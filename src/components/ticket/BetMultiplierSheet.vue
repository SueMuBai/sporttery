<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import AppIcon from '@/components/base/AppIcon.vue'
import { centsToYuan } from '@/utils/money'

const props = withDefaults(
  defineProps<{
    show: boolean
    multiplier: number
    betCount: number
    stakeCents: number
    saving?: boolean
    canSave?: boolean
    canPurchase?: boolean
  }>(),
  {
    saving: false,
    canSave: false,
    canPurchase: false,
  },
)

const emit = defineEmits<{
  'update:show': [show: boolean]
  'update:multiplier': [multiplier: number]
  save: []
  purchase: []
}>()

const quickMultipliers = [1, 2, 5, 10, 20, 50, 100] as const
const draft = ref('1')
const originalMultiplier = ref(1)
const inputRef = ref<HTMLInputElement>()
const replaceOnNextInput = ref(false)
let committedClose = false

function normalized(value: string | number): number {
  const parsed = Math.trunc(Number(value))
  return Number.isFinite(parsed) ? Math.min(9999, Math.max(1, parsed)) : 1
}

function updateDraft(value: string): void {
  draft.value = value.replace(/\D/g, '').slice(0, 4)
  if (draft.value) emit('update:multiplier', normalized(draft.value))
}

function chooseMultiplier(value: number): void {
  draft.value = String(value)
  replaceOnNextInput.value = false
  emit('update:multiplier', value)
}

function clearDraft(): void {
  draft.value = ''
  replaceOnNextInput.value = false
  emit('update:multiplier', 1)
}

function inputDigit(value: string): void {
  const nextValue = replaceOnNextInput.value
    ? value
    : draft.value === '0'
      ? value
      : `${draft.value}${value}`
  replaceOnNextInput.value = false
  updateDraft(nextValue)
}

function deleteDigit(): void {
  replaceOnNextInput.value = false
  draft.value = draft.value.slice(0, -1)
  emit('update:multiplier', normalized(draft.value))
}

function closeCommitted(): void {
  emit('update:multiplier', normalized(draft.value))
  committedClose = true
  emit('update:show', false)
  void nextTick(() => {
    committedClose = false
  })
}

function cancel(): void {
  emit('update:multiplier', originalMultiplier.value)
  emit('update:show', false)
}

function handleVisibility(show: boolean): void {
  if (show) return
  if (committedClose) emit('update:show', false)
  else closeCommitted()
}

