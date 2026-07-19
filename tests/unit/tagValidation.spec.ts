import { describe, expect, it } from "vitest";

import {
  assertValidPlanTag,
  MAX_PLAN_TAG_NAME_LENGTH,
} from "@/features/plans/tagValidation";

const tag = {
  name: "AI",
  color: "#5797F5",
  sortOrder: 1,
  createdAt: "2026-07-19T12:00:00.000Z",
};

describe("plan tag validation", () => {
  it("accepts a normalized tag and rejects malformed fields", () => {
    expect(() => assertValidPlanTag(tag)).not.toThrow();
    expect(() => assertValidPlanTag({ ...tag, name: " " })).toThrow("名称");
    expect(() =>
      assertValidPlanTag({
        ...tag,
        name: "a".repeat(MAX_PLAN_TAG_NAME_LENGTH),
      }),
    ).not.toThrow();
    expect(() =>
      assertValidPlanTag({
        ...tag,
        name: "a".repeat(MAX_PLAN_TAG_NAME_LENGTH + 1),
      }),
    ).toThrow("名称");
    expect(() => assertValidPlanTag({ ...tag, color: "blue" })).toThrow("颜色");
    expect(() => assertValidPlanTag({ ...tag, sortOrder: 0 })).toThrow("排序");
    expect(() => assertValidPlanTag({ ...tag, createdAt: "昨天" })).toThrow(
      "时间",
    );
  });
});
