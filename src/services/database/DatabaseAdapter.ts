import type {
  AppEvent,
  AppSettings,
  DatabaseCounts,
  LedgerOrder,
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
  deleteTag(name: string): Promise<void>;
  reorderTags(names: string[]): Promise<void>;

  listPlans(): Promise<SavedPlan[]>;
  getPlan(id: string): Promise<SavedPlan | undefined>;
  savePlan(plan: SavedPlan): Promise<void>;
  deletePlan(id: string): Promise<void>;

  listMatches(): Promise<MatchSnapshot[]>;
  saveMatches(matches: MatchSnapshot[]): Promise<void>;
  listLatestResults(): Promise<MatchResult[]>;
  saveResults(results: MatchResult[]): Promise<void>;

  listLedger(filter?: LedgerFilter): Promise<LedgerOrder[]>;
  saveLedgerOrder(order: LedgerOrder): Promise<void>;
  updateLedgerReturn(
    id: string,
    returnCents: number,
    manual: boolean,
    expectedUpdatedAt?: string,
  ): Promise<void>;

  saveSyncJob(job: SyncJob): Promise<number>;
  saveOddsHistory(entries: OddsHistoryEntry[]): Promise<void>;
  recordEvent(event: AppEvent): Promise<number>;
  getCounts(): Promise<DatabaseCounts>;
}
