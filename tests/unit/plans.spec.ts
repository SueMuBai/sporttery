import { describe, expect, it } from "vitest";

import { summarizePlanPurchases } from "@/stores/plans";
import type { LedgerOrder, MatchResult, SavedPlan } from "@/types/domain";

const stamp = "2026-07-19T10:00:00.000Z";

function snapshot(
  id: string,
  matchId: number,
  outcome: "h" | "a",
  odds: string,
): SavedPlan {
  return {
    id,
    revision: 1,
    status: "saved",
    name: `购买快照 ${id}`,
    selections: [
      {
        key: `${matchId}|had|${outcome}`,
        matchId,
        market: "had",
        outcome,
        odds,
      },
    ],
    passCounts: [1],
    multiplier: 1,
    tags: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function purchase(
  id: string,
  planId: string,
  planSnapshot: SavedPlan,
  stakeCents: number,
): LedgerOrder {
  return {
    id,
    planId,
    planName: planSnapshot.name,
    planSnapshot,
    purchasedAt: stamp,
    stakeCents,
    returnCents: 0,
    returnManual: false,
    status: "pending",
    notes: "",
    createdAt: stamp,
    updatedAt: stamp,
  };
}

const homeWin: MatchResult = {
  matchId: 1,
  matchNum: "周日001",
  homeTeam: "主队",
  awayTeam: "客队",
  halfTimeScore: "1:0",
  fullTimeScore: "2:0",
  goalLine: 0,
  officialResults: { had: "h" },
  fetchedAt: stamp,
};

const secondHomeWin: MatchResult = {
  ...homeWin,
  matchId: 2,
  matchNum: "周日002",
};

describe("saved plan purchase summaries", () => {
  it("aggregates independent frozen purchases using their actual stakes", () => {
    const planId = "shared-plan";
    const first = purchase(
      "order-1",
      planId,
      snapshot("snapshot-1", 1, "h", "1.80"),
      500,
    );
    const second = purchase(
      "order-2",
      planId,
      snapshot("snapshot-2", 2, "a", "2.20"),
      200,
    );

    expect(summarizePlanPurchases(planId, [first, second], [homeWin])).toEqual({
      count: 2,
      pendingCount: 1,
      settledCount: 1,
      status: "pending",
      stakeCents: 700,
      returnCents: 360,
      profitCents: -340,
    });

    expect(
      summarizePlanPurchases(
        planId,
        [first, second],
        [homeWin, secondHomeWin],
      ),
    ).toMatchObject({
      status: "settled",
      pendingCount: 0,
      settledCount: 2,
      stakeCents: 700,
      returnCents: 360,
      profitCents: -340,
    });
  });

  it("uses a manual return without mutating the frozen plan snapshot", () => {
    const planId = "manual-plan";
    const frozen = snapshot("snapshot-manual", 1, "h", "1.80");
    const order = {
      ...purchase("manual-order", planId, frozen, 500),
      returnManual: true,
      returnCents: 900,
    };

    const summary = summarizePlanPurchases(planId, [order], [homeWin]);

    expect(summary).toMatchObject({
      status: "settled",
      stakeCents: 500,
      returnCents: 900,
      profitCents: 400,
    });
    expect(order.planSnapshot).toEqual(frozen);
  });
});
