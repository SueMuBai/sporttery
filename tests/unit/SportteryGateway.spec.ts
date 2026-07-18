import { describe, expect, it } from 'vitest'

import { SportteryGateway } from '@/services/api/SportteryGateway'
import { DEFAULT_SETTINGS } from '@/types/domain'

class FakeGateway extends SportteryGateway {
  override async fetchCurrentMatches(): Promise<Array<Record<string, unknown>>> {
    return [
      {
        matchId: 10,
        matchNumStr: '周五201',
        leagueAbbName: '测试联赛',
        matchDate: '2026-07-18',
        matchTime: '19:30:00',
        homeTeamId: 100,
        awayTeamId: 200,
        homeTeamAbbName: '蓝队',
        awayTeamAbbName: '橙队',
        had: { h: '1.80', d: '3.20', a: '4.10' },
        hhad: { goalLineValue: '-1.00', h: '3.10', d: '3.50', a: '1.90' },
      },
    ]
  }

  override async fetchHistory(): Promise<Array<Record<string, unknown>>> {
    return [
      {
        sportteryHomeTeamId: 200,
        sportteryAwayTeamId: 100,
        homeTeamFullCourtGoalCnt: 1,
        awayTeamFullCourtGoalCnt: 3,
        matchDate: '2025-01-01',
        tournamentShortName: '测试联赛',
        homeTeamShortName: '橙队',
        awayTeamShortName: '蓝队',
        halfTimeGoal: '0:1',
        fullCourtGoal: '1:3',
      },
    ]
  }
}

describe('SportteryGateway normalization', () => {
  it('keeps team identity colors independent of historic home/away position', async () => {
    const gateway = new FakeGateway()
    const result = await gateway.collectMatches(DEFAULT_SETTINGS)
    const match = result.matches[0]!
    expect(match.payload.historySummary).toMatchObject({
      wins: 1,
      draws: 0,
      losses: 0,
      goalsFor: 3,
      goalsAgainst: 1,
    })
    expect(match.payload.history[0]).toMatchObject({
      homeTeamRole: 'currentAway',
      awayTeamRole: 'currentHome',
      currentHomeTeamResult: 'win',
      halfTimeScore: '0:1',
    })
  })
})