watch(
  () => props.show,
  async (show) => {
    if (!show) return
    originalMultiplier.value = props.multiplier
    draft.value = String(props.multiplier)
    replaceOnNextInput.value = true
    await nextTick()
    inputRef.value?.focus({ preventScroll: true })
  },
)
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    teleport="body"
    class="bet-multiplier-popup"
    :close-on-click-overlay="true"
    @update:show="handleVisibility"
  >
    <section class="bet-multiplier-sheet" role="dialog" aria-modal="true" aria-label="投注倍数">
      <span class="bet-multiplier-sheet__handle" aria-hidden="true" />

      <header class="bet-multiplier-sheet__header">
        <h2>投注 <span class="numeric">{{ multiplier }}</span><small>倍</small></h2>
        <button type="button" data-overlay-close @click="closeCommitted">
          收起 <AppIcon name="chevron-up" :size="16" />
        </button>
      </header>

      <div class="bet-multiplier-sheet__body">
        <div class="bet-quick-row" aria-label="快捷倍数">
          <button type="button" class="bet-quick-row__clear" @click="clearDraft">清空</button>
          <button
            v-for="value in quickMultipliers"
            :key="value"
            type="button"
            :class="{ selected: Number(draft) === value }"
            @click="chooseMultiplier(value)"
          >
            {{ value }}
          </button>
        </div>

        <label class="bet-multiplier-input">
          <strong>倍数</strong>
          <span>
            <input
              ref="inputRef"
              :value="draft"
              type="text"
              inputmode="none"
              maxlength="4"
              autocomplete="off"
              readonly
              aria-label="输入投注倍数"
            />
            <button v-if="draft" type="button" aria-label="清空倍数" @click="clearDraft">
              <AppIcon name="close" :size="14" />
            </button>
          </span>
        </label>

        <div class="bet-multiplier-sheet__summary">
          <p>共{{ betCount }}注 · 投注 <strong class="numeric">¥{{ centsToYuan(stakeCents) }}</strong></p>
          <div>
            <button type="button" :disabled="saving || !canSave" @click="emit('save')">
              <AppIcon name="save" :size="18" />保存方案
            </button>
            <button type="button" :disabled="saving || !canPurchase" @click="emit('purchase')">
              <AppIcon name="check" :size="18" />记录购买
            </button>
          </div>
        </div>
      </div>

      <footer class="bet-multiplier-sheet__footer">
        <button type="button" class="cancel" @click="cancel">取消</button>
        <button type="button" class="confirm" @click="closeCommitted">确认投注</button>
      </footer>

      <div class="bet-number-keyboard" role="group" aria-label="投注倍数数字键盘">
        <button
          v-for="value in ['1', '2', '3']"
          :key="value"
          type="button"
          class="bet-number-keyboard__key"
          @click="inputDigit(value)"
        >
          {{ value }}
        </button>
        <button type="button" class="bet-number-keyboard__key bet-number-keyboard__side" aria-label="删除一位" @click="deleteDigit">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7 6-7Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            <path d="m12 9 6 6m0-6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>

        <button
          v-for="value in ['4', '5', '6']"
          :key="value"
          type="button"
          class="bet-number-keyboard__key"
          @click="inputDigit(value)"
        >
          {{ value }}
        </button>
        <button type="button" class="bet-number-keyboard__key bet-number-keyboard__side" disabled aria-label="负号不可用于投注倍数">−</button>

        <button
          v-for="value in ['7', '8', '9']"
          :key="value"
          type="button"
          class="bet-number-keyboard__key"
          @click="inputDigit(value)"
        >
          {{ value }}
        </button>
        <button type="button" class="bet-number-keyboard__key bet-number-keyboard__side" disabled aria-label="小数点不可用于投注倍数">·</button>

        <button type="button" class="bet-number-keyboard__key bet-number-keyboard__zero" @click="inputDigit('0')">0</button>
        <button type="button" class="bet-number-keyboard__done" @click="closeCommitted">完成</button>
      </div>
    </section>
  </van-popup>
</template>

<style scoped>
.bet-multiplier-popup {
  overflow: hidden;
  max-height: min(82dvh, 680px);
  background: var(--color-surface);
}

.bet-multiplier-sheet {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  max-height: min(82dvh, 680px);
  padding-top: 12px;
}

.bet-multiplier-sheet__handle {
  position: absolute;
  top: 8px;
  left: 50%;
  width: 40px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: #d5dde8;
  transform: translateX(-50%);
}

.bet-multiplier-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 54px;
  padding: 8px var(--page-gutter) 6px;
}

.bet-multiplier-sheet__header h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 20px;
  line-height: 26px;
}

.bet-multiplier-sheet__header h2 span {
  display: inline-grid;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border-radius: 50%;
  place-items: center;
  color: #ff5b67;
  background: #fff0f3;
  font-size: 13px;
}

.bet-multiplier-sheet__header h2 small {
  font-size: 13px;
  font-weight: 400;
}

.bet-multiplier-sheet__header > button {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  gap: 4px;
  padding: 0 4px 0 12px;
  border: 0;
  color: var(--color-text-secondary);
  background: transparent;
  font-size: 13px;
}

.bet-multiplier-sheet__body {
  display: grid;
  gap: 10px;
  padding: 4px var(--page-gutter) 12px;
  overflow-y: auto;
}

