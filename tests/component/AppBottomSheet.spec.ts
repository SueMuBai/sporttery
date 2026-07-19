import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppBottomSheet from '@/components/base/AppBottomSheet.vue'

const popup = {
  props: ['show'],
  emits: ['update:show'],
  template: '<div v-if="show" class="van-popup"><slot /></div>',
}

describe('AppBottomSheet', () => {
  it('shares the title, body and fixed footer structure', () => {
    const wrapper = mount(AppBottomSheet, {
      props: { show: true, title: '日期筛选', description: '选择统计周期' },
      slots: { default: '筛选内容', footer: '确认操作' },
      global: { stubs: { 'van-popup': popup } },
    })

    expect(wrapper.get('.app-bottom-sheet__header h2').text()).toBe('日期筛选')
    expect(wrapper.get('.app-bottom-sheet__body').text()).toBe('筛选内容')
    expect(wrapper.get('.app-bottom-sheet__footer').text()).toBe('确认操作')
  })

  it('closes through the shared 44px close action', async () => {
    const wrapper = mount(AppBottomSheet, {
      props: { show: true, title: '记录购买' },
      global: { stubs: { 'van-popup': popup } },
    })

    const close = wrapper.get('button[aria-label="关闭"]')
    expect(close.attributes('data-overlay-close')).toBe('')
    await close.trigger('click')
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })
})
