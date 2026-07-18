import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppButton from '@/components/base/AppButton.vue'

describe('AppButton', () => {
  it('uses the shared centered label structure', () => {
    const wrapper = mount(AppButton, { slots: { default: '保存方案' } })

    expect(wrapper.find('.app-button__label').text()).toBe('保存方案')
    expect(wrapper.classes()).toContain('app-button--medium')
    expect(wrapper.classes()).toContain('app-button--primary')
  })

  it('exposes disabled and accessible icon button semantics through props', () => {
    const wrapper = mount(AppButton, {
      props: { disabled: true, ariaLabel: '提交保存' },
      slots: { default: '保存' },
    })

    expect(wrapper.attributes('disabled')).toBeDefined()
    expect(wrapper.attributes('aria-label')).toBe('提交保存')
  })
})