.bet-quick-row {
  display: grid;
  grid-template-columns: 52px repeat(7, minmax(0, 1fr));
  min-height: 44px;
  padding: 4px;
  border-radius: 10px;
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.bet-quick-row button {
  min-width: 0;
  height: 36px;
  padding: 0 2px;
  border: 0;
  border-radius: 8px;
  color: var(--color-text-secondary);
  background: transparent;
  font-size: 13px;
}

.bet-quick-row button.selected {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.bet-quick-row .bet-quick-row__clear {
  color: var(--color-primary);
}

.bet-multiplier-input {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  min-height: 58px;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  box-shadow: var(--outline-default);
}

.bet-multiplier-input > strong {
  font-size: 15px;
  line-height: 20px;
}

.bet-multiplier-input > span {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  height: 40px;
  border-radius: 10px;
  box-shadow: var(--outline-primary);
}

.bet-multiplier-input input,
.bet-multiplier-input button {
  min-width: 0;
  height: 40px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
}

.bet-multiplier-input input {
  padding-left: 12px;
  font-size: 15px;
}

.bet-multiplier-input button {
  display: grid;
  place-items: center;
  color: #fff;
}

.bet-multiplier-input button .app-icon {
  padding: 2px;
  border-radius: 50%;
  background: #b9c2cf;
}

.bet-multiplier-sheet__summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.bet-multiplier-sheet__summary p {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
}

.bet-multiplier-sheet__summary p strong {
  color: #ff5b67;
  font-size: 16px;
  font-weight: 500;
}

.bet-multiplier-sheet__summary > div {
  display: flex;
  gap: 6px;
}

.bet-multiplier-sheet__summary button {
  display: inline-flex;
  align-items: center;
  height: 36px;
  gap: 4px;
  padding: 0 9px;
  border: 0;
  border-radius: 10px;
  color: var(--color-primary);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 12px;
}

.bet-multiplier-sheet__summary button:disabled {
  color: var(--color-text-tertiary);
  background: var(--color-disabled);
}

.bet-multiplier-sheet__footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 58px;
  padding: 0 var(--page-gutter) calc(10px + env(safe-area-inset-bottom));
}

.bet-multiplier-sheet__footer button {
  height: 48px;
  border: 0;
  font-size: 15px;
  font-weight: 500;
}

.bet-multiplier-sheet__footer .cancel {
  border-radius: 10px 0 0 10px;
  color: #ff5b67;
  background: #fff0f3;
}

.bet-multiplier-sheet__footer .confirm {
  border-radius: 0 10px 10px 0;
  color: #fff;
  background: var(--color-primary);
}

.bet-number-keyboard {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  padding: 12px var(--page-gutter) calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-divider);
  background: #f4f7fb;
}

.bet-number-keyboard button {
  min-width: 0;
  height: 52px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 24px;
  font-weight: 400;
  line-height: 1;
}

.bet-number-keyboard button:active:not(:disabled) {
  background: var(--color-primary-soft);
}

.bet-number-keyboard__side {
  background: #edf2f8 !important;
}

.bet-number-keyboard__side:disabled {
  color: var(--color-text-secondary);
  opacity: 1;
}

.bet-number-keyboard__zero {
  grid-column: span 2;
}

.bet-number-keyboard .bet-number-keyboard__done {
  grid-column: span 2;
  color: #fff;
  background: linear-gradient(135deg, #69b0ff, #5797f5 58%, #8d83f5);
  box-shadow: inset 0 0 0 1px rgb(71 137 234 / 55%);
  font-size: 18px;
  font-weight: 500;
}

@media (max-width: 374px) {
  .bet-quick-row {
    grid-template-columns: 44px repeat(7, minmax(0, 1fr));
  }

  .bet-multiplier-sheet__summary {
    grid-template-columns: 1fr;
  }

  .bet-multiplier-sheet__summary > div {
    justify-content: flex-end;
  }

  .bet-number-keyboard {
    gap: 6px;
  }

  .bet-number-keyboard button {
    height: 48px;
  }
}
</style>
