import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  evaluatePlan,
  type PlanEvaluation,
} from "@/features/betting/calculator";
import {
  copiedPlanName,
  normalizePlanName,
} from "@/features/plans/planName";
import type { NormalizedMatch } from "@/features/matches/types";
import { getDatabase } from "@/services/database/createDatabase";
import { useTicketStore } from "@/stores/ticket";
import type { LedgerOrder, MatchResult, PlanTag, SavedPlan } from "@/types/domain";

export type PlanStatusFilter =
  "all" | "saved" | "purchased" | "pending" | "settled" | "profit" | "loss";
export type PlanSort =
  "updated-desc" | "updated-asc" | "stake-desc" | "profit-desc";

export interface EvaluatedPlan {
  plan: SavedPlan;
  purchaseCount: number;
  purchaseSummary: PlanPurchaseSummary;
  evaluation?: PlanEvaluation;
  error?: string;
}

export interface PlanPurchaseSummary {
  count: number;
  pendingCount: number;
  settledCount: number;
  status: "none" | "pending" | "settled";
  stakeCents: number;
  returnCents: number;
  profitCents: number;
}

export function summarizePlanPurchases(
  planId: string,
  ledger: readonly LedgerOrder[],
  results: readonly MatchResult[],
): PlanPurchaseSummary {
  const purchases = ledger.filter((order) => order.planId === planId);
  const evaluated = purchases.map((order) => {
    const evaluation = evaluatePlan(order.planSnapshot, results);
    return {
      status: evaluation.status,
      stakeCents: order.stakeCents,
      returnCents: order.returnManual
        ? order.returnCents
        : evaluation.currentReturnCents,
    };
  });
  const settledCount = evaluated.filter(
    (item) => item.status === "settled",
  ).length;
  const stakeCents = evaluated.reduce(
    (total, item) => total + item.stakeCents,
    0,
  );
  const returnCents = evaluated.reduce(
    (total, item) => total + item.returnCents,
    0,
  );
  return {
    count: evaluated.length,
    pendingCount: evaluated.length - settledCount,
    settledCount,
    status: !evaluated.length
      ? "none"
      : settledCount === evaluated.length
        ? "settled"
        : "pending",
    stakeCents,
    returnCents,
    profitCents: returnCents - stakeCents,
  };
}

