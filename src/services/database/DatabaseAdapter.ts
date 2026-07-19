import type {
  AppEvent,
  AppSettings,
  DatabaseCounts,
  LedgerOrder,
  LedgerAdjustment,
  MatchResult,
  MatchSnapshot,
  OddsHistoryEntry,
  PlanTag,
  SavedPlan,
  SyncJob,
} from "@/types/domain";

export interface LedgerFilter {
  start?: string;
  end?: string;
}

export interface DatabaseAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;
  transaction<T>(action: () => Promise<T>): Promise<T>;

  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;

  listTags(): Promise<PlanTag[]>;
  saveTag(tag: PlanTag): Promise<PlanTag>;
  renameTag(originalName: string, tag: PlanTag): Promise<PlanTag>;
  deleteTag(name: string): Promise<void>;
  reorderTags(names: string[]): Promise<void>;

  listPlans(): Promise<SavedPlan[]>;
  getPlan(id: string): Promise<SavedPlan | undefined>;
  savePlan(plan: SavedPlan, expectedRevision?: number): Promise<void>;
  importPlans(
    tags: PlanTag[],
    plans: SavedPlan[],
    matches?: MatchSnapshot[],
    results?: MatchResult[],
  ): Promise<{ tags: number; plans: number; matches: number; results: number }>;
  deletePlan(id: string): Promise<void>;

  listMatches(): Promise<MatchSnapshot[]>;
  saveMatches(matches: MatchSnapshot[]): Promise<void>;
  listLatestResults(): Promise<MatchResult[]>;
  saveResults(results: MatchResult[]): Promise<void>;

  listLedger(filter?: LedgerFilter): Promise<LedgerOrder[]>;
  saveLedgerOrder(order: LedgerOrder): Promise<void>;
  savePlanWithLedgerOrder(
    plan: SavedPlan,
    order: LedgerOrder,
    expectedRevision?: number,
  ): Promise<void>;
  updateLedgerReturn(
    id: string,
    returnCents: number,
    expectedUpdatedAt?: string,
  ): Promise<void>;
  updateLedgerNotes(
    id: string,
    notes: string,
    expectedUpdatedAt?: string,
  ): Promise<void>;
  listLedgerAdjustments(orderId: string): Promise<LedgerAdjustment[]>;
  undoLatestLedgerAdjustment(id: string, expectedUpdatedAt?: string): Promise<void>;

  saveSyncJob(job: SyncJob): Promise<number>;
  saveOddsHistory(entries: OddsHistoryEntry[]): Promise<void>;
  recordEvent(event: AppEvent): Promise<number>;
  listEvents(type?: string, limit?: number): Promise<AppEvent[]>;
  getCounts(): Promise<DatabaseCounts>;
}
