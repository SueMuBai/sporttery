import { describe, expect, it } from 'vitest'

import {
  calculateBetCount,
  calculatePrizeRange,
  calculateStakeCents,
  enumeratePlanBets,
  evaluatePlan,
  groupPlanBetsByMatches,
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

  it('includes every fully covered market that is guaranteed to win in the prize floor', () => {
    const fullyCovered = [
      ['1.10', '2.00', '3.00'],
      ['1.20', '2.10', '3.10'],
      ['1.30', '2.20', '3.20'],
    ].flatMap((odds, matchIndex) =>
      (['h', 'd', 'a'] as const).map((outcome, outcomeIndex) => ({
        key: `${matchIndex + 1}|had|${outcome}`,
        matchId: matchIndex + 1,
        market: 'had' as const,
        outcome,
        odds: odds[outcomeIndex]!,
      })),
    )

    expect(calculatePrizeRange(fullyCovered, [2], 1).minCents).toBe(862)
  })

  it('cannot exclude a guaranteed match when choosing the cheapest winning pass', () => {
    const values: PlanSelection[] = [
      { key: '1|had|h', matchId: 1, market: 'had', outcome: 'h', odds: '4.00' },
      { key: '1|had|d', matchId: 1, market: 'had', outcome: 'd', odds: '5.00' },
      { key: '1|had|a', matchId: 1, market: 'had', outcome: 'a', odds: '6.00' },
      { key: '2|had|h', matchId: 2, market: 'had', outcome: 'h', odds: '1.10' },
      { key: '3|had|h', matchId: 3, market: 'had', outcome: 'h', odds: '1.20' },
    ]

    expect(calculatePrizeRange(values, [2], 1).minCents).toBe(880)
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

  it('groups outcome bets by their underlying match combination', () => {
    const plan: SavedPlan = {
      revision: 1,
      status: 'saved',
      id: 'grouped-plan',
      name: '组合分组',
      selections,
      passCounts: [2],
      multiplier: 1,
      tags: [],
      createdAt: '2026-07-18T15:00:00+08:00',
      updatedAt: '2026-07-18T15:00:00+08:00',
    }
    const groups = groupPlanBetsByMatches(enumeratePlanBets(plan), 1)

    expect(groups).toHaveLength(3)
    expect(groups.reduce((total, group) => total + group.betCount, 0)).toBe(5)
    expect(groups[0]).toMatchObject({ passSize: 2, betCount: 2, prizeCents: 1400 })
  })

  it('evaluates partial and final returns using only settled combinations', () => {
    const plan: SavedPlan = {
      revision: 1,
      status: 'saved',
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
    expect(
      resolveOutcome('had', {
        ...match,
        officialResults: { had: 'invalid' },
      }),
    ).toBe('h')
  })

  it('keeps half-full-time bets pending when neither official nor half-time result is available', () => {
    const plan: SavedPlan = {
      id: 'pending-hafu',
      revision: 1,
      status: 'saved',
      name: '半全场待结算',
      selections: [
        {
          key: '1|hafu|h-h',
          matchId: 1,
          market: 'hafu',
          outcome: 'h-h',
          odds: '3.20',
        },
      ],
      passCounts: [1],
      multiplier: 1,
      tags: [],
      createdAt: '2026-07-18T15:00:00+08:00',
      updatedAt: '2026-07-18T15:00:00+08:00',
    }
    const incomplete = {
      ...result(1, '2:0'),
      halfTimeScore: '',
      officialResults: {},
    }

    expect(evaluatePlan(plan, [incomplete])).toMatchObject({
      settledMatches: 0,
      pendingMatches: 1,
      correctMatches: 0,
      wrongMatches: 0,
      currentReturnCents: 0,
      status: 'pending',
    })
    expect(
      evaluatePlan(plan, [
        { ...incomplete, officialResults: { hafu: 'h-h' } },
      ]),
    ).toMatchObject({
      settledMatches: 1,
      pendingMatches: 0,
      correctMatches: 1,
      status: 'settled',
    })
  })

  it('keeps handicap bets pending when the official result and handicap are unavailable', () => {
    const plan: SavedPlan = {
      id: 'pending-hhad',
      revision: 1,
      status: 'saved',
      name: '让球待结算',
      selections: [
        {
          key: '1|hhad|h',
          matchId: 1,
          market: 'hhad',
          outcome: 'h',
          odds: '2.10',
        },
      ],
      passCounts: [1],
      multiplier: 1,
      tags: [],
      createdAt: '2026-07-18T15:00:00+08:00',
      updatedAt: '2026-07-18T15:00:00+08:00',
    }
    const unknownHandicap = {
      ...result(1, '2:0'),
      goalLine: 0,
      officialResults: {},
    }

    expect(evaluatePlan(plan, [unknownHandicap])).toMatchObject({
      settledMatches: 0,
      pendingMatches: 1,
      wrongMatches: 0,
      status: 'pending',
    })
    expect(
      evaluatePlan(plan, [
        { ...unknownHandicap, officialResults: { hhad: 'h' } },
      ]),
    ).toMatchObject({
      settledMatches: 1,
      correctMatches: 1,
      status: 'settled',
    })
  })
})
