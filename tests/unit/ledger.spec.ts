import { describe, expect, it } from "vitest";

import { evaluateLedgerOrder, rangeForPreset } from "@/stores/ledger";
import type { LedgerOrder, MatchResult, SavedPlan } from "@/types/domain";

const stamp = "2026-07-18T12:00:00+08:00";

function plan(): SavedPlan {
  return {
    id: "ledger-plan",
    name: "账单测试方案",
    selections: [
      { key: "1|had|h", matchId: 1, market: "had", outcome: "h", odds: "1.78" },
      { key: "2|had|a", matchId: 2, market: "had", outcome: "a", odds: "2.10" },
    ],
    passCounts: [1],
    multiplier: 1,
    tags: ["已购"],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function order(returnManual = false): LedgerOrder {
  const snapshot = plan();
  return {
    id: "ledger-order",
    planId: snapshot.id,
    planName: snapshot.name,
    planSnapshot: snapshot,
    purchasedAt: stamp,
    stakeCents: 400,
    returnCents: returnManual ? 500 : 0,
    returnManual,
    status: "pending",
    notes: "",
    createdAt: stamp,
    updatedAt: stamp,
  };
}

const firstResult: MatchResult = {
  matchId: 1,
  matchNum: "周六201",
  homeTeam: "主队",
  awayTeam: "客队",
  halfTimeScore: "1:0",
  fullTimeScore: "2:0",
  goalLine: 0,
  officialResults: { had: "h" },
  fetchedAt: stamp,
};

describe("ledger domain", () => {
  it("builds current-month, three-month and all-time ranges using local dates", () => {
    const today = new Date(2026, 6, 18);
    expect(rangeForPreset("month", today)).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
    expect(rangeForPreset("three-months", today)).toEqual({
      start: "2026-05-01",
      end: "2026-07-31",
    });
    expect(rangeForPreset("all", today)).toEqual({});
  });

  it("uses settled-combination income while pending and honors a manual return override", () => {
    const automatic = evaluateLedgerOrder(order(), [firstResult]);
    expect(automatic.status).toBe("pending");
    expect(automatic.evaluation.settledMatches).toBe(1);
    expect(automatic.evaluation.correctMatches).toBe(1);
    expect(automatic.displayedReturnCents).toBe(356);
    expect(automatic.profitCents).toBe(-44);

    const manual = evaluateLedgerOrder(order(true), [firstResult]);
    expect(manual.displayedReturnCents).toBe(500);
    expect(manual.profitCents).toBe(100);
  });
});
