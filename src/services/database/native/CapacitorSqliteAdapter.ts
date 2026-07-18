import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from "@capacitor-community/sqlite";

import type {
  DatabaseAdapter,
  LedgerFilter,
} from "@/services/database/DatabaseAdapter";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  NATIVE_SCHEMA,
} from "@/services/database/schema";
import { prepareLegacyNativeDatabase } from "@/services/migration/legacyNativeMigration";
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

type SqlRow = Record<string, unknown>;

const now = () => new Date().toISOString();

const LEGACY_LEDGER_SCHEMA = `
PRAGMA foreign_keys=OFF;
ALTER TABLE ledger_transactions RENAME TO ledger_transactions_legacy_v3;
ALTER TABLE ledger_orders RENAME TO ledger_orders_legacy_v3;
`;

export class CapacitorSqliteAdapter implements DatabaseAdapter {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private connection?: SQLiteDBConnection;

  async initialize(): Promise<void> {
    await prepareLegacyNativeDatabase(DATABASE_NAME);
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
    await this.migrateLegacyLedgerIfNeeded();
    await this.db.execute(NATIVE_SCHEMA, true);
    await this.db.run(
      "INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(?,?)",
      [DATABASE_VERSION, now()],
    );
    await this.seedSettings();
    await this.seedTags();
  }

  async close(): Promise<void> {
    if (!this.connection) return;
    await this.connection.close();
    await this.sqlite.closeConnection(DATABASE_NAME, false);
    this.connection = undefined;
  }