export const usePlanStore = defineStore("plans", () => {
  const database = getDatabase();
  const ticketStore = useTicketStore();
  const loading = ref(false);
  const error = ref("");
  const plans = ref<SavedPlan[]>([]);
  const tags = ref<PlanTag[]>([]);
  const results = ref<MatchResult[]>([]);
  const ledger = ref<LedgerOrder[]>([]);
  const matches = ref<NormalizedMatch[]>([]);
  const search = ref("");
  const statusFilter = ref<PlanStatusFilter>("all");
  const tagFilter = ref("all");
  const passFilter = ref<number>();
  const sort = ref<PlanSort>("updated-desc");

  const matchById = computed(
    () => new Map(matches.value.map((match) => [match.matchId, match])),
  );
  const evaluatedPlans = computed<EvaluatedPlan[]>(() =>
    plans.value.map((plan) => {
      try {
        const purchaseSummary = summarizePlanPurchases(
          plan.id,
          ledger.value,
          results.value,
        );
        return {
          plan,
          purchaseCount: purchaseSummary.count,
          purchaseSummary,
          evaluation: evaluatePlan(plan, results.value),
        };
      } catch (reason) {
        return {
          plan,
          purchaseCount: 0,
          purchaseSummary: summarizePlanPurchases(plan.id, [], results.value),
          error: reason instanceof Error ? reason.message : String(reason),
        };
      }
    }),
  );
  const filteredPlans = computed(() => {
    const keyword = search.value.trim().toLowerCase();
    const values = evaluatedPlans.value.filter(
      ({ plan, purchaseCount, purchaseSummary }) => {
      if (
        keyword &&
        !`${plan.name} ${plan.tags.join(" ")}`.toLowerCase().includes(keyword)
      )
        return false;
      if (tagFilter.value !== "all" && !plan.tags.includes(tagFilter.value))
        return false;
      if (passFilter.value && !plan.passCounts.includes(passFilter.value))
        return false;
      if (statusFilter.value === "saved" && purchaseCount !== 0) return false;
      if (statusFilter.value === "purchased" && purchaseCount === 0) return false;
      if (
        statusFilter.value === "pending" &&
        purchaseSummary.status !== "pending"
      )
        return false;
      if (
        statusFilter.value === "settled" &&
        purchaseSummary.status !== "settled"
      )
        return false;
      if (
        statusFilter.value === "profit" &&
        (purchaseSummary.status !== "settled" ||
          purchaseSummary.profitCents <= 0)
      )
        return false;
      if (
        statusFilter.value === "loss" &&
        (purchaseSummary.status !== "settled" ||
          purchaseSummary.profitCents >= 0)
      )
        return false;
      return true;
      },
    );
    return [...values].sort((left, right) => {
      if (sort.value === "updated-asc")
        return left.plan.updatedAt.localeCompare(right.plan.updatedAt);
      if (sort.value === "stake-desc")
        return (
          (right.purchaseCount
            ? right.purchaseSummary.stakeCents
            : (right.evaluation?.stakeCents ?? 0)) -
          (left.purchaseCount
            ? left.purchaseSummary.stakeCents
            : (left.evaluation?.stakeCents ?? 0))
        );
      if (sort.value === "profit-desc")
        return (
          (right.purchaseCount
            ? right.purchaseSummary.profitCents
            : (right.evaluation?.finalProfitCents ?? -Infinity)) -
          (left.purchaseCount
            ? left.purchaseSummary.profitCents
            : (left.evaluation?.finalProfitCents ?? -Infinity))
        );
      return right.plan.updatedAt.localeCompare(left.plan.updatedAt);
    });
  });
  const availablePasses = computed(() =>
    [...new Set(plans.value.flatMap((plan) => plan.passCounts))].sort(
      (left, right) => left - right,
    ),
  );

  async function load(): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
      await database.initialize();
      const [storedPlans, storedTags, storedResults, storedMatches, storedLedger] =
        await Promise.all([
          database.listPlans(),
          database.listTags(),
          database.listLatestResults(),
          database.listMatches(),
          database.listLedger(),
        ]);
      plans.value = storedPlans;
      tags.value = storedTags;
      results.value = storedResults;
      matches.value = storedMatches as NormalizedMatch[];
      ledger.value = storedLedger;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loading.value = false;
    }
  }

  function find(id: string): EvaluatedPlan | undefined {
    return evaluatedPlans.value.find((item) => item.plan.id === id);
  }

  async function rename(plan: SavedPlan, name: string): Promise<void> {
    const stamp = new Date().toISOString();
    const nextName = normalizePlanName(name);
    const latest = await database.getPlan(plan.id);
    if (!latest || latest.revision !== plan.revision)
      throw new Error("方案已在其他页面更新，请刷新后重试");
    await database.savePlan({
      ...plan,
      name: nextName,
      revision: plan.revision + 1,
      updatedAt: stamp,
    }, plan.revision);
    await load();
  }

  async function updateTags(
    plan: SavedPlan,
    selectedTags: string[],
  ): Promise<void> {
    if (selectedTags.length > 3) throw new RangeError("每个方案最多选择3个标签");
    const available = new Set(tags.value.map((tag) => tag.name));
    if (selectedTags.some((tag) => !available.has(tag))) {
      throw new Error("方案包含已删除的标签，请刷新后重试");
    }
    const latest = await database.getPlan(plan.id);
    if (!latest || latest.revision !== plan.revision)
      throw new Error("方案已在其他页面更新，请刷新后重试");
    await database.savePlan({
      ...plan,
      tags: [...selectedTags],
      revision: plan.revision + 1,
      updatedAt: new Date().toISOString(),
    }, plan.revision);
    await load();
  }

  async function remove(id: string): Promise<void> {
    await database.deletePlan(id);
    await load();
  }

  async function duplicate(plan: SavedPlan): Promise<SavedPlan> {
    const stamp = new Date().toISOString();
    const copy: SavedPlan = {
      ...structuredClone(plan),
      id: crypto.randomUUID(),
      sourcePlanId: plan.id,
      revision: 1,
      status: "saved",
      name: copiedPlanName(plan.name),
      createdAt: stamp,
      updatedAt: stamp,
    };
    await database.savePlan(copy);
    await load();
    return copy;
  }

  async function recordPurchase(
    plan: SavedPlan,
    value: { stakeCents: number; notes?: string; purchasedAt?: string },
  ): Promise<string> {
    const stamp = new Date().toISOString();
    const id = crypto.randomUUID();
    const purchaseName = normalizePlanName(plan.name);
    const snapshot = structuredClone({ ...plan, name: purchaseName });
    await database.saveLedgerOrder({
      id,
      planId: plan.id,
      planName: purchaseName,
      planSnapshot: snapshot,
      purchasedAt: value.purchasedAt || stamp,
      stakeCents: value.stakeCents,
      returnCents: 0,
      returnManual: false,
      status: "pending",
      notes: value.notes?.trim() ?? "",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await load();
    return id;
  }

  function loadIntoTicket(plan: SavedPlan): void {
    ticketStore.loadPlan(plan);
  }

  return {
    loading,
    error,
    plans,
    tags,
    results,
    ledger,
    matches,
    search,
    statusFilter,
    tagFilter,
    passFilter,
    sort,
    matchById,
    evaluatedPlans,
    filteredPlans,
    availablePasses,
    load,
    find,
    rename,
    updateTags,
    remove,
    duplicate,
    recordPurchase,
    loadIntoTicket,
  };
});
