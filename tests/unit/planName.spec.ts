import { describe, expect, it } from "vitest";

import {
  copiedPlanName,
  fitGeneratedPlanName,
  normalizePlanName,
  PLAN_NAME_MAX_LENGTH,
} from "@/features/plans/planName";

describe("plan name constraints", () => {
  it("normalizes valid names and rejects empty or oversized input", () => {
    expect(normalizePlanName("  周日方案  ")).toBe("周日方案");
    expect(() => normalizePlanName("   ")).toThrow("请输入名称");
    expect(() => normalizePlanName("超".repeat(PLAN_NAME_MAX_LENGTH + 1))).toThrow(
      `名称最多 ${PLAN_NAME_MAX_LENGTH} 个字符`,
    );
  });

  it("keeps generated and copied names inside the shared limit", () => {
    expect(fitGeneratedPlanName("自动名称".repeat(10))).toHaveLength(
      PLAN_NAME_MAX_LENGTH,
    );
    const copy = copiedPlanName("原方案".repeat(10));
    expect(copy).toHaveLength(PLAN_NAME_MAX_LENGTH);
    expect(copy.endsWith(" 副本")).toBe(true);
  });
});
