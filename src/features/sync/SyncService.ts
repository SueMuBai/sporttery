import type { NormalizedMatch, OddsPool, SyncReport } from '@/features/matches/types'
import { assertValidMatchResult } from '@/features/matches/validation'
import { mapWithConcurrency } from '@/services/api/concurrency'
import { SportteryGateway } from '@/services/api/SportteryGateway'
import type { DatabaseAdapter } from '@/services/database/DatabaseAdapter'
import type { MatchResult, OddsHistoryEntry, SavedPlan, SyncJob } from '@/types/domain'

export interface SyncSnapshot {
  matches: SyncReport
  results: SyncReport
  completedAt: string
  mode: 'full' | 'retry'
}

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

function mergeResult(previous: MatchResult | undefined, current: MatchResult): MatchResult {
  if (!previous) return current
  return {
    ...current,
    halfTimeScore: current.halfTimeScore.trim()
      ? current.halfTimeScore
      : previous.halfTimeScore,
    goalLine:
      current.goalLine !== 0 || previous.goalLine === 0
        ? current.goalLine
        : previous.goalLine,
    officialResults: {
      ...previous.officialResults,
      ...current.officialResults,
    },
  }
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

function emptyReport(): SyncReport {
  return {
    added: 0,
    updated: 0,
    oddsChanged: 0,
    unchanged: 0,
    failed: 0,
    affectedPlans: 0,
    durationMs: 0,
    errors: [],
  }
}

export class SyncService {
  private activeFullSync?: Promise<SyncSnapshot>

  constructor(
    private readonly database: DatabaseAdapter,
    private readonly gateway = new SportteryGateway(),
  ) {}

  async syncMatches(
    onProgress?: Parameters<SportteryGateway['collectMatches']>[1],
    onlyMatchIds?: ReadonlySet<number>,
  ): Promise<SyncReport> {
    const started = performance.now()
    const startedAt = new Date().toISOString()
    const settings = await this.database.getSettings()
    await this.database.saveSyncJob(this.job('matches', 'running', startedAt))
    try {
      const previous = (await this.database.listMatches()) as NormalizedMatch[]
      const previousById = new Map(previous.map((match) => [match.matchId, match]))
      const collected = await this.gateway.collectMatches(settings, onProgress, onlyMatchIds)
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
      // Each bulk persistence method owns its transaction. Wrapping them in an
      // additional adapter transaction causes Capacitor SQLite to reject the
      // nested beginTransaction call with "Already in transaction".
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
      return {
        added: added.length,
        updated: updated.length,
        oddsChanged: oddsHistory.length,
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

  async syncResults(onlyMatchIds?: ReadonlySet<number>): Promise<SyncReport> {
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
      const desiredIds = onlyMatchIds
        ? new Set(onlyMatchIds)
        : new Set(matches.map((match) => match.matchId))
      if (!onlyMatchIds) {
        plans.forEach((plan) =>
          plan.selections.forEach((selection) => desiredIds.add(selection.matchId)),
        )
        ledger.forEach((order) =>
          order.planSnapshot.selections.forEach((selection) =>
            desiredIds.add(selection.matchId),
          ),
        )
      }
      const dates = resultDates(matches, desiredIds)
      const errors: SyncReport['errors'] = []
      const rowsByDate = await mapWithConcurrency(
        dates,
        Math.min(settings.workers, 3),
        async (date) => {
          try {
            return await this.gateway.fetchResultRows(date, settings)
          } catch (error) {
            errors.push({
              message: `赛果日期 ${date}：${error instanceof Error ? error.message : String(error)}`,
            })
            return []
          }
        },
      )
      const rawRows = [
        ...new Map(
          rowsByDate
            .flat()
            .filter((row) => desiredIds.has(Number(row.matchId)))
            .map((row) => [Number(row.matchId), row]),
        ).values(),
      ]
      const normalized = await mapWithConcurrency(
        rawRows,
        settings.workers,
        async (row) => {
          const matchId = Number(row.matchId)
          try {
            const result = await this.gateway.normalizeResult(
              row,
              byId.get(matchId),
              settings,
            )
            if (result) assertValidMatchResult(result)
            return result
          } catch (error) {
            errors.push({
              matchId: Number.isFinite(matchId) ? matchId : undefined,
              message: error instanceof Error ? error.message : String(error),
            })
            return undefined
          }
        },
      )
      const existingById = new Map(existing.map((result) => [result.matchId, result]))
      const changed = normalized.flatMap((result) => {
        if (!result) return []
        const before = existingById.get(result.matchId)
        const merged = mergeResult(before, result)
        return !before || resultFingerprint(before) !== resultFingerprint(merged) ? [merged] : []
      })
      await this.database.saveResults(changed)
      const changedIds = new Set(changed.map((result) => result.matchId))
      const affectedPlans = affectedPlanCount(plans, changedIds)
      await this.database.saveSyncJob({
        ...this.job('results', errors.length ? 'partial' : 'success', startedAt),
        addedCount: changed.filter((item) => !existingById.has(item.matchId)).length,
        updatedCount: changed.filter((item) => existingById.has(item.matchId)).length,
        failedCount: errors.length,
        errorMessage: errors.map((item) => item.message).join('\n'),
        finishedAt: new Date().toISOString(),
      })
      return {
        added: changed.filter((item) => !existingById.has(item.matchId)).length,
        updated: changed.filter((item) => existingById.has(item.matchId)).length,
        oddsChanged: 0,
        unchanged: Math.max(0, rawRows.length - changed.length - errors.filter((item) => item.matchId !== undefined).length),
        failed: errors.length,
        affectedPlans,
        durationMs: Math.round(performance.now() - started),
        errors,
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

  async fullSync(onProgress?: Parameters<SportteryGateway['collectMatches']>[1]): Promise<SyncSnapshot> {
    if (this.activeFullSync) return this.activeFullSync
    const run = (async () => {
      try {
        const matches = await this.syncMatches(onProgress)
        const results = await this.syncResults()
        return await this.persistSnapshot(matches, results, 'full')
      } catch (error) {
        await this.database.recordEvent({
          type: 'sync.failed',
          payload: { message: error instanceof Error ? error.message : String(error) },
          createdAt: new Date().toISOString(),
        })
        throw error
      }
    })()
    this.activeFullSync = run
    try {
      return await run
    } finally {
      if (this.activeFullSync === run) this.activeFullSync = undefined
    }
  }

  async syncMatchesOnly(
    onProgress?: Parameters<SportteryGateway['collectMatches']>[1],
  ): Promise<SyncSnapshot> {
    const matches = await this.syncMatches(onProgress)
    const previous = await this.latestSnapshot()
    return this.persistSnapshot(matches, previous?.results ?? emptyReport(), 'full')
  }

  async syncResultsOnly(): Promise<SyncSnapshot> {
    const results = await this.syncResults()
    const previous = await this.latestSnapshot()
    return this.persistSnapshot(previous?.matches ?? emptyReport(), results, 'full')
  }

  async retryFailed(
    snapshot: SyncSnapshot,
    onProgress?: Parameters<SportteryGateway['collectMatches']>[1],
  ): Promise<SyncSnapshot> {
    if (this.activeFullSync) return this.activeFullSync
    const matchIds = new Set(
      snapshot.matches.errors.flatMap((error) =>
        error.matchId === undefined ? [] : [error.matchId],
      ),
    )
    const resultMatchIds = new Set(
      snapshot.results.errors.flatMap((error) =>
        error.matchId === undefined ? [] : [error.matchId],
      ),
    )
    const retryResultIds = new Set([...matchIds, ...resultMatchIds])
    if (!matchIds.size && !snapshot.results.failed) return this.fullSync(onProgress)
    const run = (async () => {
      try {
        const matches = matchIds.size
          ? await this.syncMatches(onProgress, matchIds)
          : emptyReport()
        const results = await this.syncResults(
          snapshot.results.errors.some((error) => error.matchId === undefined)
            ? undefined
            : retryResultIds,
        )
        return await this.persistSnapshot(matches, results, 'retry')
      } catch (error) {
        await this.database.recordEvent({
          type: 'sync.failed',
          payload: { message: error instanceof Error ? error.message : String(error) },
          createdAt: new Date().toISOString(),
        })
        throw error
      }
    })()
    this.activeFullSync = run
    try {
      return await run
    } finally {
      if (this.activeFullSync === run) this.activeFullSync = undefined
    }
  }

  async latestSnapshot(): Promise<SyncSnapshot | undefined> {
    const [event] = await this.database.listEvents('sync.completed', 1)
    if (!event) return undefined
    const payload = event.payload as Partial<SyncSnapshot>
    if (!payload.matches || !payload.results) return undefined
    return {
      matches: payload.matches,
      results: payload.results,
      completedAt: String(payload.completedAt || event.createdAt),
      mode: payload.mode === 'retry' ? 'retry' : 'full',
    }
  }

  private async persistSnapshot(
    matches: SyncReport,
    results: SyncReport,
    mode: SyncSnapshot['mode'],
  ): Promise<SyncSnapshot> {
    const snapshot: SyncSnapshot = {
      matches,
      results,
      completedAt: new Date().toISOString(),
      mode,
    }
    await this.database.recordEvent({
      type: 'sync.completed',
      payload: structuredClone(snapshot) as unknown as Record<string, unknown>,
      createdAt: snapshot.completedAt,
    })
    return snapshot
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
