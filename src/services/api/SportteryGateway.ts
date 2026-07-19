import type { AppSettings, MatchResult } from '@/types/domain'
import type {
  HistoryMatch,
  HistorySummary,
  MatchSyncProgress,
  NormalizedMatch,
  NormalizedMatchPayload,
  OddsPool,
} from '@/features/matches/types'
import { isValidMarketOutcome } from '@/features/betting/outcomes'
import { mapWithConcurrency } from '@/services/api/concurrency'
import { requestSportteryJson } from '@/services/api/httpClient'

interface ApiEnvelope<T> {
  success: boolean
  errorCode: string | number
  errorMessage?: string
  value: T
}

type RawRecord = Record<string, unknown>

interface MatchListValue {
  matchInfoList?: Array<{ subMatchList?: RawRecord[] }>
}

interface HistoryValue {
  matchList?: RawRecord[]
}

interface GeneralValue {
  matchResultList?: RawRecord[]
}

const MATCH_PATH = '/gateway/uniform/football/getMatchCalculatorV1.qry'
const HISTORY_PATH = '/gateway/uniform/football/getResultHistoryV1.qry'
const RESULT_PATH = '/gateway/uniform/fb/getMatchDataPageListV1.qry'
const GENERAL_PATH = '/gateway/uniform/fb/getMatchGeneral.qry'

function envelopeValue<T>(payload: ApiEnvelope<T>, endpoint: string): T {
  if (!payload.value || typeof payload.value !== 'object') {
    throw new Error(`${endpoint}响应缺少有效 value`)
  }
  return payload.value
}

function optionalRows(value: unknown, endpoint: string): RawRecord[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${endpoint}列表字段格式已变化`)
  return value.filter((row): row is RawRecord => Boolean(row) && typeof row === 'object')
}

function groupedRows(value: unknown, endpoint: string): RawRecord[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${endpoint}分组字段格式已变化`)
  return value.flatMap((group) => {
    if (!group || typeof group !== 'object') return []
    return optionalRows((group as RawRecord).subMatchList, endpoint)
  })
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function integer(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : 0
}

function scoreForTeam(item: RawRecord, teamId: number): ['win' | 'draw' | 'loss' | 'unknown', number, number] {
  const homeId = integer(item.sportteryHomeTeamId)
  const awayId = integer(item.sportteryAwayTeamId)
  const homeGoals = integer(item.homeTeamFullCourtGoalCnt)
  const awayGoals = integer(item.awayTeamFullCourtGoalCnt)
  let goalsFor: number
  let goalsAgainst: number
  if (teamId === homeId) {
    goalsFor = homeGoals
    goalsAgainst = awayGoals
  } else if (teamId === awayId) {
    goalsFor = awayGoals
    goalsAgainst = homeGoals
  } else {
    return ['unknown', 0, 0]
  }
  return [goalsFor > goalsAgainst ? 'win' : goalsFor < goalsAgainst ? 'loss' : 'draw', goalsFor, goalsAgainst]
}

function normalizeHistory(match: RawRecord, rows: RawRecord[]): Pick<NormalizedMatchPayload, 'history' | 'historySummary'> {
  const homeId = integer(match.homeTeamId)
  const awayId = integer(match.awayTeamId)
  let wins = 0
  let draws = 0
  let losses = 0
  let goalsFor = 0
  let goalsAgainst = 0

  const history: HistoryMatch[] = rows.map((row) => {
    const [result, scored, conceded] = scoreForTeam(row, homeId)
    if (result === 'win') wins += 1
    else if (result === 'draw') draws += 1
    else if (result === 'loss') losses += 1
    goalsFor += scored
    goalsAgainst += conceded

    const historicHomeId = integer(row.sportteryHomeTeamId)
    const historicAwayId = integer(row.sportteryAwayTeamId)
    return {
      date: text(row.matchDate),
      tournament: text(row.tournamentShortName),
      homeTeam: text(row.homeTeamShortName),
      awayTeam: text(row.awayTeamShortName),
      score: text(row.fullCourtGoal),
      halfTimeScore: text(row.halfTimeGoal),
      currentHomeTeamResult: result,
      homeTeamRole: historicHomeId === homeId ? 'currentHome' : historicHomeId === awayId ? 'currentAway' : 'unknown',
      awayTeamRole: historicAwayId === homeId ? 'currentHome' : historicAwayId === awayId ? 'currentAway' : 'unknown',
    }
  })
  const count = wins + draws + losses
  const historySummary: HistorySummary = {
    perspective: text(match.homeTeamAbbName),
    matches: count,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    winRate: count ? Math.round((wins * 1000) / count) / 10 : 0,
  }
  return { history, historySummary }
}

