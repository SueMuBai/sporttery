import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MatchCard from '@/components/ticket/MatchCard.vue'
import type { NormalizedMatch } from '@/features/matches/types'

const match: NormalizedMatch = {
  matchId: 1,
  matchNum: '周一001',
  matchDateTime: '2026-07-20 18:00:00',
  homeTeam: '主队',
  awayTeam: '客队',
  updatedAt: '2026-07-20T10:00:00.000Z',
  payload: {
    league: '测试联赛',
    homeRank: '',
    awayRank: '',
    odds: {
      had: { h: '2.10', d: '3.20', a: '3.50' },
      hhad: { goalLineValue: '-1', h: '4.20', d: '3.60', a: '1.70' },
      crs: { s01s00: '7.00' },
      ttg: { s0: '8.00' },
      hafu: { hh: '2.80' },
    },
    historySummary: {
      perspective: '主队',
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

describe('MatchCard mixed accordion', () => {
  it('keeps only one secondary market open at a time', async () => {
    const wrapper = mount(MatchCard, {
      props: {
        match,
        activeMarket: 'mixed',
        selectedKeys: [],
        expanded: true,
        mixedMarket: 'had',
      },
    })

    expect(wrapper.findAll('.mixed-section__content')).toHaveLength(1)
    expect(wrapper.find('.odds-grid--score').exists()).toBe(true)

    const headers = wrapper.findAll('.mixed-section__header')
    await headers[1]!.trigger('click')

    expect(wrapper.findAll('.mixed-section__content')).toHaveLength(1)
    expect(wrapper.find('.odds-grid--goals').exists()).toBe(true)
    expect(wrapper.find('.odds-grid--score').exists()).toBe(false)
    expect(wrapper.emitted('changeMixedMarket')?.at(-1)).toEqual(['ttg'])
  })
})
