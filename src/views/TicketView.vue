<script setup lang="ts">
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import AppCard from '@/components/base/AppCard.vue'
import AppChip from '@/components/base/AppChip.vue'
import AppHeader from '@/components/base/AppHeader.vue'
import AppIconButton from '@/components/base/AppIconButton.vue'
import AppState from '@/components/base/AppState.vue'
import BetSheet from '@/components/ticket/BetSheet.vue'
import MatchCard from '@/components/ticket/MatchCard.vue'
import SavePlanSheet from '@/components/ticket/SavePlanSheet.vue'
import { useTicketStore, type TicketMarket } from '@/stores/ticket'
import type { MarketCode } from '@/types/domain'
import { centsToYuan } from '@/utils/money'

const store = useTicketStore()
const router = useRouter()
const showBetSheet = ref(false)
const showSaveSheet = ref(false)
const saving = ref(false)

const marketTabs: Array<{ value: TicketMarket; label: string }> = [
  { value: 'had-hhad', label: '胜平负/让球' },
  { value: 'crs', label: '比分' },
  { value: 'ttg', label: '总进球' },
  { value: 'hafu', label: '半全场' },
  { value: 'mixed', label: '混合过关' },
]

const selectedKeys = computed(() => Object.keys(store.selections))

const marketNames: Record<MarketCode, string> = {
  had: '胜平负',
  hhad: '让球胜平负',
  crs: '比分',
  ttg: '总进球',
  hafu: '半全场',
}

onMounted(() => store.initialize())

async function refresh(): Promise<void> {
  await store.refresh()
  if (store.error) showFailToast(store.error)
  else showSuccessToast('比赛和赛果已同步')
}

