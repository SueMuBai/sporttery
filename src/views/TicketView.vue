<script setup lang="ts">
import { showFailToast, showSuccessToast } from 'vant'
import { computed, onActivated, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import AppChip from '@/components/base/AppChip.vue'
import AppHeader from '@/components/base/AppHeader.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppState from '@/components/base/AppState.vue'
import AppSyncIndicator from '@/components/base/AppSyncIndicator.vue'
import { confirmAction } from '@/components/base/confirmAction'
import MatchCard from '@/components/ticket/MatchCard.vue'
import PurchaseSheet from '@/components/ticket/PurchaseSheet.vue'
import { useTicketStore, type TicketMarket } from '@/stores/ticket'
import type { MarketCode } from '@/types/domain'
import { centsToYuan } from '@/utils/money'

const store = useTicketStore()
const router = useRouter()
const betExpanded = ref(false)
const saving = ref(false)
const showPurchase = ref(false)
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

const selectableMatchCount = computed(() => store.matches.filter((match) => {
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
  const timestamps = store.matches
    .map((match) => Date.parse(match.updatedAt))
    .filter(Number.isFinite)
  if (!timestamps.length) return '尚未同步'
  const date = new Date(Math.max(...timestamps))
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
  if (syncState.value === 'success') return `${store.matches.length}场比赛已更新`
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

const syncStats = computed(() => [
  { label: '赛事', value: store.matches.length },
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
    if (Object.values(store.expandedHistory).some(Boolean)) return
    store.toggleHistory(firstMatchId)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (syncFeedbackTimer) clearTimeout(syncFeedbackTimer)
})

async function refresh(): Promise<void> {
  if (store.refreshing || Date.now() < refreshBlockedUntil) return
  await store.refresh()
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

function setMultiplier(value: string | number): void {
  const parsed = Math.trunc(Number(value))
  store.multiplier = Number.isFinite(parsed) ? Math.min(9999, Math.max(1, parsed)) : 1
}

function adjustMultiplier(delta: number): void {
  setMultiplier(store.multiplier + delta)
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
    <AppHeader title="彩果 · 选票" subtitle="赛事、选号与方案管理" />

    <div class="page-content ticket-content">
      <section class="ticket-actions" aria-label="方案操作">
        <button type="button" class="ticket-action" @click="router.push('/plans')">
          <AppIcon name="folder" :size="22" />
          <span>方案管理</span>
        </button>
        <button type="button" class="ticket-action ticket-action--end" @click="clearSelections">
          <AppIcon name="delete" :size="22" />
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
        @action="refresh"
      />

      <van-field
        v-model="store.search"
        class="match-search"
        placeholder="搜索球队或赛事"
        clearable
        aria-label="搜索比赛"
      >
        <template #left-icon><AppIcon name="search" :size="20" /></template>
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
        <span class="ticket-empty-card__icon"><AppIcon name="folder" :size="46" /></span>
        <strong>暂无可选比赛</strong>
        <p>当前筛选条件下没有比赛</p>
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
          @toggle-history="store.toggleHistory(match.matchId)"
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
            <input
              :value="store.multiplier"
              type="number"
              min="1"
              max="9999"
              step="1"
              inputmode="numeric"
              aria-label="投注倍数"
              @input="setMultiplier(($event.target as HTMLInputElement).value)"
              @blur="setMultiplier(store.multiplier)"
            />
            <button type="button" aria-label="增加倍数" :disabled="store.multiplier >= 9999" @click="adjustMultiplier(1)">＋</button>
          </span>
        </label>
        <div class="bet-dock__finance">
          <p>共{{ store.betCount }}注，投注 <strong class="numeric">¥{{ centsToYuan(store.stakeCents) }}</strong></p>
          <p>理论奖金 <strong class="numeric">¥{{ centsToYuan(store.prizeRange.minCents) }}～{{ centsToYuan(store.prizeRange.maxCents) }}</strong><AppIcon name="info" :size="16" /></p>
        </div>
        <div class="bet-dock__actions">
          <AppButton variant="secondary" block :loading="saving" :disabled="!store.betCount || !store.canSavePlan" @click="savePlan">{{ store.editingPlanId ? '保存修改' : '保存方案' }}</AppButton>
          <AppButton block :disabled="!store.betCount" @click="showPurchase = true">记录购买</AppButton>
        </div>
      </div>
    </aside>

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
  min-height: 52px;
  margin-inline: calc(var(--page-gutter) * -1);
  padding: 0 var(--page-gutter);
  border-bottom: 1px solid var(--color-divider);
  background: var(--color-surface);
}

.ticket-action {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  min-height: 52px;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
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
  min-height: 40px;
  padding: 0 12px;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.match-search:focus-within {
  box-shadow: var(--outline-primary);
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

.ticket-empty-card__icon {
  display: grid;
  width: 72px;
  height: 72px;
  margin-bottom: 8px;
  border-radius: 22px;
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
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
  min-height: 56px;
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
  min-height: 56px;
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
  gap: 10px;
  padding: 0 8px 12px;
  border-top: 1px solid var(--color-divider);
}

.bet-dock__expanded section {
  display: grid;
  gap: 6px;
}

.bet-dock__expanded h2,
.bet-dock__finance p {
  margin: 0;
}

.bet-dock__expanded h2 {
  font-size: 13px;
  font-weight: 500;
}

.bet-pass-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.bet-pass-grid .app-chip {
  width: 100%;
  min-width: 0;
  height: 40px;
  border-radius: var(--radius-control);
}

.bet-pass-grid :deep(.app-chip--selected) {
  color: #fff;
  background: var(--color-primary);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}

.bet-pass-hint {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.bet-multiplier {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.bet-stepper {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  height: 40px;
  border-radius: var(--radius-control);
  overflow: hidden;
  box-shadow: var(--outline-default);
}

.bet-stepper button,
.bet-stepper input {
  min-width: 0;
  height: 40px;
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

.bet-stepper input {
  font-size: 14px;
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
  grid-template-columns: 1fr 1fr;
  gap: 8px;
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

  .bet-multiplier {
    grid-template-columns: 88px minmax(0, 1fr);
  }
}
</style>
