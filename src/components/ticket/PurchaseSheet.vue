<script setup lang="ts">
import AppButton from '@/components/base/AppButton.vue'
import AppBottomSheet from '@/components/base/AppBottomSheet.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import { centsToYuan } from '@/utils/money'

const props = defineProps<{
  show: boolean
  defaultName: string
  defaultStakeCents: number
  loading: boolean
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  confirm: [value: { name: string; stakeCents: number; purchasedAt: string; notes: string }]
}>()

function submit(): void {
  emit('confirm', {
    name: props.defaultName.trim(),
    stakeCents: props.defaultStakeCents,
    purchasedAt: new Date().toISOString(),
    notes: '',
  })
}
</script>

<template>
  <AppBottomSheet
    :show="show"
    title="确认记录购买"
    description="确认后写入账单，当前方案仍可继续编辑。"
    drag-handle
    @update:show="emit('update:show', $event)"
  >
    <div class="purchase-confirm">
      <section class="purchase-confirm__amount" aria-label="本次投注金额">
        <span class="purchase-confirm__icon"><AppIcon name="check" :size="22" /></span>
        <span>
          <small>本次投注金额</small>
          <strong class="numeric">¥{{ centsToYuan(defaultStakeCents) }}</strong>
        </span>
      </section>

      <div class="purchase-confirm__details">
        <p><span>记录名称</span><strong>{{ defaultName }}</strong></p>
        <p><span>金额说明</span><strong>按当前注数与倍数计算，不可修改</strong></p>
      </div>
    </div>

    <template #footer>
      <AppButton block :loading="loading" :disabled="defaultStakeCents <= 0" @click="submit">
        确认并记入账单
      </AppButton>
    </template>
  </AppBottomSheet>
</template>

<style scoped>
.purchase-confirm {
  display: grid;
  gap: 10px;
  padding: 12px var(--page-gutter);
}

.purchase-confirm__amount {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  min-height: 72px;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  background: #f7fbff;
  box-shadow: var(--outline-default);
}

.purchase-confirm__icon {
  display: grid;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.purchase-confirm__amount > span:last-child {
  display: grid;
  gap: 2px;
}

.purchase-confirm__amount small {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.purchase-confirm__amount strong {
  color: #ff5b67;
  font-size: 20px;
  font-weight: 600;
  line-height: 26px;
}

.purchase-confirm__details {
  overflow: hidden;
  border-radius: 10px;
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.purchase-confirm__details p {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  min-height: 44px;
  gap: 8px;
  margin: 0;
  padding: 6px 10px;
  font-size: 13px;
}

.purchase-confirm__details p + p {
  border-top: 1px solid var(--color-divider);
}

.purchase-confirm__details span {
  color: var(--color-text-secondary);
}

.purchase-confirm__details strong {
  overflow: hidden;
  font-weight: 400;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
