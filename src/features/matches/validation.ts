import { isValidMarketOutcome } from '@/features/betting/outcomes'
import type { MatchResult, MatchSnapshot } from '@/types/domain'

const scorePattern = /^\d+\s*:\s*\d+$/

function requireText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label}不能为空`)
}

export function assertValidMatchSnapshot(match: MatchSnapshot): void {
  if (!Number.isInteger(match.matchId) || match.matchId <= 0) {
    throw new Error('比赛 ID 无效')
  }
  requireText(match.matchNum, `比赛 ${match.matchId} 的场次号`)
  requireText(match.homeTeam, `比赛 ${match.matchId} 的主队`)
  requireText(match.awayTeam, `比赛 ${match.matchId} 的客队`)
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(match.matchDateTime)) {
    throw new Error(`比赛 ${match.matchId} 的开赛时间格式无效`)
  }
  if (!match.payload || typeof match.payload !== 'object' || Array.isArray(match.payload)) {
    throw new Error(`比赛 ${match.matchId} 的原始数据格式无效`)
  }
  if (Number.isNaN(Date.parse(match.updatedAt))) {
    throw new Error(`比赛 ${match.matchId} 的更新时间格式无效`)
  }
}

export function assertValidMatchResult(result: MatchResult): void {
  if (!Number.isInteger(result.matchId) || result.matchId <= 0) {
    throw new Error('赛果比赛 ID 无效')
  }
  requireText(result.matchNum, `比赛 ${result.matchId} 的场次号`)
  requireText(result.homeTeam, `比赛 ${result.matchId} 的主队`)
  requireText(result.awayTeam, `比赛 ${result.matchId} 的客队`)
  if (result.halfTimeScore.trim() && !scorePattern.test(result.halfTimeScore)) {
    throw new Error(`比赛 ${result.matchId} 的半场比分格式无效`)
  }
  if (!scorePattern.test(result.fullTimeScore)) {
    throw new Error(`比赛 ${result.matchId} 的全场比分格式无效`)
  }
  if (!Number.isFinite(result.goalLine) || !Number.isInteger(result.goalLine)) {
    throw new Error(`比赛 ${result.matchId} 的让球值无效`)
  }
  if (
    !result.officialResults ||
    typeof result.officialResults !== 'object' ||
    Array.isArray(result.officialResults)
  ) {
    throw new Error(`比赛 ${result.matchId} 的官方赛果格式无效`)
  }
  for (const [market, outcome] of Object.entries(result.officialResults)) {
    if (!isValidMarketOutcome(market, outcome)) {
      throw new Error(`比赛 ${result.matchId} 的官方赛果内容无效`)
    }
  }
  if (Number.isNaN(Date.parse(result.fetchedAt))) {
    throw new Error(`比赛 ${result.matchId} 的赛果更新时间格式无效`)
  }
}
