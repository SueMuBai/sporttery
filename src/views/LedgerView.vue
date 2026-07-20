<script setup lang="ts">
import { showFailToast } from "vant";
import { computed, onActivated, ref, watch } from "vue";
import { useRouter } from "vue-router";

import AppButton from "@/components/base/AppButton.vue";
import AppBottomSheet from "@/components/base/AppBottomSheet.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppHeader from "@/components/base/AppHeader.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppState from "@/components/base/AppState.vue";
import LedgerDetailSheet from "@/components/ledger/LedgerDetailSheet.vue";
import DateRangePicker from "@/components/base/DateRangePicker.vue";
import billSectionIcon from "@/assets/icons/navigation/ic_nav_bill_selected.svg?url";
import ledgerEmptyIllustration from "@/assets/ui/ledger/ill_ledger_empty.svg?url";
import {
  rangeForPreset,
  useLedgerStore,
  type EvaluatedLedgerOrder,
  type LedgerRangePreset,
} from "@/stores/ledger";
import { useTicketStore } from "@/stores/ticket";
import type { SavedPlan } from "@/types/domain";
import { centsToYuan } from "@/utils/money";

type DateEndpoint = "start" | "end";
type QuickRangePreset = Exclude<LedgerRangePreset, "custom">;

const store = useLedgerStore();
const ticketStore = useTicketStore();
const router = useRouter();
const showDateSheet = ref(false);
const showDetailSheet = ref(false);
const selectedLedgerId = ref("");
const showCalendar = ref(false);
const draftStart = ref("");
const draftEnd = ref("");
const draftPreset = ref<LedgerRangePreset>("month");
const draftEndpoint = ref<DateEndpoint>("start");
const selectedLedgerItem = computed(() =>
  selectedLedgerId.value ? store.find(selectedLedgerId.value) : undefined,
);

const dateLabel = computed(() => {
  if (!store.range.start || !store.range.end) return "全部账单";
  return `${store.range.start} 至 ${store.range.end}`;
});
const minCalendarDate = computed(() => {
  const now = new Date();
  return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
});
const maxCalendarDate = computed(() => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
});

onActivated(() => store.load());

watch(showDateSheet, (visible) => {
  if (!visible) return;
  draftStart.value = store.range.start ?? "";
  draftEnd.value = store.range.end ?? "";
  draftPreset.value = store.preset;
  draftEndpoint.value = store.range.start ? "end" : "start";
  showCalendar.value = false;
});

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 19);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function selectQuickRange(preset: QuickRangePreset): void {
  const range = rangeForPreset(preset);
  draftPreset.value = preset;
  draftStart.value = range.start ?? "";
  draftEnd.value = range.end ?? "";
  draftEndpoint.value = draftStart.value ? "end" : "start";
  showCalendar.value = false;
}

function markCustomRange(): void {
  draftPreset.value = "custom";
}

function resetDraftRange(): void {
  const range = rangeForPreset("month");
  draftPreset.value = "month";
  draftStart.value = range.start ?? "";
  draftEnd.value = range.end ?? "";
  draftEndpoint.value = "end";
}

async function applyDraftRange(): Promise<void> {
  try {
    if (draftPreset.value === "custom") {
      await store.applyCustomRange(draftStart.value, draftEnd.value);
    } else {
      await store.applyPreset(draftPreset.value);
    }
    showDateSheet.value = false;
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  }
}

function openDetail(item: EvaluatedLedgerOrder): void {
  if (item.status === "settled") {
    void router.push(`/ledger/${item.order.id}`);
    return;
  }
  selectedLedgerId.value = item.order.id;
  showDetailSheet.value = true;
}

function continueEditing(plan: SavedPlan): void {
  ticketStore.loadPlan(plan);
  void router.push("/ticket");
}
</script>

