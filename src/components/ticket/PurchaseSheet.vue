<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import AppBottomSheet from '@/components/base/AppBottomSheet.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import { PLAN_NAME_MAX_LENGTH } from '@/features/plans/planName'
import { centsToYuan, yuanToCents } from '@/utils/money'

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

const name = ref('')
const stake = ref('')
const purchasedAt = ref('')
const notes = ref('')
const error = ref('')

const purchasedAtLabel = computed(() => purchasedAt.value.replace('T', ' '))

watch(
  () => props.show,
  (show) => {
    if (!show) return
    name.value = props.defaultName
    stake.value = centsToYuan(props.defaultStakeCents)
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    purchasedAt.value = now.toISOString().slice(0, 16)
    notes.value = ''
    error.value = ''
  },
)

function submit(): void {
  try {
    const stakeCents = yuanToCents(stake.value)
    if (stakeCents <= 0) throw new Error('实际投入必须大于 0')
    const purchasedDate = new Date(purchasedAt.value)
    if (Number.isNaN(purchasedDate.valueOf())) throw new Error('请选择有效的购买时间')
    error.value = ''
    emit('confirm', {
      name: name.value.trim(),
      stakeCents,
      purchasedAt: purchasedDate.toISOString(),
      notes: notes.value.trim(),
    })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}
</script>

<template>
  <AppBottomSheet
    :show="show"
    title="记录购买"
    description="确认后生成独立账单快照，后续修改方案不会影响本次记录。"
    @update:show="emit('update:show', $event)"
  >
    <div class="purchase-sheet__content">
      <van-field
        v-model="name"
        label="本次记录名称"
        :maxlength="PLAN_NAME_MAX_LENGTH"
        show-word-limit
        placeholder="自动生成名称"
      />
      <van-field
        v-model="stake"
        label="实际投入"
        type="number"
        inputmode="decimal"
        suffix="元"
        :error-message="error"
        @update:model-value="error = ''"
      />
      <label class="purchase-date-field">
        <span>购买时间</span>
        <strong class="numeric">{{ purchasedAtLabel }}</strong>
        <AppIcon name="calendar" :size="20" />
        <input
          v-model="purchasedAt"
          type="datetime-local"
          max="9999-12-31T23:59"
          aria-label="购买时间"
        />
      </label>
      <van-field v-model="notes" label="备注" maxlength="80" rows="2" autosize type="textarea" placeholder="可选" />
    </div>
    <template #footer>
      <AppButton block :loading="loading" :disabled="!name.trim()" @click="submit">确认记录购买</AppButton>
    </template>
  </AppBottomSheet>
</template>

<style scoped>
.purchase-sheet__content {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) var(--page-gutter);
}

.purchase-sheet__content :deep(.van-field) {
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
}

.purchase-date-field {
  position: relative;
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 22px;
  align-items: center;
  min-height: 48px;
  padding: 0 16px;
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 14px;
}

.purchase-date-field strong {
  overflow: hidden;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.purchase-date-field input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
</style>
