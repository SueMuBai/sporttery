<script setup lang="ts">
import { showFailToast, showSuccessToast } from 'vant'
import { computed, onActivated, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import AppAssetIcon from '@/components/base/AppAssetIcon.vue'
import AppChip from '@/components/base/AppChip.vue'
import AppHeader from '@/components/base/AppHeader.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppState from '@/components/base/AppState.vue'
import AppSyncIndicator from '@/components/base/AppSyncIndicator.vue'
import type { SyncIndicatorStatus } from '@/components/base/AppSyncIndicator.vue'
import { confirmAction } from '@/components/base/confirmAction'
import BetMultiplierSheet from '@/components/ticket/BetMultiplierSheet.vue'
import MatchCard from '@/components/ticket/MatchCard.vue'
import PlanPreviewDialog from '@/components/ticket/PlanPreviewDialog.vue'
import PurchaseSheet from '@/components/ticket/PurchaseSheet.vue'
import { useTicketStore, type TicketMarket } from '@/stores/ticket'
import type { MarketCode } from '@/types/domain'
import { centsToYuan } from '@/utils/money'

import clearIcon from '@/assets/ui/ticket/ic_clear.svg?url'
import manageIcon from '@/assets/ui/ticket/ic_manage.svg?url'
import saveIcon from '@/assets/ui/ticket/ic_save.svg?url'
import searchIcon from '@/assets/ui/ticket/ic_search.svg?url'
import ticketIcon from '@/assets/ui/ticket/ic_ticket.svg?url'
import viewPlanIcon from '@/assets/ui/ticket/ic_view_plan.svg?url'
import emptyMatchesIllustration from '@/assets/ui/ticket/ill_empty_matches.svg?url'

const store = useTicketStore()
const router = useRouter()
const betExpanded = ref(false)
const saving = ref(false)
const showPurchase = ref(false)
const showPlanPreview = ref(false)
const showMultiplierEditor = ref(false)
const syncFeedback = ref<'idle' | 'success' | 'warning'>('idle')
let syncFeedbackTimer: ReturnType<typeof setTimeout> | undefined
let refreshBlockedUntil = 0

const marketTabs: Array<{ value: TicketMarket; label: string }> = [
  { value: 'had-hhad', label: '胜平负/让球' },
  { value: 'crs', label: '比分' },
  { value: 'ttg', label: '总进球' },
  { value: 'hafu', label: '半全场' },
  { value: 'mixed', label: '混合过关' },
]

const selectedKeys = computed(() => Object.keys(store.selections))
const visibleMatches = computed(() => store.filteredMatches)
const passOptions = Array.from({ length: 8 }, (_, index) => index + 1)

function poolHasOdds(pool: Record<string, unknown>): boolean {
  return Object.entries(pool).some(([key, value]) =>
    !['goalLine', 'goalLineValue', 'updateDate', 'updateTime'].includes(key) &&
    /^\d+(?:\.\d+)?$/.test(String(value ?? '')),
  )
}

const selectableMatchCount = computed(() => store.upcomingMatches.filter((match) => {
  const odds = match.payload.odds
  if (store.activeMarket === 'had-hhad') return poolHasOdds(odds.had) || poolHasOdds(odds.hhad)
  if (store.activeMarket === 'mixed') {
    return poolHasOdds(odds.had) || poolHasOdds(odds.hhad) || poolHasOdds(odds.crs) ||
      poolHasOdds(odds.ttg) || poolHasOdds(odds.hafu)
  }
  return poolHasOdds(odds[store.activeMarket])
}).length)

const totalOdds = computed(() => {
  if (!store.selectedSelections.length) return '-'
  const product = store.selectedSelections.reduce((total, selection) => {
    const odds = Number(selection.odds)
    return Number.isFinite(odds) && odds > 0 ? total * odds : total
  }, 1)
  return product.toFixed(2)
})

const lastSyncLabel = computed(() => {
  if (!store.lastSyncAt) return '尚未同步'
  const date = new Date(store.lastSyncAt)
  if (Number.isNaN(date.valueOf())) return '尚未同步'
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
})

const syncState = computed<'idle' | 'loading' | 'success' | 'warning' | 'error'>(() => {
  if (store.refreshing) return 'loading'
  if (syncFeedback.value === 'warning' || store.syncProgress.failed > 0) return 'warning'
  if (store.error) return 'error'
  if (syncFeedback.value === 'success') return 'success'
  return 'idle'
})

const syncTitle = computed(() => {
  if (syncState.value === 'loading') return '正在同步比赛数据…'
  if (syncState.value === 'success') return '同步完成'
  if (syncState.value === 'warning') return '部分比赛更新失败'
  if (syncState.value === 'error') return '同步失败'
  return '数据已同步'
})

const syncDetail = computed(() => {
  if (syncState.value === 'loading') {
    return `已完成 ${store.syncProgress.completed}/${store.syncProgress.total || store.matches.length}`
  }
  if (syncState.value === 'success') return `${store.upcomingMatches.length}场可选比赛`
  if (syncState.value === 'warning') return `${store.syncProgress.failed}场比赛未更新`
  if (syncState.value === 'error') return store.statusMessage || store.error
  return lastSyncLabel.value
})

const syncActionText = computed(() => {
  if (syncState.value === 'loading' || syncState.value === 'success') return ''
  if (syncState.value === 'warning') return `重试 ${store.syncProgress.failed}场`
  if (syncState.value === 'error') return '重新同步'
  return '手动更新'
})

const syncStatuses = computed<SyncIndicatorStatus[]>(() => {
  const rows: SyncIndicatorStatus[] = []
  const completed = Math.max(0, store.syncProgress.completed - store.syncProgress.failed)

  if (store.refreshing) {
    rows.push({
      id: 'loading',
      title: '正在同步比赛数据…',
      detail: `已完成 ${store.syncProgress.completed}/${store.syncProgress.total || store.matches.length}`,
      state: 'loading',
      actionDisabled: true,
    })
    if (completed > 0) {
      rows.push({
        id: 'completed',
        title: '同步完成',
        detail: `${completed}场比赛已更新`,
        state: 'success',
      })
    }
    if (store.syncProgress.failed > 0) {
      rows.push({
        id: 'failed',
        title: '部分比赛更新失败',
        detail: `${store.syncProgress.failed}场比赛未更新`,
        state: 'warning',
        actionText: `重试 ${store.syncProgress.failed}场`,
        actionDisabled: true,
      })
    }
    return rows
  }

  if (syncFeedback.value === 'success') {
    return [{
      id: 'completed',
      title: '同步完成',
      detail: `${store.upcomingMatches.length}场可选比赛`,
      state: 'success',
    }]
  }
  if (syncFeedback.value === 'warning') {
    if (completed > 0) {
      rows.push({
        id: 'completed',
        title: '同步完成',
        detail: `${completed}场比赛已更新`,
        state: 'success',
      })
    }
    rows.push({
      id: 'failed',
      title: '部分比赛更新失败',
      detail: `${store.syncProgress.failed}场比赛未更新`,
      state: 'warning',
      actionText: `重试 ${store.syncProgress.failed}场`,
    })
    return rows
  }
  if (store.error) {
    return [{
      id: 'error',
      title: '同步失败',
      detail: store.statusMessage || store.error,
      state: 'error',
      actionText: '重新同步',
    }]
  }
  return [{
    id: 'idle',
    title: '数据已同步',
    detail: lastSyncLabel.value,
    state: 'idle',
    actionText: '手动更新',
  }]
})

const syncStats = computed(() => [
  { label: '赛事', value: store.upcomingMatches.length },
  { label: '可选场次', value: selectableMatchCount.value },
  { label: '已进场次', value: store.selectedMatchCount },
  { label: '总赔率', value: totalOdds.value, accent: true },
])

const marketNames: Record<MarketCode, string> = {
  had: '胜平负',
  hhad: '让球胜平负',
  crs: '比分',
  ttg: '总进球',
  hafu: '半全场',
}

onActivated(() => store.activate())

watch(
  () => [store.activeMarket, visibleMatches.value[0]?.matchId] as const,
  ([market, firstMatchId]) => {
    if (market !== 'mixed' || firstMatchId === undefined) return
    const expandedMatch = visibleMatches.value.find((match) => store.expandedHistory[match.matchId])
    store.expandedHistory = { [expandedMatch?.matchId ?? firstMatchId]: true }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (syncFeedbackTimer) clearTimeout(syncFeedbackTimer)
})

async function runRefresh(retryFailures: boolean): Promise<void> {
  if (store.refreshing || Date.now() < refreshBlockedUntil) return
  await store.refresh(retryFailures)
  refreshBlockedUntil = Date.now() + 600
  if (syncFeedbackTimer) clearTimeout(syncFeedbackTimer)
  if (store.error || store.syncProgress.failed > 0) {
    syncFeedback.value = 'warning'
    showFailToast(store.error || `${store.syncProgress.failed}场比赛更新失败`)
    return
  }
  syncFeedback.value = 'success'
  showSuccessToast('比赛和赛果已同步')
  syncFeedbackTimer = setTimeout(() => {
    syncFeedback.value = 'idle'
  }, 2000)
}

function refresh(): Promise<void> {
  return runRefresh(false)
}

function handleSyncAction(): void {
  void runRefresh(syncFeedback.value === 'warning' && store.syncProgress.failed > 0)
}

function setMultiplier(value: string | number): void {
  const parsed = Math.trunc(Number(value))
  store.multiplier = Number.isFinite(parsed) ? Math.min(9999, Math.max(1, parsed)) : 1
}

function adjustMultiplier(delta: number): void {
  setMultiplier(store.multiplier + delta)
}

function openMultiplierEditor(): void {
  betExpanded.value = true
  showMultiplierEditor.value = true
}

function purchaseFromMultiplierEditor(): void {
  showMultiplierEditor.value = false
  showPurchase.value = true
}

function confirmPlanPreview(): void {
  showPlanPreview.value = false
  showPurchase.value = true
}

function toggleMatch(matchId: number): void {
  if (store.activeMarket !== 'mixed') {
    store.toggleHistory(matchId)
    return
  }
  const willExpand = !store.expandedHistory[matchId]
  store.expandedHistory = willExpand ? { [matchId]: true } : {}
}

async function clearSelections(): Promise<void> {
  if (!store.selectedSelections.length) return
  await confirmAction({
    title: '清空当前选票？',
    message: '已选择的玩法、过关方式和倍数将全部清空。',
    confirmText: '清空',
    danger: true,
  })
  store.clear()
}

async function selectOption(
  matchId: number,
  value: { market: MarketCode; outcome: string; odds: string },
): Promise<void> {
  const selection = {
    key: `${matchId}|${value.market}|${value.outcome}`,
    matchId,
    market: value.market,
    outcome: value.outcome,
    odds: value.odds,
  }
  const conflict = store.toggleSelection(selection)
  if (!conflict) return
  try {
    await confirmAction({
      title: '切换本场玩法？',
      message: `本场已选择“${marketNames[conflict.currentMarket]}”。切换为“${marketNames[conflict.nextMarket]}”会清除本场原有选项。`,
      confirmText: '切换玩法',
    })
    store.toggleSelection(selection, true)
  } catch {
    // User kept the existing market.
  }
}

async function savePlan(): Promise<void> {
  saving.value = true
  try {
    const plan = await store.savePlan()
    showSuccessToast(`方案已保存：${plan.name}`)
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

async function purchase(value: { name: string; stakeCents: number; purchasedAt: string; notes: string }): Promise<void> {
  saving.value = true
  try {
    await store.purchaseCurrentPlan(value)
    showPurchase.value = false
    showSuccessToast('购买记录已加入账单')
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

</script>

<template>
  <div class="page ticket-page">
    <AppHeader title="彩果·选票" subtitle="赛事、选号与方案管理" />

    <div class="page-content ticket-content">
      <section class="ticket-actions" aria-label="方案操作">
        <button type="button" class="ticket-action" @click="router.push('/plans')">
          <AppAssetIcon :src="manageIcon" :size="24" />
          <span>方案管理</span>
        </button>
        <button type="button" class="ticket-action ticket-action--end" @click="clearSelections">
          <AppAssetIcon :src="clearIcon" :size="24" />
          <span>清空</span>
        </button>
      </section>

      <nav class="market-tabs" aria-label="玩法选择">
        <button
          v-for="market in marketTabs"
          :key="market.value"
          type="button"
          :class="['market-tab', { 'market-tab--selected': store.activeMarket === market.value }]"
          :aria-pressed="store.activeMarket === market.value"
          @click="store.activeMarket = market.value"
        >
          {{ market.label }}
        </button>
      </nav>

      <AppSyncIndicator
        :title="syncTitle"
        :detail="syncDetail"
        :state="syncState"
        :action-text="syncActionText"
        :action-disabled="store.refreshing"
        :stats="syncStats"
        :statuses="syncStatuses"
        @action="handleSyncAction"
      />

      <van-field
        v-model="store.search"
        class="match-search"
        placeholder="搜索球队或赛事"
        clearable
        aria-label="搜索比赛"
      >
        <template #left-icon>
          <AppAssetIcon class="match-search__icon" :src="searchIcon" :size="20" />
        </template>
      </van-field>

      <AppState
        v-if="store.loading"
        type="loading"
        title="正在读取本地比赛"
        description="不会重复请求已经保存的数据"
      />
      <AppState
        v-else-if="store.error && !store.matches.length"
        type="error"
        title="数据读取失败"
        :description="store.error"
        action-text="重新加载"
        @action="store.initialize"
      />
      <section v-else-if="!visibleMatches.length" class="ticket-empty-card" role="status">
        <img class="ticket-empty-card__illustration" :src="emptyMatchesIllustration" alt="" aria-hidden="true">
        <strong>暂无可选比赛</strong>
        <p v-if="store.search.trim()">当前搜索条件下没有未开赛的比赛</p>
        <p v-else-if="store.matches.length">
          本地有 {{ store.matches.length }} 场数据，但当前时间之后暂无可选票，请刷新
        </p>
        <p v-else>本地暂无比赛，点击刷新获取最新数据</p>
        <AppButton size="small" @click="refresh">立即刷新</AppButton>
      </section>
      <div v-else class="match-list">
        <MatchCard
          v-for="match in visibleMatches"
          :key="match.matchId"
          :match="match"
          :active-market="store.activeMarket"
          :selected-keys="selectedKeys"
          :expanded="Boolean(store.expandedHistory[match.matchId])"
          :mixed-market="store.mixedMarketFor(match.matchId)"
          @toggle-history="toggleMatch(match.matchId)"
          @change-mixed-market="store.setMixedMarket(match.matchId, $event)"
          @select="selectOption(match.matchId, $event)"
        />
      </div>
    </div>

    <aside :class="['bet-dock', { 'bet-dock--expanded': betExpanded }]" aria-label="投注摘要">
      <button type="button" class="bet-dock__summary" @click="betExpanded = !betExpanded">
        <span class="bet-dock__summary-copy">
          <strong>{{ store.selectedMatchCount }}场已选</strong>
          <i>·</i><span>{{ store.selectedSelections.length }}个选项</span>
          <i>·</i><span>{{ store.betCount }}注</span>
          <i>·</i><b class="numeric">¥{{ centsToYuan(store.stakeCents) }}</b>
        </span>
        <AppIcon :name="betExpanded ? 'chevron-up' : 'chevron-down'" :size="16" />
      </button>
      <div v-if="betExpanded" class="bet-dock__expanded">
        <section>
          <h2>过关</h2>
          <div class="bet-pass-grid">
            <AppChip
              v-for="size in passOptions"
              :key="size"
              :selected="store.passCounts.includes(size)"
              :disabled="!store.availablePasses.includes(size)"
              @click="store.togglePass(size)"
            >
              {{ size }}关
            </AppChip>
          </div>
          <small class="bet-pass-hint">最多可选8个过关方式</small>
        </section>
        <label class="bet-multiplier">
          <span>倍数</span>
          <span class="bet-stepper">
            <button type="button" aria-label="减少倍数" :disabled="store.multiplier <= 1" @click="adjustMultiplier(-1)">−</button>
            <button type="button" class="bet-stepper__value numeric" aria-label="编辑投注倍数" @click="openMultiplierEditor">
              {{ store.multiplier }}
            </button>
            <button type="button" aria-label="增加倍数" :disabled="store.multiplier >= 9999" @click="adjustMultiplier(1)">＋</button>
          </span>
        </label>
        <div class="bet-dock__finance">
          <p>共{{ store.betCount }}注，投注 <strong class="numeric">¥{{ centsToYuan(store.stakeCents) }}</strong></p>
          <p>理论奖金 <strong class="numeric">¥{{ centsToYuan(store.prizeRange.minCents) }}～{{ centsToYuan(store.prizeRange.maxCents) }}</strong><AppIcon name="info" :size="16" /></p>
        </div>
        <div class="bet-dock__actions">
          <AppButton variant="secondary" block :loading="saving" :disabled="!store.betCount || !store.canSavePlan" @click="savePlan">
            <template #icon><AppAssetIcon :src="saveIcon" :size="18" /></template>
            {{ store.editingPlanId ? '保存修改' : '保存方案' }}
          </AppButton>
          <AppButton block :disabled="!store.betCount" @click="showPurchase = true">
            <template #icon><AppAssetIcon :src="ticketIcon" :size="18" /></template>
            记录购买
          </AppButton>
          <AppButton variant="secondary" block :disabled="!store.betCount" @click="showPlanPreview = true">
            <template #icon><AppAssetIcon :src="viewPlanIcon" :size="18" /></template>
            查看方案
          </AppButton>
        </div>
      </div>
    </aside>

    <PlanPreviewDialog
      v-model:show="showPlanPreview"
      :selections="store.selectedSelections"
      :matches="store.matches"
      :pass-counts="store.passCounts"
      :multiplier="store.multiplier"
      :bet-count="store.betCount"
      :stake-cents="store.stakeCents"
      :prize-range="store.prizeRange"
      @confirm="confirmPlanPreview"
    />

    <BetMultiplierSheet
      v-model:show="showMultiplierEditor"
      :multiplier="store.multiplier"
      :bet-count="store.betCount"
      :stake-cents="store.stakeCents"
      :saving="saving"
      :can-save="Boolean(store.betCount && store.canSavePlan)"
      :can-purchase="Boolean(store.betCount)"
      @update:multiplier="setMultiplier"
      @save="savePlan"
      @purchase="purchaseFromMultiplierEditor"
    />

    <PurchaseSheet
      v-model:show="showPurchase"
      :default-name="store.suggestedPlanName"
      :default-stake-cents="store.stakeCents"
      :loading="saving"
      @confirm="purchase"
    />
  </div>
</template>

<style scoped>
.ticket-page {
  padding-bottom: 116px;
}

.ticket-content {
  gap: 8px;
  padding-top: 0;
  padding-bottom: 24px;
}

.ticket-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 44px;
  margin-inline: calc(var(--page-gutter) * -1);
  padding: 0 var(--page-gutter);
  border-bottom: 1px solid var(--color-divider);
  background: var(--color-surface);
}

.ticket-action {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  min-height: 44px;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  text-align: left;
}

.ticket-action > span:last-child {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
}

.ticket-action--end {
  justify-content: flex-end;
}

.market-tabs {
  display: grid;
  grid-template-columns: 1.35fr repeat(4, minmax(0, 1fr));
  gap: 6px;
  min-height: 50px;
  padding: 8px 0;
}

.market-tab {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 0 5px;
  border: 0;
  border-radius: 10px;
  color: var(--color-text);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
}

.market-tab--selected {
  color: #ff5b67;
  background: #fff0f3;
}

.match-search {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0 12px;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.match-search:focus-within {
  box-shadow: var(--outline-primary);
}

.match-search__icon {
  display: block;
  color: #8f9bad;
}

.match-search :deep(.van-field__body) {
  min-height: 40px;
  align-items: center;
}

.match-search :deep(.van-field__left-icon) {
  display: grid;
  align-self: stretch;
  min-width: 24px;
  min-height: 40px;
  margin-right: 8px;
  place-items: center;
  line-height: 0;
}

.match-search:focus-within .match-search__icon {
  color: var(--color-primary);
}

.match-search :deep(.van-field__control) {
  height: 40px;
  line-height: 40px;
}

.match-list {
  display: grid;
  gap: 8px;
}

.ticket-empty-card {
  display: grid;
  min-height: clamp(280px, 38dvh, 460px);
  padding: 20px;
  border-radius: 12px;
  place-items: center;
  align-content: center;
  gap: 8px;
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  text-align: center;
}

.ticket-empty-card__illustration {
  display: block;
  width: 96px;
  height: 76px;
  margin-bottom: 8px;
  object-fit: contain;
}

.ticket-empty-card strong {
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}

.ticket-empty-card p {
  margin: 0 0 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.bet-dock {
  position: fixed;
  z-index: 80;
  right: 0;
  bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom));
  left: 0;
  display: grid;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--page-gutter);
  border-radius: 12px 12px 0 0;
  background: rgb(255 255 255 / 97%);
  box-shadow: var(--outline-strong), 0 -8px 20px rgb(44 77 119 / 8%);
  backdrop-filter: blur(18px);
}

.bet-dock--expanded {
  border-radius: 20px 20px 0 0;
}

.bet-dock__summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 24px;
  align-items: center;
  width: 100%;
  min-height: 44px;
  min-width: 0;
  gap: 8px;
  padding: 0;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.bet-dock__summary-copy {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
}

.bet-dock__summary-copy > * {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
}

.bet-dock__summary-copy strong {
  flex: 0 0 auto;
  font-weight: 500;
}

.bet-dock__summary-copy span,
.bet-dock__summary-copy i {
  color: var(--color-text-secondary);
  font-style: normal;
  font-weight: 400;
}

.bet-dock__summary-copy b {
  overflow: hidden;
  color: #ff5b67;
  font-weight: 500;
  text-overflow: ellipsis;
}

.bet-dock__expanded {
  display: grid;
  gap: 6px;
  padding: 6px 8px 8px;
  border-top: 1px solid var(--color-divider);
}

.bet-dock__expanded section {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: start;
  gap: 6px 8px;
}

.bet-dock__expanded h2,
.bet-dock__finance p {
  margin: 0;
}

.bet-dock__expanded h2 {
  display: flex;
  align-items: center;
  min-height: 30px;
  grid-row: 1 / span 2;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}

.bet-pass-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-column: 2;
  gap: 6px 8px;
}

.bet-pass-grid .app-chip {
  width: 100%;
  min-width: 0;
  height: 30px;
  border-radius: var(--radius-control);
}

.bet-pass-grid :deep(.app-chip--selected) {
  color: #fff;
  background: var(--color-primary);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}

.bet-pass-hint {
  grid-column: 2;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.bet-multiplier {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.bet-multiplier > span:first-child {
  display: flex;
  align-items: center;
  min-height: 30px;
}

.bet-stepper {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 34px;
  height: 30px;
  border-radius: var(--radius-control);
  overflow: hidden;
  box-shadow: var(--outline-default);
}

.bet-stepper button,
.bet-stepper input {
  min-width: 0;
  height: 30px;
  padding: 0;
  border: 0;
  outline: 0;
  background: var(--color-surface);
  text-align: center;
}

.bet-stepper button {
  color: var(--color-text);
  font-size: 20px;
}

.bet-stepper button:first-child {
  border-right: 1px solid var(--color-divider);
}

.bet-stepper button:last-child {
  border-left: 1px solid var(--color-divider);
}

.bet-stepper button:disabled {
  color: var(--color-text-tertiary);
  background: var(--color-disabled);
}

.bet-stepper .bet-stepper__value {
  color: var(--color-text);
  font-size: 14px;
  font-weight: 400;
}

.bet-dock__finance {
  display: grid;
  gap: 4px;
  font-size: 13px;
}

.bet-dock__finance p {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bet-dock__finance strong {
  color: #ff5b67;
  font-size: 16px;
  font-weight: 500;
}

.bet-dock__finance .app-icon {
  color: var(--color-text-secondary);
}

.bet-dock__actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.bet-dock__actions :deep(.app-button) {
  min-height: 36px;
  padding-inline: 7px;
  font-size: 12px;
}

.bet-dock__actions :deep(.app-button__icon) {
  width: 18px;
  height: 18px;
}

@media (min-width: 600px) {
  .bet-dock {
    right: auto;
    left: calc(50% - 244px);
    width: 488px;
  }
}

@media (max-width: 374px) {
  .bet-dock__summary-copy {
    gap: 4px;
    font-size: 12px;
  }

  .bet-dock__expanded section,
  .bet-multiplier {
    grid-template-columns: 48px minmax(0, 1fr);
  }
}
</style>
