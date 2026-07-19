import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MarketGrid from '@/components/ticket/MarketGrid.vue'
import type { OddsPool } from '@/features/matches/types'
import type { MarketCode } from '@/types/domain'

function mountGrid(market: MarketCode, pool: OddsPool) {
  return mount(MarketGrid, {
    props: {
      matchId: 1,
      market,
      pool,
      selectedKeys: [],
    },
  })
}

describe('MarketGrid', () => {
  it('renders score options in one five-column grid without group titles', () => {
    const wrapper = mountGrid('crs', {
      s01s00: '7.00',
      s02s00: '10.00',
      s00s00: '16.00',
      s00s01: '13.00',
      s00s02: '22.00',
    })

    expect(wrapper.findAll('h4')).toHaveLength(0)
    expect(wrapper.find('.odds-grid--score').exists()).toBe(true)
    const labels = wrapper.findAll('.odds-cell span').map((cell) => cell.text())
    expect(labels).toHaveLength(31)
    expect(labels.slice(0, 13)).toEqual([
      '1:0', '2:0', '2:1', '3:0', '3:1', '3:2', '4:0', '4:1', '4:2', '5:0', '5:1', '5:2', '胜其它',
    ])
    expect(labels.slice(13, 18)).toEqual(['0:0', '1:1', '2:2', '3:3', '平其它'])
    expect(labels.slice(-3)).toEqual(['1:5', '2:5', '负其它'])
    expect(wrapper.findAll('.score-grid__spacer')).toHaveLength(2)
  })

  it('renders half-full odds as a compact three-by-three grid', () => {
    const wrapper = mountGrid('hafu', {
      hh: '2.80',
      hd: '14.00',
      ha: '28.00',
      dh: '4.70',
      dd: '6.20',
      da: '8.50',
      ah: '20.00',
      ad: '14.00',
      aa: '5.70',
    })

    expect(wrapper.findAll('.half-full-matrix__column-label')).toHaveLength(0)
    expect(wrapper.findAll('.half-full-matrix__row-label')).toHaveLength(0)
    expect(wrapper.findAll('.odds-grid--half-full .odds-cell')).toHaveLength(9)
    expect(wrapper.find('.odds-grid--half-full .odds-cell').attributes('aria-label')).toBe(
      '半场胜、全场胜，赔率2.80',
    )
  })
})
