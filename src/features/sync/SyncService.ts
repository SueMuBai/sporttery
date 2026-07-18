import type { NormalizedMatch, OddsPool, SyncReport } from '@/features/matches/types'
import { mapWithConcurrency } from '@/services/api/concurrency'
import { SportteryGateway } from '@/services/api/SportteryGateway'
import type { DatabaseAdapter } from '@/services/database/DatabaseAdapter'
import type { MatchResult, OddsHistoryEntry, SavedPlan, SyncJob } from '@/types/domain'

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function matchFingerprint(match: NormalizedMatch): string {
  return stable({
    matchNum: match.matchNum,
    matchDateTime: match.matchDateTime,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    payload: match.payload,
  })
}

function resultFingerprint(result: MatchResult): string {
  return stable({
    halfTimeScore: result.halfTimeScore,
    fullTimeScore: result.fullTimeScore,
    goalLine: result.goalLine,
    officialResults: result.officialResults,
  })
}

function poolOdds(pool: OddsPool): Array<[string, string]> {
  return Object.entries(pool).flatMap(([outcome, value]) => {
    if (
      outcome.endsWith('f') ||
      ['goalLine', 'goalLineValue', 'updateDate', 'updateTime', 'id'].includes(outcome)
    ) {
      return []
    }
    const odds = String(value ?? '')
    return /^\d+(?:\.\d+)?$/.test(odds) ? [[outcome, odds]] : []
  })
}

function changedOdds(previous: NormalizedMatch | undefined, current: NormalizedMatch): OddsHistoryEntry[] {
  const capturedAt = current.updatedAt
  const markets = ['had', 'hhad', 'crs', 'ttg', 'hafu'] as const
  return markets.flatMap((market) => {
    const before = new Map(poolOdds(previous?.payload.odds[market] ?? {}))
    return poolOdds(current.payload.odds[market]).flatMap(([outcome, odds]) =>
      before.get(outcome) === odds
        ? []
        : [{ matchId: current.matchId, market, outcome, odds, capturedAt }],
    )
  })
}

function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function resultDates(matches: NormalizedMatch[], desiredIds: Set<number>): string[] {
  const today = new Date()
  const dates = new Set(Array.from({ length: 9 }, (_, index) => isoDate(addDays(today, index - 7))))
  for (const match of matches) {
    if (!desiredIds.has(match.matchId)) continue
    const raw = match.matchDateTime.split(' ')[0]
    if (!raw) continue
    const date = new Date(`${raw}T12:00:00`)
    if (Number.isNaN(date.valueOf())) continue
    dates.add(isoDate(date))
    dates.add(isoDate(addDays(date, -1)))
  }
  return [...dates].sort()
}

function affectedPlanCount(plans: SavedPlan[], changedMatchIds: Set<number>): number {
  return plans.filter((plan) => plan.selections.some((selection) => changedMatchIds.has(selection.matchId))).length
}

export class SyncService {
  constructor(
    private readonly database: DatabaseAdapter,
    private readonly gateway = new SportteryGateway(),
  ) {}

  async syncMatches(onProgress?: Parameters<SportteryGateway['collectMatches']>[1]): Promise<SyncReport> {
    const started = performance.now()
    const startedAt = new Date().toISOString()
    const settings = await this.database.getSettings()
    await this.database.saveSyncJob(this.job('matches', 'running', startedAt))
    try {
      const previous = (await this.database.listMatches()) as NormalizedMatch[]
      const previousById = new Map(previous.map((match) => [match.matchId, match]))
      const collected = await this.gateway.collectMatches(settings, onProgress)
      const added: NormalizedMatch[] = []
      const updated: NormalizedMatch[] = []
      const oddsHistory: OddsHistoryEntry[] = []
      let unchanged = 0
      for (const match of collected.matches) {
        const before = previousById.get(match.matchId)
        if (!before) added.push(match)
        else if (matchFingerprint(before) !== matchFingerprint(match)) updated.push(match)
        else unchanged += 1
        oddsHistory.push(...changedOdds(before, match))
      }
      await this.database.transaction(async () => {
        await this.database.saveMatches([...added, ...updated])
        await this.database.saveOddsHistory(oddsHistory)
        await this.database.saveSyncJob({
          ...this.job(
            'matches',
            collected.errors.length ? 'partial' : 'success',
            startedAt,
          ),
          addedCount: added.length,
          updatedCount: updated.length,
          failedCount: collected.errors.length,
          errorMessage: collected.errors.map((item) => item.message).join('\n'),
          finishedAt: new Date().toISOString(),
        })
      })
      return {
        added: added.length,
        updated: updated.length,
        unchanged,
        failed: collected.errors.length,
        affectedPlans: 0,
        durationMs: Math.round(performance.now() - started),
        errors: collected.errors,
      }
    } catch (error) {
      await this.database.saveSyncJob({
        ...this.job('matches', 'failed', startedAt),
        failedCount: 1,
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      })
      throw error
    }
  }

