<script setup lang="ts">
import { computed, watch } from 'vue'

import billIcon from '@/assets/icons/navigation/ic_nav_bill_selected.svg?url'
import AppBottomSheet from '@/components/base/AppBottomSheet.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import { useLedgerStore, type EvaluatedLedgerOrder } from '@/stores/ledger'
import { centsToYuan } from '@/utils/money'

const props = defineProps<{
  show: boolean
  item?: EvaluatedLedgerOrder
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const store = useLedgerStore()
const adjustments = computed(() =>
  props.item ? (store.adjustments[props.item.order.id] ?? []) : [],
)
const systemSettlementAt = computed(() => {
  if (!props.item) return ''
  const matchIds = new Set(
    props.item.order.planSnapshot.selections.map((selection) => selection.matchId),
  )
  const fetchedTimes = store.results
    .filter((result) => matchIds.has(result.matchId))
    .map((result) => result.fetchedAt)
    .filter(Boolean)
    .sort()
  return fetchedTimes.at(-1) ?? props.item.order.createdAt
})

watch(
  () => [props.show, props.item?.order.id] as const,
  ([show]) => {
    if (show && props.item) void store.loadAdjustments(props.item.order.id)
  },
  { immediate: true },
)

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 16)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
</script>

<template>
  <AppBottomSheet
    :show="show"
    class="ledger-history-sheet"
    title="回款修改历史"
    close-label="关闭回款修改历史"
    @update:show="emit('update:show', $event)"
  >
    <div v-if="item" class="history-sheet">
      <div class="history-plan">
        <img :src="billIcon" alt="" />
        <strong>{{ item.order.planName }}</strong>
        <span>· {{ formatDateTime(item.order.purchasedAt) }}</span>
      </div>

      <div class="history-timeline">
        <article v-if="item.status === 'settled'" class="history-entry history-entry--system">
          <div class="history-entry__icon"><AppIcon name="monitor" :size="18" /></div>
          <div class="history-entry__card">
            <header><strong>系统结算</strong><time>{{ formatDateTime(systemSettlementAt) }}</time></header>
            <div class="history-entry__amounts">
              <div><span>旧回款</span><b>¥0.00</b></div>
              <AppIcon name="chevron-right" :size="18" />
              <div><span>新回款</span><b class="amount-positive">¥{{ centsToYuan(item.automaticReturnCents) }}</b></div>
            </div>
          </div>
        </article>

        <article v-for="adjustment in adjustments" :key="adjustment.id" class="history-entry">
          <div class="history-entry__icon"><AppIcon name="edit" :size="20" /></div>
          <div class="history-entry__card">
            <header><strong>手动修改</strong><time>{{ formatDateTime(adjustment.occurredAt) }}</time></header>
            <div class="history-entry__amounts">
              <div><span>旧回款</span><b>¥{{ centsToYuan(adjustment.previousReturnCents) }}</b></div>
              <AppIcon name="chevron-right" :size="18" />
              <div><span>新回款</span><b class="amount-positive">¥{{ centsToYuan(adjustment.nextReturnCents) }}</b></div>
            </div>
            <p><span>修改备注</span>{{ adjustment.note }}</p>
          </div>
        </article>

        <div v-if="item.status === 'pending' && !adjustments.length" class="history-empty">
          暂无回款修改记录
        </div>
      </div>

      <div class="history-note">
        <AppIcon name="info" :size="18" />
        <span>修改记录仅用于追溯，不影响原始投注数据</span>
      </div>
    </div>
  </AppBottomSheet>
</template>

<style scoped>
.history-sheet {
  display: grid;
  gap: 12px;
  min-height: calc(100dvh - 44px - env(safe-area-inset-top));
  align-content: start;
  padding: 12px var(--page-gutter) calc(18px + env(safe-area-inset-bottom));
  background: var(--color-page);
}

.ledger-history-sheet {
  height: 100dvh;
  max-height: 100dvh;
  border-radius: 0;
}

.ledger-history-sheet :deep(.app-bottom-sheet__panel) {
  height: 100dvh;
  max-height: 100dvh;
}

.ledger-history-sheet :deep(.app-bottom-sheet__header) {
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  min-height: calc(44px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 14px 0;
  color: var(--color-text);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}

.ledger-history-sheet :deep(.app-bottom-sheet__header > div) {
  grid-column: 2;
  text-align: center;
}

.ledger-history-sheet :deep(.app-bottom-sheet__header h2) {
  font-size: 17px;
  font-weight: 600;
}

.ledger-history-sheet :deep(.app-bottom-sheet__close) {
  position: relative;
  grid-row: 1;
  grid-column: 1;
  color: var(--color-text);
}

.ledger-history-sheet :deep(.app-bottom-sheet__close .app-icon) {
  display: none;
}

.ledger-history-sheet :deep(.app-bottom-sheet__close::after) {
  width: 12px;
  height: 12px;
  border-bottom: 2px solid currentcolor;
  border-left: 2px solid currentcolor;
  content: "";
  transform: rotate(45deg);
}

.history-plan {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border-radius: var(--radius-card);
  color: var(--color-primary);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.history-plan img {
  width: 24px;
  height: 24px;
}

.history-plan strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-plan span {
  flex: 0 0 auto;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.history-timeline {
  position: relative;
  display: grid;
  gap: 10px;
  padding-left: 40px;
}

.history-timeline::before {
  position: absolute;
  top: 22px;
  bottom: 22px;
  left: 17px;
  width: 1px;
  background: var(--color-border);
  content: "";
}

.history-entry {
  position: relative;
}

.history-entry__icon {
  position: absolute;
  z-index: 1;
  top: 12px;
  left: -40px;
  display: grid;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  place-items: center;
  color: #fff;
  background: var(--color-primary);
}

.history-entry--system .history-entry__icon {
  background: var(--color-mint);
}

.history-entry__card {
  display: grid;
  gap: 10px;
  min-height: 106px;
  padding: 12px;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.history-entry__card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-divider);
}

.history-entry__card header strong {
  font-size: 15px;
}

.history-entry__card time {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.history-entry__amounts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.history-entry__amounts > div {
  display: grid;
  gap: 3px;
}

.history-entry__amounts span,
.history-entry__card p {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.history-entry__amounts b {
  font-size: 15px;
  font-weight: 500;
}

.history-entry__card p {
  display: flex;
  gap: 8px;
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid var(--color-divider);
}

.history-entry__card p span {
  color: var(--color-primary);
}

.history-empty {
  padding: 28px 12px;
  border-radius: var(--radius-card);
  color: var(--color-text-secondary);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 13px;
  text-align: center;
}

.history-note {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-control);
  color: var(--color-primary);
  background: var(--color-primary-soft);
  font-size: 12px;
}

.amount-positive {
  color: var(--color-success);
}
</style>
