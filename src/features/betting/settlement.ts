import type { MarketCode, MatchResult, PlanSelection } from '@/types/domain'

function score(value: string): [number, number] {
  const match = /^(\d+)\s*:\s*(\d+)$/.exec(value.trim())
  if (!match) throw new Error(`无效比分：${value}`)
  return [Number(match[1]), Number(match[2])]
}

function resultCode(home: number, away: number): 'h' | 'd' | 'a' {
  return home > away ? 'h' : home < away ? 'a' : 'd'
}

const EXACT_SCORES = new Set([
  '0:0', '0:1', '0:2', '0:3', '0:4', '0:5',
  '1:0', '1:1', '1:2', '1:3', '1:4', '1:5',
  '2:0', '2:1', '2:2', '2:3', '2:4', '2:5',
  '3:0', '3:1', '3:2', '3:3',
  '4:0', '4:1', '4:2',
  '5:0', '5:1', '5:2',
])

export function resolveOutcome(market: MarketCode, result: MatchResult): string {
  const official = result.officialResults[market]
  if (official) return official
  const [home, away] = score(result.fullTimeScore)

  if (market === 'had') return resultCode(home, away)
  if (market === 'hhad') return resultCode(home + result.goalLine, away)
  if (market === 'ttg') return home + away <= 6 ? String(home + away) : '7+'
  if (market === 'hafu') {
    const [halfHome, halfAway] = score(result.halfTimeScore)
    return `${resultCode(halfHome, halfAway)}-${resultCode(home, away)}`
  }
  const fullScore = `${home}:${away}`
  if (EXACT_SCORES.has(fullScore)) return fullScore
  return home > away ? 'home_other' : home < away ? 'away_other' : 'draw_other'
}

export function selectionWins(selection: PlanSelection, result: MatchResult): boolean {
  return selection.outcome === resolveOutcome(selection.market, result)
}
