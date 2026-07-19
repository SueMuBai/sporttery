import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import PlanCard from "@/components/plans/PlanCard.vue";
import type { EvaluatedPlan } from "@/stores/plans";

const item: EvaluatedPlan = {
  purchaseCount: 0,
  purchaseSummary: {
    count: 0,
    pendingCount: 0,
    settledCount: 0,
    status: "none",
    stakeCents: 0,
    returnCents: 0,
    profitCents: 0,
  },
  plan: {
    id: "plan-1",
    revision: 1,
    status: "saved",
    name: "周日两场方案",
    selections: [],
    passCounts: [2],
    multiplier: 1,
    tags: ["AI"],
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  },
  evaluation: {
    totalMatches: 2,
    settledMatches: 0,
    pendingMatches: 2,
    correctMatches: 0,
    wrongMatches: 0,
    betCount: 1,
    stakeCents: 200,
    settledStakeCents: 0,
    currentReturnCents: 0,
    currentProfitCents: 0,
    status: "pending",
  },
};

describe("PlanCard", () => {
  it("keeps actions in the compact more menu", async () => {
    const wrapper = mount(PlanCard, { props: { item, menuOpen: true } });

    expect(wrapper.findAll(".plan-menu button").map((button) => button.text())).toEqual([
      "载入编辑",
      "重命名",
      "编辑标签",
      "删除",
    ]);
    await wrapper.get(".plan-menu button").trigger("click");
    expect(wrapper.emitted("load")).toHaveLength(1);
  });

  it("uses a 20-character inline rename flow with text actions", () => {
    const wrapper = mount(PlanCard, {
      props: { item, renaming: true, renameValue: "新方案" },
    });

    expect(wrapper.get('input[aria-label="方案名称"]').attributes("maxlength")).toBe("20");
    expect(wrapper.text()).toContain("名称1～20个字");
    expect(wrapper.text()).toContain("3/20");
    expect(wrapper.find(".plan-more").exists()).toBe(false);
  });

  it("shows aggregated actual amounts after the plan has been purchased", () => {
    const wrapper = mount(PlanCard, {
      props: {
        item: {
          ...item,
          purchaseCount: 2,
          purchaseSummary: {
            count: 2,
            pendingCount: 1,
            settledCount: 1,
            status: "pending",
            stakeCents: 12600,
            returnCents: 8800,
            profitCents: -3800,
          },
        },
      },
    });

    expect(wrapper.text()).toContain("购买2笔");
    expect(wrapper.text()).toContain("实际投入¥126.00");
    expect(wrapper.text()).toContain("当前已结算¥88.00");
    expect(wrapper.text()).toContain("当前收益-¥38.00");
  });
});
