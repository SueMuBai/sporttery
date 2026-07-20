import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  evaluatePlan,
  type PlanEvaluation,
} from "@/features/betting/calculator";
import type { NormalizedMatch } from "@/features/matches/types";
import { getDatabase } from "@/services/database/createDatabase";
import type {
  LedgerAdjustment,
  LedgerOrder,
  MatchResult,
} from "@/types/domain";
import { addCents } from "@/utils/money";

export type LedgerRangePreset = "month" | "three-months" | "all" | "custom";
export type LedgerSort = "desc" | "asc";

export interface LedgerRange {
  start?: string;
  end?: string;
}

export interface EvaluatedLedgerOrder {
  order: LedgerOrder;
  evaluation: PlanEvaluation;
  status: "pending" | "settled";
  automaticReturnCents: number;
  displayedReturnCents: number;
  profitCents: number;
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function rangeForPreset(
  preset: LedgerRangePreset,
  today = new Date(),
): LedgerRange {
  if (preset === "all") return {};
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const start =
    preset === "three-months"
      ? new Date(today.getFullYear(), today.getMonth() - 2, 1)
      : new Date(today.getFullYear(), today.getMonth(), 1);
  return { start: localDateString(start), end: localDateString(end) };
}

export function evaluateLedgerOrder(
  order: LedgerOrder,
  results: readonly MatchResult[],
): EvaluatedLedgerOrder {
  const evaluation = evaluatePlan(order.planSnapshot, results);
  const status = evaluation.status;
  const displayedReturnCents = order.returnManual
    ? order.returnCents
    : evaluation.currentReturnCents;
  return {
    order,
    evaluation,
    status,
    automaticReturnCents: evaluation.currentReturnCents,
    displayedReturnCents,
    profitCents: displayedReturnCents - order.stakeCents,
  };
}

export const useLedgerStore = defineStore("ledger", () => {
  const database = getDatabase();
  const loading = ref(false);
  const saving = ref(false);
  const error = ref("");
  const orders = ref<LedgerOrder[]>([]);
  const results = ref<MatchResult[]>([]);
  const matches = ref<NormalizedMatch[]>([]);
  const adjustments = ref<Record<string, LedgerAdjustment[]>>({});
  const preset = ref<LedgerRangePreset>("month");
  const range = ref<LedgerRange>(rangeForPreset("month"));
  const sort = ref<LedgerSort>("desc");

  const matchById = computed(
    () => new Map(matches.value.map((match) => [match.matchId, match])),
  );
  const evaluatedOrders = computed<EvaluatedLedgerOrder[]>(() => {
    const evaluated = orders.value.map((order) =>
      evaluateLedgerOrder(order, results.value),
    );
    return evaluated.sort((left, right) => {
      const comparison = left.order.purchasedAt.localeCompare(
        right.order.purchasedAt,
      );
      return sort.value === "desc" ? -comparison : comparison;
    });
  });
  const summary = computed(() => {
    const stakeCents = addCents(
      evaluatedOrders.value.map((item) => item.order.stakeCents),
    );
    const returnCents = addCents(
      evaluatedOrders.value.map((item) => item.displayedReturnCents),
    );
    return {
      count: evaluatedOrders.value.length,
      stakeCents,
      returnCents,
      profitCents: returnCents - stakeCents,
    };
  });

  async function load(): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
      await database.initialize();
      const [storedOrders, storedResults, storedMatches] = await Promise.all([
        database.listLedger(range.value),
        database.listLatestResults(),
        database.listMatches(),
      ]);
      orders.value = storedOrders;
      results.value = storedResults;
      matches.value = storedMatches as NormalizedMatch[];
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loading.value = false;
    }
  }

  async function applyPreset(
    nextPreset: Exclude<LedgerRangePreset, "custom">,
  ): Promise<void> {
    preset.value = nextPreset;
    range.value = rangeForPreset(nextPreset);
    await load();
  }

  async function applyCustomRange(start: string, end: string): Promise<void> {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end)
    ) {
      throw new TypeError("请选择完整的起止日期");
    }
    if (start > end) throw new RangeError("起始日期不能晚于结束日期");
    preset.value = "custom";
    range.value = { start, end };
    await load();
  }

  async function updateReturn(
    item: EvaluatedLedgerOrder,
    returnCents: number,
  ): Promise<void> {
    if (item.status !== "settled")
      throw new Error("比赛全部完成后才能修改回款");
    saving.value = true;
    try {
      await database.updateLedgerReturn(
        item.order.id,
        returnCents,
        item.order.updatedAt,
        item.displayedReturnCents,
      );
      await load();
    } finally {
      saving.value = false;
    }
  }

  async function recordReturnFailure(
    item: EvaluatedLedgerOrder,
    attemptedValue: string,
    reason: unknown,
  ): Promise<void> {
    const failureReason =
      reason instanceof Error ? reason.message : String(reason);
    await database.recordLedgerAdjustmentFailure(
      item.order.id,
      item.displayedReturnCents,
      attemptedValue,
      failureReason,
    );
    await loadAdjustments(item.order.id);
  }

  async function updateNotes(
    item: EvaluatedLedgerOrder,
    notes: string,
  ): Promise<void> {
    saving.value = true;
    try {
      await database.updateLedgerNotes(
        item.order.id,
        notes,
        item.order.updatedAt,
      );
      await load();
    } finally {
      saving.value = false;
    }
  }

  function find(id: string): EvaluatedLedgerOrder | undefined {
    return evaluatedOrders.value.find((item) => item.order.id === id);
  }

  async function loadAdjustments(orderId: string): Promise<void> {
    adjustments.value = {
      ...adjustments.value,
      [orderId]: await database.listLedgerAdjustments(orderId),
    };
  }

  async function undoLatestReturn(item: EvaluatedLedgerOrder): Promise<void> {
    saving.value = true;
    try {
      await database.undoLatestLedgerAdjustment(
        item.order.id,
        item.order.updatedAt,
      );
      await load();
      await loadAdjustments(item.order.id);
    } finally {
      saving.value = false;
    }
  }

  return {
    loading,
    saving,
    error,
    orders,
    results,
    matches,
    adjustments,
    preset,
    range,
    sort,
    matchById,
    evaluatedOrders,
    summary,
    load,
    applyPreset,
    applyCustomRange,
    updateReturn,
    recordReturnFailure,
    updateNotes,
    find,
    loadAdjustments,
    undoLatestReturn,
  };
});
