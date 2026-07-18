<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import AppCard from '@/components/base/AppCard.vue'
import AppState from '@/components/base/AppState.vue'
import SubpageHeader from '@/components/base/SubpageHeader.vue'
import { enumeratePlanBets, groupSelections } from '@/features/betting/calculator'
import { payoutCents } from '@/features/betting/oddsMath'
import { selectionWins } from '@/features/betting/settlement'
import { usePlanStore } from '@/stores/plans'
import type { MarketCode, PlanSelection } from '@/types/domain'
import { centsToYuan } from '@/utils/money'

const route = useRoute()
const router = useRouter()
const store = usePlanStore()
const planId = computed(() => String(route.params.id ?? ''))
const item = computed(() => store.find(planId.value))
const plan = computed(() => item.value?.plan)
const resultsById = computed(() => new Map(store.results.map((result) => [result.matchId, result])))
const groups = computed(() => (plan.value ? [...groupSelections(plan.value.selections)] : []))
const bets = computed(() => (plan.value ? enumeratePlanBets(plan.value) : []))

const marketLabels: Record<MarketCode, string> = {
  had: '胜平负',
  hhad: '让球胜平负',
  crs: '比分',
  ttg: '总进球',
  hafu: '半全场',
}

onMounted(async () => {
  if (!store.plans.length) await store.load()
})

function outcomeLabel(selection: PlanSelection): string {
  if (selection.market === 'had' || selection.market === 'hhad') {
    return { h: '胜', d: '平', a: '负' }[selection.outcome] ?? selection.outcome
  }
  if (selection.market === 'hafu') {
    const labels: Record<string, string> = { h: '胜', d: '平', a: '负' }
    const [half, full] = selection.outcome.split('-')
    return `${labels[half ?? ''] ?? half}${labels[full ?? ''] ?? full}`
  }
  return selection.outcome
}

function selectionStatus(selection: PlanSelection): 'pending' | 'win' | 'loss' {
  const result = resultsById.value.get(selection.matchId)
  if (!result) return 'pending'
  return selectionWins(selection, result) ? 'win' : 'loss'
}

function betStatus(selections: PlanSelection[]): 'pending' | 'win' | 'loss' {
  const results = selections.map((selection) => resultsById.value.get(selection.matchId))
  if (results.some((result) => !result)) return 'pending'
  return selections.every((selection, index) => {
    const result = results[index]
    return result ? selectionWins(selection, result) : false
  })
    ? 'win'
    : 'loss'
}
</script>

<template>
  <div class="plan-detail-page">
    <SubpageHeader :title="plan?.name || '方案详情'" subtitle="保存时的选项与赔率快照" />

    <main class="plan-detail-content">
      <AppState v-if="store.loading" type="loading" title="正在读取方案" />
      <AppState
        v-else-if="!plan"
        type="error"
        title="方案不存在"
        description="方案可能已被删除"
        action-text="返回方案管理"
        @action="router.replace('/plans')"
      />

      <template v-else>
        <AppCard v-if="item?.evaluation" class="detail-summary">
          <div><span>投注</span><strong class="numeric">¥{{ centsToYuan(item.evaluation.stakeCents) }}</strong></div>
          <div><span>场次</span><strong>{{ item.evaluation.settledMatches }}/{{ item.evaluation.totalMatches }}</strong></div>
          <div><span>猜对</span><strong>{{ item.evaluation.correctMatches }}</strong></div>
          <div>
            <span>当前回款</span>
            <strong class="positive numeric">¥{{ centsToYuan(item.evaluation.currentReturnCents) }}</strong>
          </div>
        </AppCard>

        <section class="detail-section">
          <h2>比赛选项</h2>
          <AppCard v-for="[matchId, selections] in groups" :key="matchId" class="selection-card">
            <header>
              <div>
                <h3>{{ store.matchById.get(matchId)?.homeTeam || matchId }} vs {{ store.matchById.get(matchId)?.awayTeam || '未知球队' }}</h3>
                <p>{{ store.matchById.get(matchId)?.matchNum }} · {{ marketLabels[selections[0]!.market] }}</p>
              </div>
              <span v-if="resultsById.get(matchId)" class="score numeric">{{ resultsById.get(matchId)?.fullTimeScore }}</span>
              <span v-else class="pending-label">待赛果</span>
            </header>
            <div class="selection-options">
              <span
                v-for="selection in selections"
                :key="selection.key"
                :class="['selection-option', `selection-option--${selectionStatus(selection)}`]"
              >
                {{ outcomeLabel(selection) }} <b class="numeric">{{ selection.odds }}</b>
              </span>
            </div>
          </AppCard>
        </section>

        <section class="detail-section">
          <div class="detail-section__heading">
            <h2>组合明细</h2>
            <span>共 {{ bets.length }} 注</span>
          </div>
          <AppCard class="combo-list" :padded="false">
            <div v-for="(bet, index) in bets.slice(0, 200)" :key="index" class="combo-row">
              <span class="combo-index numeric">{{ index + 1 }}</span>
              <div class="combo-copy">
                <strong>{{ bet.passSize }}关 · {{ bet.selections.map(outcomeLabel).join(' × ') }}</strong>
                <small>{{ bet.selections.map((selection) => selection.odds).join(' × ') }}</small>
              </div>
              <span :class="['combo-status', `combo-status--${betStatus(bet.selections)}`]">
                {{ betStatus(bet.selections) === 'win' ? '命中' : betStatus(bet.selections) === 'loss' ? '未中' : '待定' }}
              </span>
              <b class="combo-prize numeric">
                ¥{{ centsToYuan(payoutCents(200 * plan.multiplier, bet.selections.map((selection) => selection.odds))) }}
              </b>
            </div>
            <p v-if="bets.length > 200" class="combo-more">组合较多，当前显示前 200 注</p>
          </AppCard>
        </section>

        <AppButton block variant="secondary" @click="router.push('/plans')">返回方案管理</AppButton>
      </template>
    </main>
  </div>
