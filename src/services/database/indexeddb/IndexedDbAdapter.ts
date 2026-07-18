import Dexie, { type EntityTable, type Table } from "dexie";

import type {
  DatabaseAdapter,
  LedgerFilter,
} from "@/services/database/DatabaseAdapter";
import { DATABASE_NAME, DATABASE_VERSION } from "@/services/database/schema";
import {
  DEFAULT_SETTINGS,
  type AppEvent,
  type AppSettings,
  type DatabaseCounts,
  type LedgerOrder,
  type MatchResult,
  type MatchSnapshot,
  type OddsHistoryEntry,
  type PlanSelection,
  type PlanTag,
  type SavedPlan,
  type SyncJob,
} from "@/types/domain";

interface SettingRow {
  key: "app";
  value: AppSettings;
  updatedAt: string;
}

type PlanRow = Omit<SavedPlan, "selections" | "tags">;

interface PlanSelectionRow extends PlanSelection {
  id?: number;
  planId: string;
}

interface PlanTagRow {
  id?: number;
  planId: string;
  tagName: string;
}

interface ResultRow extends MatchResult {
  id?: number;
}

class CaiguoDexie extends Dexie {
  settings!: EntityTable<SettingRow, "key">;
  tags!: EntityTable<PlanTag, "id">;
  plans!: EntityTable<PlanRow, "id">;
  planSelections!: EntityTable<PlanSelectionRow, "id">;
  planTags!: EntityTable<PlanTagRow, "id">;
  matchSnapshots!: EntityTable<MatchSnapshot, "matchId">;
  matchResults!: EntityTable<ResultRow, "id">;
  ledgerOrders!: EntityTable<LedgerOrder, "id">;
  syncJobs!: EntityTable<SyncJob, "id">;
  oddsHistory!: EntityTable<OddsHistoryEntry, "id">;
  appEvents!: EntityTable<AppEvent, "id">;

  constructor(name: string) {
    super(name);
    this.version(DATABASE_VERSION).stores({
      settings: "&key",
      tags: "++id,&name,sortOrder",
      plans: "&id,updatedAt,createdAt",
      planSelections: "++id,planId,&[planId+key],matchId,market",
      planTags: "++id,planId,tagName,&[planId+tagName]",
      matchSnapshots: "&matchId,matchDateTime,updatedAt",
      matchResults: "++id,matchId,[matchId+fetchedAt],fetchedAt",
      ledgerOrders: "&id,planId,purchasedAt,status",
      syncJobs: "++id,kind,status,startedAt",
      oddsHistory: "++id,matchId,[matchId+capturedAt],market,outcome",
      appEvents: "++id,type,createdAt",
    });
  }
}

