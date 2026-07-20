const GENERATED_PLAN_NAME =
  /^周[日一二三四五六]\d+场\s*[·・]\s*\d{2}-\d{2}\s+\d{2}:\d{2}$/;

export function ledgerPlanTitle(planName: string, totalMatches: number): string {
  const normalized = planName.trim();
  if (normalized && !GENERATED_PLAN_NAME.test(normalized)) return normalized;

  const matchCount = Math.max(1, Math.trunc(totalMatches) || 0);
  return `${matchCount}关方案`;
}

export function ledgerPlanSubtitle(
  totalMatches: number,
  selectionCount: number,
): string {
  return `${Math.max(0, Math.trunc(totalMatches) || 0)}场 · ${Math.max(
    0,
    Math.trunc(selectionCount) || 0,
  )}个选项`;
}
