import { cartesianProduct, combinations } from '@/features/betting/combinations'
import { payoutCents } from '@/features/betting/oddsMath'
import { MARKET_OUTCOMES } from '@/features/betting/outcomes'
import { selectionSettled, selectionWins } from '@/features/betting/settlement'
import type { MatchResult, PlanSelection, SavedPlan } from '@/types/domain'

export interface MarketConflict {
  matchId: number
  markets: string[]
}

export interface PrizeRange {
  minCents: number
  maxCents: number
}

export interface PlanEvaluation {
  totalMatches: number
  settledMatches: number
  pendingMatches: number
  correctMatches: number
  wrongMatches: number
  betCount: number
  stakeCents: number
  settledStakeCents: number
  currentReturnCents: number
  currentProfitCents: number
  finalProfitCents?: number
  status: 'pending' | 'settled'
}

export interface PlanBet {
  passSize: number
  selections: PlanSelection[]
}

export interface PlanBetGroup extends PlanBet {
  betCount: number
  prizeCents: number
}

export function groupPlanBetsByMatches(
  bets: readonly PlanBet[],
  multiplier: number,
): PlanBetGroup[] {
  const values = new Map<string, PlanBetGroup>()
  for (const bet of bets) {
    const key = `${bet.passSize}:${bet.selections
      .map((selection) => selection.matchId)
      .sort((left, right) => left - right)
      .join('-')}`
    const prizeCents = payoutCents(
      200 * multiplier,
      bet.selections.map((selection) => selection.odds),
    )
    const current = values.get(key)
    if (current) {
      current.betCount += 1
      current.prizeCents += prizeCents
    } else {
      values.set(key, {
        passSize: bet.passSize,
        selections: bet.selections,
        betCount: 1,
        prizeCents,
      })
    }
  }
  return [...values.values()]
}

export function groupSelections(selections: readonly PlanSelection[]): Map<number, PlanSelection[]> {
  const groups = new Map<number, PlanSelection[]>()
  for (const selection of selections) {
    const values = groups.get(selection.matchId) ?? []
    values.push(selection)
    groups.set(selection.matchId, values)
  }
  return groups
}

export function validateSingleMarketPerMatch(
  selections: readonly PlanSelection[],
): MarketConflict[] {
  return [...groupSelections(selections)].flatMap(([matchId, values]) => {
    const markets = [...new Set(values.map((selection) => selection.market))]
    return markets.length > 1 ? [{ matchId, markets }] : []
  })
}

export function calculateBetCount(
  selections: readonly PlanSelection[],
  passCounts: readonly number[],
): number {
  const groups = [...groupSelections(selections).values()]
  return [...new Set(passCounts)].reduce((total, size) => {
    if (!Number.isInteger(size) || size < 1) return total
    return (
      total +
      combinations(groups, size).reduce(
        (subtotal, combination) =>
          subtotal + combination.reduce((product, group) => product * group.length, 1),
        0,
      )
    )
  }, 0)
}

export function enumeratePlanBets(plan: Pick<SavedPlan, 'selections' | 'passCounts'>): PlanBet[] {
  const groups = [...groupSelections(plan.selections).entries()]
  return [...new Set(plan.passCounts)].flatMap((size) =>
    combinations(groups, size).flatMap((matchCombination) =>
      cartesianProduct(matchCombination.map(([, selections]) => selections)).map((selections) => ({
        passSize: size,
        selections,
      })),
    ),
  )
}

export function calculateStakeCents(
  selections: readonly PlanSelection[],
  passCounts: readonly number[],
  multiplier: number,
): number {
  if (!Number.isInteger(multiplier) || multiplier < 1) throw new TypeError('倍数必须是正整数')
  const cents = calculateBetCount(selections, passCounts) * 200 * multiplier
  if (!Number.isSafeInteger(cents)) throw new RangeError('投注金额超出安全范围')
  return cents
}