function normalizeMatch(match: RawRecord, historyRows: RawRecord[], updatedAt: string): NormalizedMatch {
  const history = normalizeHistory(match, historyRows)
  return {
    matchId: integer(match.matchId),
    matchNum: text(match.matchNumStr),
    matchDateTime: `${text(match.matchDate)} ${text(match.matchTime)}`.trim(),
    homeTeam: text(match.homeTeamAbbName),
    awayTeam: text(match.awayTeamAbbName),
    updatedAt,
    payload: {
      league: text(match.leagueAbbName),
      homeRank: text(match.homeRank),
      awayRank: text(match.awayRank),
      odds: {
        had: (match.had ?? {}) as OddsPool,
        hhad: (match.hhad ?? {}) as OddsPool,
        crs: (match.crs ?? {}) as OddsPool,
        ttg: (match.ttg ?? {}) as OddsPool,
        hafu: (match.hafu ?? {}) as OddsPool,
      },
      ...history,
    },
  }
}

function validateCurrentMatch(match: RawRecord): void {
  const matchId = integer(match.matchId)
  if (matchId <= 0) throw new Error('比赛数据缺少有效 matchId')
  if (!text(match.matchNumStr)) throw new Error(`比赛 ${matchId} 缺少场次编号`)
  if (!text(match.homeTeamAbbName) || !text(match.awayTeamAbbName)) {
    throw new Error(`比赛 ${matchId} 缺少主客队名称`)
  }
}

export function parseOfficialResults(rows: RawRecord[]): MatchResult['officialResults'] {
  const results: MatchResult['officialResults'] = {}
  for (const row of rows) {
    const code = text(row.poolCode).toLowerCase() as keyof MatchResult['officialResults']
    let combination = text(row.combination)
    if (code === 'had' || code === 'hhad') combination = combination.toLowerCase()
    else if (code === 'hafu') combination = combination.toLowerCase().replace(':', '-')
    else if (code === 'ttg' && Number(combination) >= 7) combination = '7+'
    else if (code === 'crs') {
      if (combination === '-1:-H') combination = 'home_other'
      else if (combination === '-1:-D') combination = 'draw_other'
      else if (combination === '-1:-A') combination = 'away_other'
    }
    if (isValidMarketOutcome(code, combination)) results[code] = combination
    else if (['had', 'hhad', 'hafu', 'ttg', 'crs'].includes(code)) {
      throw new Error(`官方结果接口返回未知结果：${code}/${combination}`)
    }
  }
  return results
}

export class SportteryGateway {
  async fetchCurrentMatches(settings: AppSettings): Promise<RawRecord[]> {
    const payload = await requestSportteryJson<ApiEnvelope<MatchListValue>>(MATCH_PATH, {
      params: { channel: 'c', poolCode: 'crs,ttg,hafu,hhad,had' },
      timeoutSeconds: settings.timeoutSeconds,
      retries: settings.retries,
    })
    return groupedRows(
      envelopeValue(payload, '比赛接口').matchInfoList,
      '比赛接口',
    )
  }

  async fetchHistory(matchId: number, settings: AppSettings): Promise<RawRecord[]> {
    const payload = await requestSportteryJson<ApiEnvelope<HistoryValue>>(HISTORY_PATH, {
      params: {
        sportteryMatchId: matchId,
        termLimits: settings.historyLimits,
        tournamentFlag: 0,
        homeAwayFlag: 0,
      },
      timeoutSeconds: settings.timeoutSeconds,
      retries: settings.retries,
    })
    return optionalRows(
      envelopeValue(payload, '历史交锋接口').matchList,
      '历史交锋接口',
    )
  }

