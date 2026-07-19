<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import AppCard from "@/components/base/AppCard.vue";
import AppChip from "@/components/base/AppChip.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppState from "@/components/base/AppState.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import {
  calculatePrizeRange,
  enumeratePlanBets,
  groupPlanBetsByMatches,
} from "@/features/betting/calculator";
import { usePlanStore } from "@/stores/plans";
import type { PlanSelection } from "@/types/domain";
import { centsToYuan } from "@/utils/money";

const route = useRoute();
const router = useRouter();
const store = usePlanStore();
const passFilter = ref<number>();
const planId = computed(() => String(route.params.id ?? ""));
const item = computed(() => store.find(planId.value));
const plan = computed(() => item.value?.plan);
const bets = computed(() => (plan.value ? enumeratePlanBets(plan.value) : []));
const combinationGroups = computed(() =>
  groupPlanBetsByMatches(bets.value, plan.value?.multiplier ?? 1),
);
const filteredGroups = computed(() =>
  passFilter.value
    ? combinationGroups.value.filter((group) => group.passSize === passFilter.value)
    : combinationGroups.value,
);
const prizeRange = computed(() =>
  plan.value
    ? calculatePrizeRange(
        plan.value.selections,
        plan.value.passCounts,
        plan.value.multiplier,
      )
    : { minCents: 0, maxCents: 0 },
);

onMounted(async () => {
  if (!store.plans.length) await store.load();
});

function matchLabel(selection: PlanSelection): string {
  return store.matchById.get(selection.matchId)?.matchNum || String(selection.matchId);
}
</script>

<template>
  <div class="combination-page">
    <SubpageHeader title="过关组合明细">
      <template #action><span class="header-count">{{ filteredGroups.length }}组</span></template>
    </SubpageHeader>

    <main class="combination-content">
      <AppState v-if="store.loading" type="loading" title="正在读取组合" />
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
          <AppChip :selected="passFilter === undefined" @click="passFilter = undefined">全部</AppChip>
          <AppChip
            v-for="size in plan.passCounts"
            :key="size"
            :selected="passFilter === size"
            @click="passFilter = size"
          >
            {{ size }}关
          </AppChip>
        </div>

        <AppCard class="combination-list" :padded="false">
          <div v-for="(group, index) in filteredGroups" :key="`${group.passSize}-${index}`" class="combination-row">
            <div class="combination-name">
              <strong>组合{{ String(index + 1).padStart(2, '0') }} · {{ group.passSize }}关</strong>
              <span>{{ group.selections.map(matchLabel).join(' + ') }}</span>
            </div>
            <div class="combination-value">
              <span>{{ group.betCount }}注</span>
              <b class="numeric">¥{{ centsToYuan(group.prizeCents) }}</b>
            </div>
            <AppIcon name="chevron-right" :size="16" />
          </div>
        </AppCard>
      </template>
    </main>

    <footer v-if="plan" class="combination-footer">
      <span>合计 <b class="numeric">{{ bets.length }}</b>注</span>
      <span>理论奖金 <b class="numeric">¥{{ centsToYuan(prizeRange.minCents) }}～¥{{ centsToYuan(prizeRange.maxCents) }}</b></span>
    </footer>
  </div>
</template>

<style scoped>
.combination-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.header-count {
  color: var(--color-text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.combination-content {
  display: grid;
  gap: 12px;
  padding: 12px var(--page-gutter) calc(76px + env(safe-area-inset-bottom));
}

.combination-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  min-height: 60px;
  gap: 16px;
}

.combination-summary span,
.combination-summary b {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.combination-summary strong {
  font-size: 14px;
}

.combination-summary b {
  font-weight: 500;
}

.pass-filters {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.combination-list {
  display: grid;
}

.combination-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 16px;
  align-items: center;
  min-height: 64px;
  gap: 8px;
  padding: 8px 10px;
}

.combination-row + .combination-row {
  border-top: 1px solid var(--color-divider);
}

.combination-name,
.combination-value {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.combination-name strong {
  font-size: 13px;
}

.combination-name span,
.combination-value span {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combination-value {
  max-width: 116px;
  text-align: right;
}

.combination-value b {
  color: var(--color-accent);
  font-size: 13px;
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
  background: rgb(255 255 255 / 96%);
  border-top: 1px solid var(--color-border);
}

.combination-footer span {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.combination-footer b {
  color: var(--color-accent);
  font-size: 13px;
}
</style>
