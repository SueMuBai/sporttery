import { calculatePrizeRange, calculateStakeCents, validateSingleMarketPerMatch } from '@/features/betting/calculator'
import { isValidMarketOutcome } from '@/features/betting/outcomes'
import { normalizePlanName } from '@/features/plans/planName'
import type { LedgerOrder, SavedPlan } from '@/types/domain'

export function assertPersistablePlan(plan: SavedPlan): void {
  if (!plan.id.trim()) throw new Error('方案缺少 ID')
  if (!Number.isInteger(plan.revision) || plan.revision < 1) {
    throw new Error('方案版本无效')
  }
  if (normalizePlanName(plan.name) !== plan.name) {
    throw new Error('方案名称格式无效')
  }
  if (!plan.selections.length) throw new Error('方案没有投注选项')
  const keys = new Set<string>()
  for (const selection of plan.selections) {
    if (!Number.isInteger(selection.matchId) || selection.matchId <= 0) {
      throw new Error('方案包含无效比赛 ID')
    }
    if (!isValidMarketOutcome(selection.market, selection.outcome)) {
      throw new Error('方案包含无效投注选项')
    }
    if (!/^\d+(?:\.\d+)?$/.test(selection.odds) || Number(selection.odds) <= 0) {
      throw new Error('方案包含无效赔率')
    }
    const expectedKey = `${selection.matchId}|${selection.market}|${selection.outcome}`
    if (selection.key !== expectedKey || keys.has(expectedKey)) {
      throw new Error('方案包含重复或无效投注键')
    }
    keys.add(expectedKey)
  }
  if (validateSingleMarketPerMatch(plan.selections).length) {
    throw new Error('方案包含同场多玩法')
  }
  const matchCount = new Set(plan.selections.map((selection) => selection.matchId)).size
  if (
    !plan.passCounts.length ||
    new Set(plan.passCounts).size !== plan.passCounts.length ||
    plan.passCounts.some(
      (size) => !Number.isInteger(size) || size < 1 || size > 8 || size > matchCount,
    )
  ) {
    throw new Error('方案过关方式无效')
  }
  if (!Number.isInteger(plan.multiplier) || plan.multiplier < 1 || plan.multiplier > 9999) {
    throw new Error('方案倍数无效')
  }
  if (plan.tags.length > 3 || new Set(plan.tags).size !== plan.tags.length) {
    throw new Error('方案标签无效')
  }
  if (Number.isNaN(Date.parse(plan.createdAt)) || Number.isNaN(Date.parse(plan.updatedAt))) {
    throw new Error('方案时间格式无效')
  }
  calculateStakeCents(plan.selections, plan.passCounts, plan.multiplier)
  calculatePrizeRange(plan.selections, plan.passCounts, plan.multiplier)
}

export function assertPersistableLedgerOrder(order: LedgerOrder): void {
  if (!order.id?.trim()) throw new Error('账单缺少 ID')
  assertPersistablePlan(order.planSnapshot)
  if (normalizePlanName(order.planName) !== order.planName) {
    throw new Error('账单名称格式无效')
  }
  if (order.planName !== order.planSnapshot.name) {
    throw new Error('账单名称与冻结方案不一致')
  }
  if (order.planId && order.planId !== order.planSnapshot.id) {
    throw new Error('账单关联方案与冻结方案不一致')
  }
  const expectedStake = calculateStakeCents(
    order.planSnapshot.selections,
    order.planSnapshot.passCounts,
    order.planSnapshot.multiplier,
  )
  if (!Number.isSafeInteger(order.stakeCents) || order.stakeCents !== expectedStake) {
    throw new Error('账单投入金额与冻结方案不一致')
  }
  if (!Number.isSafeInteger(order.returnCents) || order.returnCents < 0) {
    throw new Error('账单回款金额无效')
  }
  if (!['pending', 'settled'].includes(order.status)) {
    throw new Error('账单状态无效')
  }
  if (normalizeLedgerNotes(order.notes) !== order.notes) {
    throw new Error('账单备注格式无效')
  }
  for (const [label, value] of [
    ['购买时间', order.purchasedAt],
    ['创建时间', order.createdAt],
    ['更新时间', order.updatedAt],
  ] as const) {
    if (Number.isNaN(Date.parse(value))) throw new Error(`账单${label}格式无效`)
  }
}

export function normalizeLedgerNotes(value: string): string {
  const normalized = value.trim()
  if (normalized.length > 80) throw new Error('账单备注最多 80 个字符')
  return normalized
}
