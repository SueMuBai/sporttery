import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PlanPreviewDialog from '@/components/ticket/PlanPreviewDialog.vue'
import type { NormalizedMatch } from '@/features/matches/types'
import type { MarketCode, PlanSelection } from '@/types/domain'

const popup = {
  props: ['show'],
  emits: ['update:show'],
  template: '<div v-if="show" class="van-popup"><slot /></div>',
}

const button = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
}

function match(matchId: number, market: MarketCode = 'had'): NormalizedMatch {
  return {
    matchId,
    matchNum: `周日${String(103 + matchId).padStart(3, '0')}`,
    matchDateTime: '2026-07-20T03:00:00.000Z',
    homeTeam: `主队${matchId}`,
    awayTeam: `客队${matchId}`,
    updatedAt: '2026-07-20T00:00:00.000Z',
    payload: {
      league: '世界杯',
      homeRank: '',
      awayRank: '',
      odds: {
        had: {},
        hhad: market === 'hhad' ? { goalLine: '-1' } : {},
        crs: {},
        ttg: {},
        hafu: {},
      },
      historySummary: {
        perspective: '', matches: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0, winRate: 0,
      },
      history: [],
    },
  }
}

function selection(
  matchId: number,
  market: MarketCode,
  outcome: string,
  odds: string,
): PlanSelection {
  return {
    key: `${matchId}|${market}|${outcome}`,
    matchId,
    market,
    outcome,
    odds,
  }
}

function mountPreview() {
  const matches = Array.from({ length: 8 }, (_, index) =>
    match(index + 1, index === 1 ? 'hhad' : 'had'),
  )
  const selections = [
    selection(1, 'had', 'h', '2.11'),
    selection(1, 'had', 'd', '2.96'),
    selection(2, 'hhad', 'd', '3.71'),
    selection(2, 'hhad', 'a', '1.57'),
    selection(3, 'ttg', '2', '3.85'),
    selection(3, 'ttg', '3', '3.50'),
    selection(4, 'crs', '2:0', '11.50'),
    selection(4, 'crs', '2:1', '7.00'),
    selection(5, 'hafu', 'h-h', '2.80'),
    selection(5, 'hafu', 'd-h', '4.70'),
    selection(6, 'had', 'h', '1.58'),
    selection(7, 'hhad', 'a', '2.10'),
    selection(8, 'ttg', '2', '3.85'),
    selection(8, 'ttg', '3', '3.50'),
  ]

  return mount(PlanPreviewDialog, {
    props: {
      show: true,
      selections,
      matches,
      passCounts: [2, 3, 4, 5, 6, 7, 8],
      multiplier: 1,
      betCount: 247,
      stakeCents: 49_400,
      prizeRange: { minCents: 168_020, maxCents: 926_080 },
    },
    global: {
      stubs: {
        'van-popup': popup,
        'van-button': button,
      },
    },
  })
}

describe('PlanPreviewDialog', () => {
  it('renders eight real match groups, multi selections and calculated totals', () => {
    const wrapper = mountPreview()

    expect(wrapper.findAll('.plan-preview__match')).toHaveLength(8)
    expect(wrapper.get('.plan-preview__meta').text()).toContain('8场')
    expect(wrapper.get('.plan-preview__meta').text()).toContain('14个选项')
    expect(wrapper.get('.plan-preview__meta').text()).toContain('2关、3关、4关、5关、6关、7关、8关')
    expect(wrapper.findAll('.plan-preview__options')[0]?.text()).toContain('胜(2.11)、平(2.96)')
    expect(wrapper.findAll('.plan-preview__options')[1]?.text()).toContain('让球 -1')
    expect(wrapper.findAll('.plan-preview__options')[2]?.text()).toContain('2球(3.85)、3球(3.50)')
    expect(wrapper.get('.plan-preview__finance').text()).toContain('共247注')
    expect(wrapper.get('.plan-preview__finance').text()).toContain('¥494.00')
    expect(wrapper.get('.plan-preview__finance').text()).toContain('¥1680.20～9260.80')
  })

  it('closes for editing and emits confirm for the next purchase step', async () => {
    const wrapper = mountPreview()

    await wrapper.get('.plan-preview__actions button:first-child').trigger('click')
    expect(wrapper.emitted('update:show')).toEqual([[false]])

    await wrapper.get('.plan-preview__actions button:last-child').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})
