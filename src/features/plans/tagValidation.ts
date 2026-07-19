import type { PlanTag } from '@/types/domain'

export const MAX_PLAN_TAGS = 8

export function assertValidPlanTag(tag: PlanTag): void {
  if (!tag.name.trim()) throw new Error('标签名称不能为空')
  if (tag.name !== tag.name.trim() || tag.name.length > 12) {
    throw new Error('标签名称格式无效')
  }
  if (!/^#[0-9a-f]{6}$/i.test(tag.color)) throw new Error('标签颜色格式无效')
  if (!Number.isInteger(tag.sortOrder) || tag.sortOrder < 1) {
    throw new Error('标签排序无效')
  }
  if (Number.isNaN(Date.parse(tag.createdAt))) throw new Error('标签创建时间无效')
}

export function normalizedTagIdentity(name: string): string {
  return name.toLocaleLowerCase()
}
