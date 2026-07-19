import Dexie, { type EntityTable, type Table } from "dexie";
import {
  assertPersistableLedgerOrder,
  assertPersistablePlan,
  normalizeLedgerNotes,
} from "@/features/plans/validation";
import {
  assertValidPlanTag,
  MAX_PLAN_TAGS,
  normalizedTagIdentity,
} from "@/features/plans/tagValidation";
import { validateSettings } from "@/features/settings/validation";
import {
  assertValidMatchResult,
  assertValidMatchSnapshot,
} from "@/features/matches/validation";

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
  type LedgerAdjustment,
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
  ledgerAdjustments!: EntityTable<LedgerAdjustment, "id">;
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
      ledgerAdjustments: "++id,orderId,occurredAt",
      syncJobs: "++id,kind,status,startedAt",
      oddsHistory: "++id,matchId,[matchId+capturedAt],market,outcome",
      appEvents: "++id,type,createdAt",
    });
  }
}

const now = () => new Date().toISOString();
const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isNewerTimestamp = (candidate: string, current: string): boolean =>
  Date.parse(candidate) > Date.parse(current);

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
    validateSettings(settings);
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
    assertValidPlanTag(tag);
    return this.db.transaction("rw", this.db.tags, async () => {
      const all = await this.db.tags.toArray();
      const identity = normalizedTagIdentity(tag.name);
      const duplicate = all.find(
        (item) => normalizedTagIdentity(item.name) === identity,
      );
      if (duplicate && duplicate.name !== tag.name) {
        throw new Error("已存在同名标签");
      }
      if (!duplicate && all.length >= MAX_PLAN_TAGS) {
        throw new Error("最多只能创建 8 个标签");
      }
      const row: PlanTag = { ...tag, id: tag.id ?? duplicate?.id };
      const id = await this.db.tags.put(row);
      return { ...row, id: Number(id) };
    });
  }

  async renameTag(originalName: string, tag: PlanTag): Promise<PlanTag> {
    return this.db.transaction(
      "rw",
      this.db.tags,
      this.db.planTags,
      async () => {
        const existing = await this.db.tags
          .where("name")
          .equals(originalName)
          .first();
        if (!existing?.id) throw new Error("原标签不存在，请刷新后重试");
        const duplicate = (await this.db.tags.toArray()).find(
          (item) =>
            normalizedTagIdentity(item.name) === normalizedTagIdentity(tag.name),
        );
        if (duplicate && duplicate.id !== existing.id) {
          throw new Error("已存在同名标签");
        }
        const renamed: PlanTag = {
          ...tag,
          id: existing.id,
          createdAt: existing.createdAt,
        };
        assertValidPlanTag(renamed);
        await this.db.tags.put(renamed);
        if (originalName !== tag.name) {
          await this.db.planTags
            .where("tagName")
            .equals(originalName)
            .modify({ tagName: tag.name });
        }
        return cloneJson(renamed);
      },
    );
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

  async savePlan(plan: SavedPlan, expectedRevision?: number): Promise<void> {
    await this.db.transaction(
      "rw",
      this.db.tags,
      this.db.plans,
      this.db.planSelections,
      this.db.planTags,
      () => this.writePlan(plan, expectedRevision),
    );
  }

  async importPlans(
    tags: PlanTag[],
    plans: SavedPlan[],
    matches: MatchSnapshot[] = [],
    results: MatchResult[] = [],
  ): Promise<{ tags: number; plans: number; matches: number; results: number }> {
    let importedMatchCount = 0;
    let importedResultCount = 0;
    tags.forEach(assertValidPlanTag);
    matches.forEach(assertValidMatchSnapshot);
    results.forEach(assertValidMatchResult);
    await this.db.transaction(
      "rw",
      this.db.tags,
      this.db.plans,
      this.db.planSelections,
      this.db.planTags,
      this.db.matchSnapshots,
      this.db.matchResults,
      async () => {
        const existingTags = await this.db.tags.toArray();
        const identities = new Set(
          existingTags.map((tag) => normalizedTagIdentity(tag.name)),
        );
        tags.forEach((tag) => identities.add(normalizedTagIdentity(tag.name)));
        if (identities.size > MAX_PLAN_TAGS) {
          throw new Error("最多只能创建 8 个标签");
        }
        for (const tag of tags) {
          const caseDuplicate = existingTags.find(
            (item) =>
              normalizedTagIdentity(item.name) ===
                normalizedTagIdentity(tag.name) && item.name !== tag.name,
          );
          if (caseDuplicate) throw new Error("已存在同名标签");
          const existing = await this.db.tags.where("name").equals(tag.name).first();
          await this.db.tags.put({
            ...cloneJson(tag),
            id: existing?.id,
          });
        }
        for (const plan of plans) {
          const existing = await this.db.plans.get(plan.id);
          await this.writePlan({
            ...plan,
            revision: existing
              ? Math.max(plan.revision, existing.revision + 1)
              : plan.revision,
          });
        }
        const newerMatches: MatchSnapshot[] = [];
        for (const match of matches) {
          const existing = await this.db.matchSnapshots.get(match.matchId);
          if (!existing || isNewerTimestamp(match.updatedAt, existing.updatedAt)) {
            newerMatches.push(match);
          }
        }
        if (newerMatches.length) {
          await this.db.matchSnapshots.bulkPut(cloneJson(newerMatches));
        }
        importedMatchCount = newerMatches.length;
        const newerResults: MatchResult[] = [];
        for (const result of results) {
          const existing = await this.db.matchResults
            .where("matchId")
            .equals(result.matchId)
            .toArray();
          const latest = existing.reduce<ResultRow | undefined>(
            (current, row) =>
              !current ||
              isNewerTimestamp(row.fetchedAt, current.fetchedAt) ||
              (Date.parse(row.fetchedAt) === Date.parse(current.fetchedAt) &&
                Number(row.id ?? 0) > Number(current.id ?? 0))
                ? row
                : current,
            undefined,
          );
          if (!latest || isNewerTimestamp(result.fetchedAt, latest.fetchedAt)) {
            newerResults.push(result);
          }
        }
        const matchIds = [
          ...new Set(newerResults.map((result) => result.matchId)),
        ];
        if (matchIds.length) {
          await this.db.matchResults.where("matchId").anyOf(matchIds).delete();
          await this.db.matchResults.bulkAdd(
            cloneJson(newerResults).map((result) => {
              const row: ResultRow = { ...result };
              delete row.id;
              return row;
            }),
          );
        }
        importedResultCount = newerResults.length;
      },
    );
    return {
      tags: tags.length,
      plans: plans.length,
      matches: importedMatchCount,
      results: importedResultCount,
    };
  }

  async savePlanWithLedgerOrder(
    plan: SavedPlan,
    order: LedgerOrder,
    expectedRevision?: number,
  ): Promise<void> {
    assertPersistableLedgerOrder(order);
    await this.db.transaction(
      "rw",
      this.db.tags,
      this.db.plans,
      this.db.planSelections,
      this.db.planTags,
      this.db.ledgerOrders,
      async () => {
        await this.writePlan(plan, expectedRevision);
        await this.db.ledgerOrders.put(cloneJson(order));
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
    matches.forEach(assertValidMatchSnapshot);
    if (matches.length)
      await this.db.matchSnapshots.bulkPut(cloneJson(matches));
  }

  async listLatestResults(): Promise<MatchResult[]> {
    const rows = await this.db.matchResults.toArray();
    const latest = new Map<number, MatchResult>();
    for (const row of rows) {
      const current = latest.get(row.matchId);
      if (
        !current ||
        isNewerTimestamp(row.fetchedAt, current.fetchedAt) ||
        (Date.parse(row.fetchedAt) === Date.parse(current.fetchedAt) &&
          Number(row.id ?? 0) > Number(current.id ?? 0))
      ) {
        latest.set(row.matchId, row);
      }
    }
    return [...latest.values()];
  }

  async saveResults(results: MatchResult[]): Promise<void> {
    results.forEach(assertValidMatchResult);
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
    assertPersistableLedgerOrder(order);
    await this.db.ledgerOrders.put(cloneJson(order));
  }

  async updateLedgerNotes(
    id: string,
    notes: string,
    expectedUpdatedAt?: string,
  ): Promise<void> {
    const normalizedNotes = normalizeLedgerNotes(notes);
    await this.db.transaction("rw", this.db.ledgerOrders, async () => {
      const existing = await this.db.ledgerOrders.get(id);
      if (!existing) throw new Error("账单不存在");
      if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
        throw new Error("账单已在其他页面更新，请刷新后重试");
      }
      await this.db.ledgerOrders.update(id, {
        notes: normalizedNotes,
        updatedAt: now(),
      });
    });
  }

  private async writePlan(
    plan: SavedPlan,
    expectedRevision?: number,
  ): Promise<void> {
    assertPersistablePlan(plan);
    if (expectedRevision !== undefined) {
      const existing = await this.db.plans.get(plan.id);
      if (!existing || existing.revision !== expectedRevision) {
        throw new Error("方案已在其他页面更新，请重新载入后再保存");
      }
    }
    const { selections, tags, ...row } = cloneJson(plan);
    if (tags.length) {
      const existingTags = await this.db.tags
        .where("name")
        .anyOf([...new Set(tags)])
        .toArray();
      const existingNames = new Set(existingTags.map((tag) => tag.name));
      if (tags.some((tag) => !existingNames.has(tag))) {
        throw new Error("方案包含已删除的标签，请刷新后重试");
      }
    }
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
  }

  async updateLedgerReturn(
    id: string,
    returnCents: number,
    expectedUpdatedAt?: string,
    previousReturnCents?: number,
  ): Promise<void> {
    if (!Number.isSafeInteger(returnCents) || returnCents < 0) {
      throw new TypeError("回款金额必须是非负整数分");
    }
    if (
      previousReturnCents !== undefined &&
      (!Number.isSafeInteger(previousReturnCents) || previousReturnCents < 0)
    ) {
      throw new TypeError("原回款金额必须是非负整数分");
    }
    await this.db.transaction("rw", this.db.ledgerOrders, this.db.ledgerAdjustments, async () => {
      const existing = await this.db.ledgerOrders.get(id);
      if (!existing) throw new Error("账单不存在");
      if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
        throw new Error("账单已在其他页面更新，请刷新后重试");
      }
      await this.db.ledgerAdjustments.add({
        orderId: id,
        previousReturnCents: previousReturnCents ?? existing.returnCents,
        nextReturnCents: returnCents,
        occurredAt: now(),
        note: "手工修改实际回款",
      });
      await this.db.ledgerOrders.update(id, {
        returnCents,
        returnManual: true,
        updatedAt: now(),
      });
    });
  }

  async listLedgerAdjustments(orderId: string): Promise<LedgerAdjustment[]> {
    return this.db.ledgerAdjustments.where("orderId").equals(orderId).reverse().sortBy("occurredAt");
  }

  async undoLatestLedgerAdjustment(id: string, expectedUpdatedAt?: string): Promise<void> {
    await this.db.transaction("rw", this.db.ledgerOrders, this.db.ledgerAdjustments, async () => {
      const existing = await this.db.ledgerOrders.get(id);
      if (!existing) throw new Error("账单不存在");
      if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
        throw new Error("账单已在其他页面更新，请刷新后重试");
      }
      const adjustments = await this.db.ledgerAdjustments.where("orderId").equals(id).sortBy("occurredAt");
      const latest = adjustments.at(-1);
      if (!latest?.id) throw new Error("没有可以撤销的回款修改");
      await this.db.ledgerOrders.update(id, {
        returnCents: latest.previousReturnCents,
        returnManual: adjustments.length > 1,
        updatedAt: now(),
      });
      await this.db.ledgerAdjustments.delete(latest.id);
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

  async listEvents(type?: string, limit = 20): Promise<AppEvent[]> {
    const rows = type
      ? await this.db.appEvents.where("type").equals(type).reverse().sortBy("createdAt")
      : await this.db.appEvents.orderBy("createdAt").reverse().toArray();
    return rows.slice(0, Math.max(0, limit)).map(cloneJson);
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
