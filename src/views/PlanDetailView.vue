<script setup lang="ts">
import { showFailToast, showSuccessToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import AppBottomSheet from '@/components/base/AppBottomSheet.vue'
import AppCard from '@/components/base/AppCard.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppIconButton from '@/components/base/AppIconButton.vue'
import AppInlineEditor from '@/components/base/AppInlineEditor.vue'
import AppState from '@/components/base/AppState.vue'
import { PLAN_NAME_MAX_LENGTH } from '@/features/plans/planName'
import SubpageHeader from '@/components/base/SubpageHeader.vue'
import PurchaseSheet from '@/components/ticket/PurchaseSheet.vue'
import { confirmAction } from '@/components/base/confirmAction'
import { calculatePrizeRange, enumeratePlanBets, groupSelections } from '@/features/betting/calculator'
import { selectionWins } from '@/features/betting/settlement'
import { usePlanStore } from '@/stores/plans'
import { useTicketStore } from '@/stores/ticket'
import type { MarketCode, PlanSelection } from '@/types/domain'
import { centsToYuan } from '@/utils/money'

const route = useRoute()
const router = useRouter()
const store = usePlanStore()
const ticketStore = useTicketStore()
const planId = computed(() => String(route.params.id ?? ''))
const item = computed(() => store.find(planId.value))
const plan = computed(() => item.value?.plan)
const resultsById = computed(() => new Map(store.results.map((result) => [result.matchId, result])))
const groups = computed(() => (plan.value ? [...groupSelections(plan.value.selections)] : []))
const bets = computed(() => (plan.value ? enumeratePlanBets(plan.value) : []))
const prizeRange = computed(() =>
  plan.value
    ? calculatePrizeRange(plan.value.selections, plan.value.passCounts, plan.value.multiplier)
    : { minCents: 0, maxCents: 0 },
)
const showPurchase = ref(false)
const purchasing = ref(false)
const showMenu = ref(false)
const renaming = ref(false)
const renameValue = ref('')
const showLoad = ref(false)

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

function selectionLabel(selection: PlanSelection): string {
  if (selection.market === 'ttg') return `总进球 ${outcomeLabel(selection)}`
  if (selection.market === 'crs') return `比分 ${outcomeLabel(selection)}`
  if (selection.market === 'hhad') return `让球 ${outcomeLabel(selection)}`
  if (selection.market === 'hafu') return `半全场 ${outcomeLabel(selection)}`
  return `胜平负 ${outcomeLabel(selection)}`
}

function matchTime(matchId: number): string {
  const value = store.matchById.get(matchId)?.matchDateTime || ''
  const match = value.match(/(\d{2}-\d{2})\s+(\d{2}:\d{2})/)
  return match ? `${match[1]} ${match[2]}` : value
}

function selectionStatus(selection: PlanSelection): 'pending' | 'win' | 'loss' {
  const result = resultsById.value.get(selection.matchId)
  if (!result) return 'pending'
  return selectionWins(selection, result) ? 'win' : 'loss'
}

async function purchase(value: { name: string; stakeCents: number; purchasedAt: string; notes: string }): Promise<void> {
  if (!plan.value) return
  purchasing.value = true
  try {
    await store.recordPurchase({ ...plan.value, name: value.name || plan.value.name }, value)
    showPurchase.value = false
    showSuccessToast('购买记录已加入账单')
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  } finally {
    purchasing.value = false
  }
}

function requestLoad(): void {
  if (!plan.value) return
  showMenu.value = false
  if (ticketStore.selectedSelections.length) {
    showLoad.value = true
    return
  }
  store.loadIntoTicket(plan.value)
  router.push('/ticket')
}

async function applyLoad(saveCurrent: boolean): Promise<void> {
  if (!plan.value) return
  try {
    if (saveCurrent) await ticketStore.savePlan()
    store.loadIntoTicket(plan.value)
    showLoad.value = false
    await router.push('/ticket')
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  }
}

function beginRename(): void {
  if (!plan.value) return
  renameValue.value = plan.value.name
  renaming.value = true
  showMenu.value = false
}

async function saveRename(): Promise<void> {
  if (!plan.value || !renameValue.value.trim()) return
  await store.rename(plan.value, renameValue.value)
  renaming.value = false
  showSuccessToast('方案已改名')
}

async function deletePlan(): Promise<void> {
  if (!plan.value) return
  const current = plan.value
  showMenu.value = false
  try {
    await confirmAction({
      title: '删除方案？',
      message: `确定删除“${current.name}”吗？已有购买账单快照不会受到影响。`,
      confirmText: '删除',
      danger: true,
    })
    await store.remove(current.id)
    showSuccessToast('方案已删除')
    await router.replace('/plans')
  } catch {
    // User cancelled.
  }
}
</script>

<template>
  <div class="plan-detail-page" @click="showMenu = false">
    <SubpageHeader title="方案详情">
      <template #action>
        <AppIconButton label="更多方案操作" icon="more" variant="plain" @click.stop="showMenu = !showMenu" />
      </template>
    </SubpageHeader>

    <div v-if="showMenu && plan" class="detail-menu" @click.stop>
      <button type="button" @click="requestLoad"><AppIcon name="edit" :size="20" />继续选号</button>
      <button type="button" @click="beginRename"><AppIcon name="edit" :size="20" />重命名方案</button>
      <button type="button" class="danger" @click="deletePlan"><AppIcon name="delete" :size="20" />删除方案</button>
    </div>

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
        <AppInlineEditor
          v-if="renaming"
          v-model="renameValue"
          label="方案名称"
          :max-length="PLAN_NAME_MAX_LENGTH"
          @save="saveRename"
          @cancel="renaming = false"
        />
        <AppCard v-if="item?.evaluation" class="detail-summary">
          <div><span>比赛</span><strong>{{ item.evaluation.totalMatches }}场</strong></div>
          <div><span>过关</span><strong>{{ plan.passCounts.join('/') }}关</strong></div>
          <div><span>倍数</span><strong>{{ plan.multiplier }}倍</strong></div>
          <div><span>注数</span><strong>{{ bets.length }}注</strong></div>
        </AppCard>

        <section class="detail-section">
          <h2>比赛选项</h2>
          <AppCard class="selection-list" :padded="false">
            <div v-for="[matchId, selections] in groups" :key="matchId" class="selection-card">
              <div class="selection-copy">
                <small>{{ store.matchById.get(matchId)?.matchNum }} · {{ marketLabels[selections[0]!.market] }}</small>
                <h3>{{ store.matchById.get(matchId)?.homeTeam || matchId }} vs {{ store.matchById.get(matchId)?.awayTeam || '未知球队' }}</h3>
                <p>{{ matchTime(matchId) }}</p>
              </div>
              <div class="selection-options">
                <span
                  v-for="selection in selections"
                  :key="selection.key"
                  :class="['selection-option', `selection-option--${selectionStatus(selection)}`]"
                >
                  {{ selectionLabel(selection) }} <b class="numeric">{{ selection.odds }}</b>
                </span>
                <strong v-if="resultsById.get(matchId)" class="score numeric">{{ resultsById.get(matchId)?.fullTimeScore }}</strong>
                <small v-else class="pending-label">待赛果</small>
              </div>
            </div>
          </AppCard>
        </section>

        <button type="button" class="combination-entry" @click="router.push(`/plans/${plan.id}/combinations`)">
          <span>过关组合明细</span><b>{{ bets.length }}注</b><AppIcon name="chevron-right" :size="18" />
        </button>

        <div class="detail-actions">
          <div class="detail-finance">
            <strong>{{ bets.length }}注 · ¥{{ centsToYuan(item?.evaluation?.stakeCents || 0) }}</strong>
            <span>理论奖金 ¥{{ centsToYuan(prizeRange.minCents) }}～¥{{ centsToYuan(prizeRange.maxCents) }}</span>
          </div>
          <AppButton @click="showPurchase = true">记录购买</AppButton>
        </div>
      </template>
    </main>

    <PurchaseSheet
      v-if="plan && item?.evaluation"
      v-model:show="showPurchase"
      :default-name="plan.name"
      :default-stake-cents="item.evaluation.stakeCents"
      :loading="purchasing"
      @confirm="purchase"
    />

    <AppBottomSheet v-model:show="showLoad" :title="`载入“${plan?.name || ''}”`" description="载入后将替换当前临时选票">
      <div class="load-sheet">
        <p>当前选票已有 {{ ticketStore.selectedMatchCount }} 场，载入后将替换当前临时内容。</p>
        <AppButton block @click="applyLoad(true)">保存当前方案后载入</AppButton>
        <AppButton block variant="secondary" @click="applyLoad(false)">放弃当前内容并载入</AppButton>
      </div>
    </AppBottomSheet>
  </div>
</template>

<style scoped>
.plan-detail-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.detail-menu {
  position: fixed;
  z-index: 70;
  top: calc(50px + env(safe-area-inset-top));
  right: var(--page-gutter);
  display: grid;
  width: 174px;
  overflow: hidden;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow:
    var(--outline-default),
    0 10px 28px rgb(52 78 112 / 16%);
}

.detail-menu button {
  display: flex;
  align-items: center;
  min-height: 44px;
  gap: 10px;
  padding: 0 14px;
  border: 0;
  color: var(--color-text);
  background: transparent;
  font-size: 14px;
  text-align: left;
}

.detail-menu button + button {
  border-top: 1px solid var(--color-divider);
}

.detail-menu button:active {
  background: var(--color-surface-soft);
}

.detail-menu .danger {
  color: var(--color-danger);
}

.plan-detail-content {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3) var(--page-gutter) 88px;
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
  gap: 8px;
}

