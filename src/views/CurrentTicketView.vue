<script setup lang="ts">
import { showFailToast, showSuccessToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import AppCard from '@/components/base/AppCard.vue'
import AppChip from '@/components/base/AppChip.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppState from '@/components/base/AppState.vue'
import SubpageHeader from '@/components/base/SubpageHeader.vue'
import PurchaseSheet from '@/components/ticket/PurchaseSheet.vue'
import { groupSelections } from '@/features/betting/calculator'
import { useTicketStore } from '@/stores/ticket'
import type { MarketCode, PlanSelection } from '@/types/domain'
import { centsToYuan } from '@/utils/money'

const store = useTicketStore()
const router = useRouter()
const saving = ref(false)
const showPurchase = ref(false)

const groups = computed(() => [...groupSelections(store.selectedSelections)])
const matches = computed(() => new Map(store.matches.map((match) => [match.matchId, match])))

const marketLabels: Record<MarketCode, string> = {
  had: '胜平负',
  hhad: '让球胜平负',
  crs: '比分',
  ttg: '总进球',
  hafu: '半全场',
}

onMounted(() => store.initialize())

function outcomeLabel(selection: PlanSelection): string {
  if (selection.market === 'had' || selection.market === 'hhad') {
    return { h: '胜', d: '平', a: '负' }[selection.outcome] ?? selection.outcome
  }
  if (selection.market === 'hafu') {
    const label: Record<string, string> = { h: '胜', d: '平', a: '负' }
    const [half, full] = selection.outcome.split('-')
    return `${label[half ?? ''] ?? half}${label[full ?? ''] ?? full}`
  }
  return selection.outcome
}

async function save(): Promise<void> {
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
    await router.replace('/ledger')
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="subpage current-ticket-page">
    <SubpageHeader title="当前选择" :subtitle="`${store.selectedMatchCount} 场 · ${store.selectedSelections.length} 个选项`" />

    <main class="subpage-content current-ticket-content">
      <AppState
        v-if="!store.selectedSelections.length"
        type="empty"
        title="当前没有选择"
        description="返回选票选择比赛后，再查看投注明细"
        action-text="返回选票"
        @action="router.replace('/ticket')"
      />

      <template v-else>
        <AppCard class="ticket-finance">
          <div><span>场次</span><strong>{{ store.selectedMatchCount }}</strong></div>
          <div><span>注数</span><strong>{{ store.betCount }}</strong></div>
          <div><span>投入</span><strong class="numeric">¥{{ centsToYuan(store.stakeCents) }}</strong></div>
          <p>理论奖金 <b class="numeric">¥{{ centsToYuan(store.prizeRange.minCents) }} ~ {{ centsToYuan(store.prizeRange.maxCents) }}</b></p>
        </AppCard>

        <section class="ticket-config">
          <h2>过关方式</h2>
          <div class="pass-options">
            <AppChip
              v-for="size in store.availablePasses"
              :key="size"
              :selected="store.passCounts.includes(size)"
              @click="store.togglePass(size)"
            >
              {{ size }}关
            </AppChip>
          </div>
          <div class="multiplier-row">
            <span>投注倍数</span>
            <van-stepper v-model="store.multiplier" integer :min="1" :max="9999" />
          </div>
        </section>

        <section class="selection-section">
          <h2>比赛选择</h2>
          <AppCard class="current-selection-list" :padded="false">
            <div v-for="[matchId, selections] in groups" :key="matchId" class="current-selection-card">
              <header>
                <div>
                  <small>{{ matches.get(matchId)?.matchNum }}</small>
                  <h3>{{ matches.get(matchId)?.homeTeam }} vs {{ matches.get(matchId)?.awayTeam }}</h3>
                </div>
                <span>{{ marketLabels[selections[0]!.market] }}</span>
              </header>
              <div class="current-options">
                <button
                  v-for="selection in selections"
                  :key="selection.key"
                  type="button"
                  :aria-label="`删除 ${outcomeLabel(selection)} ${selection.odds}`"
                  @click="store.toggleSelection(selection)"
                >
                  {{ outcomeLabel(selection) }} <b class="numeric">{{ selection.odds }}</b>
                  <AppIcon name="close" :size="14" />
                </button>
              </div>
            </div>
          </AppCard>
        </section>

        <div class="current-actions">
          <AppButton block variant="secondary" :loading="saving" :disabled="!store.canSavePlan" @click="save">
            {{ store.editingPlanId ? '保存修改' : '保存方案' }}
          </AppButton>
          <AppButton block :disabled="!store.betCount" @click="showPurchase = true">记录购买</AppButton>
        </div>
      </template>
    </main>

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
.current-ticket-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.current-ticket-content {
  display: grid;
  gap: 12px;
  padding: 12px var(--page-gutter) calc(84px + env(safe-area-inset-bottom));
}

.ticket-finance {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.ticket-finance div {
  display: grid;
  gap: 3px;
  text-align: center;
}

.ticket-finance span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.ticket-finance strong {
  font-size: 16px;
}

.ticket-finance p {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid var(--color-divider);
  color: var(--color-text-secondary);
  text-align: center;
}

.ticket-finance b {
  color: var(--color-accent-strong);
}

.ticket-config,
.selection-section {
  display: grid;
  gap: 8px;
}

.ticket-config h2,
.selection-section h2 {
  margin: 0 4px;
  font-size: 15px;
}

.pass-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
}

.pass-options .app-chip {
  width: 100%;
}

.multiplier-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 0 10px;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.current-selection-list {
  display: grid;
}

.current-selection-card {
  display: grid;
  gap: 6px;
  padding: 8px 10px;
}

.current-selection-card + .current-selection-card {
  border-top: 1px solid var(--color-divider);
}

.current-selection-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.current-selection-card h3,
.current-selection-card small {
  margin: 0;
}

.current-selection-card h3 {
  margin-top: 2px;
  font-size: 13px;
}

.current-selection-card small,
.current-selection-card header > span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.current-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.current-options button {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  gap: 5px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-pill);
  color: var(--color-accent-strong);
  background: var(--color-accent-soft);
  box-shadow: var(--outline-accent);
}

.current-actions {
  position: fixed;
  z-index: 40;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 8px var(--page-gutter) calc(8px + env(safe-area-inset-bottom));
  background: rgb(255 255 255 / 96%);
  border-top: 1px solid var(--color-divider);
}
</style>
