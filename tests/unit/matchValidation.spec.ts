import { describe, expect, it } from 'vitest'

import {
  assertValidMatchResult,
  assertValidMatchSnapshot,
} from '@/features/matches/validation'

const stamp = '2026-07-19T12:00:00.000Z'

describe('match persistence validation', () => {
  it('validates snapshots and completed result fields', () => {
    const match = {
      matchId: 1,
      matchNum: '周一001',
      matchDateTime: '2026-07-20 18:00:00',
      homeTeam: '主队',
      awayTeam: '客队',
      payload: {},
      updatedAt: stamp,
    }
    const result = {
      matchId: 1,
      matchNum: '周一001',
      homeTeam: '主队',
      awayTeam: '客队',
      halfTimeScore: '0:0',
      fullTimeScore: '1:0',
      goalLine: -1,
      officialResults: { had: 'h' as const },
      fetchedAt: stamp,
    }
    expect(() => assertValidMatchSnapshot(match)).not.toThrow()
    expect(() => assertValidMatchResult(result)).not.toThrow()
    expect(() => assertValidMatchSnapshot({ ...match, homeTeam: '' })).toThrow('主队')
    expect(() => assertValidMatchResult({ ...result, fullTimeScore: '完场' })).toThrow(
      '全场比分',
    )
    expect(() =>
      assertValidMatchResult({
        ...result,
        officialResults: { had: 'home' },
      }),
    ).toThrow('官方赛果内容')
  })
})
