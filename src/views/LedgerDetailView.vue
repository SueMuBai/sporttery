<script setup lang="ts">
import { showSuccessToast } from 'vant'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import AppCard from '@/components/base/AppCard.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppState from '@/components/base/AppState.vue'
import AppInlineEditor from '@/components/base/AppInlineEditor.vue'
import SubpageHeader from '@/components/base/SubpageHeader.vue'
import { groupSelections } from '@/features/betting/calculator'
import { useLedgerStore } from '@/stores/ledger'
import type { MarketCode, PlanSelection } from '@/types/domain'
import { centsToYuan, yuanToCents } from '@/utils/money'

const store = useLedgerStore()
const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id ?? ''))
const item = computed(() => store.find(id.value))
const groups = computed(() =>
  item.value ? [...groupSelections(item.value.order.planSnapshot.selections)] : [],
)
const returnValue = ref('')
const returnError = ref('')
const noteEditing = ref(false)
const noteValue = ref('')
const adjustments = computed(() => store.adjustments[id.value] ?? [])

const marketLabels: Record<MarketCode, string> = {
  had: '胜平负',
  hhad: '让球胜平负',
  crs: '比分',
  ttg: '总进球',
  hafu: '半全场',
}

const previewProfitCents = computed(() => {
  if (!item.value) return 0
  try {
    return yuanToCents(returnValue.value || '0') - item.value.order.stakeCents
  } catch {
    return item.value.profitCents
  }
})

onMounted(async () => {
  if (!store.orders.length) await store.load()
  if (item.value) await store.loadAdjustments(item.value.order.id)
})

watch(
  item,
  (value) => {
    if (value) {
      returnValue.value = centsToYuan(value.displayedReturnCents)
      noteValue.value = value.order.notes
    }
  },
  { immediate: true },
)

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

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

async function saveReturn(): Promise<void> {
  if (!item.value) return
  try {
    const cents = yuanToCents(returnValue.value)
    returnError.value = ''
    await store.updateReturn(item.value, cents)
    await store.loadAdjustments(id.value)
    showSuccessToast('实际回款已保存')
  } catch (reason) {
    returnError.value = reason instanceof Error ? reason.message : String(reason)
  }
}

async function undoReturn(): Promise<void> {
  if (!item.value) return
  try {
    await store.undoLatestReturn(item.value)
    showSuccessToast('已撤销最近一次回款修改')
  } catch (reason) {
    returnError.value = reason instanceof Error ? reason.message : String(reason)
  }
}

async function saveNotes(): Promise<void> {
  if (!item.value) return
  await store.updateNotes(item.value, noteValue.value)
  noteEditing.value = false
  showSuccessToast('账单备注已保存')
}
</script>

