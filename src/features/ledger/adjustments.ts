import type { LedgerAdjustment } from "@/types/domain";

export const LOCAL_LEDGER_OPERATOR = "本机";
export const DEFAULT_LEDGER_ADJUSTMENT_NOTE = "手工修改实际回款";

type CompatibleLedgerAdjustment = Omit<
  LedgerAdjustment,
  "status" | "source" | "operator" | "failureReason" | "attemptedValue"
> &
  Partial<
    Pick<
      LedgerAdjustment,
      "status" | "source" | "operator" | "failureReason" | "attemptedValue"
    >
  >;

/** Backfills records written by releases before adjustment audit metadata. */
export function normalizeLedgerAdjustment(
  adjustment: CompatibleLedgerAdjustment,
): LedgerAdjustment {
  const status = adjustment.status === "failed" ? "failed" : "success";
  const source = adjustment.source === "system" ? "system" : "manual";
  return {
    ...adjustment,
    status,
    source,
    operator: adjustment.operator?.trim() || LOCAL_LEDGER_OPERATOR,
    failureReason: adjustment.failureReason?.trim() || "",
    attemptedValue:
      adjustment.attemptedValue?.trim() || String(adjustment.nextReturnCents),
  };
}

export function ledgerAdjustmentErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    for (const key of ["message", "error", "reason"]) {
      const value = candidate[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return String(error);
}

export function hasMeaningfulAdjustmentNote(note: string): boolean {
  const normalized = note.trim();
  return Boolean(normalized && normalized !== DEFAULT_LEDGER_ADJUSTMENT_NOTE);
}
