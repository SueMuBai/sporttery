<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppCard from '@/components/base/AppCard.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppState from '@/components/base/AppState.vue'
import SubpageHeader from '@/components/base/SubpageHeader.vue'
import {
  calculatePrizeRange,
  enumeratePlanBets,
  groupPlanBetsByMatches,
} from '@/features/betting/calculator'
import { usePlanStore } from '@/stores/plans'
import type { PlanSelection } from '@/types/domain'
import { centsToYuan } from '@/utils/money'

const route = useRoute()
const router = useRouter()
const store = usePlanStore()
const passFilter = ref<number>()
const planId = computed(() => String(route.params.id ?? ''))
const item = computed(() => store.find(planId.value))
const plan = computed(() => item.value?.plan)
const bets = computed(() => (plan.value ? enumeratePlanBets(plan.value) : []))
const combinationGroups = computed(() =>
  groupPlanBetsByMatches(bets.value, plan.value?.multiplier ?? 1).map((group, index) => ({
    ...group,
    sequence: index + 1,
  })),
)
const filteredGroups = computed(() =>
  passFilter.value
    ? combinationGroups.value.filter((group) => group.passSize === passFilter.value)
    : combinationGroups.value,
)
const prizeRange = computed(() =>
  plan.value
    ? calculatePrizeRange(plan.value.selections, plan.value.passCounts, plan.value.multiplier)
    : { minCents: 0, maxCents: 0 },
)

onMounted(async () => {
  if (!store.plans.length) await store.load()
})

function matchLabel(selection: PlanSelection): string {
  const value = store.matchById.get(selection.matchId)?.matchNum || String(selection.matchId)
  return value.match(/\d+$/)?.[0] || value
}
</script>

<template>
  <div class="combination-page">
    <SubpageHeader title="过关组合明细">
      <template #action><span class="header-count">{{ filteredGroups.length }}组</span></template>
    </SubpageHeader>

    <main class="combination-content">
      <AppState v-if="store.loading && !plan" type="loading" title="正在读取组合" />
      <AppState
        v-else-if="!plan"
        type="error"
        title="方案不存在"
        action-text="返回方案管理"
        @action="router.replace('/plans')"
      />
      <template v-else>
        <AppCard class="combination-summary">
          <span>过关方式</span>
          <strong>{{ plan.passCounts.join('/') }}关</strong>
          <b>共{{ bets.length }}注</b>
        </AppCard>

        <div class="pass-filters" aria-label="过关方式筛选">
          <button
            type="button"
            :class="{ active: passFilter === undefined }"
            :aria-pressed="passFilter === undefined"
            @click="passFilter = undefined"
          >
            全部
          </button>
          <button
            v-for="size in plan.passCounts"
            :key="size"
            type="button"
            :class="{ active: passFilter === size }"
            :aria-pressed="passFilter === size"
            @click="passFilter = size"
          >
            {{ size }}关
          </button>
        </div>

        <AppCard class="combination-list" :padded="false">
          <div
            v-for="group in filteredGroups"
            :key="`${group.passSize}-${group.sequence}`"
            class="combination-row"
          >
            <strong class="combination-title">
              组合{{ String(group.sequence).padStart(2, '0') }} · {{ group.passSize }}关
            </strong>
            <span class="combination-matches">{{ group.selections.map(matchLabel).join(' + ') }}</span>
            <div class="combination-value">
              <span>{{ group.betCount }}注</span>
              <b class="numeric">¥{{ centsToYuan(group.prizeCents) }}</b>
            </div>
            <AppIcon class="combination-arrow" name="chevron-right" :size="16" />
          </div>
        </AppCard>

        <AppState
          v-if="!filteredGroups.length"
          type="empty"
          title="暂无对应组合"
          description="请选择其他过关方式"
        />
      </template>
    </main>

    <footer v-if="plan" class="combination-footer">
      <span>合计 <b class="numeric">{{ bets.length }}</b>注</span>
      <span>
        理论奖金
        <b class="numeric">¥{{ centsToYuan(prizeRange.minCents) }}～¥{{ centsToYuan(prizeRange.maxCents) }}</b>
      </span>
    </footer>
  </div>
</template>

<style scoped>
.combination-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.header-count {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.combination-content {
  display: grid;
  gap: 12px;
  padding: 12px var(--page-gutter) calc(72px + env(safe-area-inset-bottom));
}

.combination-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  min-height: 52px;
  gap: 16px;
  padding: 10px 16px;
}

.combination-summary span,
.combination-summary b {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.combination-summary strong {
  font-size: 14px;
  font-weight: 500;
}

.combination-summary b {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
}

.pass-filters {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.pass-filters::-webkit-scrollbar {
  display: none;
}

.pass-filters button {
  flex: 0 0 auto;
  min-width: 52px;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 13px;
  font-weight: 400;
}

.pass-filters button.active {
  color: var(--color-primary);
  background: #f7fbff;
  box-shadow: var(--outline-primary);
  font-weight: 500;
}

.combination-list {
  display: grid;
}

.combination-row {
  display: grid;
  grid-template-columns: minmax(96px, 1.05fr) minmax(0, 1.45fr) auto 16px;
  align-items: center;
  min-height: 68px;
  gap: 8px;
  padding: 8px 12px;
}

.combination-row + .combination-row {
  border-top: 1px solid var(--color-divider);
}

.combination-title {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combination-matches {
  overflow: hidden;
  color: var(--color-text);
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combination-value {
  display: grid;
  min-width: 64px;
  gap: 2px;
  text-align: right;
}

.combination-value span {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.combination-value b {
  color: var(--color-danger);
  font-size: 12px;
  font-weight: 500;
  line-height: 17px;
}

.combination-arrow {
  color: var(--color-text-tertiary);
}

.combination-footer {
  position: fixed;
  z-index: 40;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: calc(64px + env(safe-area-inset-bottom));
  gap: 12px;
  padding: 8px var(--page-gutter) calc(8px + env(safe-area-inset-bottom));
  background: rgb(255 255 255 / 97%);
  border-top: 1px solid var(--color-border);
}

.combination-footer span {
  color: var(--color-text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.combination-footer b {
  color: var(--color-danger);
  font-size: 13px;
  font-weight: 500;
}

@media (min-width: 600px) {
  .combination-footer {
    right: 50%;
    left: 50%;
    width: 520px;
    transform: translateX(-50%);
  }
}

@media (max-width: 359px) {
  .combination-row {
    grid-template-columns: minmax(88px, 1fr) minmax(0, 1.1fr) auto 16px;
    padding-inline: 9px;
  }

  .combination-matches {
    font-size: 10px;
  }
}
</style>
