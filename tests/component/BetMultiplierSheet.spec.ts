import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'

import BetMultiplierSheet from '@/components/ticket/BetMultiplierSheet.vue'

const popup = {
  props: ['show'],
  emits: ['update:show'],
  template: '<div v-if="show" class="van-popup"><slot /></div>',
}

async function openSheet(multiplier = 2) {
  const wrapper = mount(BetMultiplierSheet, {
    props: {
      show: false,
      multiplier,
      betCount: 12,
      stakeCents: 2400,
      canSave: true,
      canPurchase: true,
    },
    global: { stubs: { 'van-popup': popup } },
  })
  await wrapper.setProps({ show: true })
  await nextTick()
  return wrapper
}

describe('BetMultiplierSheet', () => {
  it('applies quick multipliers and keeps the summary live', async () => {
    const wrapper = await openSheet()

    await wrapper.get('.bet-quick-row button:nth-child(6)').trigger('click')

    expect(wrapper.emitted('update:multiplier')).toContainEqual([20])
    expect(wrapper.get('.bet-multiplier-sheet__summary').text()).toContain('12注')
    expect(wrapper.get('.bet-multiplier-sheet__summary').text()).toContain('¥24.00')
  })

  it('restores the opening multiplier when the explicit cancel action is used', async () => {
    const wrapper = await openSheet(12)
    await wrapper.get('.bet-quick-row button:nth-child(8)').trigger('click')
    await wrapper.get('.bet-multiplier-sheet__footer .cancel').trigger('click')

    expect(wrapper.emitted('update:multiplier')?.at(-1)).toEqual([12])
    expect(wrapper.emitted('update:show')?.at(-1)).toEqual([false])
  })

  it('emits save and purchase from the compact keyboard actions', async () => {
    const wrapper = await openSheet()
    const actions = wrapper.findAll('.bet-multiplier-sheet__summary button')

    await actions[0]!.trigger('click')
    await actions[1]!.trigger('click')

    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('purchase')).toHaveLength(1)
  })
})