.detail-section h2,
.selection-card h3,
.selection-card p {
  margin: 0;
}

.detail-section h2 {
  font-size: 15px;
}

.detail-section__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-section__heading > span,
.detail-section__heading > button {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.detail-section__heading > button {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  gap: 5px;
  padding: 0 4px;
  border: 0;
  background: transparent;
}

.combination-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 18px;
  align-items: center;
  min-height: 48px;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 13px;
  text-align: left;
}

.combination-entry b {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 500;
}

.selection-list {
  display: grid;
}

.selection-card {
  display: grid;
  grid-template-columns: 52% 48%;
  align-items: center;
  min-height: 76px;
  padding: 8px 10px;
}

.selection-card + .selection-card {
  border-top: 1px solid var(--color-divider);
}

.selection-copy {
  min-width: 0;
}

.selection-card h3 {
  overflow: hidden;
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-copy > small {
  color: var(--color-primary);
  font-size: 11px;
}

.selection-card p {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.score {
  font-size: 13px;
  font-weight: 700;
}

.pending-label {
  color: var(--color-warning);
  font-size: 11px;
}

.selection-options {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  justify-content: stretch;
  flex-wrap: wrap;
  gap: 4px;
  padding-left: 8px;
  border-left: 1px solid var(--color-divider);
}

.selection-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
  padding: 0 7px;
  border-radius: 6px;
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

.detail-actions {
  position: fixed;
  z-index: 40;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(112px, 2fr);
  align-items: center;
  gap: 8px;
  min-height: calc(72px + env(safe-area-inset-bottom));
  padding: 8px var(--page-gutter) calc(8px + env(safe-area-inset-bottom));
  background: rgb(255 255 255 / 96%);
  border-top: 1px solid var(--color-divider);
  box-shadow: 0 -4px 16px rgb(70 112 164 / 6%);
}

.load-sheet {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) var(--page-gutter) calc(var(--space-4) + env(safe-area-inset-bottom));
}

.load-sheet p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.detail-finance {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.detail-finance strong,
.detail-finance span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-finance strong {
  font-size: 13px;
}

.detail-finance span {
  color: var(--color-text-secondary);
  font-size: 11px;
}

@media (min-width: 600px) {
  .detail-actions {
    right: 50%;
    left: 50%;
    width: 520px;
    transform: translateX(-50%);
  }
}

@media (max-width: 359px) {
  .detail-summary {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3) 0;
  }

}
</style>
