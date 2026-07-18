<script setup lang="ts">
import { computed } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import AppCard from '@/components/base/AppCard.vue'
import type { EvaluatedPlan } from '@/stores/plans'
import { centsToYuan } from '@/utils/money'

const props = defineProps<{
  item: EvaluatedPlan
}>()

const emit = defineEmits<{
  detail: []
  load: []
  more: []
}>()

const status = computed(() => {
  const evaluation = props.item.evaluation
  if (!evaluation) return { label: '异常', class: 'error' }
  if (evaluation.status === 'pending') return { label: '进行中', class: 'pending' }
  if ((evaluation.finalProfitCents ?? 0) > 0) return { label: '已盈利', class: 'profit' }
  if ((evaluation.finalProfitCents ?? 0) < 0) return { label: '已亏损', class: 'loss' }
  return { label: '已完成', class: 'settled' }
})
</script>

<template>
  <AppCard class="plan-card">
    <div class="plan-card__top">
      <div class="plan-card__title">
        <h2>{{ item.plan.name }}</h2>
        <p>{{ new Date(item.plan.updatedAt).toLocaleString('zh-CN') }}</p>
      </div>
      <span :class="['plan-status', `plan-status--${status.class}`]">{{ status.label }}</span>
      <button type="button" class="plan-more" aria-label="更多方案操作" @click="emit('more')">
        <van-icon name="ellipsis" size="22" />
      </button>
    </div>

    <div class="plan-card__meta">
      <span>{{ item.evaluation?.totalMatches ?? 0 }} 场</span>
      <span>{{ item.plan.selections.length }} 个选项</span>
      <span>{{ item.plan.passCounts.map((size) => `${size}关`).join('、') || '未选过关' }}</span>
      <span>{{ item.plan.multiplier }} 倍</span>
    </div>

    <div v-if="item.evaluation" class="plan-card__stats">
      <div><span>投注</span><strong class="numeric">¥{{ centsToYuan(item.evaluation.stakeCents) }}</strong></div>
      <div><span>已完成</span><strong class="numeric">{{ item.evaluation.settledMatches }}/{{ item.evaluation.totalMatches }}</strong></div>
      <div><span>猜对</span><strong class="numeric">{{ item.evaluation.correctMatches }}</strong></div>
      <div>
        <span>{{ item.evaluation.status === 'settled' ? '净盈亏' : '当前收益' }}</span>
        <strong
          :class="[
            'numeric',
            (item.evaluation.finalProfitCents ?? item.evaluation.currentProfitCents) >= 0
              ? 'positive'
              : 'negative',
          ]"
        >
          {{ (item.evaluation.finalProfitCents ?? item.evaluation.currentProfitCents) >= 0 ? '+' : '-' }}¥{{
            centsToYuan(Math.abs(item.evaluation.finalProfitCents ?? item.evaluation.currentProfitCents))
          }}
        </strong>
      </div>
    </div>
    <p v-else class="plan-card__error">{{ item.error }}</p>

    <div class="plan-card__footer">
      <div class="plan-tags">
        <span v-for="tag in item.plan.tags" :key="tag">{{ tag }}</span>
        <small v-if="!item.plan.tags.length">无标签</small>
      </div>
      <div class="plan-card__actions">
        <AppButton variant="ghost" size="small" @click="emit('detail')">详情</AppButton>
        <AppButton variant="secondary" size="small" @click="emit('load')">导入编辑</AppButton>
      </div>
    </div>
  </AppCard>
</template>

<style scoped>
.plan-card {
  display: grid;
  gap: var(--space-3);
}

.plan-card__top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 36px;
  align-items: start;
  gap: var(--space-2);
}

.plan-card__title {
  min-width: 0;
}

.plan-card h2,
.plan-card p {
  margin: 0;
}

.plan-card h2 {
  overflow: hidden;
  font-size: 18px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-card__title p {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.plan-status {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
}

.plan-status--pending {
  color: #956f18;
  background: #fff6dc;
}

.plan-status--profit {
  color: var(--color-success);
  background: #eafaf5;
}

.plan-status--loss,
.plan-status--error {
  color: var(--color-danger);
  background: var(--color-accent-soft);
}

.plan-status--settled {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.plan-more {
  display: grid;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  place-items: center;
  color: var(--color-text-secondary);
  background: transparent;
}

.plan-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.plan-card__meta span {
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-soft);
  box-shadow: var(--outline-default);
}

.plan-card__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: var(--space-3) 0;
  border-block: 1px solid var(--color-divider);
}

.plan-card__stats div {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 0 4px;
  text-align: center;
}

.plan-card__stats div + div {
  border-left: 1px solid var(--color-divider);
}

.plan-card__stats span {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.plan-card__stats strong {
  overflow: hidden;
  font-size: 13px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.positive {
  color: var(--color-success);
}

.negative,
.plan-card__error {
  color: var(--color-danger);
}

.plan-card__error {
  font-size: var(--font-size-sm);
}

.plan-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.plan-tags {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 5px;
}

.plan-tags span,
.plan-tags small {
  color: var(--color-primary);
  font-size: 10px;
}

.plan-tags span {
  padding: 3px 7px;
  border-radius: var(--radius-pill);
  background: var(--color-primary-soft);
}

.plan-tags small {
  color: var(--color-text-tertiary);
}

.plan-card__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}
</style>
