<script setup lang="ts">
import { showSuccessToast } from 'vant'
import { computed, ref, watch } from 'vue'

import AppBottomSheet from '@/components/base/AppBottomSheet.vue'
import AppButton from '@/components/base/AppButton.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import LedgerHistorySheet from '@/components/ledger/LedgerHistorySheet.vue'
import { groupSelections } from '@/features/betting/calculator'
import { useLedgerStore, type EvaluatedLedgerOrder } from '@/stores/ledger'
import type { MarketCode, PlanSelection, SavedPlan } from '@/types/domain'
import { centsToYuan, yuanToCents } from '@/utils/money'

const props = defineProps<{
  show: boolean
  item?: EvaluatedLedgerOrder
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  'continue-edit': [plan: SavedPlan]
}>()

const store = useLedgerStore()
const expanded = ref(false)
const showHistory = ref(false)
const returnValue = ref('')
const returnError = ref('')

const marketLabels: Record<MarketCode, string> = {
  had: '胜平负',
  hhad: '让球胜平负',
  crs: '比分',
  ttg: '总进球',
  hafu: '半全场',
}

const groups = computed(() =>
  props.item
    ? [...groupSelections(props.item.order.planSnapshot.selections)]
    : [],
)
const visibleGroups = computed(() =>
  expanded.value ? groups.value : groups.value.slice(0, 5),
)
const remainingGroups = computed(() =>
  Math.max(0, groups.value.length - visibleGroups.value.length),
)
const previewProfitCents = computed(() => {
  if (!props.item) return 0
  try {
    return yuanToCents(returnValue.value || '0') - props.item.order.stakeCents
  } catch {
    return props.item.profitCents
  }
})

watch(
  () => [props.show, props.item?.order.id] as const,
  ([show]) => {
    if (!show || !props.item) return
    expanded.value = false
    returnValue.value = centsToYuan(props.item.displayedReturnCents)
    returnError.value = ''
  },
  { immediate: true },
)

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 19)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
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

