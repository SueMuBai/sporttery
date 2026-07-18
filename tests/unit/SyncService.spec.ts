import { describe, expect, it } from 'vitest'

import type { NormalizedMatch } from '@/features/matches/types'
import { SyncService } from '@/features/sync/SyncService'
import { SportteryGateway } from '@/services/api/SportteryGateway'
import { IndexedDbAdapter } from '@/services/database/indexeddb/IndexedDbAdapter'
import type { MatchResult, SavedPlan } from '@/types/domain'

const timestamp = '2026-07-18T15:00:00+08:00'

const match: NormalizedMatch = {
  matchId: 2040532,
  matchNum: '周五201',
  matchDateTime: '2026-07-18 01:00:00',
  homeTeam: '哥德堡',
  awayTeam: '布鲁马波',
  updatedAt: timestamp,
  payload: {
    league: '瑞超',
    homeRank: '',
    awayRank: '',
    odds: {
      had: { h: '1.78', d: '3.60', a: '3.45' },
      hhad: { goalLineValue: '-1.00', h: '3.30', d: '3.65', a: '1.81' },
      crs: {},
      ttg: {},
      hafu: {},
    },
    historySummary: {
      perspective: '哥德堡',
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      winRate: 0,
    },
    history: [],
  },
}

const result: MatchResult = {
  matchId: match.matchId,
  matchNum: match.matchNum,
  homeTeam: match.homeTeam,
  awayTeam: match.awayTeam,
  halfTimeScore: '1:0',
  fullTimeScore: '2:0',
  goalLine: -1,
  officialResults: { had: 'h', hhad: 'h' },
  fetchedAt: timestamp,
}

class FakeSyncGateway extends SportteryGateway {
  override async collectMatches(): Promise<{
    matches: NormalizedMatch[]
    errors: Array<{ matchId: number; message: string }>
  }> {
    return { matches: [structuredClone(match)], errors: [] }
  }

  override async fetchResultRows(): Promise<Array<Record<string, unknown>>> {
    return [{ matchId: match.matchId, sectionsNo999: '2:0' }]
  }

  override async normalizeResult(): Promise<MatchResult> {
    return structuredClone(result)
  }
}

describe('SyncService', () => {
  it('upserts matches/results incrementally and reports affected plans', async () => {
    const database = new IndexedDbAdapter(`caiguo-sync-${crypto.randomUUID()}`)
    await database.initialize()
    const service = new SyncService(database, new FakeSyncGateway())

    expect(await service.syncMatches()).toMatchObject({ added: 1, updated: 0, unchanged: 0 })
    expect(await service.syncMatches()).toMatchObject({ added: 0, updated: 0, unchanged: 1 })

    const plan: SavedPlan = {
      id: 'plan-1',
      name: '同步测试',
      selections: [
        {
          key: `${match.matchId}|had|h`,
          matchId: match.matchId,
          market: 'had',
          outcome: 'h',
          odds: '1.78',
        },
      ],
      passCounts: [1],
      multiplier: 1,
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await database.savePlan(plan)

    expect(await service.syncResults()).toMatchObject({ added: 1, updated: 0, affectedPlans: 1 })
    expect(await service.syncResults()).toMatchObject({ added: 0, updated: 0, affectedPlans: 0 })
    expect(await database.listLatestResults()).toHaveLength(1)

    await database.deleteDatabaseForTests()
  })
})
