import { describe, expect, it } from "vitest";

import { IndexedDbAdapter } from "@/services/database/indexeddb/IndexedDbAdapter";
import {
  DEFAULT_SETTINGS,
  type LedgerOrder,
  type MatchResult,
  type MatchSnapshot,
  type SavedPlan,
} from "@/types/domain";

const timestamp = "2026-07-18T15:00:00+08:00";

function samplePlan(): SavedPlan {
  return {
    id: "plan-1",
    revision: 1,
    status: "saved",
    name: "测试方案",
    selections: [
      {
        key: "2040532|had|h",
        matchId: 2040532,
        market: "had",
        outcome: "h",
        odds: "1.78",
      },
    ],
    passCounts: [1],
    multiplier: 1,
    tags: ["AI"],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function saveAiTag(adapter: IndexedDbAdapter): Promise<void> {
  await adapter.saveTag({
    name: "AI",
    color: "#9A91F5",
    sortOrder: 1,
    createdAt: timestamp,
  });
}

describe("IndexedDbAdapter", () => {
  it("clears all local records atomically and restores default settings", async () => {
    const name = `caiguo-clear-${crypto.randomUUID()}`;
    const adapter = new IndexedDbAdapter(name);
    await adapter.initialize();
    await adapter.saveSettings({
      historyLimits: 20,
      workers: 6,
      timeoutSeconds: 30,
      retries: 3,
      defaultMultiplier: 2,
    });
    await saveAiTag(adapter);
    const plan = samplePlan();
    await adapter.savePlan(plan);
    await adapter.saveMatches([
      {
        matchId: 2040532,
        matchNum: "周五201",
        matchDateTime: "2026-07-18 01:00:00",
        homeTeam: "哥德堡",
        awayTeam: "布鲁马波",
        payload: { league: "瑞超" },
        updatedAt: timestamp,
      },
    ]);
    await adapter.saveResults([
      {
        matchId: 2040532,
        matchNum: "周五201",
        homeTeam: "哥德堡",
        awayTeam: "布鲁马波",
        halfTimeScore: "1:0",
        fullTimeScore: "2:0",
        goalLine: -1,
        officialResults: { had: "h", hhad: "d" },
        fetchedAt: timestamp,
      },
    ]);
    const order: LedgerOrder = {
      id: "clear-ledger",
      planId: plan.id,
      planName: plan.name,
      planSnapshot: plan,
      purchasedAt: timestamp,
      stakeCents: 200,
      returnCents: 0,
      returnManual: false,
      status: "settled",
      notes: "待清空",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await adapter.saveLedgerOrder(order);
    await adapter.updateLedgerReturn(order.id, 360, order.updatedAt);
    await adapter.saveSyncJob({
      kind: "full",
      status: "success",
      addedCount: 1,
      updatedCount: 0,
      failedCount: 0,
      errorMessage: "",
      startedAt: timestamp,
      finishedAt: timestamp,
    });
    await adapter.saveOddsHistory([
      {
        matchId: 2040532,
        market: "had",
        outcome: "h",
        odds: "1.78",
        capturedAt: timestamp,
      },
    ]);
    await adapter.recordEvent({
      type: "sync.completed",
      payload: { source: "test" },
      createdAt: timestamp,
    });

    const counts = await adapter.clearLocalData();

    expect(counts).toEqual({
      settings: 1,
      tags: 0,
      plans: 0,
      planSelections: 0,
      matches: 0,
      results: 0,
      ledgerOrders: 0,
    });
    expect(await adapter.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await adapter.listTags()).toEqual([]);
    expect(await adapter.listPlans()).toEqual([]);
    expect(await adapter.listMatches()).toEqual([]);
    expect(await adapter.listLatestResults()).toEqual([]);
    expect(await adapter.listLedger()).toEqual([]);
    expect(await adapter.listLedgerAdjustments(order.id)).toEqual([]);
    expect(await adapter.listEvents()).toEqual([]);

    await adapter.close();
    const reopened = new IndexedDbAdapter(name);
    await reopened.initialize();
    expect(await reopened.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await reopened.getCounts()).toEqual(counts);
    await reopened.deleteDatabaseForTests();
  });

  it("initializes idempotently and persists normalized core records", async () => {
    const name = `caiguo-test-${crypto.randomUUID()}`;
    const adapter = new IndexedDbAdapter(name);
    await adapter.initialize();
    await adapter.initialize();
    await adapter.saveSettings({
      historyLimits: 20,
      workers: 6,
      timeoutSeconds: 30,
      retries: 3,
      defaultMultiplier: 2,
    });
    await expect(
      adapter.saveSettings({
        historyLimits: 10,
        workers: 0,
        timeoutSeconds: 15,
        retries: 2,
        defaultMultiplier: 1,
      }),
    ).rejects.toThrow("并发请求数");

    await saveAiTag(adapter);
    const plan = samplePlan();
    await adapter.savePlan(plan);

    const match: MatchSnapshot = {
      matchId: 2040532,
      matchNum: "周五201",
      matchDateTime: "2026-07-18 01:00:00",
      homeTeam: "哥德堡",
      awayTeam: "布鲁马波",
      payload: { league: "瑞超" },
      updatedAt: timestamp,
    };
    await adapter.saveMatches([match]);
    await expect(
      adapter.saveMatches([{ ...match, matchId: 0 }]),
    ).rejects.toThrow("比赛 ID 无效");

    const result: MatchResult = {
      matchId: 2040532,
      matchNum: "周五201",
      homeTeam: "哥德堡",
      awayTeam: "布鲁马波",
      halfTimeScore: "1:0",
      fullTimeScore: "2:0",
      goalLine: -1,
      officialResults: { had: "h", hhad: "d" },
      fetchedAt: timestamp,
    };
    await adapter.saveResults([result]);
    await expect(
      adapter.saveResults([{ ...result, fullTimeScore: "完场" }]),
    ).rejects.toThrow("全场比分格式无效");
    await adapter.saveResults([
      {
        ...result,
        fullTimeScore: "3:0",
        fetchedAt: "2026-07-18T08:00:00.000Z",
      },
    ]);

    const ledger: LedgerOrder = {
      id: "ledger-1",
      planId: plan.id,
      planName: plan.name,
      planSnapshot: plan,
      purchasedAt: timestamp,
      stakeCents: 200,
      returnCents: 0,
      returnManual: false,
      status: "pending",
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await adapter.saveLedgerOrder(ledger);

    expect(await adapter.getPlan(plan.id)).toEqual(plan);
    expect(await adapter.listLatestResults()).toMatchObject([
      { ...result, fullTimeScore: "3:0", fetchedAt: "2026-07-18T08:00:00.000Z" },
    ]);
    expect(await adapter.getCounts()).toEqual({
      settings: 1,
      tags: 1,
      plans: 1,
      planSelections: 1,
      matches: 1,
      results: 2,
      ledgerOrders: 1,
    });

    await adapter.close();
    const reopened = new IndexedDbAdapter(name);
    await reopened.initialize();
    expect((await reopened.getPlan(plan.id))?.name).toBe("测试方案");
    expect(await reopened.getSettings()).toEqual({
      historyLimits: 20,
      workers: 6,
      timeoutSeconds: 30,
      retries: 3,
      defaultMultiplier: 2,
    });
    await reopened.deleteDatabaseForTests();
  });

  it("rolls back a failed transaction and protects integer-cent returns", async () => {
    const adapter = new IndexedDbAdapter(`caiguo-test-${crypto.randomUUID()}`);
    await adapter.initialize();

    await expect(
      adapter.transaction(async () => {
        await adapter.saveTag({
          name: "临时",
          color: "#9A91F5",
          sortOrder: 1,
          createdAt: timestamp,
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await adapter.listTags()).toEqual([]);
    await expect(
      adapter.updateLedgerReturn("missing", 1.5),
    ).rejects.toThrow("整数分");

    await adapter.deleteDatabaseForTests();
  });

  it("deletes a saved plan without removing its purchased ledger snapshot", async () => {
    const adapter = new IndexedDbAdapter(`caiguo-test-${crypto.randomUUID()}`);
    await adapter.initialize();

    const plan = samplePlan();
    await saveAiTag(adapter);
    await adapter.savePlan(plan);
    await adapter.saveLedgerOrder({
      id: "ledger-preserved",
      planId: plan.id,
      planName: plan.name,
      planSnapshot: plan,
      purchasedAt: timestamp,
      stakeCents: 200,
      returnCents: 0,
      returnManual: false,
      status: "pending",
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await adapter.deletePlan(plan.id);

    expect(await adapter.getPlan(plan.id)).toBeUndefined();
    expect(await adapter.listLedger()).toEqual([
      expect.objectContaining({
        id: "ledger-preserved",
        planId: plan.id,
        planSnapshot: plan,
      }),
    ]);
    expect(await adapter.getCounts()).toMatchObject({
      plans: 0,
      planSelections: 0,
      ledgerOrders: 1,
    });

    await adapter.deleteDatabaseForTests();
  });

  it("imports tags and plans atomically without changing ledger records", async () => {
    const adapter = new IndexedDbAdapter(`caiguo-import-${crypto.randomUUID()}`);
    await adapter.initialize();
    const original = samplePlan();
    await saveAiTag(adapter);
    await adapter.savePlan(original);
    await adapter.saveLedgerOrder({
      id: "ledger-before-import",
      planId: original.id,
      planName: original.name,
      planSnapshot: original,
      purchasedAt: timestamp,
      stakeCents: 200,
      returnCents: 0,
      returnManual: false,
      status: "pending",
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const imported = {
      ...original,
      name: "导入后的方案",
      revision: 1,
      updatedAt: "2026-07-19T12:00:00+08:00",
    };

    await expect(
      adapter.importPlans(
        [
          {
            name: "AI",
            color: "#5797F5",
            sortOrder: 1,
            createdAt: timestamp,
          },
        ],
        [
          imported,
          {
            ...imported,
            id: "invalid-import",
            name: "无效导入",
            tags: ["不存在"],
          },
        ],
      ),
    ).rejects.toThrow("已删除的标签");
    expect(await adapter.getPlan(original.id)).toEqual(original);
    expect((await adapter.listTags())[0]?.color).toBe("#9A91F5");

    const result = await adapter.importPlans(
      [
        {
          name: "AI",
          color: "#5797F5",
          sortOrder: 1,
          createdAt: timestamp,
        },
      ],
      [imported],
      [{
        matchId: 1,
        matchNum: "周一001",
        matchDateTime: "2026-07-20 18:00:00",
        homeTeam: "主队",
        awayTeam: "客队",
        payload: {},
        updatedAt: timestamp,
      }],
      [{
        matchId: 1,
        matchNum: "周一001",
        homeTeam: "主队",
        awayTeam: "客队",
        halfTimeScore: "0:0",
        fullTimeScore: "1:0",
        goalLine: 0,
        officialResults: { had: "h" },
        fetchedAt: timestamp,
      }],
    );
    expect(result).toEqual({ tags: 1, plans: 1, matches: 1, results: 1 });
    expect((await adapter.listMatches())[0]?.matchId).toBe(1);
    expect((await adapter.listLatestResults())[0]?.fullTimeScore).toBe("1:0");
    expect(await adapter.getPlan(original.id)).toEqual({
      ...imported,
      revision: 2,
    });
    expect((await adapter.listTags())[0]?.color).toBe("#5797F5");
    expect(await adapter.listLedger()).toEqual([
      expect.objectContaining({
        id: "ledger-before-import",
        planSnapshot: original,
      }),
    ]);
    const staleDataResult = await adapter.importPlans(
      [],
      [imported],
      [{
        matchId: 1,
        matchNum: "旧场次",
        matchDateTime: "2026-07-20 18:00:00",
        homeTeam: "旧主队",
        awayTeam: "旧客队",
        payload: {},
        updatedAt: "2026-07-17T15:00:00+08:00",
      }],
      [{
        matchId: 1,
        matchNum: "旧场次",
        homeTeam: "旧主队",
        awayTeam: "旧客队",
        halfTimeScore: "0:0",
        fullTimeScore: "0:1",
        goalLine: 0,
        officialResults: { had: "a" },
        fetchedAt: "2026-07-17T15:00:00+08:00",
      }],
    );
    expect(staleDataResult).toEqual({
      tags: 0,
      plans: 1,
      matches: 0,
      results: 0,
    });
    expect((await adapter.listMatches())[0]?.homeTeam).toBe("主队");
    expect((await adapter.listLatestResults())[0]?.fullTimeScore).toBe("1:0");

    await adapter.deleteDatabaseForTests();
  });

  it("rejects an atomic overwrite when the expected plan revision is stale", async () => {
    const adapter = new IndexedDbAdapter(`caiguo-revision-${crypto.randomUUID()}`);
    await adapter.initialize();
    const plan = samplePlan();
    await saveAiTag(adapter);
    await adapter.savePlan(plan);

    await expect(
      adapter.savePlan(
        { ...plan, name: "过期修改", revision: 2, updatedAt: new Date().toISOString() },
        0,
      ),
    ).rejects.toThrow("其他页面更新");
    expect((await adapter.getPlan(plan.id))?.name).toBe(plan.name);

    await adapter.deleteDatabaseForTests();
  });

  it("rejects invalid market outcomes at the database boundary", async () => {
    const adapter = new IndexedDbAdapter(`caiguo-outcome-${crypto.randomUUID()}`);
    await adapter.initialize();
    const plan = samplePlan();
    await saveAiTag(adapter);

    await expect(
      adapter.savePlan({
        ...plan,
        selections: [{ ...plan.selections[0]!, outcome: "home" }],
      }),
    ).rejects.toThrow("无效投注选项");
    expect(await adapter.getPlan(plan.id)).toBeUndefined();

    await adapter.deleteDatabaseForTests();
  });

  it("enforces the global tag limit and case-insensitive uniqueness", async () => {
    const adapter = new IndexedDbAdapter(`caiguo-tag-limit-${crypto.randomUUID()}`);
    await adapter.initialize();
    for (let index = 0; index < 8; index += 1) {
      await adapter.saveTag({
        name: index === 0 ? "AI" : `标签${index}`,
        color: "#5797F5",
        sortOrder: index + 1,
        createdAt: timestamp,
      });
    }
    await expect(
      adapter.saveTag({
        name: "第九个",
        color: "#5797F5",
        sortOrder: 9,
        createdAt: timestamp,
      }),
    ).rejects.toThrow("最多只能创建 8 个标签");
    await expect(
      adapter.saveTag({
        name: "ai",
        color: "#5797F5",
        sortOrder: 1,
        createdAt: timestamp,
      }),
    ).rejects.toThrow("已存在同名标签");
    await expect(
      adapter.renameTag("标签1", {
        name: "标签2",
        color: "#5797F5",
        sortOrder: 1,
        createdAt: timestamp,
      }),
    ).rejects.toThrow("已存在同名标签");

    await adapter.deleteDatabaseForTests();
  });

  it("prevents a stale return editor from overwriting a newer ledger value", async () => {
    const adapter = new IndexedDbAdapter(`caiguo-test-${crypto.randomUUID()}`);
    await adapter.initialize();
    const snapshot = samplePlan();
    await adapter.saveLedgerOrder({
      id: "ledger-concurrent",
      planId: snapshot.id,
      planName: snapshot.name,
      planSnapshot: snapshot,
      purchasedAt: timestamp,
      stakeCents: 200,
      returnCents: 0,
      returnManual: false,
      status: "settled",
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await adapter.updateLedgerReturn("ledger-concurrent", 356, timestamp, 250);
    await expect(
      adapter.updateLedgerNotes("ledger-concurrent", "长".repeat(81)),
    ).rejects.toThrow("80");
    await expect(
      adapter.updateLedgerReturn("ledger-concurrent", 500, timestamp),
    ).rejects.toThrow("账单已在其他页面更新");
    await expect(
      adapter.updateLedgerNotes("ledger-concurrent", "旧页面备注", timestamp),
    ).rejects.toThrow("账单已在其他页面更新");
    expect((await adapter.listLedger())[0]?.returnCents).toBe(356);
    expect(await adapter.listLedgerAdjustments("ledger-concurrent")).toEqual([
      expect.objectContaining({
        previousReturnCents: 250,
        nextReturnCents: 356,
      }),
    ]);
    const current = (await adapter.listLedger())[0]!;
    await adapter.updateLedgerNotes(
      current.id,
      "  已核对回款  ",
      current.updatedAt,
    );
    const withNotes = (await adapter.listLedger())[0]!;
    expect(withNotes).toMatchObject({
      notes: "已核对回款",
      returnCents: 356,
      returnManual: true,
    });
    await adapter.undoLatestLedgerAdjustment(withNotes.id, withNotes.updatedAt);
    expect((await adapter.listLedger())[0]).toMatchObject({
      returnCents: 250,
      returnManual: false,
    });
    expect(await adapter.listLedgerAdjustments("ledger-concurrent")).toEqual([]);

    await adapter.deleteDatabaseForTests();
  });

  it("rolls back a newly saved plan when its purchase record cannot be written", async () => {
    const adapter = new IndexedDbAdapter(`caiguo-atomic-${crypto.randomUUID()}`);
    await adapter.initialize();
    const plan = { ...samplePlan(), id: "atomic-new-plan" };
    await saveAiTag(adapter);
    const invalidOrder: LedgerOrder = {
      id: undefined as unknown as string,
      planId: plan.id,
      planName: plan.name,
      planSnapshot: plan,
      purchasedAt: timestamp,
      stakeCents: 500,
      returnCents: 0,
      returnManual: false,
      status: "pending",
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await expect(
      adapter.savePlanWithLedgerOrder(plan, invalidOrder),
    ).rejects.toBeDefined();

    expect(await adapter.getPlan(plan.id)).toBeUndefined();
    expect(await adapter.listLedger()).toEqual([]);
    await adapter.deleteDatabaseForTests();
  });

  it("removes a deleted tag association without changing plans or ledger snapshots", async () => {
    const adapter = new IndexedDbAdapter(`caiguo-tags-${crypto.randomUUID()}`);
    await adapter.initialize();
    await saveAiTag(adapter);
    const plan = samplePlan();
    await adapter.savePlan(plan);
    await adapter.saveLedgerOrder({
      id: "tag-ledger",
      planId: plan.id,
      planName: plan.name,
      planSnapshot: structuredClone(plan),
      purchasedAt: timestamp,
      stakeCents: 200,
      returnCents: 0,
      returnManual: false,
      status: "pending",
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await adapter.deleteTag("AI");

    const current = (await adapter.getPlan(plan.id))!;
    expect(current.tags).toEqual([]);
    expect((await adapter.listLedger())[0]?.planSnapshot.tags).toEqual(["AI"]);
    expect(await adapter.getCounts()).toMatchObject({ plans: 1, ledgerOrders: 1 });
    await expect(
      adapter.savePlan(
        { ...current, revision: 2, tags: ["AI"], updatedAt: new Date().toISOString() },
        1,
      ),
    ).rejects.toThrow("已删除的标签");
    expect((await adapter.getPlan(plan.id))?.tags).toEqual([]);

    await adapter.deleteDatabaseForTests();
  });

  it("renames a global tag and all live associations without changing frozen snapshots", async () => {
    const adapter = new IndexedDbAdapter(`caiguo-tag-rename-${crypto.randomUUID()}`);
    await adapter.initialize();
    await saveAiTag(adapter);
    const plan = samplePlan();
    await adapter.savePlan(plan);
    await adapter.saveLedgerOrder({
      id: "rename-ledger",
      planId: plan.id,
      planName: plan.name,
      planSnapshot: structuredClone(plan),
      purchasedAt: timestamp,
      stakeCents: 200,
      returnCents: 0,
      returnManual: false,
      status: "pending",
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const renamed = await adapter.renameTag("AI", {
      name: "智能分析",
      color: "#5797F5",
      sortOrder: 1,
      createdAt: timestamp,
    });

    expect(renamed).toMatchObject({ name: "智能分析", color: "#5797F5" });
    expect((await adapter.getPlan(plan.id))?.tags).toEqual(["智能分析"]);
    expect((await adapter.getPlan(plan.id))?.revision).toBe(1);
    expect((await adapter.listLedger())[0]?.planSnapshot.tags).toEqual(["AI"]);
    expect((await adapter.listTags()).map((tag) => tag.name)).toEqual([
      "智能分析",
    ]);

    await adapter.deleteDatabaseForTests();
  });
});
