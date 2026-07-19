import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppInlineEditor from '@/components/base/AppInlineEditor.vue'

describe('AppInlineEditor', () => {
  it('emits edits and saves a single-line value', async () => {
    const wrapper = mount(AppInlineEditor, {
      props: { modelValue: '原名称', label: '方案名称' },
    })

    await wrapper.get('input').setValue('新名称')
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['新名称'])
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('allows an optional multiline value to be cleared', async () => {
    const wrapper = mount(AppInlineEditor, {
      props: { modelValue: '', multiline: true, allowEmpty: true },
    })

    expect(wrapper.get('.app-inline-editor__actions button:last-child').attributes('disabled')).toBeUndefined()
  })
})
