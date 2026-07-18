import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  calculateBetCount,
  calculatePrizeRange,
  calculateStakeCents,
  groupSelections,
} from '@/features/betting/calculator'
import type { NormalizedMatch } from '@/features/matches/types'
import { SyncService } from '@/features/sync/SyncService'
import { getDatabase } from '@/services/database/createDatabase'
import type { MarketCode, PlanSelection, PlanTag, SavedPlan } from '@/types/domain'

export type TicketMarket = 'had-hhad' | 'crs' | 'ttg' | 'hafu' | 'mixed'

export interface SelectionConflict {
  matchId: number
  currentMarket: MarketCode
  nextMarket: MarketCode
}

export const useTicketStore = defineStore('ticket', () => {
  const database = getDatabase()
  const syncService = new SyncService(database)
  const initialized = ref(false)
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref('')
  const statusMessage = ref('')
  const syncProgress = ref({ completed: 0, total: 0, failed: 0 })
  const matches = ref<NormalizedMatch[]>([])
  const tags = ref<PlanTag[]>([])
  const activeMarket = ref<TicketMarket>('had-hhad')
  const search = ref('')
  const expandedHistory = ref<Record<number, boolean>>({})
  const mixedMarket = ref<Record<number, MarketCode>>({})
  const selections = ref<Record<string, PlanSelection>>({})
  const passCounts = ref<number[]>([])
  const passTouched = ref(false)
  const multiplier = ref(1)
  const editingPlanId = ref<string>()
  const editingPlanName = ref('')
  const editingPlanCreatedAt = ref('')

  const selectedSelections = computed(() => Object.values(selections.value))
  const selectedMatchCount = computed(() => groupSelections(selectedSelections.value).size)
  const betCount = computed(() => calculateBetCount(selectedSelections.value, passCounts.value))
  const stakeCents = computed(() =>
    calculateStakeCents(selectedSelections.value, passCounts.value, multiplier.value),
  )
  const prizeRange = computed(() =>
    calculatePrizeRange(selectedSelections.value, passCounts.value, multiplier.value),
  )
  const availablePasses = computed(() =>
    Array.from({ length: Math.min(8, selectedMatchCount.value) }, (_, index) => index + 1),
  )
  const filteredMatches = computed(() => {
    const keyword = search.value.trim().toLowerCase()
    if (!keyword) return matches.value
    return matches.value.filter((match) =>
      [match.matchNum, match.homeTeam, match.awayTeam, match.payload.league]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  })

  async function initialize(): Promise<void> {
    if (initialized.value) return
    loading.value = true
    error.value = ''
    try {
      await database.initialize()
      await reloadLocalData()
      initialized.value = true
      statusMessage.value = matches.value.length
        ? `已从本地读取 ${matches.value.length} 场比赛`
        : '本地暂无比赛，点击右上角刷新获取最新数据'
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading.value = false
    }
  }

  async function reloadLocalData(): Promise<void> {
    const [storedMatches, storedTags] = await Promise.all([
      database.listMatches(),
      database.listTags(),
    ])
    matches.value = storedMatches as NormalizedMatch[]
    tags.value = storedTags
  }

  async function refresh(): Promise<void> {
    if (refreshing.value) return
    refreshing.value = true
    error.value = ''
    syncProgress.value = { completed: 0, total: 0, failed: 0 }
    statusMessage.value = '正在同步比赛与历史交锋…'
    try {
      const report = await syncService.fullSync((progress) => {
        syncProgress.value = progress
        statusMessage.value = `正在同步历史交锋 ${progress.completed}/${progress.total}`
      })
      await reloadLocalData()
      statusMessage.value = `比赛新增 ${report.matches.added}、更新 ${report.matches.updated}；赛果新增 ${report.results.added}、更新 ${report.results.updated}`
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      statusMessage.value = '同步失败，本地数据仍可继续使用'
    } finally {
      refreshing.value = false
    }
  }

  function selectionFor(matchId: number, market: MarketCode, outcome: string): PlanSelection | undefined {
    return selections.value[`${matchId}|${market}|${outcome}`]
  }

  function toggleSelection(
    selection: PlanSelection,
    replaceConflict = false,
  ): SelectionConflict | undefined {
    const key = selection.key
    if (selections.value[key]) {
      const next = { ...selections.value }
      delete next[key]
      selections.value = next
      normalizePassCounts()
      return undefined
    }
    const current = selectedSelections.value.find(
      (item) => item.matchId === selection.matchId && item.market !== selection.market,
    )
    if (current && !replaceConflict) {
      return {
        matchId: selection.matchId,
        currentMarket: current.market,
        nextMarket: selection.market,
      }
    }
    const next = { ...selections.value }
    if (current) {
      Object.values(next).forEach((item) => {
        if (item.matchId === selection.matchId) delete next[item.key]
      })
    }
    next[key] = selection
    selections.value = next
    normalizePassCounts()
    return undefined
  }

  function normalizePassCounts(): void {
    const available = new Set(availablePasses.value)
    if (!passTouched.value) {
      passCounts.value = availablePasses.value.length
        ? [availablePasses.value.includes(2) ? 2 : availablePasses.value[0]!]
        : []
      return
    }
    passCounts.value = passCounts.value.filter((size) => available.has(size))
    if (!passCounts.value.length && availablePasses.value.length) {
      passCounts.value = [availablePasses.value.includes(2) ? 2 : availablePasses.value[0]!]
    }
  }

  function togglePass(size: number): void {
    passTouched.value = true
    const next = new Set(passCounts.value)
    if (next.has(size)) next.delete(size)
    else next.add(size)
    passCounts.value = [...next].sort((left, right) => left - right)
  }

  function clear(): void {
    selections.value = {}
    passCounts.value = []
    passTouched.value = false
    multiplier.value = 1
    editingPlanId.value = undefined
    editingPlanName.value = ''
    editingPlanCreatedAt.value = ''
  }

  function toggleHistory(matchId: number): void {
    expandedHistory.value = {
      ...expandedHistory.value,
      [matchId]: !expandedHistory.value[matchId],
    }
  }

  function setMixedMarket(matchId: number, market: MarketCode): void {
    mixedMarket.value = { ...mixedMarket.value, [matchId]: market }
  }

  function mixedMarketFor(matchId: number): MarketCode {
    const selected = selectedSelections.value.find((item) => item.matchId === matchId)
    return selected?.market ?? mixedMarket.value[matchId] ?? 'had'
  }

  async function savePlan(name: string, selectedTags: string[]): Promise<SavedPlan> {
    if (!selectedSelections.value.length) throw new Error('请先选择投注项')
    if (!passCounts.value.length) throw new Error('请至少选择一种过关方式')
    const stamp = new Date().toISOString()
    const plan: SavedPlan = {
      id: editingPlanId.value ?? crypto.randomUUID(),
      name: name.trim() || `方案 ${new Date().toLocaleString('zh-CN')}`,
      selections: selectedSelections.value.map((selection) => ({ ...selection })),
      passCounts: [...passCounts.value],
      multiplier: multiplier.value,
      tags: [...selectedTags],
      createdAt: editingPlanCreatedAt.value || stamp,
      updatedAt: stamp,
    }
    await database.savePlan(plan)
    const linkedLedger = (await database.listLedger()).find((order) => order.planId === plan.id)
    if (linkedLedger) {
      await database.saveLedgerOrder({
        ...linkedLedger,
        planName: plan.name,
        updatedAt: stamp,
      })
    } else if (selectedTags.includes('已购')) {
      await database.saveLedgerOrder({
        id: crypto.randomUUID(),
        planId: plan.id,
        planName: plan.name,
        planSnapshot: plan,
        purchasedAt: stamp,
        stakeCents: stakeCents.value,
        returnCents: 0,
        returnManual: false,
        status: 'pending',
        notes: '',
        createdAt: stamp,
        updatedAt: stamp,
      })
    }
    editingPlanId.value = plan.id
    editingPlanName.value = plan.name
    editingPlanCreatedAt.value = plan.createdAt
    return plan
  }

  function mergeConflicts(plan: SavedPlan): Array<{ matchId: number; current: MarketCode; incoming: MarketCode }> {
    const currentByMatch = new Map(
      selectedSelections.value.map((selection) => [selection.matchId, selection.market]),
    )
    return plan.selections.flatMap((selection) => {
      const current = currentByMatch.get(selection.matchId)
      return current && current !== selection.market
        ? [{ matchId: selection.matchId, current, incoming: selection.market }]
        : []
    })
  }

  function loadPlan(plan: SavedPlan, mode: 'replace' | 'merge'): void {
    if (mode === 'replace') {
      selections.value = Object.fromEntries(plan.selections.map((selection) => [selection.key, { ...selection }]))
      passCounts.value = [...plan.passCounts]
      multiplier.value = plan.multiplier
      passTouched.value = true
      editingPlanId.value = plan.id
      editingPlanName.value = plan.name
      editingPlanCreatedAt.value = plan.createdAt
      return
    }
    const conflicts = mergeConflicts(plan)
    if (conflicts.length) throw new Error('合并方案存在同场不同玩法冲突')
    selections.value = {
      ...selections.value,
      ...Object.fromEntries(plan.selections.map((selection) => [selection.key, { ...selection }])),
    }
    passCounts.value = [...new Set([...passCounts.value, ...plan.passCounts])].sort(
      (left, right) => left - right,
    )
    multiplier.value = Math.max(multiplier.value, plan.multiplier)
    passTouched.value = true
    editingPlanId.value = undefined
    editingPlanName.value = `${editingPlanName.value || '当前方案'} + ${plan.name}`
    editingPlanCreatedAt.value = ''
    normalizePassCounts()
  }

  return {
    initialized,
    loading,
    refreshing,
    error,
    statusMessage,
    syncProgress,
    matches,
    tags,
    activeMarket,
    search,
    expandedHistory,
    selections,
    passCounts,
    multiplier,
    editingPlanId,
    editingPlanName,
    selectedSelections,
    selectedMatchCount,
    betCount,
    stakeCents,
    prizeRange,
    availablePasses,
    filteredMatches,
    initialize,
    refresh,
    selectionFor,
    toggleSelection,
    togglePass,
    clear,
    toggleHistory,
    setMixedMarket,
    mixedMarketFor,
    savePlan,
    mergeConflicts,
    loadPlan,
  }
})