const now = () => new Date().toISOString();
const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class IndexedDbAdapter implements DatabaseAdapter {
  private readonly db: CaiguoDexie;

  constructor(name = `${DATABASE_NAME}-web`) {
    this.db = new CaiguoDexie(name);
  }

  async initialize(): Promise<void> {
    await this.db.open();
    const existing = await this.db.settings.get("app");
    if (!existing) {
      await this.db.settings.put({
        key: "app",
        value: DEFAULT_SETTINGS,
        updatedAt: now(),
      });
    }
    if ((await this.db.tags.count()) === 0) {
      const createdAt = now();
      await this.db.tags.bulkAdd([
        { name: "已购", color: "#5797F5", sortOrder: 1, createdAt },
        { name: "AI", color: "#9A91F5", sortOrder: 2, createdAt },
      ]);
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async transaction<T>(action: () => Promise<T>): Promise<T> {
    const tables = this.db.tables as Table[];
    return this.db.transaction("rw", tables, action);
  }

  async getSettings(): Promise<AppSettings> {
    const row = await this.db.settings.get("app");
    return cloneJson(row?.value ?? DEFAULT_SETTINGS);
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.db.settings.put({
      key: "app",
      value: cloneJson(settings),
      updatedAt: now(),
    });
  }

  async listTags(): Promise<PlanTag[]> {
    return this.db.tags.orderBy("sortOrder").toArray();
  }

  async saveTag(tag: PlanTag): Promise<PlanTag> {
    const existing = await this.db.tags.where("name").equals(tag.name).first();
    const row: PlanTag = { ...tag, id: tag.id ?? existing?.id };
    const id = await this.db.tags.put(row);
    return { ...row, id: Number(id) };
  }

  async deleteTag(name: string): Promise<void> {
    await this.db.transaction(
      "rw",
      this.db.tags,
      this.db.planTags,
      async () => {
        const tag = await this.db.tags.where("name").equals(name).first();
        if (tag?.id !== undefined) await this.db.tags.delete(tag.id);
        await this.db.planTags.where("tagName").equals(name).delete();
      },
    );
  }

  async reorderTags(names: string[]): Promise<void> {
    await this.db.transaction("rw", this.db.tags, async () => {
      for (const [index, name] of names.entries()) {
        const tag = await this.db.tags.where("name").equals(name).first();
        if (tag?.id !== undefined)
          await this.db.tags.update(tag.id, { sortOrder: index + 1 });
      }
    });
  }

  async listPlans(): Promise<SavedPlan[]> {
    const rows = await this.db.plans.orderBy("updatedAt").reverse().toArray();
    return Promise.all(rows.map((row) => this.hydratePlan(row)));
  }

  async getPlan(id: string): Promise<SavedPlan | undefined> {
    const row = await this.db.plans.get(id);
    return row ? this.hydratePlan(row) : undefined;
  }

  async savePlan(plan: SavedPlan): Promise<void> {
    await this.db.transaction(
      "rw",
      this.db.plans,
      this.db.planSelections,
      this.db.planTags,
      async () => {
        const { selections, tags, ...row } = cloneJson(plan);
        await this.db.plans.put(row);
        await this.db.planSelections.where("planId").equals(plan.id).delete();
        await this.db.planTags.where("planId").equals(plan.id).delete();
        if (selections.length) {
          await this.db.planSelections.bulkAdd(
            selections.map((selection) => ({ ...selection, planId: plan.id })),
          );
        }
        if (tags.length) {
          await this.db.planTags.bulkAdd(
            tags.map((tagName) => ({ planId: plan.id, tagName })),
          );
        }
      },
    );
  }

  async deletePlan(id: string): Promise<void> {
    await this.db.transaction(
      "rw",
      this.db.plans,
      this.db.planSelections,
      this.db.planTags,
      async () => {
        await this.db.plans.delete(id);
        await this.db.planSelections.where("planId").equals(id).delete();
        await this.db.planTags.where("planId").equals(id).delete();
      },
    );
  }

  async listMatches(): Promise<MatchSnapshot[]> {
    return this.db.matchSnapshots.orderBy("matchDateTime").toArray();
  }

  async saveMatches(matches: MatchSnapshot[]): Promise<void> {
    if (matches.length)
      await this.db.matchSnapshots.bulkPut(cloneJson(matches));
  }

  async listLatestResults(): Promise<MatchResult[]> {
    const rows = await this.db.matchResults
      .orderBy("fetchedAt")
      .reverse()
      .toArray();
    const latest = new Map<number, MatchResult>();
    for (const row of rows) {
      if (!latest.has(row.matchId)) latest.set(row.matchId, row);
    }
    return [...latest.values()];
  }

  async saveResults(results: MatchResult[]): Promise<void> {
    if (results.length) await this.db.matchResults.bulkAdd(cloneJson(results));
  }

  async listLedger(filter: LedgerFilter = {}): Promise<LedgerOrder[]> {
    const rows = await this.db.ledgerOrders
      .orderBy("purchasedAt")
      .reverse()
      .toArray();
    return rows.filter((row) => {
      if (filter.start && row.purchasedAt.slice(0, 10) < filter.start)
        return false;
      if (filter.end && row.purchasedAt.slice(0, 10) > filter.end) return false;
      return true;
    });
  }

  async saveLedgerOrder(order: LedgerOrder): Promise<void> {
    await this.db.ledgerOrders.put(cloneJson(order));
  }

  async updateLedgerReturn(
    id: string,
    returnCents: number,
    manual: boolean,
    expectedUpdatedAt?: string,
  ): Promise<void> {
    if (!Number.isSafeInteger(returnCents) || returnCents < 0) {
      throw new TypeError("回款金额必须是非负整数分");
    }
    await this.db.transaction("rw", this.db.ledgerOrders, async () => {
      const existing = await this.db.ledgerOrders.get(id);
      if (!existing) throw new Error("账单不存在");
      if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
        throw new Error("账单已在其他页面更新，请刷新后重试");
      }
      await this.db.ledgerOrders.update(id, {
        returnCents,
        returnManual: manual,
        updatedAt: now(),
      });
    });
  }

  async saveSyncJob(job: SyncJob): Promise<number> {
    return Number(await this.db.syncJobs.put(cloneJson(job)));
  }

  async saveOddsHistory(entries: OddsHistoryEntry[]): Promise<void> {
    if (entries.length) await this.db.oddsHistory.bulkAdd(cloneJson(entries));
  }

  async recordEvent(event: AppEvent): Promise<number> {
    return Number(await this.db.appEvents.put(cloneJson(event)));
  }

  async getCounts(): Promise<DatabaseCounts> {
    const [
      settings,
      tags,
      plans,
      planSelections,
      matches,
      results,
      ledgerOrders,
    ] = await Promise.all([
      this.db.settings.count(),
      this.db.tags.count(),
      this.db.plans.count(),
      this.db.planSelections.count(),
      this.db.matchSnapshots.count(),
      this.db.matchResults.count(),
      this.db.ledgerOrders.count(),
    ]);
    return {
      settings,
      tags,
      plans,
      planSelections,
      matches,
      results,
      ledgerOrders,
    };
  }

  async deleteDatabaseForTests(): Promise<void> {
    this.db.close();
    await Dexie.delete(this.db.name);
  }

  private async hydratePlan(row: PlanRow): Promise<SavedPlan> {
    const [selectionRows, tagRows] = await Promise.all([
      this.db.planSelections.where("planId").equals(row.id).sortBy("id"),
      this.db.planTags.where("planId").equals(row.id).sortBy("id"),
    ]);
    const selections = selectionRows.map((selection) => ({
      key: selection.key,
      matchId: selection.matchId,
      market: selection.market,
      outcome: selection.outcome,
      odds: selection.odds,
    }));
    return { ...row, selections, tags: tagRows.map((tag) => tag.tagName) };
  }
}
