<script setup lang="ts">
import { showFailToast, showSuccessToast } from 'vant'
import { computed, onActivated, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import AppBottomSheet from '@/components/base/AppBottomSheet.vue'
import AppChip from '@/components/base/AppChip.vue'
import AppHeader from '@/components/base/AppHeader.vue'
import AppIconButton from '@/components/base/AppIconButton.vue'
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
const showMatchFilter = ref(false)
const matchFilter = ref<'all' | 'selected' | 'history' | 'unselected'>('all')

const marketTabs: Array<{ value: TicketMarket; label: string }> = [
  { value: 'had-hhad', label: '胜平负/让球' },
  { value: 'crs', label: '比分' },
  { value: 'ttg', label: '总进球' },
  { value: 'hafu', label: '半全场' },
  { value: 'mixed', label: '混合过关' },
]

const selectedKeys = computed(() => Object.keys(store.selections))
const selectedMatchIds = computed(() => new Set(store.selectedSelections.map((selection) => selection.matchId)))
const visibleMatches = computed(() => {
  if (matchFilter.value === 'selected') {
    return store.filteredMatches.filter((match) => selectedMatchIds.value.has(match.matchId))
  }
  if (matchFilter.value === 'unselected') {
    return store.filteredMatches.filter((match) => !selectedMatchIds.value.has(match.matchId))
  }
  if (matchFilter.value === 'history') {
    return store.filteredMatches.filter((match) => match.payload.history.length > 0)
  }
  return store.filteredMatches
})

const marketNames: Record<MarketCode, string> = {
  had: '胜平负',
  hhad: '让球胜平负',
  crs: '比分',
  ttg: '总进球',
  hafu: '半全场',
}

onActivated(() => store.activate())

async function refresh(): Promise<void> {
  await store.refresh()
  if (store.error) showFailToast(store.error)
  else showSuccessToast('比赛和赛果已同步')
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

async function saveAsNewPlan(): Promise<void> {
  saving.value = true
  try {
    const plan = await store.saveAsNewPlan()
    showSuccessToast(`已另存为：${plan.name}`)
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
    <AppHeader title="彩果 · 选票" subtitle="赛事、选项与方案管理">
      <template #action>
        <AppIconButton
          label="刷新比赛和赛果"
          :loading="store.refreshing"
          @click="refresh"
        >
          <AppIcon name="refresh" />
        </AppIconButton>
      </template>
    </AppHeader>

    <div class="page-content ticket-content">
      <section class="ticket-actions" aria-label="方案操作">
        <AppButton variant="secondary" block @click="router.push('/plans')">
          方案管理
        </AppButton>
        <AppButton variant="ghost" block :disabled="!store.selectedSelections.length" @click="clearSelections">
          清空
        </AppButton>
      </section>

      <nav class="market-tabs" aria-label="玩法选择">
        <AppChip
          v-for="market in marketTabs"
          :key="market.value"
          :selected="store.activeMarket === market.value"
          @click="store.activeMarket = market.value"
        >
          {{ market.label }}
        </AppChip>
      </nav>

      <AppSyncIndicator
        :message="store.statusMessage || '正在初始化本地数据…'"
        :loading="store.refreshing"
        :error="Boolean(store.error)"
        :stats="[
          { label: '当前比赛', value: store.matches.length },
          { label: '本次历史', value: store.syncProgress.completed },
          { label: '查询失败', value: store.syncProgress.failed },
          { label: '已选场次', value: store.selectedMatchCount },
        ]"
      />

      <van-field
        v-model="store.search"
        class="match-search"
        placeholder="搜索球队、联赛或场次…"
        clearable
        aria-label="搜索比赛"
      >
        <template #left-icon><AppIcon name="search" :size="20" /></template>
        <template #right-icon>
          <button type="button" class="match-filter-button" aria-label="筛选比赛" @click.stop="showMatchFilter = true">
            <AppIcon name="filter" :size="20" /><span v-if="matchFilter !== 'all'" />
          </button>
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
      <AppState
        v-else-if="!visibleMatches.length"
        type="empty"
        :title="matchFilter !== 'all' ? '当前筛选暂无比赛' : store.search ? '没有找到相关比赛' : '本地暂无比赛'"
        :description="matchFilter !== 'all' ? '可以点击搜索框右侧筛选按钮查看全部比赛' : store.search ? '请尝试球队、联赛或场次编号' : '点击右上角刷新获取最新比赛和赛果'"
        :action-text="store.search || matchFilter !== 'all' ? '' : '立即刷新'"
        @action="refresh"
      />
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
        <strong class="numeric">{{ store.selectedMatchCount }}</strong>
        <span>场已选</span>
        <small>· {{ store.selectedSelections.length }} 个选项</small>
        <AppIcon :name="betExpanded ? 'chevron-down' : 'chevron-up'" :size="16" />
      </button>
      <div v-if="betExpanded" class="bet-dock__expanded">
        <section>
          <h2>过关 <span>（可多选，最多8个）</span></h2>
          <div class="bet-pass-grid">
            <AppChip
              v-for="size in store.availablePasses"
              :key="size"
              :selected="store.passCounts.includes(size)"
              @click="store.togglePass(size)"
            >
              {{ size }}关
            </AppChip>
          </div>
        </section>
        <div class="bet-dock__finance">
          <label>倍数 <input v-model.number="store.multiplier" type="number" min="1" max="9999" inputmode="numeric" /></label>
          <div>
            <p>共{{ store.betCount }}注，投注 <strong class="numeric">{{ centsToYuan(store.stakeCents) }} 元</strong></p>
            <small>理论奖金：{{ centsToYuan(store.prizeRange.minCents) }} ~ {{ centsToYuan(store.prizeRange.maxCents) }} 元</small>
          </div>
        </div>
        <div class="bet-dock__actions">
          <AppButton variant="secondary" block :loading="saving" :disabled="!store.betCount || !store.canSavePlan" @click="savePlan">{{ store.editingPlanId ? '保存修改' : '保存方案' }}</AppButton>
          <AppButton block :disabled="!store.betCount" @click="showPurchase = true">记录购买</AppButton>
        </div>
        <div class="bet-dock__links">
          <button type="button" class="bet-dock__detail-link" @click="router.push('/ticket/current')">查看当前选择</button>
          <button v-if="store.editingPlanId" type="button" class="bet-dock__detail-link" :disabled="saving" @click="saveAsNewPlan">另存为新方案</button>
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

    <AppBottomSheet v-model:show="showMatchFilter" title="筛选比赛" description="只影响当前比赛列表，不会清除已选内容">
      <div class="match-filter-sheet">
        <button type="button" :class="{ selected: matchFilter === 'all' }" @click="matchFilter = 'all'; showMatchFilter = false">全部比赛</button>
        <button type="button" :class="{ selected: matchFilter === 'selected' }" @click="matchFilter = 'selected'; showMatchFilter = false">已选择</button>
        <button type="button" :class="{ selected: matchFilter === 'unselected' }" @click="matchFilter = 'unselected'; showMatchFilter = false">未选择</button>
        <button type="button" :class="{ selected: matchFilter === 'history' }" @click="matchFilter = 'history'; showMatchFilter = false">有历史交锋</button>
      </div>
    </AppBottomSheet>
  </div>
</template>

<style scoped>
.ticket-page {
  padding-bottom: 92px;
}

.ticket-content {
  gap: var(--space-3);
  padding-bottom: var(--space-8);
}

.ticket-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.market-tabs {
  display: grid;
  grid-template-columns: 1.35fr repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-inline: 0;
  padding: 2px 0 6px;
}

.market-tabs :deep(.app-chip) {
  width: 100%;
  min-width: 0;
  padding-inline: 5px;
  font-size: 12px;
}

.match-search {
  min-height: var(--control-height-lg);
  padding: 0 var(--space-4);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.match-search:focus-within {
  box-shadow: var(--outline-primary);
}

.match-search :deep(.van-field__control) {
  height: var(--control-height-lg);
  line-height: var(--control-height-lg);
}

.match-filter-button {
  position: relative;
  display: grid;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  place-items: center;
  color: var(--color-primary);
  background: transparent;
}

.match-filter-button span {
  position: absolute;
  top: 7px;
  right: 6px;
  width: 7px;
  height: 7px;
  border: 1px solid #fff;
  border-radius: 50%;
  background: var(--color-accent);
}

.match-filter-sheet {
  display: grid;
  padding: 4px var(--page-gutter) 12px;
}

.match-filter-sheet button {
  min-height: 48px;
  padding: 0 10px;
  border: 0;
  color: var(--color-text);
  background: transparent;
  border-bottom: 1px solid var(--color-divider);
  font-size: 13px;
  text-align: left;
}

.match-filter-sheet button.selected {
  color: var(--color-primary);
  font-weight: 650;
}

.match-list {
  display: grid;
  gap: var(--space-3);
}

.bet-dock {
  position: fixed;
  z-index: 80;
  right: 0;
  bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom));
  left: 0;
  display: grid;
  align-items: center;
  min-height: 72px;
  padding: 0 var(--page-gutter);
  border-radius: 20px 20px 0 0;
  background: rgb(255 255 255 / 97%);
  box-shadow: var(--outline-strong), var(--shadow-float);
  backdrop-filter: blur(18px);
}

.bet-dock--expanded {
  padding-top: 4px;
}

.bet-dock__summary {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) 24px;
  align-items: center;
  width: 100%;
  min-height: 68px;
  min-width: 0;
  gap: 0 6px;
  padding: 0;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.bet-dock__summary strong {
  color: var(--color-accent-strong);
  font-size: 25px;
  line-height: 1;
}

.bet-dock__summary span {
  font-weight: 650;
  line-height: 1.2;
}

.bet-dock__summary small {
  display: block;
  min-width: 0;
  gap: 3px;
  margin-top: 0;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bet-dock__expanded {
  display: grid;
  gap: 12px;
  padding: 0 8px 12px;
}

.bet-dock__expanded section {
  display: grid;
  gap: 8px;
}

.bet-dock__expanded h2,
.bet-dock__finance p {
  margin: 0;
}

.bet-dock__expanded h2 {
  font-size: 13px;
  font-weight: 500;
}

.bet-dock__expanded h2 span,
.bet-dock__finance small {
  color: var(--color-text-secondary);
  font-weight: 400;
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
  background: linear-gradient(135deg, #72aeff, #8f91f5);
}

.bet-dock__finance {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.bet-dock__finance label {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.bet-dock__finance input {
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border: 0;
  outline: 0;
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
  font-size: 14px;
}

.bet-dock__finance div {
  display: grid;
  gap: 3px;
  font-size: 13px;
}

.bet-dock__finance strong {
  color: var(--color-accent);
  font-size: 16px;
}

.bet-dock__finance small {
  font-size: 11px;
}

.bet-dock__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.bet-dock__detail-link {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: var(--font-size-sm);
}

.bet-dock__links {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
}

.bet-dock__links .bet-dock__detail-link + .bet-dock__detail-link::before {
  content: "·";
  margin-right: var(--space-2);
  color: var(--color-text-tertiary);
}

@media (min-width: 600px) {
  .bet-dock {
    right: auto;
    left: calc(50% - 244px);
    width: 488px;
  }
}

@media (max-width: 374px) {
  .bet-dock__finance {
    grid-template-columns: 112px minmax(0, 1fr);
  }
}
</style>
