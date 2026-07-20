import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
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
import {
  LOCAL_LEDGER_OPERATOR,
  normalizeLedgerAdjustment,
} from "@/features/ledger/adjustments";
import {
  normalizeBackupSnapshot,
  type DatabaseBackupSnapshot,
} from "@/services/database/backup";

import type {
  DatabaseAdapter,
  LedgerFilter,
} from "@/services/database/DatabaseAdapter";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  NATIVE_SCHEMA,
  NATIVE_UPGRADES,
} from "@/services/database/schema";
import { SerialTaskQueue } from "@/services/database/SerialTaskQueue";
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

type SqlRow = Record<string, unknown>;

const now = () => new Date().toISOString();
const isNewerTimestamp = (candidate: string, current: string): boolean =>
  Date.parse(candidate) > Date.parse(current);

// Capacitor's Android plugin stores connections in a native dictionary keyed
// by database name. Two JavaScript adapter instances therefore still operate
// on the same native SQLite connection. Keep the queue at module/database
// scope instead of per adapter instance so duplicate store initialization,
// WebView lifecycle races, or an accidental second adapter cannot overlap
// BEGIN/COMMIT calls on that shared connection.
const nativeDatabaseQueue = new SerialTaskQueue();

function nativeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    for (const key of ["message", "error", "reason"]) {
      const value = candidate[key];
      if (typeof value === "string") return value;
      if (value && value !== error) {
        const nested = nativeErrorMessage(value);
        if (nested && nested !== "[object Object]") return nested;
      }
    }
    try {
      return JSON.stringify(error);
    } catch {
      // Fall through to the safest generic representation.
    }
  }
  return String(error);
}

