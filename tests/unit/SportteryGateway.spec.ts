import { describe, expect, it } from 'vitest'

import {
  parseOfficialResults,
  SportteryGateway,
} from '@/services/api/SportteryGateway'
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

  it('reports invalid match identifiers instead of requesting history for match 0', async () => {
    class InvalidMatchGateway extends FakeGateway {
      historyCalls: number[] = []

      override async fetchCurrentMatches(): Promise<Array<Record<string, unknown>>> {
        return [
          ...(await super.fetchCurrentMatches(DEFAULT_SETTINGS)),
          { matchNumStr: '异常场次', homeTeamAbbName: '无ID主队' },
        ]
      }

      override async fetchHistory(matchId: number): Promise<Array<Record<string, unknown>>> {
        this.historyCalls.push(matchId)
        return super.fetchHistory(matchId, DEFAULT_SETTINGS)
      }
    }
    const gateway = new InvalidMatchGateway()
    const result = await gateway.collectMatches(DEFAULT_SETTINGS)

    expect(gateway.historyCalls).toEqual([10])
    expect(result.matches).toHaveLength(1)
    expect(result.errors).toEqual([
      expect.objectContaining({ matchId: 0, message: expect.stringContaining('异常场次') }),
    ])
  })

  it('keeps the match and odds when only its history request fails', async () => {
    class HistoryFailureGateway extends FakeGateway {
      override async fetchHistory(): Promise<Array<Record<string, unknown>>> {
        throw new Error('历史接口超时')
      }
    }
    const gateway = new HistoryFailureGateway()
    const result = await gateway.collectMatches(DEFAULT_SETTINGS)

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]).toMatchObject({
      matchId: 10,
      homeTeam: '蓝队',
      awayTeam: '橙队',
      payload: {
        odds: { had: { h: '1.80', d: '3.20', a: '4.10' } },
        history: [],
        historySummary: { matches: 0 },
      },
    })
    expect(result.errors).toEqual([
      { matchId: 10, message: '历史交锋：历史接口超时' },
    ])
  })

  it('normalizes official total-goal overflow and ignores unfinished score placeholders', async () => {
    expect(
      parseOfficialResults([
        { poolCode: 'HHAD', combination: 'A' },
        { poolCode: 'TTG', combination: '7' },
        { poolCode: 'HAFU', combination: 'H:D' },
        { poolCode: 'CRS', combination: '-1:-A' },
        { poolCode: 'HAD', combination: 'D' },
      ]),
    ).toEqual({
      hhad: 'a',
      ttg: '7+',
      hafu: 'h-d',
      crs: 'away_other',
      had: 'd',
    })
    expect(() =>
      parseOfficialResults([{ poolCode: 'HAD', combination: 'HOME' }]),
    ).toThrow('官方结果接口返回未知结果：had/home')

    const gateway = new SportteryGateway()
    await expect(
      gateway.normalizeResult({ matchId: 1, sectionsNo999: '-' }, undefined, DEFAULT_SETTINGS),
    ).resolves.toBeUndefined()
    await expect(
      gateway.normalizeResult({ matchId: 0, sectionsNo999: '1:0' }, undefined, DEFAULT_SETTINGS),
    ).rejects.toThrow('有效 matchId')
  })
})
