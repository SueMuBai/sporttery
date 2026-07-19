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
  })
})
