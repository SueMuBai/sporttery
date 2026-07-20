import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTicketStore } from "@/stores/ticket";
import type { SavedPlan } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  database: {
    initialize: vi.fn(async () => undefined),
    listMatches: vi.fn(async () => []),
    listTags: vi.fn(async () => []),
    getPlan: vi.fn(),
    savePlan: vi.fn(),
    savePlanWithLedgerOrder: vi.fn(async () => undefined),
    saveLedgerOrder: vi.fn(async () => undefined),
  },
  syncService: {
    fullSync: vi.fn(),
    latestSnapshot: vi.fn(),
    retryFailed: vi.fn(),
  },
}));

vi.mock("@/services/database/createDatabase", () => ({
  getDatabase: () => mocks.database,
}));

vi.mock("@/features/sync/getSyncService", () => ({
  getSyncService: () => mocks.syncService,
}));

function samplePlan(): SavedPlan {
  return {
    id: "plan-ticket",
    revision: 1,
    status: "saved",
    name: "测试选票",
    selections: [
      {
        key: "1|had|h",
        matchId: 1,
        market: "had",
        outcome: "h",
        odds: "1.80",
      },
    ],
    passCounts: [1],
    multiplier: 1,
    tags: ["AI"],
    createdAt: "2026-07-19T10:00:00.000Z",
    updatedAt: "2026-07-19T10:00:00.000Z",
  };
}

