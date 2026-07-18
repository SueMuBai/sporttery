import { describe, expect, it } from 'vitest'

import {
  calculateBetCount,
  calculatePrizeRange,
  calculateStakeCents,
  evaluatePlan,
  validateSingleMarketPerMatch,
} from '@/features/betting/calculator'
import { resolveOutcome } from '@/features/betting/settlement'
import type { MatchResult, PlanSelection, SavedPlan } from '@/types/domain'

const selections: PlanSelection[] = [
  { key: '1|had|h', matchId: 1, market: 'had', outcome: 'h', odds: '1.50' },
  { key: '1|had|d', matchId: 1, market: 'had', outcome: 'd', odds: '2.00' },
  { key: '2|had|h', matchId: 2, market: 'had', outcome: 'h', odds: '2.00' },
  { key: '3|had|h', matchId: 3, market: 'had', outcome: 'h', odds: '3.00' },
]

function result(matchId: number, fullTimeScore: string): MatchResult {
  return {
    matchId,
    matchNum: String(matchId),
    homeTeam: '主队',
    awayTeam: '客队',
    halfTimeScore: '0:0',
    fullTimeScore,
    goalLine: 0,
    officialResults: {},
    fetchedAt: '2026-07-18T15:00:00+08:00',
  }
}

describe('betting calculator', () => {
  it('calculates multi-pass counts, stake and achievable prize range', () => {
    expect(calculateBetCount(selections, [2, 3])).toBe(7)
    expect(calculateStakeCents(selections, [2, 3], 1)).toBe(1400)
    expect(calculatePrizeRange(selections, [2, 3], 1)).toEqual({
      minCents: 600,
      maxCents: 5600,
    })
  })

  it('rejects selecting multiple markets for the same match', () => {
    const conflict = [
      selections[0]!,
      { key: '1|hhad|h', matchId: 1, market: 'hhad', outcome: 'h', odds: '2.20' } as const,
    ]
    expect(validateSingleMarketPerMatch(conflict)).toEqual([
      { matchId: 1, markets: ['had', 'hhad'] },
    ])
  })

  it('evaluates partial and final returns using only settled combinations', () => {
    const plan: SavedPlan = {
      id: 'plan',
      name: '三场二关',
      selections: [selections[1]!, selections[2]!, selections[3]!],
      passCounts: [2],
      multiplier: 1,
      tags: [],
      createdAt: '2026-07-18T15:00:00+08:00',
      updatedAt: '2026-07-18T15:00:00+08:00',
    }
    const partial = evaluatePlan(plan, [result(1, '1:1'), result(2, '1:0')])
    expect(partial).toMatchObject({
      totalMatches: 3,
      settledMatches: 2,
      pendingMatches: 1,
      correctMatches: 2,
      wrongMatches: 0,
      betCount: 3,
      stakeCents: 600,
      settledStakeCents: 200,
      currentReturnCents: 800,
      currentProfitCents: 600,
      status: 'pending',
    })
    const settled = evaluatePlan(plan, [
      result(1, '1:1'),
      result(2, '1:0'),
      result(3, '0:1'),
    ])
    expect(settled).toMatchObject({
      correctMatches: 2,
      wrongMatches: 1,
      currentReturnCents: 800,
      finalProfitCents: 200,
      status: 'settled',
    })
  })

  it('resolves all five official markets from scores', () => {
    const match = {
      ...result(1, '4:2'),
      halfTimeScore: '1:2',
      goalLine: -2,
    }
    expect(resolveOutcome('had', match)).toBe('h')
    expect(resolveOutcome('hhad', match)).toBe('d')
    expect(resolveOutcome('ttg', match)).toBe('6')
    expect(resolveOutcome('hafu', match)).toBe('a-h')
    expect(resolveOutcome('crs', match)).toBe('4:2')
    expect(resolveOutcome('ttg', { ...match, fullTimeScore: '4:3' })).toBe('7+')
    expect(resolveOutcome('crs', { ...match, fullTimeScore: '4:3' })).toBe('home_other')
    expect(resolveOutcome('crs', { ...match, fullTimeScore: '6:1' })).toBe('home_other')
  })
})
