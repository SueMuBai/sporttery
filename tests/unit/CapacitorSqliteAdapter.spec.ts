import { describe, expect, it, vi } from "vitest";

import { CapacitorSqliteAdapter } from "@/services/database/native/CapacitorSqliteAdapter";
import { DEFAULT_SETTINGS } from "@/types/domain";

function nativeConnection(activeStates: boolean[] = [false]) {
  const isTransactionActive = vi.fn(async () => ({
    result: activeStates.shift() ?? false,
  }));
  return {
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    isTransactionActive,
    beginTransaction: vi.fn(async () => ({ changes: {} })),
    commitTransaction: vi.fn(async () => ({ changes: {} })),
    rollbackTransaction: vi.fn(async () => ({ changes: {} })),
    query: vi.fn(async () => ({ values: [] })),
    run: vi.fn(async () => ({ changes: { changes: 1 } })),
  };
}

describe("CapacitorSqliteAdapter native transactions", () => {
  it("clears every business table and restores defaults in one native transaction", async () => {
    const connection = nativeConnection([false]);
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await adapter.clearLocalData();

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
    expect(connection.rollbackTransaction).not.toHaveBeenCalled();
    const statements = connection.run.mock.calls.map(([statement]) =>
      String(statement),
    );
    expect(
      statements.filter((statement) => statement.startsWith("DELETE FROM ")),
    ).toEqual([
      "DELETE FROM ledger_adjustments",
      "DELETE FROM ledger_orders",
      "DELETE FROM plan_tags",
      "DELETE FROM plan_selections",
      "DELETE FROM plans",
      "DELETE FROM tags",
      "DELETE FROM match_results",
      "DELETE FROM match_snapshots",
      "DELETE FROM odds_history",
      "DELETE FROM sync_jobs",
      "DELETE FROM app_events",
      "DELETE FROM settings",
    ]);
    expect(
      statements.filter((statement) =>
        statement.startsWith("INSERT OR IGNORE INTO settings"),
      ),
    ).toHaveLength(7);
    expect(statements.join("\n")).not.toMatch(/DROP\s+TABLE|deleteDatabase/i);
  });

  it("rolls back the whole clear operation when any table write fails", async () => {
    const connection = nativeConnection([false]);
    connection.run.mockImplementation(async (statement: string) => {
      if (statement === "DELETE FROM plans") {
        throw new Error("simulated delete failure");
      }
      return { changes: { changes: 1 } };
    });
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await expect(adapter.clearLocalData()).rejects.toThrow(
      "simulated delete failure",
    );

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commitTransaction).not.toHaveBeenCalled();
    expect(connection.rollbackTransaction).toHaveBeenCalledOnce();
    expect(connection.run).not.toHaveBeenCalledWith(
      "DELETE FROM settings",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("serializes transactions across adapter instances sharing one native database", async () => {
    const connection = nativeConnection();
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted!: () => void;
    const firstDidStart = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    connection.beginTransaction.mockImplementationOnce(async () => {
      firstStarted();
      await firstCanFinish;
      return { changes: {} };
    });

    const first = new CapacitorSqliteAdapter();
    const second = new CapacitorSqliteAdapter();
    Object.assign(first, { connection });
    Object.assign(second, { connection });

    const firstWrite = first.saveMatches([]);
    await firstDidStart;
    const secondWrite = second.saveMatches([]);
    await Promise.resolve();

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    releaseFirst();
    await Promise.all([firstWrite, secondWrite]);

    expect(connection.beginTransaction).toHaveBeenCalledTimes(2);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(2);
    expect(
      connection.commitTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(connection.beginTransaction.mock.invocationCallOrder[1]!);
  });

  it("rejects invalid settings before opening a native transaction", async () => {
    const connection = nativeConnection();
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await expect(
      adapter.saveSettings({
        ...DEFAULT_SETTINGS,
        historyLimits: 10,
        workers: 0,
        timeoutSeconds: 15,
        retries: 2,
        defaultMultiplier: 1,
      }),
    ).rejects.toThrow("并发请求数");
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(connection.run).not.toHaveBeenCalled();
  });

  it("uses boolean defaults when an existing native database has no new setting keys", async () => {
    const connection = nativeConnection();
    connection.query.mockResolvedValue({
      values: [
        { key: "history_limits", value: "20" },
        { key: "workers", value: "6" },
      ],
    });
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await expect(adapter.getSettings()).resolves.toMatchObject({
      historyLimits: 20,
      workers: 6,
      autoSyncMatches: true,
      expandMatchDetails: false,
    });
  });

  it("selects the latest native result by real timestamp instead of row id", async () => {
    const connection = nativeConnection();
    connection.query.mockResolvedValue({ values: [] });
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await adapter.listLatestResults();

    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "ORDER BY julianday(latest.fetched_at) DESC,latest.id DESC",
      ),
      [],
    );
  });

  it("does not let statements open nested plugin transactions", async () => {
    const connection = nativeConnection();
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await adapter.saveMatches([
      {
        matchId: 1,
        matchNum: "周一001",
        matchDateTime: "2026-07-20 18:00:00",
        homeTeam: "主队",
        awayTeam: "客队",
        payload: {},
        updatedAt: "2026-07-19T12:00:00.000Z",
      },
    ]);

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO match_snapshots"),
      expect.any(Array),
      false,
      "no",
    );
  });

  it("rejects malformed matches before native writes", async () => {
    const connection = nativeConnection();
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await expect(
      adapter.saveMatches([
        {
          matchId: 1,
          matchNum: "周一001",
          matchDateTime: "错误时间",
          homeTeam: "主队",
          awayTeam: "客队",
          payload: {},
          updatedAt: "2026-07-19T12:00:00.000Z",
        },
      ]),
    ).rejects.toThrow("开赛时间格式无效");
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(connection.run).not.toHaveBeenCalled();
  });

  it("rejects invalid market outcomes before native plan writes", async () => {
    const connection = nativeConnection([false]);
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });
    const stamp = "2026-07-19T12:00:00.000Z";

    await expect(
      adapter.savePlan({
        id: "invalid-outcome",
        revision: 1,
        status: "saved",
        name: "无效选项",
        selections: [
          {
            key: "1|had|home",
            matchId: 1,
            market: "had",
            outcome: "home",
            odds: "1.80",
          },
        ],
        passCounts: [1],
        multiplier: 1,
        tags: [],
        createdAt: stamp,
        updatedAt: stamp,
      }),
    ).rejects.toThrow("无效投注选项");

    expect(connection.run).not.toHaveBeenCalled();
    expect(connection.rollbackTransaction).toHaveBeenCalledOnce();
  });

  it("rolls back a native transaction left by a previous runtime", async () => {
    const connection = nativeConnection([true]);
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await adapter.saveMatches([]);

    expect(connection.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(
      connection.rollbackTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(connection.beginTransaction.mock.invocationCallOrder[0]!);
  });

  it("recovers when Android reports a stale transaction only during begin", async () => {
    const connection = nativeConnection([false]);
    connection.beginTransaction
      .mockRejectedValueOnce(
        new Error(
          "BeginTransaction: Failed in beginTransaction Already in transaction",
        ),
      )
      .mockResolvedValueOnce({ changes: {} });
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await adapter.saveMatches([]);

    expect(connection.beginTransaction).toHaveBeenCalledTimes(2);
    expect(connection.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
    expect(
      connection.rollbackTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(connection.beginTransaction.mock.invocationCallOrder[1]!);
  });

  it("recovers when Capacitor returns a plain-object native error", async () => {
    const connection = nativeConnection([false]);
    connection.beginTransaction
      .mockRejectedValueOnce({
        message:
          "BeginTransaction: Failed in beginTransaction Already in transaction",
      })
      .mockResolvedValueOnce({ changes: {} });
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await adapter.saveMatches([]);

    expect(connection.beginTransaction).toHaveBeenCalledTimes(2);
    expect(connection.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it("refuses partial writes when even a recreated Android connection stays stuck", async () => {
    const connection = nativeConnection([false]);
    connection.beginTransaction.mockRejectedValue(
      new Error(
        "BeginTransaction: Failed in beginTransaction Already in transaction",
      ),
    );
    const recreated = nativeConnection([false]);
    recreated.beginTransaction.mockRejectedValue(
      new Error(
        "BeginTransaction: Failed in beginTransaction Already in transaction",
      ),
    );
    const sqlite = {
      closeConnection: vi.fn(async () => undefined),
      createConnection: vi.fn(async () => recreated),
    };
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection, sqlite });

    await expect(
      adapter.saveMatches([
        {
          matchId: 2,
          matchNum: "周一002",
          matchDateTime: "2026-07-20 20:00:00",
          homeTeam: "主队",
          awayTeam: "客队",
          payload: {},
          updatedAt: "2026-07-19T12:00:00.000Z",
        },
      ]),
    ).rejects.toThrow("已停止本次写入");

    expect(connection.beginTransaction).toHaveBeenCalledTimes(3);
    expect(connection.rollbackTransaction).toHaveBeenCalledTimes(3);
    expect(connection.close).toHaveBeenCalledTimes(2);
    expect(connection.open).toHaveBeenCalledTimes(1);
    expect(sqlite.closeConnection).toHaveBeenCalledOnce();
    expect(sqlite.createConnection).toHaveBeenCalledOnce();
    expect(recreated.beginTransaction).toHaveBeenCalledOnce();
    expect(recreated.rollbackTransaction).toHaveBeenCalledOnce();
    expect(connection.run).not.toHaveBeenCalled();
    expect(recreated.run).not.toHaveBeenCalled();
  });

  it("restores atomic writes by recreating the native connection dictionary", async () => {
    const connection = nativeConnection([false]);
    connection.beginTransaction.mockRejectedValue(
      new Error(
        "BeginTransaction: Failed in beginTransaction Already in transaction",
      ),
    );
    const recreated = nativeConnection([false]);
    const sqlite = {
      closeConnection: vi.fn(async () => undefined),
      createConnection: vi.fn(async () => recreated),
    };
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection, sqlite });

    await adapter.saveMatches([
      {
        matchId: 22,
        matchNum: "周一022",
        matchDateTime: "2026-07-20 22:00:00",
        homeTeam: "主队",
        awayTeam: "客队",
        payload: {},
        updatedAt: "2026-07-19T12:00:00.000Z",
      },
    ]);

    expect(connection.beginTransaction).toHaveBeenCalledTimes(3);
    expect(recreated.beginTransaction).toHaveBeenCalledOnce();
    expect(recreated.run).toHaveBeenCalledOnce();
    expect(recreated.commitTransaction).toHaveBeenCalledOnce();
    expect(sqlite.closeConnection).toHaveBeenCalledWith("caiguo_app_v2", false);
  });

  it("restores native transactions after reopening a stuck Android connection", async () => {
    const connection = nativeConnection([false]);
    connection.beginTransaction
      .mockRejectedValueOnce(
        new Error(
          "BeginTransaction: Failed in beginTransaction Already in transaction",
        ),
      )
      .mockRejectedValueOnce(
        new Error(
          "BeginTransaction: Failed in beginTransaction Already in transaction",
        ),
      )
      .mockResolvedValueOnce({ changes: {} });
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await adapter.saveMatches([]);

    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(connection.open).toHaveBeenCalledTimes(1);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(3);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it("ignores a no-active-transaction response while recovering", async () => {
    const connection = nativeConnection([false]);
    connection.beginTransaction
      .mockRejectedValueOnce(
        new Error(
          "BeginTransaction: Failed in beginTransaction Already in transaction",
        ),
      )
      .mockResolvedValueOnce({ changes: {} });
    connection.rollbackTransaction.mockRejectedValueOnce(
      new Error("RollbackTransaction: No transaction active"),
    );
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await adapter.saveMatches([]);

    expect(connection.beginTransaction).toHaveBeenCalledTimes(2);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it("queues standalone writes behind an active bulk transaction", async () => {
    const connection = nativeConnection([false]);
    let releaseFirstWrite!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    connection.run
      .mockImplementationOnce(async () => {
        await firstWrite;
        return { changes: { changes: 1 } };
      })
      .mockResolvedValue({ changes: { changes: 1 } });
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    const bulkWrite = adapter.saveMatches([
      {
        matchId: 3,
        matchNum: "周一003",
        matchDateTime: "2026-07-20 21:00:00",
        homeTeam: "主队",
        awayTeam: "客队",
        payload: {},
        updatedAt: "2026-07-19T12:00:00.000Z",
      },
    ]);
    await vi.waitFor(() => expect(connection.run).toHaveBeenCalledTimes(1));

    const standaloneWrite = adapter.deletePlan("plan-1");
    await Promise.resolve();
    expect(connection.run).toHaveBeenCalledTimes(1);

    releaseFirstWrite();
    await Promise.all([bulkWrite, standaloneWrite]);

    expect(connection.run).toHaveBeenCalledTimes(2);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it("waits for active writes before closing the native connection", async () => {
    const connection = nativeConnection([false]);
    let releaseWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    connection.run.mockImplementationOnce(async () => {
      await pendingWrite;
      return { changes: { changes: 1 } };
    });
    const closeConnection = vi.fn(async () => undefined);
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, {
      connection,
      sqlite: { closeConnection },
      initialized: true,
    });

    const write = adapter.deletePlan("plan-1");
    await vi.waitFor(() => expect(connection.run).toHaveBeenCalledTimes(1));
    const close = adapter.close();
    await Promise.resolve();
    expect(connection.close).not.toHaveBeenCalled();

    releaseWrite();
    await Promise.all([write, close]);

    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(closeConnection).toHaveBeenCalledWith("caiguo_app_v2", false);
  });

  it("writes a new plan and purchase snapshot in one native transaction", async () => {
    const connection = nativeConnection([false]);
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });
    const stamp = "2026-07-19T12:00:00.000Z";
    const plan = {
      id: "atomic-plan",
      revision: 1,
      status: "saved" as const,
      name: "原子购买方案",
      selections: [
        {
          key: "1|had|h",
          matchId: 1,
          market: "had" as const,
          outcome: "h",
          odds: "1.80",
        },
      ],
      passCounts: [1],
      multiplier: 1,
      tags: [],
      createdAt: stamp,
      updatedAt: stamp,
    };

    await adapter.savePlanWithLedgerOrder(plan, {
      id: "atomic-order",
      planId: plan.id,
      planName: plan.name,
      planSnapshot: plan,
      purchasedAt: stamp,
      stakeCents: 200,
      returnCents: 0,
      returnManual: false,
      status: "pending",
      notes: "",
      createdAt: stamp,
      updatedAt: stamp,
    });

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO plans"),
      expect.any(Array),
      false,
      "no",
    );
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ledger_orders"),
      expect.any(Array),
      false,
      "no",
    );
  });

  it("imports native tags and plans in one transaction", async () => {
    const connection = nativeConnection([false]);
    connection.query.mockImplementation(async (statement: string) => ({
      values: statement.includes("SELECT name FROM tags")
        ? [{ name: "AI" }]
        : statement.includes("SELECT revision FROM plans")
          ? [{ revision: 4 }]
          : [],
    }));
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });
    const stamp = "2026-07-19T12:00:00.000Z";
    const result = await adapter.importPlans(
      [
        {
          name: "AI",
          color: "#5797F5",
          sortOrder: 1,
          createdAt: stamp,
        },
      ],
      [
        {
          id: "native-import-plan",
          revision: 1,
          status: "saved",
          name: "原生导入方案",
          selections: [
            {
              key: "1|had|h",
              matchId: 1,
              market: "had",
              outcome: "h",
              odds: "1.80",
            },
          ],
          passCounts: [1],
          multiplier: 1,
          tags: ["AI"],
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      [
        {
          matchId: 1,
          matchNum: "周一001",
          matchDateTime: "2026-07-20 18:00:00",
          homeTeam: "主队",
          awayTeam: "客队",
          payload: {},
          updatedAt: stamp,
        },
      ],
      [
        {
          matchId: 1,
          matchNum: "周一001",
          homeTeam: "主队",
          awayTeam: "客队",
          halfTimeScore: "0:0",
          fullTimeScore: "1:0",
          goalLine: 0,
          officialResults: { had: "h" },
          fetchedAt: stamp,
        },
      ],
    );

    expect(result).toEqual({ tags: 1, plans: 1, matches: 1, results: 1 });
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO tags"),
      expect.any(Array),
      false,
      "no",
    );
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO plans"),
      expect.arrayContaining(["native-import-plan", 5]),
      false,
      "no",
    );
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO match_snapshots"),
      expect.any(Array),
      false,
      "no",
    );
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR IGNORE INTO match_results"),
      expect.any(Array),
      false,
      "no",
    );
  });

  it("does not downgrade newer native match and result records during import", async () => {
    const connection = nativeConnection([false]);
    connection.query.mockImplementation(async (statement: string) => ({
      values: statement.includes("FROM match_snapshots")
        ? [{ updated_at: "2026-07-20T12:00:00.000Z" }]
        : statement.includes("FROM match_results")
          ? [{ fetched_at: "2026-07-20T13:00:00.000Z" }]
          : [],
    }));
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    const result = await adapter.importPlans(
      [],
      [],
      [
        {
          matchId: 9,
          matchNum: "旧场次",
          matchDateTime: "2026-07-19 18:00:00",
          homeTeam: "旧主队",
          awayTeam: "旧客队",
          payload: {},
          updatedAt: "2026-07-19T12:00:00.000Z",
        },
      ],
      [
        {
          matchId: 9,
          matchNum: "旧场次",
          homeTeam: "旧主队",
          awayTeam: "旧客队",
          halfTimeScore: "0:0",
          fullTimeScore: "0:1",
          goalLine: 0,
          officialResults: { had: "a" },
          fetchedAt: "2026-07-19T13:00:00.000Z",
        },
      ],
    );

    expect(result).toEqual({ tags: 0, plans: 0, matches: 0, results: 0 });
    expect(connection.run).not.toHaveBeenCalled();
    expect(connection.commitTransaction).toHaveBeenCalledOnce();
  });

  it("rolls back the native plan write when the purchase insert fails", async () => {
    const connection = nativeConnection([false]);
    connection.run.mockImplementation(async (statement: string) => {
      if (statement.includes("INSERT INTO ledger_orders")) {
        throw new Error("ledger insert failed");
      }
      return { changes: { changes: 1 } };
    });
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });
    const stamp = "2026-07-19T12:00:00.000Z";
    const plan = {
      id: "rollback-plan",
      revision: 1,
      status: "saved" as const,
      name: "回滚购买方案",
      selections: [
        {
          key: "1|had|h",
          matchId: 1,
          market: "had" as const,
          outcome: "h",
          odds: "1.80",
        },
      ],
      passCounts: [1],
      multiplier: 1,
      tags: [],
      createdAt: stamp,
      updatedAt: stamp,
    };

    await expect(
      adapter.savePlanWithLedgerOrder(plan, {
        id: "rollback-order",
        planId: plan.id,
        planName: plan.name,
        planSnapshot: plan,
        purchasedAt: stamp,
        stakeCents: 200,
        returnCents: 0,
        returnManual: false,
        status: "pending",
        notes: "",
        createdAt: stamp,
        updatedAt: stamp,
      }),
    ).rejects.toThrow("ledger insert failed");

    expect(connection.commitTransaction).not.toHaveBeenCalled();
    expect(connection.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a plan that tries to recreate a deleted global tag", async () => {
    const connection = nativeConnection([false]);
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });
    const stamp = "2026-07-19T12:00:00.000Z";

    await expect(
      adapter.savePlan({
        id: "stale-tag-plan",
        revision: 1,
        status: "saved",
        name: "失效标签方案",
        selections: [
          {
            key: "1|had|h",
            matchId: 1,
            market: "had",
            outcome: "h",
            odds: "1.80",
          },
        ],
        passCounts: [1],
        multiplier: 1,
        tags: ["已删除标签"],
        createdAt: stamp,
        updatedAt: stamp,
      }),
    ).rejects.toThrow("已删除的标签");

    expect(connection.run).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO plans"),
      expect.anything(),
      false,
      "no",
    );
    expect(connection.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it("renames a native tag without rewriting plan or ledger rows", async () => {
    const connection = nativeConnection([false]);
    connection.query
      .mockResolvedValueOnce({
        values: [
          {
            id: 7,
            name: "AI",
            color: "#9A91F5",
            sort_order: 1,
            created_at: "2026-07-19T12:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ values: [] });
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    const renamed = await adapter.renameTag("AI", {
      name: "智能分析",
      color: "#5797F5",
      sortOrder: 1,
      createdAt: "ignored",
    });

    expect(renamed).toEqual({
      id: 7,
      name: "智能分析",
      color: "#5797F5",
      sortOrder: 1,
      createdAt: "2026-07-19T12:00:00.000Z",
    });
    expect(connection.run).toHaveBeenCalledTimes(1);
    expect(connection.run).toHaveBeenCalledWith(
      "UPDATE tags SET name=?,color=?,sort_order=? WHERE id=?",
      ["智能分析", "#5797F5", 1, 7],
      false,
      "no",
    );
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it("updates only ledger notes with optimistic concurrency protection", async () => {
    const connection = nativeConnection([false]);
    connection.query.mockResolvedValueOnce({
      values: [{ updated_at: "2026-07-19T12:00:00.000Z" }],
    });
    const adapter = new CapacitorSqliteAdapter();
    Object.assign(adapter, { connection });

    await expect(
      adapter.updateLedgerNotes("ledger-1", "长".repeat(81)),
    ).rejects.toThrow("80");
    expect(connection.beginTransaction).not.toHaveBeenCalled();

    await adapter.updateLedgerNotes(
      "ledger-1",
      "  已核对  ",
      "2026-07-19T12:00:00.000Z",
    );

    expect(connection.run).toHaveBeenCalledTimes(1);
    expect(connection.run).toHaveBeenCalledWith(
      "UPDATE ledger_orders SET notes=?,updated_at=? WHERE id=?",
      ["已核对", expect.any(String), "ledger-1"],
      false,
      "no",
    );
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
  });
});