<template>
  <div class="page ledger-page">
    <AppHeader title="彩果·账单" subtitle="记录每一次投入与回报" />

    <div class="page-content ledger-content">
      <AppCard
        class="period-card"
        interactive
        role="button"
        tabindex="0"
        @click="showDateSheet = true"
        @keydown.enter.prevent="showDateSheet = true"
        @keydown.space.prevent="showDateSheet = true"
      >
        <div class="period-card__icon">
          <AppIcon name="calendar" />
        </div>
        <div class="period-card__copy">
          <span>统计周期</span>
          <strong class="numeric">{{ dateLabel }}</strong>
        </div>
        <AppIcon name="chevron-right" :size="18" />
      </AppCard>

      <AppCard class="ledger-summary" :padded="false">
        <div>
          <span>总投入</span>
          <strong class="numeric">¥{{ centsToYuan(store.summary.stakeCents) }}</strong>
        </div>
        <div>
          <span>总回款</span>
          <strong class="numeric ledger-summary__return">¥{{ centsToYuan(store.summary.returnCents) }}</strong>
        </div>
        <div>
          <span>净盈亏</span>
          <strong
            :class="[
              'numeric',
              store.summary.profitCents >= 0
                ? 'amount-positive'
                : 'amount-negative',
            ]"
          >
            {{
              store.summary.profitCents > 0
                ? "+"
                : store.summary.profitCents < 0
                  ? "-"
                  : ""
            }}¥{{ centsToYuan(Math.abs(store.summary.profitCents)) }}
          </strong>
        </div>
        <p>共 {{ store.summary.count }} 笔方案</p>
      </AppCard>

      <section class="content-section">
        <div class="section-heading">
          <h2 class="text-section-title section-heading__title">
            <img :src="billSectionIcon" alt="" />
            账单明细
          </h2>
          <button
            type="button"
            class="sort-button"
            @click="store.sort = store.sort === 'desc' ? 'asc' : 'desc'"
          >
            按时间{{ store.sort === "desc" ? "倒序" : "正序" }}
            <AppIcon
              :name="store.sort === 'desc' ? 'chevron-down' : 'chevron-up'"
              :size="14"
            />
          </button>
        </div>

        <AppCard
          v-if="store.loading && !store.orders.length"
          class="ledger-state-card"
          :padded="false"
        >
          <AppState type="loading" title="正在读取账单" />
        </AppCard>
        <AppCard
          v-else-if="store.error"
          class="ledger-state-card"
          :padded="false"
        >
          <AppState
            type="error"
            title="账单读取失败"
            :description="store.error"
            action-text="重试"
            @action="store.load"
          />
        </AppCard>
        <AppCard
          v-else-if="!store.evaluatedOrders.length"
          class="ledger-empty"
          :padded="false"
        >
          <span class="ledger-empty__illustration">
            <img :src="ledgerEmptyIllustration" alt="" />
          </span>
          <strong>暂无账单记录</strong>
          <p>所选日期内还没有购买方案</p>
          <AppButton variant="secondary" @click="showDateSheet = true">
            调整日期
          </AppButton>
        </AppCard>
        <div v-else class="ledger-list">
          <AppCard
            v-for="item in store.evaluatedOrders"
            :key="item.order.id"
            class="ledger-item"
            interactive
            role="button"
            tabindex="0"
            @click="openDetail(item)"
            @keydown.enter.prevent="openDetail(item)"
            @keydown.space.prevent="openDetail(item)"
          >
            <div class="ledger-item__meta">
              <time class="numeric">{{
                formatDateTime(item.order.purchasedAt)
              }}</time>
              <span :class="['status-pill', `status-pill--${item.status}`]">
                {{ item.status === "settled" ? "已完成" : "进行中" }}
              </span>
            </div>
            <div class="ledger-item__title-row">
              <div>
                <h3>{{ item.order.planName }}</h3>
                <p>
                  {{ item.evaluation.totalMatches }}场 ·
                  {{ item.order.planSnapshot.selections.length }}个选项
                </p>
              </div>
            </div>
            <div class="ledger-item__finance">
              <div>
                <span>投注</span><strong class="numeric">¥{{ centsToYuan(item.order.stakeCents) }}</strong>
              </div>
              <div>
                <span>回款</span>
                <strong
                  :class="[
                    'numeric',
                    item.displayedReturnCents > 0
                      ? 'amount-positive'
                      : 'amount-muted',
                  ]"
                >¥{{ centsToYuan(item.displayedReturnCents) }}</strong>
              </div>
              <div>
                <span>净盈亏</span>
                <strong
                  :class="[
                    'numeric',
                    item.profitCents > 0
                      ? 'amount-positive'
                      : 'amount-negative',
                  ]"
                >
                  {{
                    item.profitCents > 0
                      ? "+"
                      : item.profitCents < 0
                        ? "-"
                        : ""
                  }}¥{{ centsToYuan(Math.abs(item.profitCents)) }}
                </strong>
              </div>
            </div>
          </AppCard>
        </div>
      </section>
    </div>

    <AppBottomSheet
      v-model:show="showDateSheet"
      :class="[
        'ledger-date-sheet',
        { 'ledger-date-sheet--calendar': showCalendar },
      ]"
      title="日期筛选"
      :show-close="false"
      drag-handle
    >
      <div class="date-sheet">
        <AppIcon
          v-if="showCalendar"
          class="date-sheet__header-icon"
          name="calendar"
          :size="22"
        />
        <section>
          <h3 v-if="!showCalendar">快捷选择</h3>
          <div class="date-sheet__quick">
            <AppButton
              :variant="draftPreset === 'month' ? 'primary' : 'secondary'"
              @click="selectQuickRange('month')"
            >
              本月
            </AppButton>
            <AppButton
              :variant="
                draftPreset === 'three-months' ? 'primary' : 'secondary'
              "
              @click="selectQuickRange('three-months')"
            >
              近3个月
            </AppButton>
            <AppButton
              :variant="draftPreset === 'all' ? 'primary' : 'secondary'"
              @click="selectQuickRange('all')"
            >
              全部
            </AppButton>
          </div>
        </section>
        <section>
          <h3 v-if="!showCalendar">自定义日期</h3>
          <DateRangePicker
            v-model:start="draftStart"
            v-model:end="draftEnd"
            v-model:active-endpoint="draftEndpoint"
            v-model:expanded="showCalendar"
            :min-date="minCalendarDate"
            :max-date="maxCalendarDate"
            @update:start="markCustomRange"
            @update:end="markCustomRange"
          />
          <p v-if="!showCalendar" class="range-hint">
            最多可查询最近 12 个月的账单
          </p>
        </section>
      </div>
      <template #footer>
        <div class="date-sheet__actions">
          <AppButton variant="secondary" block @click="resetDraftRange">
            重置
          </AppButton>
          <AppButton block :loading="store.loading" @click="applyDraftRange">
            确定
          </AppButton>
        </div>
      </template>
    </AppBottomSheet>

    <LedgerDetailSheet
      v-model:show="showDetailSheet"
      :item="selectedLedgerItem"
      @continue-edit="continueEditing"
    />
  </div>