  async syncResults(): Promise<SyncReport> {
    const started = performance.now()
    const startedAt = new Date().toISOString()
    const settings = await this.database.getSettings()
    await this.database.saveSyncJob(this.job('results', 'running', startedAt))
    try {
      const [matchesRaw, plans, ledger, existing] = await Promise.all([
        this.database.listMatches(),
        this.database.listPlans(),
        this.database.listLedger(),
        this.database.listLatestResults(),
      ])
      const matches = matchesRaw as NormalizedMatch[]
      const byId = new Map(matches.map((match) => [match.matchId, match]))
      const desiredIds = new Set(matches.map((match) => match.matchId))
      plans.forEach((plan) => plan.selections.forEach((selection) => desiredIds.add(selection.matchId)))
      ledger.forEach((order) =>
        order.planSnapshot.selections.forEach((selection) => desiredIds.add(selection.matchId)),
      )
      const dates = resultDates(matches, desiredIds)
      const rowsByDate = await mapWithConcurrency(dates, Math.min(settings.workers, 3), (date) =>
        this.gateway.fetchResultRows(date, settings),
      )
      const rawRows = [
        ...new Map(
          rowsByDate
            .flat()
            .filter((row) => desiredIds.has(Number(row.matchId)))
            .map((row) => [Number(row.matchId), row]),
        ).values(),
      ]
      const normalized = await mapWithConcurrency(rawRows, settings.workers, (row) =>
        this.gateway.normalizeResult(row, byId.get(Number(row.matchId)), settings),
      )
      const existingById = new Map(existing.map((result) => [result.matchId, result]))
      const changed = normalized.flatMap((result) => {
        if (!result) return []
        const before = existingById.get(result.matchId)
        return !before || resultFingerprint(before) !== resultFingerprint(result) ? [result] : []
      })
      await this.database.saveResults(changed)
      const changedIds = new Set(changed.map((result) => result.matchId))
      const affectedPlans = affectedPlanCount(plans, changedIds)
      await this.database.saveSyncJob({
        ...this.job('results', 'success', startedAt),
        addedCount: changed.filter((item) => !existingById.has(item.matchId)).length,
        updatedCount: changed.filter((item) => existingById.has(item.matchId)).length,
        finishedAt: new Date().toISOString(),
      })
      return {
        added: changed.filter((item) => !existingById.has(item.matchId)).length,
        updated: changed.filter((item) => existingById.has(item.matchId)).length,
        unchanged: Math.max(0, rawRows.length - changed.length),
        failed: 0,
        affectedPlans,
        durationMs: Math.round(performance.now() - started),
        errors: [],
      }
    } catch (error) {
      await this.database.saveSyncJob({
        ...this.job('results', 'failed', startedAt),
        failedCount: 1,
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      })
      throw error
    }
  }

  async fullSync(onProgress?: Parameters<SportteryGateway['collectMatches']>[1]): Promise<{
    matches: SyncReport
    results: SyncReport
  }> {
    const matches = await this.syncMatches(onProgress)
    const results = await this.syncResults()
    return { matches, results }
  }

  private job(kind: SyncJob['kind'], status: SyncJob['status'], startedAt: string): SyncJob {
    return {
      kind,
      status,
      addedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      errorMessage: '',
      startedAt,
    }
  }
}