  async transaction<T>(action: () => Promise<T>): Promise<T> {
    await this.db.beginTransaction();
    try {
      const result = await action();
      await this.db.commitTransaction();
      return result;
    } catch (error) {
      await this.db.rollbackTransaction();
      throw error;
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
    };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const entries: Array<[string, number]> = [
      ["history_limits", settings.historyLimits],
      ["workers", settings.workers],
      ["timeout", settings.timeoutSeconds],
      ["retries", settings.retries],
      ["default_multiplier", settings.defaultMultiplier],
    ];
    await this.transaction(async () => {
      for (const [key, value] of entries) {
        await this.db.run(
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
    await this.db.run(
      `INSERT INTO tags(name,color,sort_order,created_at) VALUES(?,?,?,?)
       ON CONFLICT(name) DO UPDATE SET color=excluded.color,sort_order=excluded.sort_order`,
      [tag.name, tag.color, tag.sortOrder, tag.createdAt],
    );
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

  async deleteTag(name: string): Promise<void> {
    await this.db.run("DELETE FROM tags WHERE name=?", [name]);
  }

  async reorderTags(names: string[]): Promise<void> {
    await this.transaction(async () => {
      for (const [index, name] of names.entries()) {
        await this.db.run("UPDATE tags SET sort_order=? WHERE name=?", [
          index + 1,
          name,
        ]);
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

  async savePlan(plan: SavedPlan): Promise<void> {
    await this.transaction(async () => {
      await this.db.run(
        `INSERT INTO plans(id,name,pass_counts,multiplier,created_at,updated_at)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name,pass_counts=excluded.pass_counts,
         multiplier=excluded.multiplier,updated_at=excluded.updated_at`,
        [
          plan.id,
          plan.name,
          JSON.stringify(plan.passCounts),
          plan.multiplier,
          plan.createdAt,
          plan.updatedAt,
        ],
      );
      await this.db.run("DELETE FROM plan_selections WHERE plan_id=?", [
        plan.id,
      ]);
      await this.db.run("DELETE FROM plan_tags WHERE plan_id=?", [plan.id]);
      for (const selection of plan.selections) {
        await this.db.run(
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
      for (const [index, tagName] of plan.tags.entries()) {
        await this.db.run(
          "INSERT OR IGNORE INTO tags(name,color,sort_order,created_at) VALUES(?,?,?,?)",
          [tagName, "#5797F5", index + 1, plan.createdAt],
        );
        await this.db.run(
          `INSERT OR IGNORE INTO plan_tags(plan_id,tag_id)
           SELECT ?,id FROM tags WHERE name=?`,
          [plan.id, tagName],
        );
      }
    });
  }

  async deletePlan(id: string): Promise<void> {
    await this.db.run("DELETE FROM plans WHERE id=?", [id]);
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
    await this.transaction(async () => {
      for (const match of matches) {
        await this.db.run(
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
    });
  }

  async listLatestResults(): Promise<MatchResult[]> {
    const rows = await this.query(
      `SELECT r.* FROM match_results r
       JOIN (SELECT match_id,MAX(id) id FROM match_results GROUP BY match_id) latest
       ON latest.id=r.id ORDER BY r.match_id`,
    );
    return rows.map((row) => this.mapResult(row));
  }

  async saveResults(results: MatchResult[]): Promise<void> {
    await this.transaction(async () => {
      for (const result of results) {
        await this.db.run(
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
    });
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
    await this.db.run(
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
    );
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
    const stamp = now();
    const result = expectedUpdatedAt
      ? await this.db.run(
          "UPDATE ledger_orders SET return_cents=?,return_manual=?,updated_at=? WHERE id=? AND updated_at=?",
          [returnCents, manual ? 1 : 0, stamp, id, expectedUpdatedAt],
        )
      : await this.db.run(
          "UPDATE ledger_orders SET return_cents=?,return_manual=?,updated_at=? WHERE id=?",
          [returnCents, manual ? 1 : 0, stamp, id],
        );
    if (!result.changes?.changes) {
      const existing = await this.query(
        "SELECT id FROM ledger_orders WHERE id=?",
        [id],
      );
      if (existing.length)
        throw new Error("账单已在其他页面更新，请刷新后重试");
      throw new Error("账单不存在");
    }
  }

  async saveSyncJob(job: SyncJob): Promise<number> {
    const result = await this.db.run(
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
      true,
      "last",
    );
    return Number(result.changes?.lastId ?? 0);
  }

  async saveOddsHistory(entries: OddsHistoryEntry[]): Promise<void> {
    await this.transaction(async () => {
      for (const entry of entries) {
        await this.db.run(
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
    const result = await this.db.run(
      "INSERT INTO app_events(type,payload,created_at) VALUES(?,?,?)",
      [event.type, JSON.stringify(event.payload), event.createdAt],
      true,
      "last",
    );
    return Number(result.changes?.lastId ?? 0);
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

  private async seedSettings(): Promise<void> {
    const entries: Array<[string, number]> = [
      ["history_limits", DEFAULT_SETTINGS.historyLimits],
      ["workers", DEFAULT_SETTINGS.workers],
      ["timeout", DEFAULT_SETTINGS.timeoutSeconds],
      ["retries", DEFAULT_SETTINGS.retries],
      ["default_multiplier", DEFAULT_SETTINGS.defaultMultiplier],
    ];
    for (const [key, value] of entries) {
      await this.db.run(
        "INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)",
        [key, JSON.stringify(value), now()],
      );
    }
  }

  private async seedTags(): Promise<void> {
    const createdAt = now();
    await this.db.run(
      "INSERT OR IGNORE INTO tags(name,color,sort_order,created_at) VALUES(?,?,?,?)",
      ["已购", "#5797F5", 1, createdAt],
    );
    await this.db.run(
      "INSERT OR IGNORE INTO tags(name,color,sort_order,created_at) VALUES(?,?,?,?)",
      ["AI", "#9A91F5", 2, createdAt],
    );
  }

  private async migrateLegacyLedgerIfNeeded(): Promise<void> {
    const tables = await this.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ledger_orders'",
    );
    if (!tables.length) return;
    const columns = await this.query("PRAGMA table_info(ledger_orders)");
    const names = new Set(columns.map((column) => String(column.name)));
    if (!names.has("stake_amount") || names.has("stake_cents")) return;

    await this.db.execute(LEGACY_LEDGER_SCHEMA, true);
    await this.db.execute(NATIVE_SCHEMA, true);
    await this.db.execute(
      `INSERT INTO ledger_orders(
         id,plan_id,plan_name,plan_snapshot,purchased_at,stake_cents,return_cents,
         return_manual,status,notes,created_at,updated_at
       ) SELECT id,plan_id,plan_name,plan_snapshot,purchased_at,
         CAST(ROUND(stake_amount*100) AS INTEGER),CAST(ROUND(return_amount*100) AS INTEGER),
         return_manual,status,notes,created_at,updated_at FROM ledger_orders_legacy_v3;
       INSERT INTO ledger_transactions(order_id,type,amount_cents,occurred_at,note)
       SELECT order_id,type,CAST(ROUND(amount*100) AS INTEGER),occurred_at,note
       FROM ledger_transactions_legacy_v3;
       DROP TABLE ledger_transactions_legacy_v3;
       DROP TABLE ledger_orders_legacy_v3;
       PRAGMA foreign_keys=ON;`,
      true,
    );
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