async function clearSelections(): Promise<void> {
  if (!store.selectedSelections.length) return
  await showConfirmDialog({
    title: '清空当前选票？',
    message: '已选择的玩法、过关方式和倍数将全部清空。',
    confirmButtonText: '清空',
    confirmButtonColor: '#EF5B67',
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
    await showConfirmDialog({
      title: '切换本场玩法？',
      message: `本场已选择“${marketNames[conflict.currentMarket]}”。切换为“${marketNames[conflict.nextMarket]}”会清除本场原有选项。`,
      confirmButtonText: '切换玩法',
    })
    store.toggleSelection(selection, true)
  } catch {
    // User kept the existing market.
  }
}

async function savePlan(value: { name: string; tags: string[] }): Promise<void> {
  saving.value = true
  try {
    const plan = await store.savePlan(value.name, value.tags)
    showSaveSheet.value = false
    showBetSheet.value = false
    showSuccessToast(`方案已保存：${plan.name}`)
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
          icon="replay"
          :loading="store.refreshing"
          @click="refresh"
        />
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

      <AppCard class="sync-card" :padded="false">
        <div :class="['sync-card__status', { 'sync-card__status--error': store.error }]">
          <van-loading v-if="store.refreshing" size="18" color="var(--color-primary)" />
          <van-icon
            v-else
            :name="store.error ? 'warning-o' : 'checked'"
            size="18"
            :color="store.error ? 'var(--color-danger)' : 'var(--color-success)'"
          />
          <span>{{ store.statusMessage || '正在初始化本地数据…' }}</span>
        </div>
        <div class="sync-card__stats">
          <div><strong class="numeric">{{ store.matches.length }}</strong><span>当前比赛</span></div>
          <div><strong class="numeric">{{ store.syncProgress.completed }}</strong><span>本次历史</span></div>
          <div><strong class="numeric">{{ store.syncProgress.failed }}</strong><span>查询失败</span></div>
          <div><strong class="numeric">{{ store.selectedMatchCount }}</strong><span>已选场次</span></div>
        </div>
      </AppCard>

      <van-field
        v-model="store.search"
        class="match-search"
        left-icon="search"
        right-icon="filter-o"
        placeholder="搜索球队、联赛或场次…"
        clearable
        aria-label="搜索比赛"
      />

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
        v-else-if="!store.filteredMatches.length"
        type="empty"
        :title="store.search ? '没有找到相关比赛' : '本地暂无比赛'"
        :description="store.search ? '请尝试球队、联赛或场次编号' : '点击右上角刷新获取最新比赛和赛果'"
        :action-text="store.search ? '' : '立即刷新'"
        @action="refresh"
      />
      <div v-else class="match-list">
        <MatchCard
          v-for="match in store.filteredMatches"
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

    <aside class="bet-dock" aria-label="投注摘要">
      <button type="button" class="bet-dock__summary" @click="showBetSheet = true">
        <strong class="numeric">{{ store.selectedMatchCount }}</strong>
        <span>场已选</span>
        <small>
          {{ store.betCount }} 注 · {{ centsToYuan(store.stakeCents) }} 元
          <van-icon name="arrow-up" size="12" />
        </small>
      </button>
      <AppButton variant="secondary" size="small" :disabled="!store.selectedSelections.length" @click="showSaveSheet = true">
        保存方案
      </AppButton>
      <AppButton size="small" :disabled="!store.selectedSelections.length" @click="showBetSheet = true">
        查看方案
      </AppButton>
    </aside>

    <BetSheet
      v-model:show="showBetSheet"
      :match-count="store.selectedMatchCount"
      :selection-count="store.selectedSelections.length"
      :available-passes="store.availablePasses"
      :pass-counts="store.passCounts"
      :multiplier="store.multiplier"
      :bet-count="store.betCount"
      :stake-cents="store.stakeCents"
      :prize-min-cents="store.prizeRange.minCents"
      :prize-max-cents="store.prizeRange.maxCents"
      @toggle-pass="store.togglePass"
      @update:multiplier="store.multiplier = $event"
      @save="showSaveSheet = true"
    />

    <SavePlanSheet
      v-model:show="showSaveSheet"
      :tags="store.tags"
      :loading="saving"
      :default-name="store.editingPlanName"
      @save="savePlan"
    />
  </div>
</template>

<style scoped>
.ticket-page {
  padding-bottom: 92px;
}

.ticket-content {
  padding-bottom: var(--space-8);
}

.ticket-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.market-tabs {
  display: flex;
  gap: var(--space-2);
  margin-inline: calc(var(--page-gutter) * -1);
  padding: 2px var(--page-gutter) 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.market-tabs::-webkit-scrollbar {
  display: none;
}

.sync-card__status {
  display: flex;
  align-items: center;
  min-height: 48px;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  color: var(--color-text-secondary);
  background: var(--color-primary-soft);
  font-size: var(--font-size-sm);
}

.sync-card__status--error {
  background: var(--color-accent-soft);
}

.sync-card__status span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-card__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.sync-card__stats div {
  display: grid;
  min-width: 0;
  min-height: 78px;
  padding: var(--space-3) 4px;
  place-items: center;
  align-content: center;
  gap: 4px;
  text-align: center;
}

.sync-card__stats div + div {
  border-left: 1px solid var(--color-divider);
}

.sync-card__stats strong {
  font-size: 23px;
  line-height: 1.1;
}

.sync-card__stats span {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.match-list {
  display: grid;
  gap: var(--space-3);
}

.bet-dock {
  position: fixed;
  z-index: 80;
  right: var(--page-gutter);
  bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom) + 10px);
  left: var(--page-gutter);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  min-height: 72px;
  padding: 10px 12px;
  border-radius: var(--radius-card);
  background: rgb(255 255 255 / 97%);
  box-shadow: var(--outline-strong), var(--shadow-float);
  backdrop-filter: blur(18px);
}

.bet-dock__summary {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: baseline;
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
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 3px;
  margin-top: 4px;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 600px) {
  .bet-dock {
    right: calc(50% - 244px);
    left: calc(50% - 244px);
  }
}

@media (max-width: 374px) {
  .bet-dock {
    grid-template-columns: minmax(0, 1fr) 78px 78px;
    gap: 6px;
  }
}
</style>
