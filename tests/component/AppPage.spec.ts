import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppFormRow from '@/components/base/AppFormRow.vue'
import AppListGroup from '@/components/base/AppListGroup.vue'
import AppPage from '@/components/base/AppPage.vue'

describe('shared page structure', () => {
  it('provides one header, scroll content and footer skeleton', () => {
    const wrapper = mount(AppPage, {
      props: { secondary: true, contentClass: 'test-content' },
      slots: { header: '页面标题', default: '页面内容', footer: '底部操作' },
    })

    expect(wrapper.classes()).toContain('app-page--secondary')
    expect(wrapper.get('main').classes()).toContain('test-content')
    expect(wrapper.text()).toContain('页面标题页面内容底部操作')
  })

  it('renders a grouped interactive form row with accessible button semantics', () => {
    const group = mount(AppListGroup, {
      props: { title: '数据配置' },
      slots: { default: '<div>分组内容</div>' },
    })
    const row = mount(AppFormRow, {
      props: {
        title: '系统设置',
        description: '历史条数与并发',
        value: '10 / 4',
        icon: 'system',
      },
    })

    expect(group.get('h2').text()).toBe('数据配置')
    expect(row.get('button').text()).toContain('系统设置')
    expect(row.get('button').text()).toContain('10 / 4')
    expect(row.get('.app-form-row__trailing').find('.app-row-chevron').exists()).toBe(true)
    expect(row.get('.app-form-row__trailing').find('svg').attributes('width')).toBe('18')
  })

  it('keeps the navigation chevron in the same trailing slot with or without a value', () => {
    const withValue = mount(AppFormRow, {
      props: { title: '系统设置', value: '10 / 4 / 15s', icon: 'system' },
    })
    const withoutValue = mount(AppFormRow, {
      props: { title: '数据更新', icon: 'refresh' },
    })

    expect(withValue.get('.app-form-row__value').text()).toBe('10 / 4 / 15s')
    expect(withValue.get('.app-form-row__trailing').find('.app-row-chevron').exists()).toBe(true)
    expect(withoutValue.find('.app-form-row__value').exists()).toBe(false)
    expect(withoutValue.get('.app-form-row__trailing').find('.app-row-chevron').exists()).toBe(true)
  })

  it('does not render a navigation chevron for a static form row', () => {
    const row = mount(AppFormRow, {
      props: { title: '本地状态', interactive: false, icon: 'info' },
    })

    expect(row.get('button').attributes('disabled')).toBeDefined()
    expect(row.get('.app-form-row__trailing').find('.app-row-chevron').exists()).toBe(false)
  })
})
