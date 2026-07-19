<script setup lang="ts">
import { computed, watch } from 'vue'

import AppBottomSheet from '@/components/base/AppBottomSheet.vue'
import AppButton from '@/components/base/AppButton.vue'
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
    title="回款修改历史"
    close-label="关闭回款修改历史"
    @update:show="emit('update:show', $event)"
  >
    <div v-if="item" class="history-sheet">
      <div class="history-plan">
        <AppIcon name="history" :size="22" />
        <strong>{{ item.order.planName }}</strong>
        <span>· {{ formatDateTime(item.order.purchasedAt) }}</span>
      </div>

      <div class="history-timeline">
        <article v-if="item.status === 'settled'" class="history-entry history-entry--system">
          <div class="history-entry__icon"><AppIcon name="system" :size="20" /></div>
          <div class="history-entry__card">
            <header><strong>系统结算</strong><time>{{ formatDateTime(item.order.updatedAt) }}</time></header>
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

    <template #footer>
      <AppButton variant="secondary" block @click="emit('update:show', false)">关闭</AppButton>
    </template>
  </AppBottomSheet>
</template>

<style scoped>
.history-sheet {
  display: grid;
  gap: 12px;
  padding: 10px var(--page-gutter) 12px;
}

.history-plan {
  display: flex;
  min-height: 46px;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border-radius: var(--radius-card);
  color: var(--color-primary);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.history-plan strong {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-plan span {
  flex: 0 0 auto;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.history-timeline {
  position: relative;
  display: grid;
  gap: 10px;
  padding-left: 36px;
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
  left: -36px;
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
  gap: 8px;
  padding: 10px;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.history-entry__card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--color-divider);
}

.history-entry__card header strong {
  font-size: 14px;
}

.history-entry__card time {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.history-entry__amounts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}

.history-entry__amounts > div {
  display: grid;
  gap: 3px;
}

.history-entry__amounts span,
.history-entry__card p {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.history-entry__amounts b {
  font-size: 14px;
  font-weight: 500;
}

.history-entry__card p {
  display: flex;
  gap: 8px;
  margin: 0;
  padding-top: 7px;
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
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-control);
  color: var(--color-primary);
  background: var(--color-primary-soft);
  font-size: 11px;
}

.amount-positive {
  color: var(--color-success);
}
</style>
