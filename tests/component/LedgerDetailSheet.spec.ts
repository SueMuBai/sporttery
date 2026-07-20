import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";

import LedgerDetailSheet from "@/components/ledger/LedgerDetailSheet.vue";
import type { EvaluatedLedgerOrder } from "@/stores/ledger";

const bottomSheetStub = {
  props: ["show", "title"],
  emits: ["update:show"],
  template: `
    <section v-if="show" class="bottom-sheet-stub">
      <h2>{{ title }}</h2>
      <slot />
      <footer><slot name="footer" /></footer>
    </section>
  `,
};

const fieldStub = {
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template: '<input class="van-field-stub" :value="modelValue" />',
};

function ledgerItem(status: "pending" | "settled"): EvaluatedLedgerOrder {
  const selections = [1, 2, 3, 4, 5, 6].map((matchId) => ({
    key: `${matchId}:had:h`,
    matchId,
    market: "had" as const,
    outcome: "h",
    odds: "1.80",
  }));
  return {
    order: {
      id: "ledger-1",
      planId: "plan-1",
      planName: "6关方案",
      planSnapshot: {
        id: "plan-1",
        revision: 1,
        status: "saved",
        name: "6关方案",
        selections,
        passCounts: [2],
        multiplier: 1,
        tags: [],
        createdAt: "2026-07-16T19:11:48",
        updatedAt: "2026-07-16T19:11:48",
      },
      purchasedAt: "2026-07-16T19:11:48",
      stakeCents: 800,
      returnCents: status === "settled" ? 1200 : 0,
      returnManual: false,
      status,
      notes: "",
      createdAt: "2026-07-16T19:11:48",
      updatedAt: "2026-07-16T19:11:48",
    },
    evaluation: {
      totalMatches: 6,
      settledMatches: status === "settled" ? 6 : 2,
      pendingMatches: status === "settled" ? 0 : 4,
      correctMatches: 2,
      wrongMatches: status === "settled" ? 4 : 0,
      betCount: 15,
      stakeCents: 800,
      settledStakeCents: status === "settled" ? 800 : 200,
      currentReturnCents: status === "settled" ? 1200 : 0,
      currentProfitCents: status === "settled" ? 400 : -200,
      finalProfitCents: status === "settled" ? 400 : undefined,
      status,
    },
    status,
    automaticReturnCents: status === "settled" ? 1200 : 0,
    displayedReturnCents: status === "settled" ? 1200 : 0,
    profitCents: status === "settled" ? 400 : -800,
  };
}

function mountSheet(item: EvaluatedLedgerOrder) {
  return mount(LedgerDetailSheet, {
    props: { show: true, item },
    global: {
      stubs: { AppBottomSheet: bottomSheetStub, "van-field": fieldStub },
    },
  });
}

describe("LedgerDetailSheet", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("keeps the plan detail in a sheet and expands the folded match list", async () => {
    const wrapper = mountSheet(ledgerItem("pending"));

    expect(wrapper.get(".bottom-sheet-stub > h2").text()).toBe("方案详情");
    expect(wrapper.findAll(".match-row")).toHaveLength(5);
    expect(wrapper.text()).toContain("查看其余1场");
    expect(wrapper.find(".pending-banner").exists()).toBe(false);

    await wrapper.get(".match-list__expand").trigger("click");
    expect(wrapper.findAll(".match-row")).toHaveLength(6);
    expect(wrapper.text()).toContain("收起方案内容");
  });

  it("places the completed return editor directly after the finance summary", () => {
    const wrapper = mountSheet(ledgerItem("settled"));
    const summary = wrapper.get(".finance-summary").element;
    const editor = wrapper.get(".return-editor").element;

    expect(
      summary.compareDocumentPosition(editor) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(wrapper.text()).toContain("回款金额");
    expect(wrapper.text()).toContain("取消");
    expect(wrapper.text()).toContain("保存修改");
    expect(wrapper.find(".pending-banner").exists()).toBe(false);
  });
});
