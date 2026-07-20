import { describe, expect, it } from "vitest";

import { detailChoiceTone } from "@/features/plans/detailPresentation";
import type { PlanSelection } from "@/types/domain";

function selection(outcome: string): PlanSelection {
  return {
    key: `1:had:${outcome}`,
    matchId: 1,
    market: "had",
    outcome,
    odds: "1.80",
  };
}

describe("plan detail choice presentation", () => {
  it("keeps semantic outcome colors before any result is available", () => {
    expect(
      detailChoiceTone([selection("h")], {
        anySettled: false,
        settled: false,
        correct: false,
      }),
    ).toBe("win");
    expect(
      detailChoiceTone([selection("d")], {
        anySettled: false,
        settled: false,
        correct: false,
      }),
    ).toBe("draw");
    expect(
      detailChoiceTone([selection("a")], {
        anySettled: false,
        settled: false,
        correct: false,
      }),
    ).toBe("loss");
  });

  it("uses correctness colors for settled rows and blue for pending rows", () => {
    expect(
      detailChoiceTone([selection("h")], {
        anySettled: true,
        settled: true,
        correct: false,
      }),
    ).toBe("wrong");
    expect(
      detailChoiceTone([selection("a")], {
        anySettled: true,
        settled: true,
        correct: true,
      }),
    ).toBe("correct");
    expect(
      detailChoiceTone([selection("h")], {
        anySettled: true,
        settled: false,
        correct: false,
      }),
    ).toBe("pending");
  });
});
