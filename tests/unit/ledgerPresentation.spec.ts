import { describe, expect, it } from "vitest";

import {
  ledgerPlanSubtitle,
  ledgerPlanTitle,
} from "@/features/ledger/presentation";

describe("ledger presentation", () => {
  it("keeps a user-defined plan name as the card title", () => {
    expect(ledgerPlanTitle("周四稳健方案", 8)).toBe("周四稳健方案");
  });

  it("replaces the generated timestamp name with a compact pass title", () => {
    expect(ledgerPlanTitle("周一1场 · 07-20 03:10", 8)).toBe("8关方案");
  });

  it("formats match and selection counts as secondary information", () => {
    expect(ledgerPlanSubtitle(8, 12)).toBe("8场 · 12个选项");
  });
});