describe("ticket draft and saved-plan state", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    mocks.database.initialize.mockResolvedValue(undefined);
    mocks.database.listMatches.mockResolvedValue([]);
    mocks.database.listTags.mockResolvedValue([]);
    mocks.database.getPlan.mockResolvedValue(undefined);
    mocks.database.savePlan.mockResolvedValue(undefined);
    mocks.database.savePlanWithLedgerOrder.mockResolvedValue(undefined);
    mocks.database.saveLedgerOrder.mockResolvedValue(undefined);
    mocks.syncService.fullSync.mockReset();
    mocks.syncService.retryFailed.mockReset();
    mocks.syncService.latestSnapshot.mockResolvedValue(undefined);
  });

  it("saves a tag-free plan without creating a purchase ledger", async () => {
    const store = useTicketStore();
    await store.initialize();
    store.toggleSelection({
      key: "1|had|h",
      matchId: 1,
      market: "had",
      outcome: "h",
      odds: "1.80",
    });

    const saved = await store.savePlan("无标签方案");

    expect(saved).toMatchObject({ name: "无标签方案", tags: [] });
    expect(mocks.database.savePlan).toHaveBeenCalledOnce();
    expect(mocks.database.savePlanWithLedgerOrder).not.toHaveBeenCalled();
    expect(mocks.database.saveLedgerOrder).not.toHaveBeenCalled();
  });

  it("enforces the same plan-name limit for save and purchase entry points", async () => {
    const store = useTicketStore();
    await store.initialize();
    store.toggleSelection({
      key: "1|had|h",
      matchId: 1,
      market: "had",
      outcome: "h",
      odds: "1.80",
    });
    const oversized = "超".repeat(21);

    await expect(store.savePlan(oversized)).rejects.toThrow("名称最多 20 个字符");
    await expect(
      store.purchaseCurrentPlan({ name: oversized }),
    ).rejects.toThrow("名称最多 20 个字符");
    expect(mocks.database.savePlan).not.toHaveBeenCalled();
    expect(mocks.database.savePlanWithLedgerOrder).not.toHaveBeenCalled();
    expect(mocks.database.saveLedgerOrder).not.toHaveBeenCalled();
  });

  it("removes the persisted draft when the final selection is deleted", async () => {
    const store = useTicketStore();
    await store.initialize();
    const selection = {
      key: "1|had|h",
      matchId: 1,
      market: "had" as const,
      outcome: "h",
      odds: "1.80",
    };

    store.toggleSelection(selection);
    await nextTick();
    expect(localStorage.getItem("caiguo.ticket-draft.v1")).not.toBeNull();

    store.toggleSelection(selection);
    await nextTick();
    expect(localStorage.getItem("caiguo.ticket-draft.v1")).toBeNull();
  });

  it("disables unchanged overwrites and does not create empty revisions", async () => {
    let stored = samplePlan();
    mocks.database.getPlan.mockImplementation(async () => structuredClone(stored));
    mocks.database.savePlan.mockImplementation(async (plan: SavedPlan) => {
      stored = structuredClone(plan);
    });
    const store = useTicketStore();
    await store.initialize();
    store.loadPlan(stored);

    expect(store.hasUnsavedChanges).toBe(false);
    expect(store.canSavePlan).toBe(false);

    store.multiplier = 2;
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.canSavePlan).toBe(true);

    const saved = await store.savePlan();
    expect(saved.revision).toBe(2);
    expect(mocks.database.savePlan).toHaveBeenCalledTimes(1);
    expect(store.canSavePlan).toBe(false);

    const unchanged = await store.savePlan();
    expect(unchanged.revision).toBe(2);
    expect(mocks.database.savePlan).toHaveBeenCalledTimes(1);
  });

  it("does not let an old editor overwrite a plan replaced by backup import", async () => {
    const loaded = samplePlan();
    const imported = {
      ...loaded,
      revision: loaded.revision + 1,
      name: "备份导入版本",
    };
    mocks.database.getPlan.mockResolvedValue(structuredClone(imported));
    const store = useTicketStore();
    await store.initialize();
    store.loadPlan(loaded);
    store.multiplier = 2;

    await expect(store.savePlan()).rejects.toThrow("其他页面更新");
    expect(mocks.database.savePlan).not.toHaveBeenCalled();
  });

  it("rebuilds the baseline for drafts saved before dirty-state tracking", async () => {
    const plan = samplePlan();
    mocks.database.getPlan.mockResolvedValue(structuredClone(plan));
    localStorage.setItem(
      "caiguo.ticket-draft.v1",
      JSON.stringify({
        selections: Object.fromEntries(
          plan.selections.map((selection) => [selection.key, selection]),
        ),
        passCounts: plan.passCounts,
        multiplier: plan.multiplier,
        editingPlanId: plan.id,
        editingPlanName: plan.name,
        editingPlanCreatedAt: plan.createdAt,
        editingPlanTags: plan.tags,
        editingPlanRevision: plan.revision,
      }),
    );

    const store = useTicketStore();
    await store.initialize();

    expect(store.editingPlanId).toBe(plan.id);
    expect(store.hasUnsavedChanges).toBe(false);
    expect(store.canSavePlan).toBe(false);
  });

  it("creates a new plan and its frozen purchase in one database operation", async () => {
    const store = useTicketStore();
    await store.initialize();
    store.toggleSelection({
      key: "1|had|h",
      matchId: 1,
      market: "had",
      outcome: "h",
      odds: "1.80",
    });

    const purchased = await store.purchaseCurrentPlan({
      stakeCents: 500,
      notes: "原子购买",
    });

    expect(mocks.database.savePlanWithLedgerOrder).toHaveBeenCalledTimes(1);
    expect(mocks.database.savePlan).not.toHaveBeenCalled();
    expect(mocks.database.saveLedgerOrder).not.toHaveBeenCalled();
    const [plan, order] = mocks.database.savePlanWithLedgerOrder.mock.calls[0]!;
    expect(order).toMatchObject({
      id: purchased.orderId,
      planId: plan.id,
      stakeCents: 500,
      notes: "原子购买",
      planSnapshot: plan,
    });
    expect(store.editingPlanId).toBe(plan.id);
  });

  it("does not adopt a half-saved plan when the atomic purchase fails", async () => {
    mocks.database.savePlanWithLedgerOrder.mockRejectedValueOnce(
      new Error("purchase transaction failed"),
    );
    const store = useTicketStore();
    await store.initialize();
    store.toggleSelection({
      key: "1|had|h",
      matchId: 1,
      market: "had",
      outcome: "h",
      odds: "1.80",
    });

    await expect(store.purchaseCurrentPlan()).rejects.toThrow(
      "purchase transaction failed",
    );

    expect(store.editingPlanId).toBeUndefined();
    expect(mocks.database.savePlan).not.toHaveBeenCalled();
    expect(mocks.database.saveLedgerOrder).not.toHaveBeenCalled();
  });

  it("does not restore a tag that was deleted after the plan was loaded", async () => {
    const loaded = samplePlan();
    const latest = { ...loaded, tags: [] };
    mocks.database.getPlan.mockResolvedValue(structuredClone(latest));
    const store = useTicketStore();
    await store.initialize();
    store.loadPlan(loaded);
    store.multiplier = 2;

    await store.savePlan();

    const [saved] = mocks.database.savePlan.mock.calls[0]!;
    expect(saved.tags).toEqual([]);
  });

  it("keeps an existing plan name unchanged when the purchase snapshot is renamed", async () => {
    const existing = samplePlan();
    mocks.database.getPlan.mockResolvedValue(structuredClone(existing));
    mocks.database.listTags.mockResolvedValue([
      {
        id: 1,
        name: "AI",
        color: "#9A91F5",
        sortOrder: 1,
        createdAt: existing.createdAt,
      },
    ]);
    const store = useTicketStore();
    await store.initialize();
    store.loadPlan(existing);

    await store.purchaseCurrentPlan({ name: "本次购买备注名" });

    expect(mocks.database.savePlan).not.toHaveBeenCalled();
    expect(mocks.database.savePlanWithLedgerOrder).not.toHaveBeenCalled();
    expect(mocks.database.saveLedgerOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        planName: "本次购买备注名",
        planSnapshot: expect.objectContaining({ name: "本次购买备注名" }),
      }),
    );
    expect(store.editingPlanName).toBe(existing.name);
  });

  it("creates independent ledger snapshots for repeated purchases", async () => {
    const existing = samplePlan();
    mocks.database.getPlan.mockResolvedValue(structuredClone(existing));
    mocks.database.listTags.mockResolvedValue([
      {
        id: 1,
        name: "AI",
        color: "#9A91F5",
        sortOrder: 1,
        createdAt: existing.createdAt,
      },
    ]);
    const store = useTicketStore();
    await store.initialize();
    store.loadPlan(existing);

    const first = await store.purchaseCurrentPlan({ stakeCents: 200 });
    const second = await store.purchaseCurrentPlan({ stakeCents: 600 });

    expect(first.orderId).not.toBe(second.orderId);
    expect(mocks.database.saveLedgerOrder).toHaveBeenCalledTimes(2);
    const [firstOrder] = mocks.database.saveLedgerOrder.mock.calls[0]!;
    const [secondOrder] = mocks.database.saveLedgerOrder.mock.calls[1]!;
    expect(firstOrder).toMatchObject({
      planId: existing.id,
      stakeCents: 200,
      planSnapshot: existing,
    });
    expect(secondOrder).toMatchObject({
      planId: existing.id,
      stakeCents: 600,
      planSnapshot: existing,
    });
    expect(firstOrder.id).not.toBe(secondOrder.id);
  });

  it("saves an edited plan as a new sourced copy without overwriting the original", async () => {
    const existing = samplePlan();
    mocks.database.getPlan.mockResolvedValue(structuredClone(existing));
    mocks.database.listTags.mockResolvedValue([
      {
        id: 1,
        name: "AI",
        color: "#9A91F5",
        sortOrder: 1,
        createdAt: existing.createdAt,
      },
    ]);
    const store = useTicketStore();
    await store.initialize();
    store.loadPlan(existing);
    store.multiplier = 3;

    const copy = await store.saveAsNewPlan("测试选票副本");

    expect(copy).toMatchObject({
      name: "测试选票副本",
      sourcePlanId: existing.id,
      revision: 1,
      multiplier: 3,
      tags: ["AI"],
    });
    expect(copy.id).not.toBe(existing.id);
    expect(mocks.database.savePlan).toHaveBeenCalledOnce();
    expect(mocks.database.savePlan).toHaveBeenCalledWith(
      expect.objectContaining({ id: copy.id, sourcePlanId: existing.id }),
      undefined,
    );
  });

  it("keeps locally loaded matches usable when an offline refresh fails", async () => {
    const localMatch = {
      matchId: 9,
      matchNum: "周日009",
      matchDateTime: "2026-07-19 20:00:00",
      homeTeam: "本地主队",
      awayTeam: "本地客队",
      payload: { league: "测试联赛", odds: {}, history: [] },
      updatedAt: "2026-07-19T10:00:00.000Z",
    };
    mocks.database.listMatches.mockResolvedValue([localMatch]);
    mocks.syncService.fullSync.mockRejectedValueOnce(new Error("网络不可用"));
    const store = useTicketStore();
    await store.initialize();

    await store.refresh();

    expect(store.matches).toEqual([localMatch]);
    expect(store.error).toBe("网络不可用");
    expect(store.statusMessage).toBe("同步失败，本地数据仍可继续使用");
  });

  it("restores the persisted last sync timestamp even when there are no matches", async () => {
    mocks.syncService.latestSnapshot.mockResolvedValueOnce({
      matches: { added: 0, updated: 0, oddsChanged: 0, unchanged: 0, failed: 0, affectedPlans: 0, durationMs: 1, errors: [] },
      results: { added: 0, updated: 0, oddsChanged: 0, unchanged: 0, failed: 0, affectedPlans: 0, durationMs: 1, errors: [] },
      completedAt: "2026-07-21T01:41:23.000Z",
      mode: "full",
    });
    const store = useTicketStore();

    await store.initialize();

    expect(store.matches).toEqual([]);
    expect(store.lastSyncAt).toBe("2026-07-21T01:41:23.000Z");
  });

  it("reloads local matches when the cached ticket page becomes active again", async () => {
    const first = {
      matchId: 1,
      matchNum: "周日001",
      matchDateTime: "2026-07-19 18:00:00",
      homeTeam: "主队一",
      awayTeam: "客队一",
      payload: { league: "测试", odds: {}, history: [] },
      updatedAt: "2026-07-19T10:00:00.000Z",
    };
    const second = { ...first, matchId: 2, matchNum: "周日002" };
    mocks.database.listMatches
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([first, second]);
    const store = useTicketStore();

    await store.activate();
    expect(store.matches).toHaveLength(1);
    await store.activate();

    expect(mocks.database.initialize).toHaveBeenCalledOnce();
    expect(mocks.database.listMatches).toHaveBeenCalledTimes(2);
    expect(store.matches.map((match) => match.matchId)).toEqual([1, 2]);
  });
});
