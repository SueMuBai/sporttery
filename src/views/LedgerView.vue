<script setup lang="ts">
import { showFailToast } from "vant";
import { computed, onActivated, ref, watch } from "vue";
import { useRouter } from "vue-router";

import AppButton from "@/components/base/AppButton.vue";
import AppBottomSheet from "@/components/base/AppBottomSheet.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppChip from "@/components/base/AppChip.vue";
import AppHeader from "@/components/base/AppHeader.vue";
import AppIconButton from "@/components/base/AppIconButton.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppState from "@/components/base/AppState.vue";
import DateRangePicker from "@/components/base/DateRangePicker.vue";
import { useLedgerStore, type EvaluatedLedgerOrder } from "@/stores/ledger";
import { centsToYuan } from "@/utils/money";

const store = useLedgerStore();
const router = useRouter();
const showDateSheet = ref(false);
const showCalendar = ref(false);
const draftStart = ref("");
const draftEnd = ref("");

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

async function selectQuickRange(
  preset: "month" | "three-months" | "all",
): Promise<void> {
  await store.applyPreset(preset);
  showDateSheet.value = false;
}

function openInlineCalendar(): void {
  showCalendar.value = !showCalendar.value;
}

async function applyCustomRange(): Promise<void> {
  try {
    await store.applyCustomRange(draftStart.value, draftEnd.value);
    showDateSheet.value = false;
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  }
}

function openDetail(item: EvaluatedLedgerOrder): void {
  router.push(`/ledger/${item.order.id}`);
}
</script>

<template>
  <div class="page ledger-page">
    <AppHeader title="彩果 · 长期账单" subtitle="记录每一次投入与回报">
      <template #action>
        <AppIconButton
          label="筛选账单日期"
          @click="showDateSheet = true"
        >
          <AppIcon name="calendar-filter" />
        </AppIconButton>
      </template>
    </AppHeader>

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

      <div class="quick-ranges" aria-label="快捷日期范围">
        <AppChip
          :selected="store.preset === 'month'"
          @click="store.applyPreset('month')"
        >
          本月
        </AppChip>
        <AppChip
          :selected="store.preset === 'three-months'"
          @click="store.applyPreset('three-months')"
        >
          近3个月
        </AppChip>
        <AppChip
          :selected="store.preset === 'all'"
          @click="store.applyPreset('all')"
        >
          全部
        </AppChip>
      </div>

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
            {{ store.summary.profitCents >= 0 ? "+" : "-" }}¥{{
              centsToYuan(Math.abs(store.summary.profitCents))
            }}
          </strong>
        </div>
        <p>共 {{ store.summary.count }} 笔方案</p>
      </AppCard>

      <section class="content-section">
        <div class="section-heading">
          <h2 class="text-section-title">账单明细</h2>
          <button
            type="button"
            class="sort-button"
            @click="store.sort = store.sort === 'desc' ? 'asc' : 'desc'"
          >
            按时间{{ store.sort === "desc" ? "倒序" : "正序" }}
            <AppIcon :name="store.sort === 'desc' ? 'chevron-down' : 'chevron-up'" :size="14" />
          </button>
        </div>

        <AppState
          v-if="store.loading && !store.orders.length"
          type="loading"
          title="正在读取账单"
        />
        <AppState
          v-else-if="store.error"
          type="error"
          title="账单读取失败"
          :description="store.error"
          action-text="重试"
          @action="store.load"
        />
        <AppState
          v-else-if="!store.evaluatedOrders.length"
          type="empty"
          title="当前周期暂无账单"
          description="在选票或当前选择页点击“记录购买”后，会自动记录到这里"
        />
        <template v-else>
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
                <p>{{ item.evaluation.totalMatches }}场 · {{ item.order.planSnapshot.selections.length }}个选项 · 完成{{ item.evaluation.settledMatches }}/{{ item.evaluation.totalMatches }} · 猜对{{ item.evaluation.correctMatches }}</p>
              </div>
              <AppIcon name="chevron-right" :size="18" />
            </div>
            <div class="ledger-item__finance">
              <div>
                <span>投注</span><strong class="numeric">¥{{ centsToYuan(item.order.stakeCents) }}</strong>
              </div>
              <div>
                <span>{{
                  item.status === "pending"
                    ? "当前已结算"
                    : item.order.returnManual
                      ? "实际回款"
                      : "理论回款"
                }}<small v-if="item.order.returnManual">手工调整</small></span><strong class="numeric amount-positive">¥{{ centsToYuan(item.displayedReturnCents) }}</strong>
              </div>
              <div>
                <span>净盈亏</span>
                <strong
                  :class="[
                    'numeric',
                    item.profitCents >= 0
                      ? 'amount-positive'
                      : 'amount-negative',
                  ]"
                >
                  {{ item.profitCents >= 0 ? "+" : "-" }}¥{{
                    centsToYuan(Math.abs(item.profitCents))
                  }}
                </strong>
              </div>
            </div>
          </AppCard>
          <p class="list-end">已经到底了</p>
        </template>
      </section>
    </div>

    <AppBottomSheet v-model:show="showDateSheet" title="日期筛选" description="选择统计账单的起止日期">
      <div class="date-sheet">
        <section>
          <h3>快捷选择</h3>
          <div class="date-sheet__quick">
            <AppButton
              :variant="store.preset === 'month' ? 'primary' : 'secondary'"
              @click="selectQuickRange('month')"
            >
              本月
            </AppButton>
            <AppButton
              :variant="
                store.preset === 'three-months' ? 'primary' : 'secondary'
              "
              @click="selectQuickRange('three-months')"
            >
              近3个月
            </AppButton>
            <AppButton
              :variant="store.preset === 'all' ? 'primary' : 'secondary'"
              @click="selectQuickRange('all')"
            >
              全部
            </AppButton>
          </div>
        </section>
        <section>
          <h3>自定义日期</h3>
          <div class="range-fields">
            <button type="button" @click="openInlineCalendar">
              <AppIcon name="calendar" :size="20" />{{ draftStart || "起始日期" }}
              <AppIcon name="chevron-down" :size="16" />
            </button>
            <b>至</b>
            <button type="button" @click="openInlineCalendar">
              <AppIcon name="calendar" :size="20" />{{ draftEnd || "结束日期" }}
              <AppIcon name="chevron-down" :size="16" />
            </button>
          </div>
          <p class="range-hint">最多可查询最近 12 个月的账单</p>
          <DateRangePicker
            v-if="showCalendar"
            v-model:start="draftStart"
            v-model:end="draftEnd"
            :min-date="minCalendarDate"
            :max-date="maxCalendarDate"
          />
        </section>
      </div>
      <template #footer>
        <div class="date-sheet__actions">
          <AppButton variant="secondary" block @click="draftStart = ''; draftEnd = ''; showCalendar = true">重置</AppButton>
          <AppButton block :loading="store.loading" @click="applyCustomRange">确定</AppButton>
        </div>
      </template>
    </AppBottomSheet>
  </div>