function formatMatchDateTime(value?: string): string {
  if (!value) return '时间待定'
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value.slice(5, 16).replace('-', '/')
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function continueEditing(): void {
  if (!props.item) return
  emit('continue-edit', props.item.order.planSnapshot)
  emit('update:show', false)
}

function closeSheet(): void {
  if (props.item) returnValue.value = centsToYuan(props.item.displayedReturnCents)
  returnError.value = ''
  emit('update:show', false)
}

function handleVisibility(show: boolean): void {
  if (show) emit('update:show', true)
  else closeSheet()
}

async function saveReturn(): Promise<void> {
  if (!props.item) return
  try {
    returnError.value = ''
    const cents = yuanToCents(returnValue.value)
    if (cents > 99_999_999) throw new RangeError('回款金额不能超过 999999.99 元')
    if (cents === props.item.displayedReturnCents) {
      showSuccessToast('回款金额未变化')
      emit('update:show', false)
      return
    }
    await store.updateReturn(props.item, cents)
    await store.loadAdjustments(props.item.order.id)
    showSuccessToast('实际回款已保存')
    emit('update:show', false)
  } catch (reason) {
    returnError.value = reason instanceof Error ? reason.message : String(reason)
  }
}
</script>

<template>
  <AppBottomSheet
    :show="show"
    title="方案详情"
    close-label="关闭方案详情"
    @update:show="handleVisibility"
  >
    <div v-if="item" class="ledger-detail-sheet">
      <section class="detail-identity">
        <div class="detail-identity__title">
          <div>
            <h3>{{ item.order.planName }}</h3>
            <span :class="['status-pill', `status-pill--${item.status}`]">
              {{ item.status === 'settled' ? '已完成' : '进行中' }}
            </span>
          </div>
          <time>{{ formatDateTime(item.order.purchasedAt) }}</time>
        </div>
      </section>

      <section class="finance-summary" aria-label="账单金额汇总">
        <div>
          <span>投注</span>
          <strong class="numeric">¥{{ centsToYuan(item.order.stakeCents) }}</strong>
        </div>
        <div>
          <span>回款</span>
          <strong :class="['numeric', item.displayedReturnCents > 0 ? 'amount-positive' : 'amount-muted']">
            ¥{{ centsToYuan(item.displayedReturnCents) }}
          </strong>
        </div>
        <div>
          <span>净盈亏</span>
          <strong :class="['numeric', item.profitCents > 0 ? 'amount-positive' : 'amount-negative']">
            {{ item.profitCents > 0 ? '+' : item.profitCents < 0 ? '-' : '' }}¥{{ centsToYuan(Math.abs(item.profitCents)) }}
          </strong>
        </div>
      </section>

      <section v-if="item.status === 'settled'" class="return-editor">
        <div class="return-editor__heading">
          <div>
            <h3>回款金额</h3>
            <button type="button" @click="showHistory = true">修改历史</button>
          </div>
        </div>
        <van-field
          v-model="returnValue"
          type="number"
          inputmode="decimal"
          label="¥"
          placeholder="0.00"
          clearable
          :error-message="returnError"
          @update:model-value="returnError = ''"
        />
        <p class="return-editor__help">金额范围 0.00～999999.99，最多保留两位小数</p>
        <div class="return-preview">
          <span>修改后净盈亏</span>
          <strong :class="previewProfitCents >= 0 ? 'amount-positive' : 'amount-negative'">
            {{ previewProfitCents >= 0 ? '+' : '-' }}¥{{ centsToYuan(Math.abs(previewProfitCents)) }}
          </strong>
        </div>
      </section>

      <section class="detail-section">
        <div class="match-list">
          <div v-for="[matchId, selections] in visibleGroups" :key="matchId" class="match-row">
            <div class="match-row__meta">
              <strong>{{ store.matchById.get(matchId)?.matchNum || matchId }}</strong>
              <span>{{ formatMatchDateTime(store.matchById.get(matchId)?.matchDateTime) }}</span>
            </div>
            <div class="match-row__copy">
              <strong>
                {{ store.matchById.get(matchId)?.homeTeam || '未知球队' }}
                <em>vs</em>
                {{ store.matchById.get(matchId)?.awayTeam || '未知球队' }}
              </strong>
              <small>{{ store.matchById.get(matchId)?.payload.league || '联赛待定' }}</small>
            </div>
            <div class="match-row__selections">
              <small>{{ marketLabels[selections[0]!.market] }}</small>
              <span v-for="selection in selections" :key="selection.key" class="selection-pill">
                {{ outcomeLabel(selection) }} <b class="numeric">({{ selection.odds }})</b>
              </span>
            </div>
          </div>
          <button
            v-if="groups.length > 5"
            type="button"
            class="match-list__expand"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
          >
            {{ expanded ? '收起方案内容' : `查看其余${remainingGroups}场` }}
            <AppIcon :name="expanded ? 'chevron-up' : 'chevron-down'" :size="16" />
          </button>
        </div>
      </section>

      <div v-if="item.status === 'pending'" class="pending-banner">
        <AppIcon name="info" :size="18" />
        <span>方案进行中，比赛完成后可录入实际回款金额</span>
      </div>
    </div>

    <template #footer>
      <div v-if="item?.status === 'settled'" class="sheet-actions">
        <AppButton variant="secondary" block @click="closeSheet">取消</AppButton>
        <AppButton block :loading="store.saving" @click="saveReturn">保存修改</AppButton>
      </div>
      <div v-else class="sheet-actions">
        <AppButton variant="secondary" block @click="showHistory = true">查看购买记录</AppButton>
        <AppButton block @click="continueEditing">继续编辑</AppButton>
      </div>
    </template>
  </AppBottomSheet>

  <LedgerHistorySheet
    v-model:show="showHistory"
    :item="item"
  />
</template>

<style scoped>
.ledger-detail-sheet {
  display: grid;
  gap: 12px;
  margin: 10px var(--page-gutter) 12px;
  padding: 10px;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.detail-identity {
  padding: 0 2px;
}

.detail-identity__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.detail-identity__title > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.detail-identity__title time {
  flex: 0 0 auto;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.detail-identity h3,
.detail-identity p,
.detail-section h3,
.return-editor h3 {
  margin: 0;
}

.detail-identity h3 {
  overflow: hidden;
  color: var(--color-primary-strong);
  font-size: 16px;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  font-size: 10px;
  font-weight: 600;
}

.status-pill--pending {
  color: var(--color-primary-strong);
  background: var(--color-primary-soft);
  box-shadow: inset 0 0 0 1px rgb(87 151 245 / 22%);
}

.status-pill--settled {
  color: var(--color-success);
  background: rgb(97 214 191 / 14%);
  box-shadow: inset 0 0 0 1px rgb(97 214 191 / 24%);
}

.finance-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 9px 0;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default), var(--shadow-card);
}

.finance-summary > div {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 0 6px;
  text-align: center;
}

.finance-summary > div + div {
  border-left: 1px solid var(--color-divider);
}

.finance-summary span {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.finance-summary strong {
  overflow: hidden;
  font-size: 15px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.return-editor {
  display: grid;
  gap: 8px;
}

.return-editor__heading > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.return-editor h3,
.detail-section h3 {
  font-size: 15px;
  line-height: 21px;
}

.return-editor__heading button {
  min-height: 36px;
  padding: 0 4px 0 10px;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 11px;
}

.return-editor :deep(.van-field) {
  min-height: 40px;
  border-radius: var(--radius-control);
  box-shadow: var(--outline-primary);
}

.return-editor__help {
  margin: -3px 0 0;
  color: var(--color-text-secondary);
  font-size: 10px;
}

.return-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 0 10px;
  border-radius: var(--radius-control);
  color: var(--color-text-secondary);
  background: var(--color-surface-soft);
  box-shadow: var(--outline-default);
  font-size: 12px;
}

.detail-section {
  display: grid;
  gap: 8px;
}

.match-list {
  overflow: hidden;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.match-row {
  display: grid;
  grid-template-columns: minmax(0, 25fr) minmax(0, 48fr) minmax(0, 27fr);
  align-items: center;
  min-height: 62px;
  gap: 8px;
  padding: 7px 8px;
}

.match-row + .match-row {
  border-top: 1px solid var(--color-divider);
}

.match-row__meta,
.match-row__copy,
.match-row__selections {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.match-row__meta span,
.match-row__copy small {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.match-row__meta strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-row__copy strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  line-height: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-row__copy em {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-style: normal;
  font-weight: 400;
}

.match-row__selections {
  justify-items: end;
}

.match-row__selections > small {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.selection-pill {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: var(--color-accent-strong);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-pill b {
  font-weight: 500;
}

.match-list__expand {
  display: flex;
  width: 100%;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 10px;
  border: 0;
  border-top: 1px solid var(--color-divider);
  color: var(--color-primary);
  background: var(--color-surface);
  font-size: 13px;
}

.pending-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-control);
  color: #956f18;
  background: #fff8e6;
  box-shadow: inset 0 0 0 1px rgb(232 170 50 / 28%);
  font-size: 12px;
  text-align: center;
}

.sheet-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.amount-positive {
  color: var(--color-success);
}

.amount-negative {
  color: var(--color-danger);
}

.amount-muted {
  color: var(--color-placeholder);
}

@media (max-width: 359px) {
  .finance-summary strong {
    font-size: 13px;
  }

  .match-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
  }

  .match-row__selections {
    grid-column: 1 / -1;
    justify-items: start;
  }
}
</style>
