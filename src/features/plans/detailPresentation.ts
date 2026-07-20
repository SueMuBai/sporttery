import type { PlanSelection } from "@/types/domain";

export type DetailChoiceTone =
  "win" | "draw" | "loss" | "default" | "correct" | "wrong" | "pending";

export function detailChoiceTone(
  selections: readonly PlanSelection[],
  options: {
    anySettled: boolean;
    settled: boolean;
    correct: boolean;
  },
): DetailChoiceTone {
  if (options.anySettled) {
    if (!options.settled) return "pending";
    return options.correct ? "correct" : "wrong";
  }

  const outcome = selections[0]?.outcome ?? "";
  const last = outcome.split("-").at(-1);
  if (last === "h") return "win";
  if (last === "d") return "draw";
  if (last === "a") return "loss";
  return "default";
}
