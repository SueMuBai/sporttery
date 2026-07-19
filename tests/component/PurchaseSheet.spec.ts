import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PurchaseSheet from '@/components/ticket/PurchaseSheet.vue'

const popup = {
  props: ['show'],
  emits: ['update:show'],
  template: '<div v-if="show" class="van-popup"><slot /></div>',
}

const button = {
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>',
}

describe('PurchaseSheet', () => {
  it('shows the calculated stake as read-only and records that exact amount', async () => {
    const wrapper = mount(PurchaseSheet, {
      props: {
        show: true,
        defaultName: '周一2场方案',
        defaultStakeCents: 30400,
        loading: false,
      },
      global: { stubs: { 'van-popup': popup, 'van-button': button } },
    })

    expect(wrapper.text()).toContain('¥304.00')
    expect(wrapper.find('input[type="number"]').exists()).toBe(false)
    await wrapper.get('.app-bottom-sheet__footer button').trigger('click')

    const payload = wrapper.emitted('confirm')?.[0]?.[0]
    expect(payload).toMatchObject({
      name: '周一2场方案',
      stakeCents: 30400,
      notes: '',
    })
  })
})
