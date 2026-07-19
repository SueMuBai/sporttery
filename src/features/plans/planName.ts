export const PLAN_NAME_MAX_LENGTH = 20;

export function normalizePlanName(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError("请输入名称");
  if (normalized.length > PLAN_NAME_MAX_LENGTH) {
    throw new RangeError(`名称最多 ${PLAN_NAME_MAX_LENGTH} 个字符`);
  }
  return normalized;
}

export function fitGeneratedPlanName(value: string): string {
  const normalized = value.trim();
  return normalized.length <= PLAN_NAME_MAX_LENGTH
    ? normalized
    : normalized.slice(0, PLAN_NAME_MAX_LENGTH);
}

export function copiedPlanName(value: string): string {
  const suffix = " 副本";
  return `${value.trim().slice(0, PLAN_NAME_MAX_LENGTH - suffix.length)}${suffix}`;
}
