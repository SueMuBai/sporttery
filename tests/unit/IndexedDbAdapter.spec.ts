import { describe, expect, it } from "vitest";

import { IndexedDbAdapter } from "@/services/database/indexeddb/IndexedDbAdapter";
import type {
  LedgerOrder,
  MatchResult,
  MatchSnapshot,
  SavedPlan,
} from "@/types/domain";

const timestamp = "2026-07-18T15:00:00+08:00";

function samplePlan(): SavedPlan {
  return {
    id: "plan-1",
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
    tags: ["已购"],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("IndexedDbAdapter", () => {
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

    await adapter.saveTag({
      name: "已购",
      color: "#5797F5",
      sortOrder: 1,
      createdAt: timestamp,
    });
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
    expect(await adapter.listLatestResults()).toMatchObject([result]);
    expect(await adapter.getCounts()).toEqual({
      settings: 1,
      tags: 2,
      plans: 1,
      planSelections: 1,
      matches: 1,
      results: 1,
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
    expect((await adapter.listTags()).map((tag) => tag.name)).toEqual([
      "已购",
      "AI",
    ]);
    await expect(
      adapter.updateLedgerReturn("missing", 1.5, true),
    ).rejects.toThrow("整数分");

    await adapter.deleteDatabaseForTests();
  });

  it("deletes a saved plan without removing its purchased ledger snapshot", async () => {
    const adapter = new IndexedDbAdapter(`caiguo-test-${crypto.randomUUID()}`);
    await adapter.initialize();

    const plan = samplePlan();
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

    await adapter.updateLedgerReturn("ledger-concurrent", 356, true, timestamp);
    await expect(
      adapter.updateLedgerReturn("ledger-concurrent", 500, true, timestamp),
    ).rejects.toThrow("账单已在其他页面更新");
    expect((await adapter.listLedger())[0]?.returnCents).toBe(356);

    await adapter.deleteDatabaseForTests();
  });
});