export function calculatePrizeRange(
  selections: readonly PlanSelection[],
  passCounts: readonly number[],
  multiplier: number,
): PrizeRange {
  const groups = [...groupSelections(selections).values()]
  const validPasses = [...new Set(passCounts)]
    .filter((size) => Number.isInteger(size) && size >= 1 && size <= groups.length)
    .sort((left, right) => left - right)
  if (!groups.length || !validPasses.length) return { minCents: 0, maxCents: 0 }
  const baseCents = 200 * multiplier

  const minimumGroups = groups.map((group) => {
    const odds = group
      .map((selection) => selection.odds)
      .sort((left, right) => Number(left) - Number(right))[0]!
    const market = group[0]!.market
    const selectedOutcomes = new Set(group.map((selection) => selection.outcome))
    const fullOutcomes = MARKET_OUTCOMES[market]
    const guaranteed =
      selectedOutcomes.size >= fullOutcomes.size &&
      [...fullOutcomes].every((outcome) => selectedOutcomes.has(outcome))
    return { odds, guaranteed }
  })
  const minimumPass = validPasses[0]!
  const guaranteedOdds = minimumGroups
    .filter((group) => group.guaranteed)
    .map((group) => group.odds)
  let minCents: number
  if (guaranteedOdds.length >= minimumPass) {
    minCents = validPasses
      .filter((size) => size <= guaranteedOdds.length)
      .reduce(
        (total, size) =>
          total +
          combinations(guaranteedOdds, size).reduce(
            (subtotal, combination) =>
              subtotal + payoutCents(baseCents, combination),
            0,
          ),
        0,
      )
  } else {
    const optionalOdds = minimumGroups
      .filter((group) => !group.guaranteed)
      .map((group) => group.odds)
      .sort((left, right) => Number(left) - Number(right))
    minCents = payoutCents(baseCents, [
      ...guaranteedOdds,
      ...optionalOdds.slice(0, minimumPass - guaranteedOdds.length),
    ])
  }

  const maximumGroups = groups.map((group) =>
    group.reduce((best, selection) => (Number(selection.odds) > Number(best.odds) ? selection : best)),
  )
  const maxCents = validPasses.reduce(
    (total, size) =>
      total +
      combinations(maximumGroups, size).reduce(
        (subtotal, combination) =>
          subtotal + payoutCents(baseCents, combination.map((selection) => selection.odds)),
        0,
      ),
    0,
  )
  return { minCents, maxCents }
}

export function evaluatePlan(plan: SavedPlan, results: readonly MatchResult[]): PlanEvaluation {
  const conflicts = validateSingleMarketPerMatch(plan.selections)
  if (conflicts.length) throw new Error(`方案包含同场多玩法冲突：${conflicts.map((item) => item.matchId).join('、')}`)
  const resultById = new Map(results.map((result) => [result.matchId, result]))
  const groups = [...groupSelections(plan.selections).entries()]
  const settledGroups = groups.filter(([matchId, selections]) =>
    selectionSettled(selections[0]!, resultById.get(matchId)),
  )
  const correctMatches = settledGroups.filter(([matchId, selections]) => {
    const result = resultById.get(matchId)
    return result ? selections.some((selection) => selectionWins(selection, result)) : false
  }).length
  const wrongMatches = settledGroups.length - correctMatches
  const baseCents = 200 * plan.multiplier
  let betCount = 0
  let settledBetCount = 0
  let currentReturnCents = 0

  for (const size of [...new Set(plan.passCounts)]) {
    for (const matchCombination of combinations(groups, size)) {
      const selectionGroups = matchCombination.map(([, selections]) => selections)
      for (const selectionCombination of cartesianProduct(selectionGroups)) {
        betCount += 1
        const settled = selectionCombination.every((selection) =>
          selectionSettled(selection, resultById.get(selection.matchId)),
        )
        if (!settled) continue
        settledBetCount += 1
        const won = selectionCombination.every((selection) => {
          const result = resultById.get(selection.matchId)
          return result ? selectionWins(selection, result) : false
        })
        if (won) {
          currentReturnCents += payoutCents(
            baseCents,
            selectionCombination.map((selection) => selection.odds),
          )
        }
      }
    }
  }

  const stakeCents = betCount * baseCents
  const settledStakeCents = settledBetCount * baseCents
  const pendingMatches = groups.length - settledGroups.length
  const status = pendingMatches === 0 ? 'settled' : 'pending'
  return {
    totalMatches: groups.length,
    settledMatches: settledGroups.length,
    pendingMatches,
    correctMatches,
    wrongMatches,
    betCount,
    stakeCents,
    settledStakeCents,
    currentReturnCents,
    currentProfitCents: currentReturnCents - settledStakeCents,
    finalProfitCents: status === 'settled' ? currentReturnCents - stakeCents : undefined,
    status,
  }
}