<template>
  <div class="subpage ledger-detail-page">
    <SubpageHeader :title="item?.order.planName || '账单详情'" subtitle="购买时的冻结方案快照" />
    <main class="subpage-content ledger-detail-content">
      <AppState v-if="store.loading" type="loading" title="正在读取账单" />
      <AppState
        v-else-if="!item"
        type="error"
        title="账单不存在"
        action-text="返回账单"
        @action="router.replace('/ledger')"
      />
      <template v-else>
        <div class="detail-meta">
          <time>{{ formatDateTime(item.order.purchasedAt) }}</time>
          <span :class="['status-pill', `status-pill--${item.status}`]">{{ item.status === 'settled' ? '已完成' : '进行中' }}</span>
        </div>

        <AppCard class="detail-summary" :padded="false">
          <div><span>实际投入</span><strong>¥{{ centsToYuan(item.order.stakeCents) }}</strong></div>
          <div><span>{{ item.status === 'settled' ? (item.order.returnManual ? '实际回款' : '理论回款') : '当前已结算回款' }}</span><strong class="amount-positive">¥{{ centsToYuan(item.displayedReturnCents) }}</strong></div>
          <div><span>当前盈亏</span><strong :class="item.profitCents >= 0 ? 'amount-positive' : 'amount-negative'">{{ item.profitCents >= 0 ? '+' : '-' }}¥{{ centsToYuan(Math.abs(item.profitCents)) }}</strong></div>
        </AppCard>

        <div v-if="item.order.returnManual" class="manual-return-reference">
          <div>
            <strong>手工调整</strong>
            <span>当前显示用户填写的实际到账金额</span>
          </div>
          <p>
            理论回款 <b class="numeric">¥{{ centsToYuan(item.automaticReturnCents) }}</b>
            · 调整差额
            <b :class="item.displayedReturnCents - item.automaticReturnCents >= 0 ? 'amount-positive' : 'amount-negative'">
              {{ item.displayedReturnCents - item.automaticReturnCents >= 0 ? '+' : '-' }}¥{{ centsToYuan(Math.abs(item.displayedReturnCents - item.automaticReturnCents)) }}
            </b>
          </p>
        </div>

        <div class="progress-banner">
          已完成 {{ item.evaluation.settledMatches }}/{{ item.evaluation.totalMatches }} 场 · 猜对 {{ item.evaluation.correctMatches }} 场
        </div>

        <section class="snapshot-section">
          <h2>方案快照</h2>
          <AppCard class="snapshot-list" :padded="false">
            <div v-for="[matchId, selections] in groups" :key="matchId" class="snapshot-row">
              <div>
                <strong>{{ store.matchById.get(matchId)?.homeTeam || matchId }} vs {{ store.matchById.get(matchId)?.awayTeam || '未知球队' }}</strong>
                <small>{{ store.matchById.get(matchId)?.matchNum }} · {{ marketLabels[selections[0]!.market] }}</small>
              </div>
              <p>{{ selections.map((selection) => `${outcomeLabel(selection)} ${selection.odds}`).join('、') }}</p>
            </div>
          </AppCard>
        </section>

        <AppCard class="notes-card">
          <div class="notes-card__heading">
            <span>账单备注</span>
            <button v-if="!noteEditing" type="button" @click="noteEditing = true">编辑</button>
          </div>
          <template v-if="noteEditing">
            <AppInlineEditor
              v-model="noteValue"
              multiline
              allow-empty
              :max-length="120"
              :loading="store.saving"
              placeholder="记录购买渠道、核对信息等（可选）"
              @save="saveNotes"
              @cancel="noteValue = item.order.notes; noteEditing = false"
            />
          </template>
          <p v-else>{{ item.order.notes || '暂无备注' }}</p>
        </AppCard>

        <section v-if="item.status === 'settled'" class="return-editor">
          <div>
            <h2>实际回款</h2>
            <p>全部比赛已完成，可直接填写实际到账金额。</p>
          </div>
          <van-field
            v-model="returnValue"
            type="number"
            inputmode="decimal"
            label="¥"
            placeholder="0.00"
            :error-message="returnError"
            @update:model-value="returnError = ''"
          />
          <p>修改后实际盈亏：<strong :class="previewProfitCents >= 0 ? 'amount-positive' : 'amount-negative'">{{ previewProfitCents >= 0 ? '+' : '-' }}¥{{ centsToYuan(Math.abs(previewProfitCents)) }}</strong></p>
          <AppButton block :loading="store.saving" @click="saveReturn">保存实际回款</AppButton>
        </section>
        <section v-if="adjustments.length" class="adjustment-history">
          <div class="adjustment-heading">
            <h2>回款修改记录</h2>
            <button type="button" :disabled="store.saving" @click="undoReturn">撤销最近一次</button>
          </div>
          <div v-for="adjustment in adjustments" :key="adjustment.id" class="adjustment-row">
            <time>{{ formatDateTime(adjustment.occurredAt) }}</time>
            <span>¥{{ centsToYuan(adjustment.previousReturnCents) }} → ¥{{ centsToYuan(adjustment.nextReturnCents) }}</span>
          </div>
        </section>
        <div v-if="item.status === 'pending'" class="pending-banner">
          <AppIcon name="info" :size="18" />
          <span>比赛全部完成后可填写实际回款；当前金额按已结算组合计算。</span>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.ledger-detail-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.ledger-detail-content {
  display: grid;
  gap: 12px;
  padding: 12px var(--page-gutter) var(--space-8);
}

.detail-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.detail-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.detail-summary div {
  display: grid;
  min-width: 0;
  gap: 5px;
  padding: 10px 6px;
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
  font-size: 15px;
}

.progress-banner,
.pending-banner {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-control);
  color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: var(--outline-default);
  font-size: var(--font-size-sm);
  text-align: center;
}

.pending-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.manual-return-reference {
  display: grid;
  gap: 6px;
  padding: 10px var(--space-4);
  border-radius: var(--radius-control);
  background: rgb(232 170 50 / 12%);
  box-shadow: var(--outline-default);
}

.manual-return-reference > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.manual-return-reference strong {
  color: var(--color-warning);
  font-size: var(--font-size-sm);
}

.manual-return-reference span,
.manual-return-reference p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manual-return-reference p {
  line-height: 1.5;
}

.snapshot-section {
  display: grid;
  gap: 8px;
}

.snapshot-section h2,
.return-editor h2 {
  margin: 0;
  font-size: 15px;
}

.snapshot-list {
  display: grid;
}

.snapshot-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-height: 54px;
  gap: 8px;
  padding: 8px 10px;
}

.snapshot-row + .snapshot-row {
  border-top: 1px solid var(--color-divider);
}

.snapshot-row div {
  display: grid;
  gap: 3px;
}

.snapshot-row small {
  color: var(--color-text-secondary);
}

.snapshot-row p,
.notes-card p,
.return-editor p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.snapshot-row p {
  max-width: 132px;
  color: var(--color-accent);
  text-align: right;
}

.notes-card span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.notes-card {
  display: grid;
  gap: var(--space-2);
}

.notes-card__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.notes-card__heading > button {
  min-width: 44px;
  min-height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-xs);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}


.return-editor {
  display: grid;
  gap: var(--space-3);
  padding: 10px;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.adjustment-history {
  overflow: hidden;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.adjustment-heading,
.adjustment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  gap: 8px;
  padding: 0 10px;
}

.adjustment-heading h2 {
  margin: 0;
  font-size: 15px;
}

.adjustment-heading button {
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 12px;
}

.adjustment-row {
  border-top: 1px solid var(--color-divider);
  color: var(--color-text-secondary);
  font-size: 11px;
}

.return-editor :deep(.van-field) {
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
}

.amount-positive {
  color: var(--color-success);
}

.amount-negative {
  color: var(--color-danger);
}
</style>
