import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DateRangePicker from '@/components/base/DateRangePicker.vue'

function mountPicker() {
  return mount(DateRangePicker, {
    props: {
      start: '2026-07-01',
      end: '2026-07-31',
      minDate: new Date(2025, 6, 19),
      maxDate: new Date(2026, 6, 31),
    },
  })
}

describe('DateRangePicker', () => {
  it('edits start and end dates without converting through UTC', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.date-range-picker__endpoints button:first-child').trigger('click')
    const day = wrapper.findAll('.date-range-picker__days button').find((item) => item.text() === '15')
    await day?.trigger('click')

    expect(wrapper.emitted('update:start')?.at(-1)).toEqual(['2026-07-15'])
  })

  it('moves through year, month and day modes', async () => {
    const wrapper = mountPicker()
    const toolbar = wrapper.get('.date-range-picker__toolbar')
    await toolbar.findAll('button')[1]!.trigger('click')
    expect(wrapper.find('.date-range-picker__picker-grid').exists()).toBe(true)

    const year = wrapper.findAll('.date-range-picker__picker-grid button').find((item) => item.text() === '2026年')
    await year?.trigger('click')
    const month = wrapper.findAll('.date-range-picker__picker-grid button').find((item) => item.text() === '7月')
    await month?.trigger('click')
    expect(wrapper.find('.date-range-picker__days').exists()).toBe(true)
  })

  it('renders symmetric month navigation and exposes the bounded disabled state', async () => {
    const wrapper = mountPicker()
    const previous = wrapper.get('button[aria-label="上一页"]')
    const next = wrapper.get('button[aria-label="下一页"]')

    expect(previous.get('.app-icon path').attributes('d')).toBe('m15 5-7 7 7 7')
    expect(next.get('.app-icon path').attributes('d')).toBe('m9 5 7 7-7 7')
    expect(previous.attributes('disabled')).toBeUndefined()
    expect(next.attributes('disabled')).toBeDefined()

    await previous.trigger('click')
    expect(wrapper.get('.date-range-picker__toolbar').text()).toContain('6月')
    expect(wrapper.get('button[aria-label="下一页"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    expect(wrapper.get('.date-range-picker__toolbar').text()).toContain('7月')
    expect(wrapper.get('button[aria-label="下一页"]').attributes('disabled')).toBeDefined()
  })

  it('renders the compact V2 Sunday-first calendar layout', () => {
    const wrapper = mountPicker()
    const weekdays = wrapper.findAll('.date-range-picker__week span').map((item) => item.text())

    expect(weekdays).toEqual(['日', '一', '二', '三', '四', '五', '六'])
    expect(wrapper.findAll('.date-range-picker__days > span')).toHaveLength(3)
  })
})