</template>

<style scoped>
.ledger-content {
  display: grid;
  gap: 12px;
}

.period-card {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
}

.period-card__icon {
  display: grid;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-control);
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
  gap: 3px;
}

.period-card__copy span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.period-card__copy strong {
  overflow: hidden;
  font-size: 14px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-ranges {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.ledger-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 10px 0 8px;
}

.ledger-summary > div {
  display: grid;
  min-width: 0;
  gap: 2px;
  padding: 0 var(--space-2);
  text-align: center;
}

.ledger-summary > div + div {
  border-left: 1px solid var(--color-divider);
}

.ledger-summary span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.ledger-summary strong {
  overflow: hidden;
  font-size: 16px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-summary p {
  grid-column: 1 / -1;
  margin: 6px 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-align: center;
}

.amount-positive,
.ledger-summary__return {
  color: var(--color-success);
}

.amount-negative {
  color: var(--color-danger);
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
  font-size: var(--font-size-sm);
  line-height: 1;
}

.ledger-item {
  display: grid;
  gap: 6px;
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
  font-size: var(--font-size-xs);
}

.status-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 650;
}

.status-pill--pending {
  color: #956f18;
  background: #fff6dc;
}

.status-pill--settled {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.ledger-item__title-row > div {
  min-width: 0;
}

.ledger-item__title-row h3 {
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-item__title-row p {
  display: block;
  overflow: hidden;
  margin: 2px 0 0;
  color: var(--color-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-item__finance {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding-top: 5px;
  border-top: 1px solid var(--color-divider);
}

.ledger-item__finance > div {
  display: grid;
  min-width: 0;
  gap: 1px;
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
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-end {
  margin: var(--space-4) 0;
  color: var(--color-text-tertiary);
  text-align: center;
}

.date-sheet {
  display: grid;
  gap: 16px;
  padding: 12px var(--page-gutter);
}

.date-sheet h3 {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  font-weight: 500;
}

.date-sheet section {
  display: grid;
  gap: var(--space-3);
}

.date-sheet__quick,
.date-sheet__actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.date-sheet__actions {
  grid-template-columns: repeat(2, 1fr);
}

.range-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
}

.range-fields button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 40px;
  gap: 7px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 13px;
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

  .range-fields button {
    font-size: 11px;
  }
}
</style>