</template>

<style scoped>
.plan-detail-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.plan-detail-content {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-4) var(--page-gutter) var(--space-8);
}

.detail-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.detail-summary div {
  display: grid;
  min-width: 0;
  gap: 5px;
  padding-inline: 4px;
  text-align: center;
}

.detail-summary div + div {
  border-left: 1px solid var(--color-divider);
}

.detail-summary span {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.detail-summary strong {
  overflow: hidden;
  font-size: 14px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.positive {
  color: var(--color-success);
}

.detail-section {
  display: grid;
  gap: var(--space-3);
}

.detail-section h2,
.selection-card h3,
.selection-card p {
  margin: 0;
}

.detail-section h2 {
  font-size: 18px;
}

.detail-section__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-section__heading span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.selection-card {
  display: grid;
  gap: var(--space-3);
}

.selection-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.selection-card h3 {
  font-size: 15px;
  line-height: 1.35;
}

.selection-card p {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.score {
  font-size: 18px;
  font-weight: 700;
}

.pending-label {
  color: var(--color-warning);
  font-size: 11px;
}

.selection-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.selection-option {
  padding: 6px 10px;
  border-radius: var(--radius-pill);
  color: var(--color-text-secondary);
  background: var(--color-surface-soft);
  box-shadow: var(--outline-default);
  font-size: 11px;
}

.selection-option--win {
  color: var(--color-success);
  background: #eafaf5;
}

.selection-option--loss {
  color: var(--color-danger);
  background: var(--color-accent-soft);
}

.combo-list {
  display: grid;
}

.combo-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto auto;
  align-items: center;
  min-height: 58px;
  gap: var(--space-2);
  padding: 8px var(--space-3);
}

.combo-row + .combo-row {
  border-top: 1px solid var(--color-divider);
}

.combo-index {
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.combo-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.combo-copy strong,
.combo-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combo-copy strong {
  font-size: 12px;
}

.combo-copy small {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.combo-status {
  font-size: 10px;
}

.combo-status--win {
  color: var(--color-success);
}

.combo-status--loss {
  color: var(--color-danger);
}

.combo-status--pending {
  color: var(--color-warning);
}

.combo-prize {
  min-width: 56px;
  font-size: 11px;
  text-align: right;
}

.combo-more {
  margin: 0;
  padding: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
}

@media (max-width: 359px) {
  .detail-summary {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3) 0;
  }

  .combo-row {
    grid-template-columns: 24px minmax(0, 1fr) auto;
  }

  .combo-prize {
    grid-column: 2 / -1;
  }
}
</style>
