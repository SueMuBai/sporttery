import { describe, expect, it, vi } from 'vitest'

import type { NormalizedMatch } from '@/features/matches/types'
import type { MatchSyncProgress } from '@/features/matches/types'
import { SyncService } from '@/features/sync/SyncService'
import { SportteryGateway } from '@/services/api/SportteryGateway'
import { IndexedDbAdapter } from '@/services/database/indexeddb/IndexedDbAdapter'
import type { AppSettings, MatchResult, SavedPlan } from '@/types/domain'

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
  collectCalls = 0

  override async collectMatches(): Promise<{
    matches: NormalizedMatch[]
    errors: Array<{ matchId: number; message: string }>
  }> {
    this.collectCalls += 1
    return { matches: [structuredClone(match)], errors: [] }
  }

  override async fetchResultRows(): Promise<Array<Record<string, unknown>>> {
    return [{ matchId: match.matchId, sectionsNo999: '2:0' }]
  }

  override async normalizeResult(): Promise<MatchResult> {
    return structuredClone(result)
  }
}

class RetrySyncGateway extends FakeSyncGateway {
  retriedIds: number[] = []

  override async collectMatches(
    _settings: AppSettings,
    _onProgress?: (progress: MatchSyncProgress) => void,
    onlyMatchIds?: ReadonlySet<number>,
  ): Promise<{
    matches: NormalizedMatch[]
    errors: Array<{ matchId: number; message: string }>
  }> {
    if (!onlyMatchIds) {
      return { matches: [], errors: [{ matchId: match.matchId, message: '临时失败' }] }
    }
    this.retriedIds = [...onlyMatchIds]
    return { matches: [structuredClone(match)], errors: [] }
  }
}

class PartialResultGateway extends FakeSyncGateway {
  resultFailuresRemaining = 1

  override async fetchResultRows(): Promise<Array<Record<string, unknown>>> {
    if (this.resultFailuresRemaining > 0) {
      this.resultFailuresRemaining -= 1
      throw new Error('临时赛果网络错误')
    }
    return super.fetchResultRows()
  }
}

class PartialHistoryGateway extends FakeSyncGateway {
  override async collectMatches(): Promise<{
    matches: NormalizedMatch[]
    errors: Array<{ matchId: number; message: string }>
  }> {
    return {
      matches: [structuredClone(match)],
      errors: [{ matchId: match.matchId, message: '历史交锋：临时超时' }],
    }
  }
}

class TransientOfficialFailureGateway extends FakeSyncGateway {
  normalizeCalls = 0

  override async normalizeResult(): Promise<MatchResult> {
    this.normalizeCalls += 1
    if (this.normalizeCalls === 1) return structuredClone(result)
    return {
      ...structuredClone(result),
      halfTimeScore: '',
      goalLine: 0,
      officialResults: {},
      fetchedAt: '2026-07-19T15:00:00+08:00',
    }
  }
}

describe('SyncService', () => {
  it('shares one full refresh across concurrent page triggers', async () => {
    const database = new IndexedDbAdapter(`caiguo-sync-${crypto.randomUUID()}`)
    await database.initialize()
    const gateway = new FakeSyncGateway()
    const service = new SyncService(database, gateway)

    const [first, second] = await Promise.all([service.fullSync(), service.fullSync()])

    expect(gateway.collectCalls).toBe(1)
    expect(second).toEqual(first)
    expect((await service.latestSnapshot())?.completedAt).toBe(first.completedAt)
    await database.deleteDatabaseForTests()
  })

  it('persists the latest report and retries only failed match histories', async () => {
    const database = new IndexedDbAdapter(`caiguo-retry-${crypto.randomUUID()}`)
    await database.initialize()
    const gateway = new RetrySyncGateway()
    const service = new SyncService(database, gateway)

    const failed = await service.fullSync()
    expect(failed.matches.failed).toBe(1)

    const retried = await service.retryFailed(failed)
    expect(gateway.retriedIds).toEqual([match.matchId])
    expect(retried.mode).toBe('retry')
    expect(retried.matches).toMatchObject({ added: 1, failed: 0 })
    expect((await service.latestSnapshot())?.mode).toBe('retry')

    await database.deleteDatabaseForTests()
  })

  it('persists core match data even when its history is only partially available', async () => {
    const database = new IndexedDbAdapter(`caiguo-history-partial-${crypto.randomUUID()}`)
    await database.initialize()
    const service = new SyncService(database, new PartialHistoryGateway())

    const report = await service.syncMatches()

    expect(report).toMatchObject({ added: 1, failed: 1 })
    expect(await database.listMatches()).toEqual([match])
    await database.deleteDatabaseForTests()
  })

  it('upserts matches/results incrementally and reports affected plans', async () => {
    const database = new IndexedDbAdapter(`caiguo-sync-${crypto.randomUUID()}`)
    await database.initialize()
    const service = new SyncService(database, new FakeSyncGateway())
    const outerTransaction = vi.spyOn(database, 'transaction')

    expect(await service.syncMatches()).toMatchObject({ added: 1, updated: 0, unchanged: 0 })
    expect(await service.syncMatches()).toMatchObject({ added: 0, updated: 0, unchanged: 1 })
    expect(outerTransaction).not.toHaveBeenCalled()

    const plan: SavedPlan = {
      id: 'plan-1',
      revision: 1,
      status: 'saved',
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

  it('preserves complete local result fields when a later detail request is partial', async () => {
    const database = new IndexedDbAdapter(`caiguo-result-merge-${crypto.randomUUID()}`)
    await database.initialize()
    await database.saveMatches([match])
    const gateway = new TransientOfficialFailureGateway()
    const service = new SyncService(database, gateway)

    expect(await service.syncResults()).toMatchObject({ added: 1, updated: 0 })
    expect(await service.syncResults()).toMatchObject({ added: 0, updated: 0 })
    expect(await database.listLatestResults()).toEqual([
      expect.objectContaining({
        halfTimeScore: '1:0',
        goalLine: -1,
        officialResults: { had: 'h', hhad: 'h' },
      }),
    ])

    await database.deleteDatabaseForTests()
  })

  it('keeps successful result dates and retries result-only failures without refetching matches', async () => {
    const database = new IndexedDbAdapter(`caiguo-result-partial-${crypto.randomUUID()}`)
    await database.initialize()
    const gateway = new PartialResultGateway()
    const service = new SyncService(database, gateway)

    const partial = await service.fullSync()

    expect(partial.matches.failed).toBe(0)
    expect(partial.results).toMatchObject({ added: 1, failed: 1 })
    expect(partial.results.errors[0]?.message).toContain('赛果日期')
    expect(await database.listLatestResults()).toHaveLength(1)
    expect(gateway.collectCalls).toBe(1)

    const retried = await service.retryFailed(partial)

    expect(gateway.collectCalls).toBe(1)
    expect(retried.mode).toBe('retry')
    expect(retried.matches).toMatchObject({ added: 0, updated: 0, failed: 0 })
    expect(retried.results.failed).toBe(0)

    await database.deleteDatabaseForTests()
  })
})
