import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  evaluatePlan,
  type PlanEvaluation,
} from "@/features/betting/calculator";
import type { NormalizedMatch } from "@/features/matches/types";
import { getDatabase } from "@/services/database/createDatabase";
import { useTicketStore } from "@/stores/ticket";
import type { MatchResult, PlanTag, SavedPlan } from "@/types/domain";

export type PlanStatusFilter =
  "all" | "pending" | "settled" | "profit" | "loss";
export type PlanSort =
  "updated-desc" | "updated-asc" | "stake-desc" | "profit-desc";

export interface EvaluatedPlan {
  plan: SavedPlan;
  evaluation?: PlanEvaluation;
  error?: string;
}

export const usePlanStore = defineStore("plans", () => {
  const database = getDatabase();
  const ticketStore = useTicketStore();
  const loading = ref(false);
  const error = ref("");
  const plans = ref<SavedPlan[]>([]);
  const tags = ref<PlanTag[]>([]);
  const results = ref<MatchResult[]>([]);
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
        return { plan, evaluation: evaluatePlan(plan, results.value) };
      } catch (reason) {
        return {
          plan,
          error: reason instanceof Error ? reason.message : String(reason),
        };
      }
    }),
  );
  const filteredPlans = computed(() => {
    const keyword = search.value.trim().toLowerCase();
    const values = evaluatedPlans.value.filter(({ plan, evaluation }) => {
      if (
        keyword &&
        !`${plan.name} ${plan.tags.join(" ")}`.toLowerCase().includes(keyword)
      )
        return false;
      if (tagFilter.value !== "all" && !plan.tags.includes(tagFilter.value))
        return false;
      if (passFilter.value && !plan.passCounts.includes(passFilter.value))
        return false;
      if (statusFilter.value === "pending" && evaluation?.status !== "pending")
        return false;
      if (statusFilter.value === "settled" && evaluation?.status !== "settled")
        return false;
      if (
        statusFilter.value === "profit" &&
        (evaluation?.finalProfitCents ?? 0) <= 0
      )
        return false;
      if (
        statusFilter.value === "loss" &&
        (evaluation?.finalProfitCents ?? 0) >= 0
      )
        return false;
      return true;
    });
    return [...values].sort((left, right) => {
      if (sort.value === "updated-asc")
        return left.plan.updatedAt.localeCompare(right.plan.updatedAt);
      if (sort.value === "stake-desc")
        return (
          (right.evaluation?.stakeCents ?? 0) -
          (left.evaluation?.stakeCents ?? 0)
        );
      if (sort.value === "profit-desc")
        return (
          (right.evaluation?.finalProfitCents ?? -Infinity) -
          (left.evaluation?.finalProfitCents ?? -Infinity)
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
      const [storedPlans, storedTags, storedResults, storedMatches] =
        await Promise.all([
          database.listPlans(),
          database.listTags(),
          database.listLatestResults(),
          database.listMatches(),
        ]);
      plans.value = storedPlans;
      tags.value = storedTags;
      results.value = storedResults;
      matches.value = storedMatches as NormalizedMatch[];
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
    const nextName = name.trim();
    await database.savePlan({ ...plan, name: nextName, updatedAt: stamp });
    const linkedOrders = (await database.listLedger()).filter(
      (order) => order.planId === plan.id,
    );
    await Promise.all(
      linkedOrders.map((order) =>
        database.saveLedgerOrder({
          ...order,
          planName: nextName,
          updatedAt: stamp,
        }),
      ),
    );
    await load();
  }

  async function updateTags(
    plan: SavedPlan,
    selectedTags: string[],
  ): Promise<void> {
    await database.savePlan({
      ...plan,
      tags: [...selectedTags],
      updatedAt: new Date().toISOString(),
    });
    await load();
  }

  async function remove(id: string): Promise<void> {
    await database.deletePlan(id);
    await load();
  }

  function mergeConflicts(plan: SavedPlan) {
    return ticketStore.mergeConflicts(plan);
  }

  function loadIntoTicket(plan: SavedPlan, mode: "replace" | "merge"): void {
    ticketStore.loadPlan(plan, mode);
  }

  return {
    loading,
    error,
    plans,
    tags,
    results,
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
    mergeConflicts,
    loadIntoTicket,
  };
});
