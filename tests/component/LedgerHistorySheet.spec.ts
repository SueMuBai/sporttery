import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LedgerHistorySheet from "@/components/ledger/LedgerHistorySheet.vue";
import type { EvaluatedLedgerOrder } from "@/stores/ledger";

const database = vi.hoisted(() => ({
  listLedgerAdjustments: vi.fn(),
}));

vi.mock("@/services/database/createDatabase", () => ({
  getDatabase: () => database,
}));

const bottomSheetStub = {
  props: ["show", "title"],
  emits: ["update:show"],
  template: '<section v-if="show"><h2>{{ title }}</h2><slot /></section>',
};

function settledItem(): EvaluatedLedgerOrder {
  const stamp = "2026-07-16T19:11:39+08:00";
  const plan = {
    id: "plan-1",
    revision: 1,
    status: "saved" as const,
    name: "6关方案",
    selections: [
      {
        key: "1|had|h",
        matchId: 1,
        market: "had" as const,
        outcome: "h",
        odds: "1.80",
      },
    ],
    passCounts: [1],
    multiplier: 1,
    tags: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  return {
    order: {
      id: "ledger-1",
      planId: plan.id,
      planName: plan.name,
      planSnapshot: plan,
      purchasedAt: stamp,
      stakeCents: 200,
      returnCents: 8800,
      returnManual: true,
      status: "settled",
      notes: "",
      createdAt: stamp,
      updatedAt: "2026-07-19T10:51:00+08:00",
    },
    evaluation: {
      totalMatches: 1,
      settledMatches: 1,
      pendingMatches: 0,
      correctMatches: 1,
      wrongMatches: 0,
      betCount: 1,
      stakeCents: 200,
      settledStakeCents: 200,
      currentReturnCents: 8250,
      currentProfitCents: 8050,
      finalProfitCents: 8050,
      status: "settled",
    },
    status: "settled",
    automaticReturnCents: 8250,
    displayedReturnCents: 8800,
    profitCents: 8600,
  };
}

describe("LedgerHistorySheet", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    database.listLedgerAdjustments.mockReset();
  });

  it("renders successful, failed and compatible manual audit details", async () => {
    database.listLedgerAdjustments.mockResolvedValue([
      {
        id: 3,
        orderId: "ledger-1",
        previousReturnCents: 8616,
        nextReturnCents: 8800,
        occurredAt: "2026-07-19T10:51:00+08:00",
        note: "手工修改实际回款",
        status: "success",
        source: "manual",
        operator: "本机",
        failureReason: "",
        attemptedValue: "8800",
      },
      {
        id: 2,
        orderId: "ledger-1",
        previousReturnCents: 8250,
        nextReturnCents: 8250,
        occurredAt: "2026-07-19T10:47:00+08:00",
        note: "",
        status: "failed",
        source: "manual",
        operator: "本机",
        failureReason: "金额格式错误",
        attemptedValue: "abc",
      },
      {
        id: 1,
        orderId: "ledger-1",
        previousReturnCents: 8250,
        nextReturnCents: 8616,
        occurredAt: "2026-07-19T10:45:00+08:00",
        note: "补录奖金",
        status: "success",
        source: "manual",
        operator: "本机",
        failureReason: "",
        attemptedValue: "8616",
      },
    ]);

    const wrapper = mount(LedgerHistorySheet, {
      props: { show: true, item: settledItem() },
      global: {
        stubs: {
          AppBottomSheet: bottomSheetStub,
          AppIcon: { template: '<i class="app-icon-stub" />' },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("回款修改历史");
    expect(wrapper.text()).toContain("系统结算");
    expect(wrapper.text()).toContain("手动修改失败");
    expect(wrapper.text()).toContain("失败原因金额格式错误");
    expect(wrapper.text()).toContain("修改备注补录奖金");
    expect(wrapper.text()).toContain("操作者本机");
    expect(wrapper.text()).not.toContain("修改备注手工修改实际回款");
  });
});
