import { describe, expect, it } from 'vitest'

import {
  assertPersistableLedgerOrder,
  assertPersistablePlan,
  normalizeLedgerNotes,
} from '@/features/plans/validation'
import type { SavedPlan } from '@/types/domain'

const stamp = '2026-07-19T12:00:00.000Z'

function plan(): SavedPlan {
  return {
    id: 'valid-plan',
    revision: 1,
    status: 'saved',
    name: '有效方案',
    selections: [
      {
        key: '1|had|h',
        matchId: 1,
        market: 'had',
        outcome: 'h',
        odds: '1.80',
      },
    ],
    passCounts: [1],
    multiplier: 1,
    tags: [],
    createdAt: stamp,
    updatedAt: stamp,
  }
}

describe('persistable plan validation', () => {
  it('accepts a normalized valid plan', () => {
    expect(() => assertPersistablePlan(plan())).not.toThrow()
  })

  it('rejects invalid odds, keys, passes, multipliers and duplicate tags', () => {
    expect(() =>
      assertPersistablePlan({
        ...plan(),
        selections: [{ ...plan().selections[0]!, odds: '-1.20' }],
      }),
    ).toThrow('无效赔率')
    expect(() =>
      assertPersistablePlan({
        ...plan(),
        selections: [{ ...plan().selections[0]!, key: 'forged' }],
      }),
    ).toThrow('投注键')
    expect(() => assertPersistablePlan({ ...plan(), passCounts: [2] })).toThrow(
      '过关方式',
    )
    expect(() => assertPersistablePlan({ ...plan(), multiplier: 0 })).toThrow(
      '倍数',
    )
    expect(() => assertPersistablePlan({ ...plan(), tags: ['AI', 'AI'] })).toThrow(
      '标签',
    )
  })

  it('requires ledger money and identity to match the frozen plan', () => {
    const snapshot = plan()
    const order = {
      id: 'order-1',
      planId: snapshot.id,
      planName: snapshot.name,
      planSnapshot: snapshot,
      purchasedAt: stamp,
      stakeCents: 200,
      returnCents: 0,
      returnManual: false,
      status: 'pending' as const,
      notes: '',
      createdAt: stamp,
      updatedAt: stamp,
    }
    expect(() => assertPersistableLedgerOrder(order)).not.toThrow()
    expect(() =>
      assertPersistableLedgerOrder({ ...order, stakeCents: 400 }),
    ).toThrow('投入金额')
    expect(() =>
      assertPersistableLedgerOrder({ ...order, planName: '其他名称' }),
    ).toThrow('名称与冻结方案')
    expect(() =>
      assertPersistableLedgerOrder({ ...order, returnCents: -1 }),
    ).toThrow('回款金额')
    expect(normalizeLedgerNotes('  已核对  ')).toBe('已核对')
    expect(() => normalizeLedgerNotes('长'.repeat(81))).toThrow('80')
  })
})
