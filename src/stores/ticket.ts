import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import {
  calculateBetCount,
  calculatePrizeRange,
  calculateStakeCents,
  groupSelections,
} from '@/features/betting/calculator'
import {
  copiedPlanName,
  fitGeneratedPlanName,
  normalizePlanName,
} from '@/features/plans/planName'
import type { NormalizedMatch } from '@/features/matches/types'
import {
  isMatchKickoffAfter,
  parseMatchKickoffMs,
} from '@/features/matches/visibility'
import type { SyncSnapshot } from '@/features/sync/SyncService'
import { getSyncService } from '@/features/sync/getSyncService'
import { getDatabase } from '@/services/database/createDatabase'
import type { LedgerOrder, MarketCode, PlanSelection, SavedPlan } from '@/types/domain'

export type TicketMarket = 'had-hhad' | 'crs' | 'ttg' | 'hafu' | 'mixed'

export interface SelectionConflict {
  matchId: number
  currentMarket: MarketCode
  nextMarket: MarketCode
}

function ticketFingerprint(
  currentSelections: PlanSelection[],
  currentPassCounts: number[],
  currentMultiplier: number,
): string {
  return JSON.stringify({
    selections: currentSelections
      .map(({ key, matchId, market, outcome, odds }) => ({
        key,
        matchId,
        market,
        outcome,
        odds,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    passCounts: [...currentPassCounts].sort((left, right) => left - right),
    multiplier: currentMultiplier,
  })
}

export const useTicketStore = defineStore('ticket', () => {
  const draftKey = 'caiguo.ticket-draft.v1'
  const database = getDatabase()
  const syncService = getSyncService()
  const initialized = ref(false)
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref('')
  const statusMessage = ref('')
  const syncProgress = ref({ completed: 0, total: 0, failed: 0 })
  const lastSyncAt = ref('')
  const lastSyncSnapshot = ref<SyncSnapshot>()
  const matches = ref<NormalizedMatch[]>([])
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
  const editingPlanTags = ref<string[]>([])
  const editingPlanRevision = ref(0)
  const editingPlanSourceId = ref<string>()
  const editingPlanBaseline = ref('')
  /**
   * Device clock (ms). Reactive so upcomingMatches re-filters as time passes;
   * never hard-code a calendar date.
   */
  const nowMs = ref(Date.now())
  let visibilityTimer: ReturnType<typeof setTimeout> | undefined

  function refreshNowMs(now: Date = new Date()): number {
    const next = now.getTime()
    if (nowMs.value !== next) nowMs.value = next
    return nowMs.value
  }

  function scheduleVisibilityRefresh(): void {
    if (typeof globalThis.setTimeout !== 'function') return
    if (visibilityTimer !== undefined) {
      globalThis.clearTimeout(visibilityTimer)
      visibilityTimer = undefined
    }

    const now = Date.now()
    let nextTick = now + 60_000
    for (const match of matches.value) {
      const kickoff = parseMatchKickoffMs(match.matchDateTime)
      if (kickoff !== null && kickoff > now) {
        nextTick = Math.min(nextTick, kickoff + 1_000)
      }
    }
    const delay = Math.max(1_000, Math.min(60_000, nextTick - now))
    visibilityTimer = globalThis.setTimeout(() => {
      refreshNowMs()
      if (initialized.value) statusMessage.value = localLoadStatusMessage()
      scheduleVisibilityRefresh()
    }, delay)
  }

  const selectedSelections = computed(() => Object.values(selections.value))
  const selectedMatchCount = computed(() => groupSelections(selectedSelections.value).size)
  const betCount = computed(() => calculateBetCount(selectedSelections.value, passCounts.value))
  const stakeCents = computed(() =>
    calculateStakeCents(selectedSelections.value, passCounts.value, multiplier.value),
  )
  const prizeRange = computed(() =>
    calculatePrizeRange(selectedSelections.value, passCounts.value, multiplier.value),
  )
  const currentFingerprint = computed(() =>
    ticketFingerprint(selectedSelections.value, passCounts.value, multiplier.value),
  )
  const hasUnsavedChanges = computed(() =>
    Boolean(selectedSelections.value.length) &&
    (!editingPlanId.value || currentFingerprint.value !== editingPlanBaseline.value),
  )
  const canSavePlan = computed(
    () =>
      Boolean(selectedSelections.value.length && passCounts.value.length) &&
      (!editingPlanId.value || hasUnsavedChanges.value),
  )
  const availablePasses = computed(() =>
    Array.from({ length: Math.min(8, selectedMatchCount.value) }, (_, index) => index + 1),
  )
  /**
   * Ticket list: only fixtures whose kickoff is strictly after device now.
   * Full match snapshots stay in matches[] for plans / settlement.
   */
  const upcomingMatches = computed(() => {
    const clock = nowMs.value
    return matches.value.filter((match) => isMatchKickoffAfter(match.matchDateTime, clock))
  })
  const filteredMatches = computed(() => {
    const keyword = search.value.trim().toLowerCase()
    if (!keyword) return upcomingMatches.value
    return upcomingMatches.value.filter((match) =>
      [match.matchNum, match.homeTeam, match.awayTeam, match.payload.league]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  })

  function localLoadStatusMessage(): string {
    if (!matches.value.length) {
      return '本地暂无比赛，点击右上角刷新获取最新数据'
    }
    if (!upcomingMatches.value.length) {
      return `本地共 ${matches.value.length} 场，当前时间之后暂无可选票，请刷新`
    }
    if (upcomingMatches.value.length === matches.value.length) {
      return `已从本地读取 ${upcomingMatches.value.length} 场未开赛比赛`
    }
    return `已显示 ${upcomingMatches.value.length} 场未开赛，隐藏 ${matches.value.length - upcomingMatches.value.length} 场已开赛/历史`
  }

  async function initialize(): Promise<void> {
    if (initialized.value) return
    loading.value = true
    error.value = ''
    try {
      refreshNowMs()
      await database.initialize()
      await Promise.all([reloadLocalData(), restoreLastSyncAt()])
      restoreDraft()
      await restoreEditingBaseline()
      refreshNowMs()
      scheduleVisibilityRefresh()
      initialized.value = true
      statusMessage.value = localLoadStatusMessage()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading.value = false
    }
  }

  async function reloadLocalData(): Promise<void> {
    const storedMatches = await database.listMatches()
    matches.value = storedMatches as NormalizedMatch[]
  }

  async function restoreLastSyncAt(): Promise<void> {
    const snapshot = await syncService.latestSnapshot()
    lastSyncSnapshot.value = snapshot
    lastSyncAt.value = snapshot?.completedAt ?? ''
  }

  async function activate(): Promise<void> {
    if (!initialized.value) {
      await initialize()
      return
    }
    try {
      refreshNowMs()
      await Promise.all([reloadLocalData(), restoreLastSyncAt()])
      refreshNowMs()
      scheduleVisibilityRefresh()
      statusMessage.value = localLoadStatusMessage()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    }
  }

  /** Called when the native app returns to foreground so kickoff filter stays correct. */
  function onAppBecameActive(): void {
    refreshNowMs()
    scheduleVisibilityRefresh()
    if (initialized.value) {
      statusMessage.value = localLoadStatusMessage()
    }
  }

  async function refresh(retryFailures = false): Promise<void> {
    if (refreshing.value) return
    refreshing.value = true
    error.value = ''
    syncProgress.value = { completed: 0, total: 0, failed: 0 }
    statusMessage.value = '正在同步比赛与历史交锋…'
    try {
      refreshNowMs()
      const report = await (
        retryFailures && lastSyncSnapshot.value
          ? syncService.retryFailed(lastSyncSnapshot.value, (progress) => {
              syncProgress.value = progress
              statusMessage.value = `正在重试历史交锋 ${progress.completed}/${progress.total}`
            })
          : syncService.fullSync((progress) => {
              syncProgress.value = progress
              statusMessage.value = `正在同步历史交锋 ${progress.completed}/${progress.total}`
            })
      )
      lastSyncSnapshot.value = report
      lastSyncAt.value = report.completedAt
      await reloadLocalData()
      refreshNowMs()
      scheduleVisibilityRefresh()
      syncProgress.value = {
        completed: syncProgress.value.completed || matches.value.length,
        total: syncProgress.value.total || matches.value.length,
        failed: report.matches.failed + report.results.failed,
      }
      const hidden = matches.value.length - upcomingMatches.value.length
      statusMessage.value =
        `比赛新增 ${report.matches.added}、更新 ${report.matches.updated}；赛果新增 ${report.results.added}、更新 ${report.results.updated}` +
        (hidden > 0 ? `；已隐藏 ${hidden} 场已开赛/历史场次` : '')
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
    editingPlanTags.value = []
    editingPlanRevision.value = 0
    editingPlanSourceId.value = undefined
    editingPlanBaseline.value = ''
    localStorage.removeItem(draftKey)
  }

  function restoreDraft(): void {
    const raw = localStorage.getItem(draftKey)
    if (!raw) return
    try {
      const draft = JSON.parse(raw) as {
        selections?: Record<string, PlanSelection>
        passCounts?: number[]
        multiplier?: number
        editingPlanId?: string
        editingPlanName?: string
        editingPlanCreatedAt?: string
        editingPlanTags?: string[]
        editingPlanRevision?: number
        editingPlanSourceId?: string
        editingPlanBaseline?: string
      }
      selections.value = draft.selections ?? {}
      passCounts.value = draft.passCounts ?? []
      multiplier.value = draft.multiplier ?? 1
      editingPlanId.value = draft.editingPlanId
      editingPlanName.value = draft.editingPlanName ?? ''
      editingPlanCreatedAt.value = draft.editingPlanCreatedAt ?? ''
      editingPlanTags.value = draft.editingPlanTags ?? []
      editingPlanRevision.value = draft.editingPlanRevision ?? 0
      editingPlanSourceId.value = draft.editingPlanSourceId
      editingPlanBaseline.value = draft.editingPlanBaseline ?? ''
      passTouched.value = Boolean(passCounts.value.length)
      normalizePassCounts()
    } catch {
      localStorage.removeItem(draftKey)
    }
  }

  async function restoreEditingBaseline(): Promise<void> {
    if (!editingPlanId.value || editingPlanBaseline.value) return
    const stored = await database.getPlan(editingPlanId.value)
    if (!stored) return
    const storedFingerprint = ticketFingerprint(
      stored.selections,
      stored.passCounts,
      stored.multiplier,
    )
    if (storedFingerprint === currentFingerprint.value) {
      editingPlanBaseline.value = storedFingerprint
    }
  }

  watch(
    [selections, passCounts, multiplier, editingPlanId, editingPlanName, editingPlanCreatedAt, editingPlanTags, editingPlanRevision, editingPlanSourceId, editingPlanBaseline],
    () => {
      if (!initialized.value) return
      if (!selectedSelections.value.length) {
        localStorage.removeItem(draftKey)
        return
      }
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          selections: selections.value,
          passCounts: passCounts.value,
          multiplier: multiplier.value,
          editingPlanId: editingPlanId.value,
          editingPlanName: editingPlanName.value,
          editingPlanCreatedAt: editingPlanCreatedAt.value,
          editingPlanTags: editingPlanTags.value,
          editingPlanRevision: editingPlanRevision.value,
          editingPlanSourceId: editingPlanSourceId.value,
          editingPlanBaseline: editingPlanBaseline.value,
        }),
      )
    },
    { deep: true },
  )

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

  function defaultPlanName(): string {
    const date = new Date()
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
    const time = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    return fitGeneratedPlanName(`${weekday}${selectedMatchCount.value}场 · ${time}`)
  }

  const suggestedPlanName = computed(() => editingPlanName.value || defaultPlanName())

  async function preparePlan(name = ''): Promise<{
    plan: SavedPlan
    expectedRevision?: number
    unchanged: boolean
  }> {
    if (!selectedSelections.value.length) throw new Error('请先选择投注项')
    if (!passCounts.value.length) throw new Error('请至少选择一种过关方式')
    const stamp = new Date().toISOString()
    const existing = editingPlanId.value
      ? await database.getPlan(editingPlanId.value)
      : undefined
    if (editingPlanId.value && !existing) {
      throw new Error('原方案已被删除，请另存为新方案')
    }
    if (existing && existing.revision !== editingPlanRevision.value) {
      throw new Error('方案已在其他页面更新，请重新载入后再保存')
    }
    const resolvedName = normalizePlanName(
      name.trim() || editingPlanName.value || defaultPlanName(),
    )
    const availableTagNames = new Set(
      (await database.listTags()).map((tag) => tag.name),
    )
    const existingFingerprint = existing
      ? ticketFingerprint(existing.selections, existing.passCounts, existing.multiplier)
      : ''
    if (
      existing &&
      existing.name === resolvedName &&
      existingFingerprint === currentFingerprint.value
    ) {
      return {
        plan: existing,
        expectedRevision: existing.revision,
        unchanged: true,
      }
    }
    const resolvedTags = existing
      ? [...existing.tags]
      : editingPlanTags.value.filter(
          (tag) => availableTagNames.has(tag),
        )
    const plan: SavedPlan = {
      id: editingPlanId.value ?? crypto.randomUUID(),
      sourcePlanId: editingPlanSourceId.value,
      revision: (existing?.revision ?? 0) + 1,
      status: 'saved',
      name: resolvedName,
      selections: selectedSelections.value.map((selection) => ({ ...selection })),
      passCounts: [...passCounts.value],
      multiplier: multiplier.value,
      tags: resolvedTags,
      createdAt: editingPlanCreatedAt.value || stamp,
      updatedAt: stamp,
    }
    return {
      plan,
      expectedRevision: existing?.revision,
      unchanged: false,
    }
  }

  function adoptPlan(plan: SavedPlan): void {
    editingPlanId.value = plan.id
    editingPlanName.value = plan.name
    editingPlanCreatedAt.value = plan.createdAt
    editingPlanRevision.value = plan.revision
    editingPlanSourceId.value = plan.sourcePlanId
    editingPlanBaseline.value = currentFingerprint.value
  }

  async function savePlan(name = ''): Promise<SavedPlan> {
    const prepared = await preparePlan(name)
    if (!prepared.unchanged) {
      await database.savePlan(prepared.plan, prepared.expectedRevision)
    }
    adoptPlan(prepared.plan)
    const plan = prepared.plan
    return plan
  }

  async function purchaseCurrentPlan(value: {
    name?: string
    stakeCents?: number
    purchasedAt?: string
    notes?: string
  } = {}): Promise<{ plan: SavedPlan; orderId: string }> {
    const prepared = await preparePlan(editingPlanId.value ? '' : value.name)
    const plan = prepared.plan
    const purchaseName = normalizePlanName(value.name?.trim() || plan.name)
    const frozenPlan = structuredClone({ ...plan, name: purchaseName })
    const stamp = new Date().toISOString()
    const orderId = crypto.randomUUID()
    const order: LedgerOrder = {
      id: orderId,
      planId: plan.id,
      planName: purchaseName,
      planSnapshot: frozenPlan,
      purchasedAt: value.purchasedAt || stamp,
      stakeCents: value.stakeCents ?? stakeCents.value,
      returnCents: 0,
      returnManual: false,
      status: 'pending',
      notes: value.notes?.trim() ?? '',
      createdAt: stamp,
      updatedAt: stamp,
    }
    if (prepared.unchanged) {
      await database.saveLedgerOrder(order)
    } else {
      await database.savePlanWithLedgerOrder(
        plan,
        order,
        prepared.expectedRevision,
      )
    }
    adoptPlan(plan)
    return { plan, orderId }
  }

  async function saveAsNewPlan(name = ''): Promise<SavedPlan> {
    const previous = {
      id: editingPlanId.value,
      name: editingPlanName.value,
      createdAt: editingPlanCreatedAt.value,
      revision: editingPlanRevision.value,
      sourceId: editingPlanSourceId.value,
      baseline: editingPlanBaseline.value,
    }
    editingPlanId.value = undefined
    editingPlanName.value = ''
    editingPlanCreatedAt.value = ''
    editingPlanRevision.value = 0
    editingPlanSourceId.value = previous.id ?? previous.sourceId
    editingPlanBaseline.value = ''
    try {
      return await savePlan(
        name.trim() || copiedPlanName(previous.name || defaultPlanName()),
      )
    } catch (error) {
      editingPlanId.value = previous.id
      editingPlanName.value = previous.name
      editingPlanCreatedAt.value = previous.createdAt
      editingPlanRevision.value = previous.revision
      editingPlanSourceId.value = previous.sourceId
      editingPlanBaseline.value = previous.baseline
      throw error
    }
  }

  function loadPlan(plan: SavedPlan): void {
    selections.value = Object.fromEntries(plan.selections.map((selection) => [selection.key, { ...selection }]))
    passCounts.value = [...plan.passCounts]
    multiplier.value = plan.multiplier
    passTouched.value = true
    editingPlanId.value = plan.id
    editingPlanName.value = plan.name
    editingPlanCreatedAt.value = plan.createdAt
    editingPlanTags.value = [...plan.tags]
    editingPlanRevision.value = plan.revision
    editingPlanSourceId.value = plan.sourcePlanId
    editingPlanBaseline.value = ticketFingerprint(
      plan.selections,
      plan.passCounts,
      plan.multiplier,
    )
  }

  return {
    initialized,
    loading,
    refreshing,
    error,
    statusMessage,
    syncProgress,
    lastSyncAt,
    matches,
    nowMs,
    upcomingMatches,
    activeMarket,
    search,
    expandedHistory,
    selections,
    passCounts,
    multiplier,
    editingPlanId,
    editingPlanName,
    suggestedPlanName,
    hasUnsavedChanges,
    canSavePlan,
    selectedSelections,
    selectedMatchCount,
    betCount,
    stakeCents,
    prizeRange,
    availablePasses,
    filteredMatches,
    activate,
    initialize,
    onAppBecameActive,
    refresh,
    selectionFor,
    toggleSelection,
    togglePass,
    clear,
    toggleHistory,
    setMixedMarket,
    mixedMarketFor,
    savePlan,
    saveAsNewPlan,
    purchaseCurrentPlan,
    loadPlan,
  }
})