export class CapacitorSqliteAdapter implements DatabaseAdapter {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private readonly transactions = nativeDatabaseQueue;
  private connection?: SQLiteDBConnection;
  private initializePromise?: Promise<void>;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initializePromise ??= this.initializeOnce();
    try {
      await this.initializePromise;
      this.initialized = true;
    } finally {
      this.initializePromise = undefined;
    }
  }

  private async initializeOnce(): Promise<void> {
    await this.sqlite.addUpgradeStatement(DATABASE_NAME, NATIVE_UPGRADES);
    const consistency = await this.sqlite.checkConnectionsConsistency();
    const existing = await this.sqlite.isConnection(DATABASE_NAME, false);
    if (consistency.result && existing.result) {
      this.connection = await this.sqlite.retrieveConnection(
        DATABASE_NAME,
        false,
      );
    } else {
      this.connection = await this.sqlite.createConnection(
        DATABASE_NAME,
        false,
        "no-encryption",
        DATABASE_VERSION,
        false,
      );
    }
    await this.db.open();
    // Android may keep the native connection alive across a WebView reload. If
    // the previous JS runtime disappeared while a transaction was open, the
    // retrieved connection is still marked as being in that transaction.
    // Clear it before schema/setup writes or every later beginTransaction will
    // fail with "Already in transaction" until the app data is removed.
    await this.rollbackDanglingTransaction();
    // Do not let execute() create a second plugin-managed transaction. Schema
    // setup uses the same serialized/recoverable path as all later writes.
    await this.transaction(async () => {
      await this.db.execute(NATIVE_SCHEMA, false);
      await this.ensureLedgerAdjustmentColumnsInTransaction();
    });
    await this.run(
      "INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(?,?)",
      [DATABASE_VERSION, now()],
    );
    await this.seedSettings();
  }

  async close(): Promise<void> {
    await this.transactions.run(async () => {
      if (!this.connection) return;
      await this.connection.close();
      await this.sqlite.closeConnection(DATABASE_NAME, false);
      this.connection = undefined;
      this.initialized = false;
    });
  }

  async transaction<T>(action: () => Promise<T>): Promise<T> {
    return this.transactions.run(async () => {
      // SerialTaskQueue prevents overlap in this adapter instance. The native
      // connection can nevertheless outlive that instance (hot reload,
      // interrupted app, restored Capacitor connection), so also recover its
      // real transaction state before beginning a new unit of work.
      await this.beginTransactionWithRecovery();
      try {
        const result = await action();
        await this.db.commitTransaction();
        return result;
      } catch (error) {
        await this.safeRollbackTransaction();
        throw error;
      }
    });
  }

  private async beginTransactionWithRecovery(): Promise<void> {
    await this.rollbackDanglingTransaction();
    try {
      await this.db.beginTransaction();
      return;
    } catch (error) {
      // capacitor-community/sqlite can occasionally report no active
      // transaction through isTransactionActive() while Android's underlying
      // connection still rejects BEGIN with "Already in transaction". This
      // happens most often after the app/WebView was interrupted during a
      // previous sync. Roll back the native connection unconditionally and
      // retry once so users do not have to clear the app data. Some Android
      // versions of the plugin can remain stuck even after that rollback.
      // Never execute a multi-statement action without a native transaction:
      // doing so could save only half a plan, purchase or backup import.
      if (!this.isAlreadyInTransactionError(error)) throw error;
      await this.safeRollbackTransaction();
      try {
        await this.db.beginTransaction();
        return;
      } catch (retryError) {
        if (!this.isAlreadyInTransactionError(retryError)) throw retryError;
        await this.safeRollbackTransaction();
        // A native connection can preserve a stale transaction even though
        // rollbackTransaction() reports success. Reopening it is the only
        // reliable way to reset that native state on affected Android builds.
        await this.db.close();
        await this.db.open();
        try {
          await this.db.beginTransaction();
          return;
        } catch (reopenError) {
          if (!this.isAlreadyInTransactionError(reopenError)) throw reopenError;
          await this.safeRollbackTransaction();
          await this.recreateNativeConnection();
          try {
            await this.db.beginTransaction();
          } catch (resetError) {
            if (!this.isAlreadyInTransactionError(resetError)) throw resetError;
            await this.safeRollbackTransaction();
            throw new Error(
              "数据库事务状态异常，已停止本次写入，请重新打开应用后重试",
              { cause: resetError },
            );
          }
        }
      }
    }
  }

  private async recreateNativeConnection(): Promise<void> {
    try {
      await this.db.close();
    } catch (error) {
      const message = nativeErrorMessage(error);
      if (
        !/not\s+open|already\s+closed|database\s+not\s+opened/i.test(message)
      ) {
        throw error;
      }
    }
    try {
      await this.sqlite.closeConnection(DATABASE_NAME, false);
    } catch (error) {
      const message = nativeErrorMessage(error);
      if (!/no\s+available\s+connection|does\s+not\s+exist/i.test(message)) {
        throw error;
      }
    }
    this.connection = await this.sqlite.createConnection(
      DATABASE_NAME,
      false,
      "no-encryption",
      DATABASE_VERSION,
      false,
    );
    await this.db.open();
  }

  private isAlreadyInTransactionError(error: unknown): boolean {
    // Capacitor's Android bridge does not guarantee an Error instance. On
    // some devices plugin rejections arrive as { message: "..." }; String()
    // turns that into "[object Object]" and used to bypass recovery entirely.
    const message = nativeErrorMessage(error);
    return /already\s+in\s+transaction/i.test(message);
  }

  private async rollbackDanglingTransaction(): Promise<void> {
    const state = await this.db.isTransactionActive();
    if (state.result) await this.safeRollbackTransaction();
  }

  private async safeRollbackTransaction(): Promise<void> {
    try {
      await this.db.rollbackTransaction();
    } catch (error) {
      const message = nativeErrorMessage(error);
      if (!/no\s+transaction|not\s+in\s+(?:a\s+)?transaction/i.test(message)) {
        throw error;
      }
    }
  }

  async getSettings(): Promise<AppSettings> {
    const rows = await this.query("SELECT key,value FROM settings");
    const values = new Map(
      rows.map((row) => [String(row.key), JSON.parse(String(row.value))]),
    );
    return {
      historyLimits: Number(
        values.get("history_limits") ?? DEFAULT_SETTINGS.historyLimits,
      ),
      workers: Number(values.get("workers") ?? DEFAULT_SETTINGS.workers),
      timeoutSeconds: Number(
        values.get("timeout") ?? DEFAULT_SETTINGS.timeoutSeconds,
      ),
      retries: Number(values.get("retries") ?? DEFAULT_SETTINGS.retries),
      defaultMultiplier: Number(
        values.get("default_multiplier") ?? DEFAULT_SETTINGS.defaultMultiplier,
      ),
      autoSyncMatches: Boolean(
        values.get("auto_sync_matches") ?? DEFAULT_SETTINGS.autoSyncMatches,
      ),
      expandMatchDetails: Boolean(
        values.get("expand_match_details") ??
        DEFAULT_SETTINGS.expandMatchDetails,
      ),
    };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    validateSettings(settings);
    const entries: Array<[string, number | boolean]> = [
      ["history_limits", settings.historyLimits],
      ["workers", settings.workers],
      ["timeout", settings.timeoutSeconds],
      ["retries", settings.retries],
      ["default_multiplier", settings.defaultMultiplier],
      ["auto_sync_matches", settings.autoSyncMatches],
      ["expand_match_details", settings.expandMatchDetails],
    ];
    await this.transaction(async () => {
      for (const [key, value] of entries) {
        await this.runInTransaction(
          `INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
          [key, JSON.stringify(value), now()],
        );
      }
    });
  }

  async listTags(): Promise<PlanTag[]> {
    const rows = await this.query(
      "SELECT id,name,color,sort_order,created_at FROM tags ORDER BY sort_order,id",
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      color: String(row.color),
      sortOrder: Number(row.sort_order),
      createdAt: String(row.created_at),
    }));
  }

  async saveTag(tag: PlanTag): Promise<PlanTag> {
    assertValidPlanTag(tag);
    await this.transaction(async () => {
      const [duplicate] = await this.query(
        "SELECT name FROM tags WHERE lower(name)=lower(?) LIMIT 1",
        [tag.name],
      );
      if (duplicate && String(duplicate.name) !== tag.name) {
        throw new Error("已存在同名标签");
      }
      if (!duplicate) {
        const [count] = await this.query("SELECT COUNT(*) count FROM tags");
        if (Number(count?.count ?? 0) >= MAX_PLAN_TAGS) {
          throw new Error("最多只能创建 8 个标签");
        }
      }
      await this.runInTransaction(
        `INSERT INTO tags(name,color,sort_order,created_at) VALUES(?,?,?,?)
         ON CONFLICT(name) DO UPDATE SET color=excluded.color,sort_order=excluded.sort_order`,
        [tag.name, tag.color, tag.sortOrder, tag.createdAt],
      );
    });
    const rows = await this.query(
      "SELECT id,name,color,sort_order,created_at FROM tags WHERE name=?",
      [tag.name],
    );
    const row = rows[0];
    if (!row) throw new Error("标签保存失败");
    return {
      id: Number(row.id),
      name: String(row.name),
      color: String(row.color),
      sortOrder: Number(row.sort_order),
      createdAt: String(row.created_at),
    };
  }

  async renameTag(originalName: string, tag: PlanTag): Promise<PlanTag> {
    let renamed: PlanTag | undefined;
    await this.transaction(async () => {
      const [existing] = await this.query(
        "SELECT id,name,color,sort_order,created_at FROM tags WHERE name=?",
        [originalName],
      );
      if (!existing) throw new Error("原标签不存在，请刷新后重试");
      const [duplicate] = await this.query(
        "SELECT id FROM tags WHERE lower(name)=lower(?)",
        [tag.name],
      );
      if (duplicate && Number(duplicate.id) !== Number(existing.id)) {
        throw new Error("已存在同名标签");
      }
      assertValidPlanTag({
        ...tag,
        id: Number(existing.id),
        createdAt: String(existing.created_at),
      });
      await this.runInTransaction(
        "UPDATE tags SET name=?,color=?,sort_order=? WHERE id=?",
        [tag.name, tag.color, tag.sortOrder, existing.id],
      );
      renamed = {
        id: Number(existing.id),
        name: tag.name,
        color: tag.color,
        sortOrder: tag.sortOrder,
        createdAt: String(existing.created_at),
      };
    });
    if (!renamed) throw new Error("标签改名失败");
    return renamed;
  }

  async deleteTag(name: string): Promise<void> {
    await this.run("DELETE FROM tags WHERE name=?", [name]);
  }

  async reorderTags(names: string[]): Promise<void> {
    await this.transaction(async () => {
      for (const [index, name] of names.entries()) {
        await this.runInTransaction(
          "UPDATE tags SET sort_order=? WHERE name=?",
          [index + 1, name],
        );
      }
    });
  }

  async listPlans(): Promise<SavedPlan[]> {
    const rows = await this.query(
      "SELECT * FROM plans ORDER BY updated_at DESC",
    );
    return Promise.all(rows.map((row) => this.hydratePlan(row)));
  }

  async getPlan(id: string): Promise<SavedPlan | undefined> {
    const rows = await this.query("SELECT * FROM plans WHERE id=?", [id]);
    return rows[0] ? this.hydratePlan(rows[0]) : undefined;
  }

  async savePlan(plan: SavedPlan, expectedRevision?: number): Promise<void> {
    await this.transaction(async () => {
      await this.writePlanInTransaction(plan, expectedRevision);
    });
  }

  async importPlans(
    tags: PlanTag[],
    plans: SavedPlan[],
    matches: MatchSnapshot[] = [],
    results: MatchResult[] = [],
  ): Promise<{
    tags: number;
    plans: number;
    matches: number;
    results: number;
  }> {
    let importedMatchCount = 0;
    let importedResultCount = 0;
    tags.forEach(assertValidPlanTag);
    matches.forEach(assertValidMatchSnapshot);
    results.forEach(assertValidMatchResult);
    await this.transaction(async () => {
      const existingTags = await this.query("SELECT name FROM tags");
      const identities = new Set(
        existingTags.map((tag) => normalizedTagIdentity(String(tag.name))),
      );
      tags.forEach((tag) => identities.add(normalizedTagIdentity(tag.name)));
      if (identities.size > MAX_PLAN_TAGS) {
        throw new Error("最多只能创建 8 个标签");
      }
      for (const tag of tags) {
        const caseDuplicate = existingTags.find(
          (item) =>
            normalizedTagIdentity(String(item.name)) ===
              normalizedTagIdentity(tag.name) && String(item.name) !== tag.name,
        );
        if (caseDuplicate) throw new Error("已存在同名标签");
        await this.runInTransaction(
          `INSERT INTO tags(name,color,sort_order,created_at) VALUES(?,?,?,?)
           ON CONFLICT(name) DO UPDATE SET color=excluded.color,sort_order=excluded.sort_order`,
          [tag.name, tag.color, tag.sortOrder, tag.createdAt],
        );
      }
      for (const plan of plans) {
        const [existing] = await this.query(
          "SELECT revision FROM plans WHERE id=?",
          [plan.id],
        );
        await this.writePlanInTransaction({
          ...plan,
          revision: existing
            ? Math.max(plan.revision, Number(existing.revision) + 1)
            : plan.revision,
        });
      }
      const newerMatches: MatchSnapshot[] = [];
      for (const match of matches) {
        const [existing] = await this.query(
          "SELECT updated_at FROM match_snapshots WHERE match_id=?",
          [match.matchId],
        );
        if (
          !existing ||
          isNewerTimestamp(match.updatedAt, String(existing.updated_at))
        ) {
          newerMatches.push(match);
        }
      }
      for (const match of newerMatches) {
        await this.writeMatchInTransaction(match);
      }
      importedMatchCount = newerMatches.length;
      const newerResults: MatchResult[] = [];
      for (const result of results) {
        const [existing] = await this.query(
          "SELECT fetched_at FROM match_results WHERE match_id=? ORDER BY julianday(fetched_at) DESC,id DESC LIMIT 1",
          [result.matchId],
        );
        if (
          !existing ||
          isNewerTimestamp(result.fetchedAt, String(existing.fetched_at))
        ) {
          newerResults.push(result);
        }
      }
      for (const matchId of new Set(
        newerResults.map((result) => result.matchId),
      )) {
        await this.runInTransaction(
          "DELETE FROM match_results WHERE match_id=?",
          [matchId],
        );
      }
      for (const result of newerResults) {
        await this.writeResultInTransaction(result);
      }
      importedResultCount = newerResults.length;
    });
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
    await this.transaction(async () => {
      await this.writePlanInTransaction(plan, expectedRevision);
      await this.writeLedgerOrderInTransaction(order);
    });
  }

  async deletePlan(id: string): Promise<void> {
    await this.run("DELETE FROM plans WHERE id=?", [id]);
  }

  async listMatches(): Promise<MatchSnapshot[]> {
    const rows = await this.query(
      "SELECT * FROM match_snapshots ORDER BY match_datetime",
    );
    return rows.map((row) => ({
      matchId: Number(row.match_id),
      matchNum: String(row.match_num),
      matchDateTime: String(row.match_datetime),
      homeTeam: String(row.home_team),
      awayTeam: String(row.away_team),
      payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
      updatedAt: String(row.updated_at),
    }));
  }

  async saveMatches(matches: MatchSnapshot[]): Promise<void> {
    matches.forEach(assertValidMatchSnapshot);
    await this.transaction(async () => {
      for (const match of matches) await this.writeMatchInTransaction(match);
    });
  }

  private async writeMatchInTransaction(match: MatchSnapshot): Promise<void> {
    await this.runInTransaction(
      `INSERT INTO match_snapshots(match_id,match_num,match_datetime,home_team,away_team,payload,updated_at)
       VALUES(?,?,?,?,?,?,?) ON CONFLICT(match_id) DO UPDATE SET
       match_num=excluded.match_num,match_datetime=excluded.match_datetime,
       home_team=excluded.home_team,away_team=excluded.away_team,
       payload=excluded.payload,updated_at=excluded.updated_at`,
      [
        match.matchId,
        match.matchNum,
        match.matchDateTime,
        match.homeTeam,
        match.awayTeam,
        JSON.stringify(match.payload),
        match.updatedAt,
      ],
    );
  }

  async listLatestResults(): Promise<MatchResult[]> {
    const rows = await this.query(
      `SELECT r.* FROM match_results r
       WHERE r.id=(
         SELECT latest.id FROM match_results latest
         WHERE latest.match_id=r.match_id
         ORDER BY julianday(latest.fetched_at) DESC,latest.id DESC LIMIT 1
       ) ORDER BY r.match_id`,
    );
    return rows.map((row) => this.mapResult(row));
  }

  async saveResults(results: MatchResult[]): Promise<void> {
    results.forEach(assertValidMatchResult);
    await this.transaction(async () => {
      for (const result of results) await this.writeResultInTransaction(result);
    });
  }

  private async writeResultInTransaction(result: MatchResult): Promise<void> {
    await this.runInTransaction(
      `INSERT OR IGNORE INTO match_results(
         match_id,match_num,home_team,away_team,half_time_score,full_time_score,
         goal_line,official_results,fetched_at
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
      [
        result.matchId,
        result.matchNum,
        result.homeTeam,
        result.awayTeam,
        result.halfTimeScore,
        result.fullTimeScore,
        result.goalLine,
        JSON.stringify(result.officialResults),
        result.fetchedAt,
      ],
    );
  }

  async listLedger(filter: LedgerFilter = {}): Promise<LedgerOrder[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (filter.start) {
      clauses.push("substr(purchased_at,1,10)>=?");
      values.push(filter.start);
    }
    if (filter.end) {
      clauses.push("substr(purchased_at,1,10)<=?");
      values.push(filter.end);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = await this.query(
      `SELECT * FROM ledger_orders${where} ORDER BY purchased_at DESC`,
      values,
    );
    return rows.map((row) => this.mapLedger(row));
  }

  async saveLedgerOrder(order: LedgerOrder): Promise<void> {
    await this.run(...this.ledgerOrderStatement(order));
  }

  private async writeLedgerOrderInTransaction(
    order: LedgerOrder,
  ): Promise<void> {
    await this.runInTransaction(...this.ledgerOrderStatement(order));
  }

  private ledgerOrderStatement(order: LedgerOrder): [string, unknown[]] {
    assertPersistableLedgerOrder(order);
    return [
      `INSERT INTO ledger_orders(
         id,plan_id,plan_name,plan_snapshot,purchased_at,stake_cents,return_cents,
         return_manual,status,notes,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
       plan_id=excluded.plan_id,plan_name=excluded.plan_name,plan_snapshot=excluded.plan_snapshot,
       purchased_at=excluded.purchased_at,stake_cents=excluded.stake_cents,
       return_cents=excluded.return_cents,return_manual=excluded.return_manual,
       status=excluded.status,notes=excluded.notes,updated_at=excluded.updated_at`,
      [
        order.id,
        order.planId ?? null,
        order.planName,
        JSON.stringify(order.planSnapshot),
        order.purchasedAt,
        order.stakeCents,
        order.returnCents,
        order.returnManual ? 1 : 0,
        order.status,
        order.notes,
        order.createdAt,
        order.updatedAt,
      ],
    ];
  }

  async updateLedgerNotes(
    id: string,
    notes: string,
    expectedUpdatedAt?: string,
  ): Promise<void> {
    const normalizedNotes = normalizeLedgerNotes(notes);
    await this.transaction(async () => {
      const [existing] = await this.query(
        "SELECT updated_at FROM ledger_orders WHERE id=?",
        [id],
      );
      if (!existing) throw new Error("账单不存在");
      if (
        expectedUpdatedAt &&
        String(existing.updated_at) !== expectedUpdatedAt
      ) {
        throw new Error("账单已在其他页面更新，请刷新后重试");
      }
      await this.runInTransaction(
        "UPDATE ledger_orders SET notes=?,updated_at=? WHERE id=?",
        [normalizedNotes, now(), id],
      );
    });
  }

  async updateLedgerReturn(
    id: string,
    returnCents: number,
    expectedUpdatedAt?: string,
    previousReturnCents?: number,
  ): Promise<void> {
    try {
      if (!Number.isSafeInteger(returnCents) || returnCents < 0) {
        throw new TypeError("回款金额必须是非负整数分");
      }
      if (
        previousReturnCents !== undefined &&
        (!Number.isSafeInteger(previousReturnCents) || previousReturnCents < 0)
      ) {
        throw new TypeError("原回款金额必须是非负整数分");
      }
      await this.transaction(async () => {
        const rows = await this.query(
          "SELECT return_cents,updated_at FROM ledger_orders WHERE id=?",
          [id],
        );
        const existing = rows[0];
        if (!existing) throw new Error("账单不存在");
        if (
          expectedUpdatedAt &&
          String(existing.updated_at) !== expectedUpdatedAt
        ) {
          throw new Error("账单已在其他页面更新，请刷新后重试");
        }
        const stamp = now();
        await this.runInTransaction(
          `INSERT INTO ledger_adjustments(
             order_id,previous_return_cents,next_return_cents,occurred_at,note,
             status,source,operator,failure_reason,attempted_value
           ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            previousReturnCents ?? Number(existing.return_cents),
            returnCents,
            stamp,
            "",
            "success",
            "manual",
            LOCAL_LEDGER_OPERATOR,
            "",
            String(returnCents),
          ],
        );
        await this.runInTransaction(
          "UPDATE ledger_orders SET return_cents=?,return_manual=?,updated_at=? WHERE id=?",
          [returnCents, 1, stamp, id],
        );
      });
    } catch (error) {
      await this.auditFailedLedgerAdjustment(
        id,
        previousReturnCents,
        String(returnCents),
        error,
      );
      throw error;
    }
  }

  async recordLedgerAdjustmentFailure(
    id: string,
    previousReturnCents: number | undefined,
    attemptedValue: string,
    failureReason: string,
  ): Promise<void> {
    const normalizedAttempt = attemptedValue.trim().slice(0, 80);
    const normalizedReason = failureReason.trim().slice(0, 240);
    if (!normalizedReason) throw new TypeError("失败原因不能为空");
    await this.transaction(async () => {
      const [existing] = await this.query(
        "SELECT return_cents FROM ledger_orders WHERE id=?",
        [id],
      );
      if (!existing) throw new Error("账单不存在");
      const previous =
        previousReturnCents !== undefined &&
        Number.isSafeInteger(previousReturnCents) &&
        previousReturnCents >= 0
          ? previousReturnCents
          : Number(existing.return_cents);
      await this.runInTransaction(
        `INSERT INTO ledger_adjustments(
           order_id,previous_return_cents,next_return_cents,occurred_at,note,
           status,source,operator,failure_reason,attempted_value
         ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          previous,
          previous,
          now(),
          "",
          "failed",
          "manual",
          LOCAL_LEDGER_OPERATOR,
          normalizedReason,
          normalizedAttempt,
        ],
      );
    });
  }

  async listLedgerAdjustments(orderId: string): Promise<LedgerAdjustment[]> {
    const rows = await this.query(
      "SELECT * FROM ledger_adjustments WHERE order_id=? ORDER BY occurred_at DESC,id DESC",
      [orderId],
    );
    return rows.map((row) =>
      normalizeLedgerAdjustment({
        id: Number(row.id),
        orderId: String(row.order_id),
        previousReturnCents: Number(row.previous_return_cents),
        nextReturnCents: Number(row.next_return_cents),
        occurredAt: String(row.occurred_at),
        note: String(row.note),
        status: row.status === "failed" ? "failed" : "success",
        source: row.source === "system" ? "system" : "manual",
        operator: String(row.operator ?? ""),
        failureReason: String(row.failure_reason ?? ""),
        attemptedValue: String(row.attempted_value ?? ""),
      }),
    );
  }

  async undoLatestLedgerAdjustment(
    id: string,
    expectedUpdatedAt?: string,
  ): Promise<void> {
    await this.transaction(async () => {
      const orders = await this.query(
        "SELECT updated_at FROM ledger_orders WHERE id=?",
        [id],
      );
      const order = orders[0];
      if (!order) throw new Error("账单不存在");
      if (expectedUpdatedAt && String(order.updated_at) !== expectedUpdatedAt) {
        throw new Error("账单已在其他页面更新，请刷新后重试");
      }
      const adjustments = await this.query(
        "SELECT * FROM ledger_adjustments WHERE order_id=? AND status='success' ORDER BY occurred_at DESC,id DESC LIMIT 1",
        [id],
      );
      const latest = adjustments[0];
      if (!latest) throw new Error("没有可以撤销的回款修改");
      const remaining = await this.query(
        "SELECT COUNT(*) count FROM ledger_adjustments WHERE order_id=? AND status='success' AND id<>?",
        [id, latest.id],
      );
      await this.runInTransaction(
        "UPDATE ledger_orders SET return_cents=?,return_manual=?,updated_at=? WHERE id=?",
        [
          Number(latest.previous_return_cents),
          Number(remaining[0]?.count ?? 0) > 0 ? 1 : 0,
          now(),
          id,
        ],
      );
      await this.runInTransaction("DELETE FROM ledger_adjustments WHERE id=?", [
        latest.id,
      ]);
    });
  }

  async saveSyncJob(job: SyncJob): Promise<number> {
    const result = await this.run(
      `INSERT INTO sync_jobs(kind,status,added_count,updated_count,failed_count,error_message,started_at,finished_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      [
        job.kind,
        job.status,
        job.addedCount,
        job.updatedCount,
        job.failedCount,
        job.errorMessage,
        job.startedAt,
        job.finishedAt ?? null,
      ],
      "last",
    );
    return Number(result.changes?.lastId ?? 0);
  }

  async saveOddsHistory(entries: OddsHistoryEntry[]): Promise<void> {
    await this.transaction(async () => {
      for (const entry of entries) {
        await this.runInTransaction(
          `INSERT OR IGNORE INTO odds_history(match_id,market,outcome,odds,captured_at)
           VALUES(?,?,?,?,?)`,
          [
            entry.matchId,
            entry.market,
            entry.outcome,
            entry.odds,
            entry.capturedAt,
          ],
        );
      }
    });
  }

  async recordEvent(event: AppEvent): Promise<number> {
    const result = await this.run(
      "INSERT INTO app_events(type,payload,created_at) VALUES(?,?,?)",
      [event.type, JSON.stringify(event.payload), event.createdAt],
      "last",
    );
    return Number(result.changes?.lastId ?? 0);
  }

  async listEvents(type?: string, limit = 20): Promise<AppEvent[]> {
    const safeLimit = Math.max(0, Math.trunc(limit));
    const rows = type
      ? await this.query(
          "SELECT * FROM app_events WHERE type=? ORDER BY created_at DESC,id DESC LIMIT ?",
          [type, safeLimit],
        )
      : await this.query(
          "SELECT * FROM app_events ORDER BY created_at DESC,id DESC LIMIT ?",
          [safeLimit],
        );
    return rows.map((row) => ({
      id: Number(row.id),
      type: String(row.type),
      payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
      createdAt: String(row.created_at),
    }));
  }

  async createBackupSnapshot(): Promise<DatabaseBackupSnapshot> {
    return this.transaction(async () => {
      const settings = await this.getSettings();
      const tags = await this.listTags();
      const plans = await this.listPlans();
      const ledgerOrders = await this.listLedger();
      const matches = await this.listMatches();
      const resultRows = await this.query(
        "SELECT * FROM match_results ORDER BY match_id,julianday(fetched_at),id",
      );
      const adjustmentRows = await this.query(
        "SELECT * FROM ledger_adjustments ORDER BY occurred_at,id",
      );
      const syncRows = await this.query(
        "SELECT * FROM sync_jobs ORDER BY started_at,id",
      );
      const oddsRows = await this.query(
        "SELECT * FROM odds_history ORDER BY captured_at,id",
      );
      const eventRows = await this.query(
        "SELECT * FROM app_events ORDER BY created_at,id",
      );
      return {
        settings,
        tags,
        plans,
        ledgerOrders,
        ledgerAdjustments: adjustmentRows.map((row) =>
          this.mapLedgerAdjustment(row),
        ),
        matches,
        results: resultRows.map((row) => this.mapResult(row)),
        syncJobs: syncRows.map((row) => this.mapSyncJob(row)),
        oddsHistory: oddsRows.map((row) => this.mapOddsHistory(row)),
        appEvents: eventRows.map((row) => this.mapEvent(row)),
      };
    });
  }

  async restoreBackupSnapshot(
    snapshot: DatabaseBackupSnapshot,
  ): Promise<DatabaseCounts> {
    const restored = normalizeBackupSnapshot(snapshot);
    await this.transaction(async () => {
      const tables = [
        "ledger_adjustments",
        "ledger_orders",
        "plan_tags",
        "plan_selections",
        "plans",
        "tags",
        "match_results",
        "match_snapshots",
        "odds_history",
        "sync_jobs",
        "app_events",
        "settings",
      ] as const;
      for (const table of tables) {
        await this.runInTransaction(`DELETE FROM ${table}`);
      }
      await this.writeSettingsInTransaction(restored.settings);
      for (const tag of restored.tags) {
        await this.runInTransaction(
          "INSERT INTO tags(name,color,sort_order,created_at) VALUES(?,?,?,?)",
          [tag.name, tag.color, tag.sortOrder, tag.createdAt],
        );
      }
      for (const plan of restored.plans) {
        await this.writePlanInTransaction(plan);
      }
      for (const match of restored.matches) {
        await this.writeMatchInTransaction(match);
      }
      for (const result of restored.results) {
        await this.writeResultInTransaction(result);
      }
      for (const order of restored.ledgerOrders) {
        await this.writeLedgerOrderInTransaction(order);
      }
      for (const adjustment of restored.ledgerAdjustments) {
        await this.runInTransaction(
          `INSERT INTO ledger_adjustments(
             order_id,previous_return_cents,next_return_cents,occurred_at,note,
             status,source,operator,failure_reason,attempted_value
           ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
          [
            adjustment.orderId,
            adjustment.previousReturnCents,
            adjustment.nextReturnCents,
            adjustment.occurredAt,
            adjustment.note,
            adjustment.status,
            adjustment.source,
            adjustment.operator,
            adjustment.failureReason,
            adjustment.attemptedValue,
          ],
        );
      }
      for (const job of restored.syncJobs) {
        await this.runInTransaction(
          `INSERT INTO sync_jobs(
             kind,status,added_count,updated_count,failed_count,error_message,
             started_at,finished_at
           ) VALUES(?,?,?,?,?,?,?,?)`,
          [
            job.kind,
            job.status,
            job.addedCount,
            job.updatedCount,
            job.failedCount,
            job.errorMessage,
            job.startedAt,
            job.finishedAt ?? null,
          ],
        );
      }
      for (const entry of restored.oddsHistory) {
        await this.runInTransaction(
          `INSERT INTO odds_history(match_id,market,outcome,odds,captured_at)
           VALUES(?,?,?,?,?)`,
          [
            entry.matchId,
            entry.market,
            entry.outcome,
            entry.odds,
            entry.capturedAt,
          ],
        );
      }
      for (const event of restored.appEvents) {
        await this.runInTransaction(
          "INSERT INTO app_events(type,payload,created_at) VALUES(?,?,?)",
          [event.type, JSON.stringify(event.payload), event.createdAt],
        );
      }
    });
    return this.getCounts();
  }

  async getCounts(): Promise<DatabaseCounts> {
    const names = [
      "settings",
      "tags",
      "plans",
      "plan_selections",
      "match_snapshots",
      "match_results",
      "ledger_orders",
    ] as const;
    const values = await Promise.all(
      names.map(async (name) =>
        Number(
          (await this.query(`SELECT COUNT(*) count FROM ${name}`))[0]?.count ??
            0,
        ),
      ),
    );
    return {
      settings: values[0],
      tags: values[1],
      plans: values[2],
      planSelections: values[3],
      matches: values[4],
      results: values[5],
      ledgerOrders: values[6],
    };
  }

  async clearLocalData(): Promise<DatabaseCounts> {
    await this.transaction(async () => {
      // Keep the schema intact and clear records in foreign-key-safe order.
      // This is deliberately a fixed allow-list rather than accepting table
      // names from the caller, and the whole reset either commits or rolls
      // back as one native SQLite transaction.
      const tables = [
        "ledger_adjustments",
        "ledger_orders",
        "plan_tags",
        "plan_selections",
        "plans",
        "tags",
        "match_results",
        "match_snapshots",
        "odds_history",
        "sync_jobs",
        "app_events",
        "settings",
      ] as const;
      for (const table of tables) {
        await this.runInTransaction(`DELETE FROM ${table}`);
      }
      await this.seedSettingsInTransaction();
    });
    return this.getCounts();
  }

  private async ensureLedgerAdjustmentColumnsInTransaction(): Promise<void> {
    const columns = new Set(
      (await this.query("PRAGMA table_info(ledger_adjustments)")).map((row) =>
        String(row.name),
      ),
    );
    const missingColumns = [
      ["status", "TEXT NOT NULL DEFAULT 'success'"],
      ["source", "TEXT NOT NULL DEFAULT 'manual'"],
      ["operator", "TEXT NOT NULL DEFAULT '本机'"],
      ["failure_reason", "TEXT NOT NULL DEFAULT ''"],
      ["attempted_value", "TEXT NOT NULL DEFAULT ''"],
    ] as const;
    for (const [name, definition] of missingColumns) {
      if (!columns.has(name)) {
        await this.runInTransaction(
          `ALTER TABLE ledger_adjustments ADD COLUMN ${name} ${definition}`,
        );
      }
    }
  }

  private async auditFailedLedgerAdjustment(
    id: string,
    previousReturnCents: number | undefined,
    attemptedValue: string,
    error: unknown,
  ): Promise<void> {
    const reason = nativeErrorMessage(error);
    try {
      await this.recordLedgerAdjustmentFailure(
        id,
        previousReturnCents,
        attemptedValue,
        reason,
      );
    } catch (auditError) {
      if (nativeErrorMessage(auditError) === "账单不存在") return;
      throw new Error(
        `${reason}；失败记录保存失败：${nativeErrorMessage(auditError)}`,
        { cause: error },
      );
    }
  }

  private get db(): SQLiteDBConnection {
    if (!this.connection) throw new Error("数据库尚未初始化");
    return this.connection;
  }

  private async query(
    statement: string,
    values: unknown[] = [],
  ): Promise<SqlRow[]> {
    const result = await this.db.query(statement, values);
    return (result.values ?? []) as SqlRow[];
  }

  private async writePlanInTransaction(
    plan: SavedPlan,
    expectedRevision?: number,
  ): Promise<void> {
    assertPersistablePlan(plan);
    if (expectedRevision !== undefined) {
      const [existing] = await this.query(
        "SELECT revision FROM plans WHERE id=?",
        [plan.id],
      );
      if (!existing || Number(existing.revision) !== expectedRevision) {
        throw new Error("方案已在其他页面更新，请重新载入后再保存");
      }
    }
    for (const tagName of plan.tags) {
      const [tag] = await this.query("SELECT name FROM tags WHERE name=?", [
        tagName,
      ]);
      if (!tag) {
        throw new Error("方案包含已删除的标签，请刷新后重试");
      }
    }
    await this.runInTransaction(
      `INSERT INTO plans(id,source_plan_id,revision,status,name,pass_counts,multiplier,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET source_plan_id=excluded.source_plan_id,
       revision=excluded.revision,status=excluded.status,name=excluded.name,
       pass_counts=excluded.pass_counts,multiplier=excluded.multiplier,updated_at=excluded.updated_at`,
      [
        plan.id,
        plan.sourcePlanId ?? null,
        plan.revision,
        plan.status,
        plan.name,
        JSON.stringify(plan.passCounts),
        plan.multiplier,
        plan.createdAt,
        plan.updatedAt,
      ],
    );
    await this.runInTransaction("DELETE FROM plan_selections WHERE plan_id=?", [
      plan.id,
    ]);
    await this.runInTransaction("DELETE FROM plan_tags WHERE plan_id=?", [
      plan.id,
    ]);
    for (const selection of plan.selections) {
      await this.runInTransaction(
        `INSERT INTO plan_selections(plan_id,match_id,market,outcome,odds,selection_key)
         VALUES(?,?,?,?,?,?)`,
        [
          plan.id,
          selection.matchId,
          selection.market,
          selection.outcome,
          selection.odds,
          selection.key,
        ],
      );
    }
    for (const tagName of plan.tags) {
      await this.runInTransaction(
        `INSERT OR IGNORE INTO plan_tags(plan_id,tag_id)
         SELECT ?,id FROM tags WHERE name=?`,
        [plan.id, tagName],
      );
    }
  }

  private run(
    statement: string,
    values: unknown[] = [],
    returnMode: Parameters<SQLiteDBConnection["run"]>[3] = "no",
  ) {
    // Standalone writes share the same queue as multi-statement transactions.
    // Otherwise a sync log/tag write could enter the native connection while
    // saveMatches/saveResults owns a transaction and recreate the Android
    // "Already in transaction" failure through a different call path.
    return this.transactions.run(() =>
      this.runInTransaction(statement, values, returnMode),
    );
  }

  private runInTransaction(
    statement: string,
    values: unknown[] = [],
    returnMode: Parameters<SQLiteDBConnection["run"]>[3] = "no",
  ) {
    // We manage multi-statement transactions explicitly in transaction().
    // Passing the plugin default (`true`) here would make every statement try
    // to open another native transaction and Android rejects it as nested.
    // A standalone SQLite statement is atomic even with this flag disabled.
    return this.db.run(statement, values, false, returnMode);
  }

  private async seedSettings(): Promise<void> {
    await this.transactions.run(() => this.seedSettingsInTransaction());
  }

  private async seedSettingsInTransaction(): Promise<void> {
    await this.writeSettingsInTransaction(DEFAULT_SETTINGS, true);
  }

  private async writeSettingsInTransaction(
    settings: AppSettings,
    insertOnly = false,
  ): Promise<void> {
    const entries: Array<[string, number | boolean]> = [
      ["history_limits", settings.historyLimits],
      ["workers", settings.workers],
      ["timeout", settings.timeoutSeconds],
      ["retries", settings.retries],
      ["default_multiplier", settings.defaultMultiplier],
      ["auto_sync_matches", settings.autoSyncMatches],
      ["expand_match_details", settings.expandMatchDetails],
    ];
    for (const [key, value] of entries) {
      await this.runInTransaction(
        insertOnly
          ? "INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)"
          : `INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
        [key, JSON.stringify(value), now()],
      );
    }
  }

  private async hydratePlan(row: SqlRow): Promise<SavedPlan> {
    const [selectionRows, tagRows] = await Promise.all([
      this.query("SELECT * FROM plan_selections WHERE plan_id=? ORDER BY id", [
        row.id,
      ]),
      this.query(
        `SELECT t.name FROM plan_tags pt JOIN tags t ON t.id=pt.tag_id
         WHERE pt.plan_id=? ORDER BY t.sort_order,t.id`,
        [row.id],
      ),
    ]);
    const selections: PlanSelection[] = selectionRows.map((selection) => ({
      key: String(selection.selection_key),
      matchId: Number(selection.match_id),
      market: String(selection.market) as PlanSelection["market"],
      outcome: String(selection.outcome),
      odds: String(selection.odds),
    }));
    return {
      id: String(row.id),
      sourcePlanId: row.source_plan_id ? String(row.source_plan_id) : undefined,
      revision: Number(row.revision),
      status: "saved",
      name: String(row.name),
      selections,
      passCounts: JSON.parse(String(row.pass_counts)) as number[],
      multiplier: Number(row.multiplier),
      tags: tagRows.map((tag) => String(tag.name)),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapResult(row: SqlRow): MatchResult {
    return {
      id: Number(row.id),
      matchId: Number(row.match_id),
      matchNum: String(row.match_num),
      homeTeam: String(row.home_team),
      awayTeam: String(row.away_team),
      halfTimeScore: String(row.half_time_score),
      fullTimeScore: String(row.full_time_score),
      goalLine: Number(row.goal_line),
      officialResults: JSON.parse(
        String(row.official_results),
      ) as MatchResult["officialResults"],
      fetchedAt: String(row.fetched_at),
    };
  }

  private mapLedgerAdjustment(row: SqlRow): LedgerAdjustment {
    return normalizeLedgerAdjustment({
      id: Number(row.id),
      orderId: String(row.order_id),
      previousReturnCents: Number(row.previous_return_cents),
      nextReturnCents: Number(row.next_return_cents),
      occurredAt: String(row.occurred_at),
      note: String(row.note),
      status: String(row.status) as LedgerAdjustment["status"],
      source: String(row.source) as LedgerAdjustment["source"],
      operator: String(row.operator ?? ""),
      failureReason: String(row.failure_reason ?? ""),
      attemptedValue: String(row.attempted_value ?? ""),
    });
  }

  private mapSyncJob(row: SqlRow): SyncJob {
    return {
      id: Number(row.id),
      kind: String(row.kind) as SyncJob["kind"],
      status: String(row.status) as SyncJob["status"],
      addedCount: Number(row.added_count),
      updatedCount: Number(row.updated_count),
      failedCount: Number(row.failed_count),
      errorMessage: String(row.error_message),
      startedAt: String(row.started_at),
      ...(row.finished_at ? { finishedAt: String(row.finished_at) } : {}),
    };
  }

  private mapOddsHistory(row: SqlRow): OddsHistoryEntry {
    return {
      id: Number(row.id),
      matchId: Number(row.match_id),
      market: String(row.market) as OddsHistoryEntry["market"],
      outcome: String(row.outcome),
      odds: String(row.odds),
      capturedAt: String(row.captured_at),
    };
  }

  private mapEvent(row: SqlRow): AppEvent {
    return {
      id: Number(row.id),
      type: String(row.type),
      payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
      createdAt: String(row.created_at),
    };
  }

  private mapLedger(row: SqlRow): LedgerOrder {
    return {
      id: String(row.id),
      planId: row.plan_id ? String(row.plan_id) : undefined,
      planName: String(row.plan_name),
      planSnapshot: JSON.parse(String(row.plan_snapshot)) as SavedPlan,
      purchasedAt: String(row.purchased_at),
      stakeCents: Number(row.stake_cents),
      returnCents: Number(row.return_cents),
      returnManual: Boolean(row.return_manual),
      status: String(row.status) as LedgerOrder["status"],
      notes: String(row.notes),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}
