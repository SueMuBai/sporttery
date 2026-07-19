export type MarketCode = 'had' | 'hhad' | 'crs' | 'ttg' | 'hafu'
export type OutcomeCode = string

export interface AppSettings {
  historyLimits: number
  workers: number
  timeoutSeconds: number
  retries: number
  defaultMultiplier: number
}

export interface PlanTag {
  id?: number
  name: string
  color: string
  sortOrder: number
  createdAt: string
}

export interface PlanSelection {
  key: string
  matchId: number
  market: MarketCode
  outcome: OutcomeCode
  odds: string
}

export interface SavedPlan {
  id: string
  sourcePlanId?: string
  revision: number
  status: 'saved'
  name: string
  selections: PlanSelection[]
  passCounts: number[]
  multiplier: number
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface MatchSnapshot {
  matchId: number
  matchNum: string
  matchDateTime: string
  homeTeam: string
  awayTeam: string
  payload: Record<string, unknown>
  updatedAt: string
}

export interface MatchResult {
  id?: number
  matchId: number
  matchNum: string
  homeTeam: string
  awayTeam: string
  halfTimeScore: string
  fullTimeScore: string
  goalLine: number
  officialResults: Partial<Record<MarketCode, string>>
  fetchedAt: string
}

export type LedgerStatus = 'pending' | 'settled'

export interface LedgerOrder {
  id: string
  planId?: string
  planName: string
  planSnapshot: SavedPlan
  purchasedAt: string
  stakeCents: number
  returnCents: number
  returnManual: boolean
  status: LedgerStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export interface LedgerAdjustment {
  id?: number
  orderId: string
  previousReturnCents: number
  nextReturnCents: number
  occurredAt: string
  note: string
}

export interface SyncJob {
  id?: number
  kind: 'matches' | 'results' | 'full'
  status: 'running' | 'success' | 'partial' | 'failed'
  addedCount: number
  updatedCount: number
  failedCount: number
  errorMessage: string
  startedAt: string
  finishedAt?: string
}

export interface OddsHistoryEntry {
  id?: number
  matchId: number
  market: MarketCode
  outcome: OutcomeCode
  odds: string
  capturedAt: string
}

export interface AppEvent {
  id?: number
  type: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface DatabaseCounts {
  settings: number
  tags: number
  plans: number
  planSelections: number
  matches: number
  results: number
  ledgerOrders: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  historyLimits: 10,
  workers: 4,
  timeoutSeconds: 15,
  retries: 2,
  defaultMultiplier: 1,
}
