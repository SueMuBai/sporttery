<script setup lang="ts">
import { computed } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import AppChip from '@/components/base/AppChip.vue'
import { centsToYuan } from '@/utils/money'

const props = defineProps<{
  show: boolean
  matchCount: number
  selectionCount: number
  availablePasses: number[]
  passCounts: number[]
  multiplier: number
  betCount: number
  stakeCents: number
  prizeMinCents: number
  prizeMaxCents: number
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  'update:multiplier': [multiplier: number]
  togglePass: [size: number]
  save: []
}>()

const prizeText = computed(
  () => `${centsToYuan(props.prizeMinCents)} ~ ${centsToYuan(props.prizeMaxCents)} 元`,
)
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    closeable
    class="bet-sheet"
    @update:show="emit('update:show', $event)"
  >
    <div class="bet-sheet__content">
      <header>
        <h2>查看方案</h2>
        <p><strong class="numeric">{{ matchCount }}</strong> 场已选 · {{ selectionCount }} 个选项</p>
      </header>

      <section class="bet-sheet__section">
        <h3>过关方式（可多选）</h3>
        <div class="pass-grid">
          <AppChip
            v-for="size in availablePasses"
            :key="size"
            :selected="passCounts.includes(size)"
            @click="emit('togglePass', size)"
          >
            {{ size }}关
          </AppChip>
        </div>
      </section>

      <section class="bet-sheet__finance">
        <div class="multiplier-field">
          <span>倍数</span>
          <van-stepper
            :model-value="multiplier"
            integer
            :min="1"
            :max="9999"
            input-width="54px"
            button-size="36px"
            @update:model-value="emit('update:multiplier', Number($event))"
          />
        </div>
        <div class="bet-summary">
          <p>共 <strong class="numeric">{{ betCount }}</strong> 注，投注 <b class="numeric">{{ centsToYuan(stakeCents) }} 元</b></p>
          <p>理论奖金：<span class="numeric">{{ prizeText }}</span></p>
        </div>
      </section>

      <AppButton block :disabled="!betCount" @click="emit('save')">保存方案</AppButton>
    </div>
  </van-popup>
</template>

<style scoped>
.bet-sheet {
  overflow: hidden;
  background: var(--color-surface);
}

.bet-sheet__content {
  display: grid;
  gap: var(--space-5);
  max-height: min(72dvh, 620px);
  padding: var(--space-5) var(--page-gutter) calc(var(--space-5) + env(safe-area-inset-bottom));
  overflow-y: auto;
}

.bet-sheet header {
  padding-right: 40px;
}

.bet-sheet h2,
.bet-sheet h3,
.bet-sheet p {
  margin: 0;
}

.bet-sheet h2 {
  font-size: 21px;
  line-height: 1.35;
}

.bet-sheet header p {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.bet-sheet header strong {
  color: var(--color-accent-strong);
  font-size: 22px;
}

.bet-sheet__section {
  display: grid;
  gap: var(--space-3);
}

.bet-sheet h3 {
  font-size: var(--font-size-md);
  line-height: 1.35;
}

.pass-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.pass-grid .app-chip {
  width: 100%;
  min-width: 0;
}

.bet-sheet__finance {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--radius-card);
  background: var(--color-surface-soft);
  box-shadow: var(--outline-default);
}

.multiplier-field {
  display: grid;
  gap: 6px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.bet-summary {
  display: grid;
  min-width: 0;
  gap: 4px;
  font-size: var(--font-size-sm);
}

.bet-summary p {
  overflow-wrap: anywhere;
}

.bet-summary b {
  color: var(--color-accent-strong);
  font-size: 18px;
}

.bet-summary span {
  color: var(--color-text-secondary);
}

@media (max-width: 374px) {
  .pass-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .bet-sheet__finance {
    grid-template-columns: 1fr;
  }
}
</style>