</template>

<style scoped>
.ledger-content {
  display: grid;
  gap: 14px;
  padding-top: 14px;
}

.period-card {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  height: 56px;
  gap: 10px;
  padding: 7px 14px;
}

.period-card__icon {
  display: grid;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-xs);
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.period-card__icon img,
.header-action-icon {
  width: 24px;
  height: 24px;
}

.period-card__copy {
  display: grid;
  min-width: 0;
  gap: 0;
}

.period-card__copy span {
  color: var(--color-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 17px;
}

.period-card__copy strong {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 400;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 122px;
  padding: 16px 0 10px;
}

.ledger-summary > div {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 8px;
  padding: 0 var(--space-2);
  text-align: center;
}

.ledger-summary > div + div {
  border-left: 1px solid var(--color-divider);
}

.ledger-summary span {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.ledger-summary strong {
  overflow: hidden;
  font-size: 19px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-summary p {
  grid-column: 1 / -1;
  margin: 12px 14px 0;
  padding-top: 10px;
  border-top: 1px solid var(--color-divider);
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: center;
}

.amount-positive,
.ledger-summary__return {
  color: var(--color-success);
}

.amount-negative {
  color: var(--color-danger);
}

.amount-muted {
  color: var(--color-placeholder);
}

.section-heading__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
}

.section-heading__title img {
  width: 24px;
  height: 24px;
}

.sort-button {
  display: inline-flex;
  align-items: center;
  min-height: var(--touch-target);
  gap: 4px;
  padding: 0 2px 0 12px;
  border: 0;
  color: var(--color-text-secondary);
  background: transparent;
  font-size: 13px;
  line-height: 1;
}

.ledger-item {
  display: grid;
  min-height: 164px;
  align-content: stretch;
  gap: 10px;
  padding: 14px;
}

.ledger-item__meta,
.ledger-item__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.ledger-item__meta time {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.status-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 12px;
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

.ledger-item__title-row > div {
  min-width: 0;
}

.ledger-item__title-row h3 {
  margin: 0;
  overflow: hidden;
  color: var(--color-primary-strong);
  font-size: 16px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-item__title-row p {
  display: block;
  overflow: hidden;
  margin: 5px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-item__finance {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 58px;
  padding-top: 10px;
  border-top: 1px solid var(--color-divider);
}

.ledger-item__finance > div {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 5px;
  padding: 0 var(--space-2);
  text-align: center;
}

.ledger-item__finance > div + div {
  border-left: 1px solid var(--color-divider);
}

.ledger-item__finance span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.ledger-item__finance span small {
  display: block;
  margin-top: 2px;
  color: var(--color-warning);
  font-size: 9px;
  line-height: 1;
}

.ledger-item__finance strong {
  overflow: hidden;
  font-size: 15px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-list {
  display: grid;
  gap: 10px;
}

.ledger-state-card {
  min-height: 220px;
}

.ledger-empty {
  display: grid;
  min-height: 292px;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 20px;
  text-align: center;
}

.ledger-empty__illustration {
  display: grid;
  width: 120px;
  height: 100px;
  place-items: center;
}

.ledger-empty__illustration img {
  width: 120px;
  height: 100px;
}

.ledger-empty strong {
  margin-top: 8px;
  font-size: 15px;
  line-height: 20px;
}

.ledger-empty p {
  margin: 0 0 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.ledger-empty :deep(.app-button) {
  min-width: 132px;
}

.date-sheet {
  display: grid;
  gap: 12px;
  padding: 4px 22px 8px;
}

.date-sheet__header-icon {
  position: absolute;
  z-index: 3;
  top: 23px;
  right: var(--page-gutter);
  color: var(--color-primary);
}

.date-sheet h3 {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  font-weight: 500;
}

.date-sheet section {
  display: grid;
  gap: 8px;
}

.date-sheet__quick,
.date-sheet__actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.date-sheet__actions {
  grid-template-columns: repeat(2, 1fr);
}

.date-sheet__quick :deep(.app-button--primary) {
  background: linear-gradient(135deg, #68b8ff, var(--color-violet));
  box-shadow: var(--outline-primary);
}

.date-sheet__quick :deep(.app-button--secondary) {
  color: var(--color-text-secondary);
  box-shadow: var(--outline-default);
}

.ledger-date-sheet :deep(.app-bottom-sheet__header) {
  grid-template-columns: minmax(0, 1fr);
  min-height: 46px;
  padding: 14px 22px 4px;
  border-bottom: 0;
}

.ledger-date-sheet :deep(.app-bottom-sheet__footer) {
  padding-inline: 22px;
}

.ledger-date-sheet--calendar .date-sheet {
  gap: 6px;
  padding: 2px 16px 8px;
}

.ledger-date-sheet--calendar .date-sheet section {
  gap: 6px;
}

.ledger-date-sheet--calendar .date-sheet__quick {
  display: flex;
  gap: 8px;
}

.ledger-date-sheet--calendar .date-sheet__actions {
  width: calc(100% - 64px);
  grid-template-columns: repeat(2, 105px);
  justify-content: space-between;
  margin-inline: auto;
}

.ledger-date-sheet--calendar :deep(.app-bottom-sheet__header) {
  padding-inline: 16px;
}

.ledger-date-sheet--calendar :deep(.app-bottom-sheet__footer) {
  padding-inline: 12px;
}

.ledger-date-sheet--calendar .date-sheet__quick :deep(.app-button) {
  width: auto;
  height: 30px;
  padding: 0 12px;
  font-size: 12px;
}

.ledger-date-sheet--calendar .date-sheet__quick :deep(.app-button--primary) {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.ledger-date-sheet--calendar :deep(.date-range-picker) {
  gap: 6px;
}

.ledger-date-sheet--calendar :deep(.date-range-picker__endpoints > button) {
  min-height: 32px;
}

.ledger-date-sheet--calendar :deep(.date-range-picker__toolbar > button),
.ledger-date-sheet--calendar :deep(.date-range-picker__toolbar div button) {
  min-height: 32px;
}

.ledger-date-sheet--calendar :deep(.date-range-picker__wheel > div) {
  grid-template-rows: 18px repeat(3, 28px);
}

.ledger-date-sheet--calendar :deep(.date-range-picker__wheel button) {
  min-height: 28px;
}

.ledger-date-sheet--calendar :deep(.date-range-picker__week span) {
  min-height: 22px;
}

.ledger-date-sheet--calendar :deep(.date-range-picker__days > span),
.ledger-date-sheet--calendar :deep(.date-range-picker__days button) {
  min-height: 25px;
}

.ledger-date-sheet--calendar
  :deep(.date-range-picker__days button.is-start::before),
.ledger-date-sheet--calendar
  :deep(.date-range-picker__days button.is-end::before) {
  width: 25px;
  height: 25px;
}

.range-hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

@media (max-width: 359px) {
  .ledger-summary strong,
  .ledger-item__finance strong {
    font-size: 13px;
  }

  .date-sheet__quick {
    gap: 6px;
  }
}
</style>
