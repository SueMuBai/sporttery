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
})