  async collectMatches(
    settings: AppSettings,
    onProgress?: (progress: MatchSyncProgress) => void,
    onlyMatchIds?: ReadonlySet<number>,
  ): Promise<{ matches: NormalizedMatch[]; errors: Array<{ matchId: number; message: string }> }> {
    const currentMatches = await this.fetchCurrentMatches(settings)
    const requestedMatches = onlyMatchIds
      ? currentMatches.filter((match) => onlyMatchIds.has(integer(match.matchId)))
      : currentMatches
    const invalidMatches = requestedMatches.filter((match) => integer(match.matchId) <= 0)
    const rawMatches = requestedMatches.filter((match) => integer(match.matchId) > 0)
    let completed = 0
    let failed = 0
    const updatedAt = new Date().toISOString()
    const results = await mapWithConcurrency(rawMatches, settings.workers, async (match) => {
      const matchId = integer(match.matchId)
      let history: RawRecord[] = []
      let historyError: { matchId: number; message: string } | undefined
      try {
        validateCurrentMatch(match)
        try {
          history = await this.fetchHistory(matchId, settings)
        } catch (error) {
          failed += 1
          historyError = {
            matchId,
            message: `历史交锋：${error instanceof Error ? error.message : String(error)}`,
          }
        }
        return {
          match: normalizeMatch(match, history, updatedAt),
          error: historyError,
        }
      } catch (error) {
        if (!historyError) failed += 1
        return { error: { matchId, message: error instanceof Error ? error.message : String(error) } }
      } finally {
        completed += 1
        onProgress?.({ completed, total: rawMatches.length, failed })
      }
    })
    return {
      matches: results.flatMap((item) => (item.match ? [item.match] : [])),
      errors: [
        ...invalidMatches.map((match) => ({
          matchId: 0,
          message: `比赛数据缺少有效 matchId：${text(match.matchNumStr) || '未知场次'}`,
        })),
        ...results.flatMap((item) => (item.error ? [item.error] : [])),
      ],
    }
  }

  async fetchResultRows(matchDate: string, settings: AppSettings): Promise<RawRecord[]> {
    const payload = await requestSportteryJson<ApiEnvelope<MatchListValue>>(RESULT_PATH, {
      params: { method: 'result', matchDate, pageSize: 100 },
      timeoutSeconds: settings.timeoutSeconds,
      retries: settings.retries,
    })
    return groupedRows(
      envelopeValue(payload, '赛果接口').matchInfoList,
      '赛果接口',
    )
  }

  async fetchOfficialResults(
    matchId: number,
    matchStatus: string,
    settings: AppSettings,
  ): Promise<MatchResult['officialResults']> {
    const payload = await requestSportteryJson<ApiEnvelope<GeneralValue>>(GENERAL_PATH, {
      params: { matchId, matchStatus },
      timeoutSeconds: settings.timeoutSeconds,
      retries: settings.retries,
    })
    return parseOfficialResults(
      optionalRows(
        envelopeValue(payload, '官方结果接口').matchResultList,
        '官方结果接口',
      ),
    )
  }

  async normalizeResult(
    row: RawRecord,
    source: NormalizedMatch | undefined,
    settings: AppSettings,
  ): Promise<MatchResult | undefined> {
    const fullTimeScore = text(row.sectionsNo999)
    if (!fullTimeScore || !/^\d+\s*:\s*\d+$/.test(fullTimeScore)) return undefined
    const matchId = integer(row.matchId)
    if (matchId <= 0) throw new Error('赛果数据缺少有效 matchId')
    let officialResults: MatchResult['officialResults'] = {}
    try {
      officialResults = await this.fetchOfficialResults(matchId, text(row.matchStatus || '11'), settings)
    } catch {
      // Score-based settlement remains available when the detail endpoint is temporarily unavailable.
    }
    return {
      matchId,
      matchNum: text(row.matchNumStr || source?.matchNum),
      homeTeam: text(row.homeTeamAbbName || source?.homeTeam),
      awayTeam: text(row.awayTeamAbbName || source?.awayTeam),
      halfTimeScore: text(row.sectionsNo1),
      fullTimeScore,
      goalLine: integer(source?.payload.odds.hhad.goalLineValue),
      officialResults,
      fetchedAt: new Date().toISOString(),
    }
  }
}
