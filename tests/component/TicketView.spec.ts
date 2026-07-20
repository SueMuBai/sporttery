import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useTicketStore } from '@/stores/ticket'
import TicketView from '@/views/TicketView.vue'

const mocks = vi.hoisted(() => ({
  database: {
    initialize: vi.fn(async () => undefined),
    listMatches: vi.fn(async () => []),
    getPlan: vi.fn(),
    listTags: vi.fn(async () => []),
  },
  syncService: {
    fullSync: vi.fn(),
    latestSnapshot: vi.fn(async () => undefined),
    retryFailed: vi.fn(),
  },
}))

vi.mock('@/services/database/createDatabase', () => ({ getDatabase: () => mocks.database }))
vi.mock('@/features/sync/getSyncService', () => ({ getSyncService: () => mocks.syncService }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function mountTicket() {
  return mount(TicketView, {
    global: {
      plugins: [createPinia()],
      stubs: {
        AppHeader: true,
        MatchCard: true,
        BetMultiplierSheet: true,
        PlanPreviewDialog: {
          props: ['show'],
          emits: ['update:show', 'confirm'],
          template: '<div v-if="show" class="plan-preview-stub"><button @click="$emit(\'confirm\')">确认方案</button></div>',
        },
        PurchaseSheet: {
          props: ['show'],
          template: '<div v-if="show" class="purchase-stub" />',
        },
        'van-field': { template: '<label class="van-field"><slot name="left-icon" /><input /></label>' },
      },
    },
  })
}

describe('TicketView core states', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows syncing, completed and partial-failure rows together', () => {
    const wrapper = mountTicket()
    const store = useTicketStore()
    store.refreshing = true
    store.syncProgress = { completed: 42, total: 86, failed: 4 }

    return wrapper.vm.$nextTick().then(() => {
      const rows = wrapper.findAll('.app-sync-indicator__status')
      expect(rows).toHaveLength(3)
      expect(rows.map((row) => row.text())).toEqual([
        expect.stringContaining('正在同步比赛数据'),
        expect.stringContaining('同步完成'),
        expect.stringContaining('部分比赛更新失败'),
      ])
    })
  })

  it('uses the persisted last sync time in the zero-match empty state', async () => {
    const wrapper = mountTicket()
    const store = useTicketStore()
    store.lastSyncAt = '2026-07-21T01:41:23.000Z'
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.app-sync-indicator__status').text()).not.toContain('尚未同步')
    expect(wrapper.get('.ticket-empty-card').text()).toContain('暂无可选比赛')
  })

  it('expands and collapses the bet dock from its summary', async () => {
    const wrapper = mountTicket()
    expect(wrapper.find('.bet-dock__expanded').exists()).toBe(false)

    await wrapper.get('.bet-dock__summary').trigger('click')
    expect(wrapper.find('.bet-dock__expanded').exists()).toBe(true)

    await wrapper.get('.bet-dock__summary').trigger('click')
    expect(wrapper.find('.bet-dock__expanded').exists()).toBe(false)
  })

  it('opens the inline plan preview and continues to purchase after confirmation', async () => {
    const wrapper = mountTicket()
    const store = useTicketStore()
    store.toggleSelection({
      key: '1|had|h',
      matchId: 1,
      market: 'had',
      outcome: 'h',
      odds: '1.80',
    })
    await wrapper.vm.$nextTick()

    await wrapper.get('.bet-dock__summary').trigger('click')
    const actions = wrapper.findAll('.bet-dock__actions button')
    expect(actions).toHaveLength(3)
    expect(actions.map((action) => action.text())).toEqual([
      expect.stringContaining('保存方案'),
      expect.stringContaining('记录购买'),
      expect.stringContaining('查看方案'),
    ])
    expect(actions[2]?.text()).toContain('查看方案')

    await actions[2]!.trigger('click')
    expect(wrapper.find('.plan-preview-stub').exists()).toBe(true)

    await wrapper.get('.plan-preview-stub button').trigger('click')
    expect(wrapper.find('.plan-preview-stub').exists()).toBe(false)
    expect(wrapper.find('.purchase-stub').exists()).toBe(true)
  })
})
