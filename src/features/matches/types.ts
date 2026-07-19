import type { MatchSnapshot } from '@/types/domain'

export interface HistoryMatch {
  date: string
  tournament: string
  homeTeam: string
  awayTeam: string
  score: string
  halfTimeScore: string
  currentHomeTeamResult: 'win' | 'draw' | 'loss' | 'unknown'
  homeTeamRole: 'currentHome' | 'currentAway' | 'unknown'
  awayTeamRole: 'currentHome' | 'currentAway' | 'unknown'
}

export interface HistorySummary {
  perspective: string
  matches: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  winRate: number
}

export interface OddsPool {
  goalLine?: string
  goalLineValue?: string
  updateDate?: string
  updateTime?: string
  [key: string]: unknown
}

export interface NormalizedMatchPayload extends Record<string, unknown> {
  league: string
  homeRank: string
  awayRank: string
  odds: {
    had: OddsPool
    hhad: OddsPool
    crs: OddsPool
    ttg: OddsPool
    hafu: OddsPool
  }
  historySummary: HistorySummary
  history: HistoryMatch[]
}

export type NormalizedMatch = MatchSnapshot & { payload: NormalizedMatchPayload }

export interface MatchSyncProgress {
  completed: number
  total: number
  failed: number
}

export interface SyncReport {
  added: number
  updated: number
  oddsChanged: number
  unchanged: number
  failed: number
  affectedPlans: number
  durationMs: number
  errors: Array<{ matchId?: number; message: string }>
}
