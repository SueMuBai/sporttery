<script setup lang="ts">
import { showFailToast, showSuccessToast } from "vant";
import { computed, onMounted, ref, watch } from "vue";

import AppButton from "@/components/base/AppButton.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppChip from "@/components/base/AppChip.vue";
import AppHeader from "@/components/base/AppHeader.vue";
import AppIconButton from "@/components/base/AppIconButton.vue";
import AppState from "@/components/base/AppState.vue";
import { groupSelections } from "@/features/betting/calculator";
import { useLedgerStore, type EvaluatedLedgerOrder } from "@/stores/ledger";
import type { MarketCode, PlanSelection } from "@/types/domain";
import { centsToYuan, yuanToCents } from "@/utils/money";

const store = useLedgerStore();
const showDateSheet = ref(false);
const showCalendar = ref(false);
const showDatePicker = ref(false);
const activeDateEndpoint = ref<"start" | "end">("start");
const pickerValue = ref<string[]>([]);
const showDetail = ref(false);
const activeItem = ref<EvaluatedLedgerOrder>();
const draftStart = ref("");
const draftEnd = ref("");
const returnValue = ref("");
const returnError = ref("");

const marketLabels: Record<MarketCode, string> = {
  had: "胜平负",
  hhad: "让球胜平负",
  crs: "比分",
  ttg: "总进球",
  hafu: "半全场",
};

const dateLabel = computed(() => {
  if (!store.range.start || !store.range.end) return "全部账单";
  return `${store.range.start} 至 ${store.range.end}`;
});
const draftCalendarDates = computed<[Date, Date] | undefined>(() => {
  if (!draftStart.value || !draftEnd.value) return undefined;
  return [
    new Date(`${draftStart.value}T00:00:00`),
    new Date(`${draftEnd.value}T00:00:00`),
  ];
});
const minCalendarDate = computed(() => {
  const now = new Date();
  return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
});
const maxCalendarDate = computed(() => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
});
const activeGroups = computed(() =>
  activeItem.value
    ? [...groupSelections(activeItem.value.order.planSnapshot.selections)]
    : [],
);
const previewProfitCents = computed(() => {
  if (!activeItem.value) return 0;
  try {
    return (
      yuanToCents(returnValue.value || "0") - activeItem.value.order.stakeCents
    );
  } catch {
    return activeItem.value.profitCents;
  }
});

onMounted(() => store.load());

watch(showDateSheet, (visible) => {
  if (!visible) return;
  draftStart.value = store.range.start ?? "";
  draftEnd.value = store.range.end ?? "";
  showCalendar.value = false;
  showDatePicker.value = false;
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

function formatShortDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function outcomeLabel(selection: PlanSelection): string {
  if (selection.market === "had" || selection.market === "hhad") {
    return (
      { h: "胜", d: "平", a: "负" }[selection.outcome] ?? selection.outcome
    );
  }
  if (selection.market === "hafu") {
    const labels: Record<string, string> = { h: "胜", d: "平", a: "负" };
    const [half, full] = selection.outcome.split("-");
    return `${labels[half ?? ""] ?? half}${labels[full ?? ""] ?? full}`;
  }
  return selection.outcome;
}

async function selectQuickRange(
  preset: "month" | "three-months" | "all",
): Promise<void> {
  await store.applyPreset(preset);
  showDateSheet.value = false;
}

function applyCalendarRange(values: Date | Date[]): void {
  if (!Array.isArray(values) || values.length < 2) return;
  draftStart.value = formatShortDate(values[0]!);
  draftEnd.value = formatShortDate(values[1]!);
  showCalendar.value = false;
}

function openDateEndpoint(endpoint: "start" | "end"): void {
  activeDateEndpoint.value = endpoint;
  const fallback = endpoint === "start" ? draftStart.value : draftEnd.value;
  const value = fallback || formatShortDate(new Date());
  pickerValue.value = value.split("-");
  showCalendar.value = false;
  showDatePicker.value = true;
}

function applyPickedDate(payload: { selectedValues: string[] }): void {
  const value = payload.selectedValues.join("-");
  if (activeDateEndpoint.value === "start") draftStart.value = value;
  else draftEnd.value = value;
  showDatePicker.value = false;
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
  activeItem.value = item;
  returnValue.value = centsToYuan(item.displayedReturnCents);
  returnError.value = "";
  showDetail.value = true;
}

async function saveReturn(): Promise<void> {
  const item = activeItem.value;
  if (!item) return;
  try {
    const cents = yuanToCents(returnValue.value);
    if (cents < 0) throw new TypeError("回款金额不能小于 0");
    returnError.value = "";
    await store.updateReturn(item, cents);
    activeItem.value = store.evaluatedOrders.find(
      (candidate) => candidate.order.id === item.order.id,
    );
    showSuccessToast("回款金额已保存");
  } catch (reason) {
    returnError.value =
      reason instanceof Error ? reason.message : String(reason);
  }
}
</script>

<template>
  <div class="page ledger-page">
    <AppHeader title="彩果 · 长期账单" subtitle="记录每一次投入与回报">
      <template #action>
        <AppIconButton
          label="筛选账单日期"
          icon="calendar-o"
          @click="showDateSheet = true"
        />
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
          <van-icon name="calendar-o" size="22" />
        </div>
        <div class="period-card__copy">
          <span>统计周期</span>
          <strong class="numeric">{{ dateLabel }}</strong>
        </div>
        <van-icon name="arrow" size="18" color="var(--color-text-tertiary)" />
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
            <van-icon
              :name="store.sort === 'desc' ? 'arrow-down' : 'arrow-up'"
              size="14"
              aria-hidden="true"
            />
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
          description="保存方案并标记“已购”后，会自动记录到这里"
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
                <p>
                  {{ item.evaluation.totalMatches }} 场 ·
                  {{ item.order.planSnapshot.selections.length }} 个选项
                </p>
                <small>完成 {{ item.evaluation.settledMatches }}/{{
                  item.evaluation.totalMatches
                }}
                  · 猜对 {{ item.evaluation.correctMatches }}</small>
              </div>
              <van-icon
                name="arrow"
                size="18"
                color="var(--color-text-tertiary)"
              />
            </div>
            <div class="ledger-item__finance">
              <div>
                <span>投注</span><strong class="numeric">¥{{ centsToYuan(item.order.stakeCents) }}</strong>
              </div>
              <div>
                <span>{{
                  item.status === "pending" ? "当前回款" : "回款"
                }}</span><strong class="numeric amount-positive">¥{{ centsToYuan(item.displayedReturnCents) }}</strong>
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

    <van-popup
      v-model:show="showDateSheet"
      position="bottom"
      round
      closeable
      class="date-sheet-popup"
    >
      <div class="date-sheet">
        <h2>日期筛选</h2>
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
            <button type="button" @click="openDateEndpoint('start')">
              <van-icon name="calendar-o" />{{ draftStart || "起始日期" }}
            </button>
            <b>至</b>
            <button type="button" @click="openDateEndpoint('end')">
              <van-icon name="calendar-o" />{{ draftEnd || "结束日期" }}
            </button>
          </div>
          <button
            type="button"
            class="range-mode-button"
            @click="
              showCalendar = !showCalendar;
              showDatePicker = false;
            "
          >
            <van-icon name="notes-o" />
            {{ showCalendar ? "收起区间日历" : "展开区间日历" }}
          </button>
          <p class="range-hint">最多可查询最近 12 个月的账单</p>
          <van-date-picker
            v-if="showDatePicker"
            v-model="pickerValue"
            :title="
              activeDateEndpoint === 'start' ? '选择起始日期' : '选择结束日期'
            "
            :min-date="minCalendarDate"
            :max-date="maxCalendarDate"
            @confirm="applyPickedDate"
            @cancel="showDatePicker = false"
          />
          <van-calendar
            v-if="showCalendar"
            class="inline-calendar"
            type="range"
            :poppable="false"
            :min-date="minCalendarDate"
            :max-date="maxCalendarDate"
            :default-date="draftCalendarDates"
            color="var(--color-primary)"
            @confirm="applyCalendarRange"
          />
        </section>
        <div class="date-sheet__actions">
          <AppButton
            variant="secondary"
            block
            @click="
              draftStart = '';
              draftEnd = '';
              showCalendar = true;
              showDatePicker = false;
            "
          >
            重置
          </AppButton>
          <AppButton block :loading="store.loading" @click="applyCustomRange">
            确定
          </AppButton>
        </div>
      </div>
    </van-popup>

    <van-popup
      v-model:show="showDetail"
      position="bottom"
      round
      closeable
      class="detail-sheet-popup"
    >
      <div v-if="activeItem" class="ledger-detail">
        <header>
          <div>
            <h2>{{ activeItem.order.planName }}</h2>
            <p>{{ formatDateTime(activeItem.order.purchasedAt) }}</p>
          </div>
          <span :class="['status-pill', `status-pill--${activeItem.status}`]">
            {{ activeItem.status === "settled" ? "已完成" : "进行中" }}
          </span>
        </header>

        <AppCard class="detail-summary" :padded="false">
          <div>
            <span>投注</span><strong>¥{{ centsToYuan(activeItem.order.stakeCents) }}</strong>
          </div>
          <div>
            <span>当前回款</span><strong class="amount-positive">¥{{ centsToYuan(activeItem.displayedReturnCents) }}</strong>
          </div>
          <div>
            <span>净盈亏</span><strong
              :class="
                activeItem.profitCents >= 0
                  ? 'amount-positive'
                  : 'amount-negative'
              "
            >{{ activeItem.profitCents >= 0 ? "+" : "-" }}¥{{
              centsToYuan(Math.abs(activeItem.profitCents))
            }}</strong>
          </div>
        </AppCard>

        <div class="progress-banner">
          已完成 {{ activeItem.evaluation.settledMatches }}/{{
            activeItem.evaluation.totalMatches
          }}
          场，猜对 {{ activeItem.evaluation.correctMatches }} 场
        </div>

        <section class="detail-matches">
          <h3>方案快照</h3>
          <div
            v-for="[matchId, selections] in activeGroups"
            :key="matchId"
            class="detail-match-row"
          >
            <div>
              <strong>{{ store.matchById.get(matchId)?.homeTeam || matchId }} vs
                {{
                  store.matchById.get(matchId)?.awayTeam || "未知球队"
                }}</strong>
              <small>{{ store.matchById.get(matchId)?.matchNum }} ·
                {{ marketLabels[selections[0]!.market] }}</small>
            </div>
            <span>{{
              selections
                .map(
                  (selection) => `${outcomeLabel(selection)} ${selection.odds}`,
                )
                .join("、")
            }}</span>
          </div>
        </section>

        <section v-if="activeItem.status === 'settled'" class="return-editor">
          <div class="return-editor__heading">
            <div>
              <h3>回款金额</h3>
              <p>比赛已全部完成，可以按实际到账金额修正</p>
            </div>
            <van-icon name="edit" size="20" color="var(--color-primary)" />
          </div>
          <van-field
            v-model="returnValue"
            type="decimal"
            inputmode="decimal"
            label="¥"
            placeholder="0.00"
            :error-message="returnError"
            @update:model-value="returnError = ''"
          />
          <p>
            修改后净盈亏：<strong
              :class="
                previewProfitCents >= 0 ? 'amount-positive' : 'amount-negative'
              "
            >{{ previewProfitCents >= 0 ? "+" : "-" }}¥{{
              centsToYuan(Math.abs(previewProfitCents))
            }}</strong>
          </p>
          <AppButton block :loading="store.saving" @click="saveReturn">
            保存回款金额
          </AppButton>
        </section>
        <div v-else class="pending-banner">
          比赛完成后可录入回款金额；当前收益按已结算组合实时计算。
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.ledger-content {
  display: grid;
  gap: var(--space-4);
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
  padding: var(--space-4) 0 var(--space-3);
}

.ledger-summary > div,
.detail-summary > div {
  display: grid;
  min-width: 0;
  gap: 6px;
  padding: 0 var(--space-2);
  text-align: center;
}

.ledger-summary > div + div,
.detail-summary > div + div {
  border-left: 1px solid var(--color-divider);
}

.ledger-summary span,
.detail-summary span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.ledger-summary strong {
  overflow: hidden;
  font-size: clamp(15px, 4.5vw, 20px);
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-summary p {
  grid-column: 1 / -1;
  margin: var(--space-3) 0 0;
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
  gap: var(--space-3);
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
  min-height: 28px;
  padding: 0 11px;
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
  font-size: 19px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-item__title-row p,
.ledger-item__title-row small {
  display: block;
  margin: 3px 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.ledger-item__title-row small {
  font-size: 11px;
}

.ledger-item__finance {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-divider);
}

.ledger-item__finance > div {
  display: grid;
  min-width: 0;
  gap: 4px;
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

.ledger-item__finance strong {
  overflow: hidden;
  font-size: clamp(14px, 4vw, 18px);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-end {
  margin: var(--space-4) 0;
  color: var(--color-text-tertiary);
  text-align: center;
}

.date-sheet-popup,
.detail-sheet-popup {
  width: 100%;
  max-height: 88dvh;
  overflow-y: auto;
}

.date-sheet,
.ledger-detail {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5) var(--page-gutter)
    calc(var(--space-5) + env(safe-area-inset-bottom));
}

.date-sheet h2,
.date-sheet h3,
.ledger-detail h2,
.ledger-detail h3,
.ledger-detail p {
  margin: 0;
}

.date-sheet h2 {
  padding-right: 44px;
  font-size: 22px;
}

.date-sheet section {
  display: grid;
  gap: var(--space-3);
}

.date-sheet h3 {
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  font-weight: 500;
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
  min-height: 52px;
  gap: 7px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 13px;
}

.range-fields .van-icon {
  color: var(--color-primary);
  font-size: 20px;
}

.range-mode-button {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  min-height: 36px;
  gap: 6px;
  padding: 0 4px;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: var(--font-size-sm);
}

.range-hint {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.inline-calendar {
  overflow: hidden;
  border-radius: var(--radius-card);
  box-shadow: var(--outline-default);
}

.inline-calendar :deep(.van-calendar__header) {
  box-shadow: inset 0 -1px 0 var(--color-divider);
}

.ledger-detail header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding-right: 38px;
}

.ledger-detail header h2 {
  font-size: 21px;
}

.ledger-detail header p {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.detail-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: var(--space-4) 0;
}

.detail-summary strong {
  font-size: 15px;
}

.progress-banner,
.pending-banner {
  padding: var(--space-3);
  border-radius: var(--radius-control);
  color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: inset 0 0 0 1px rgb(87 151 245 / 20%);
  font-size: var(--font-size-sm);
}

.detail-matches {
  display: grid;
  gap: var(--space-2);
}

.detail-match-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-divider);
}

.detail-match-row > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.detail-match-row strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-match-row small {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.detail-match-row > span {
  flex: 0 0 auto;
  color: var(--color-primary);
  font-size: 11px;
}

.return-editor {
  display: grid;
  gap: var(--space-3);
}

.return-editor__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.return-editor__heading p,
.return-editor > p {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.return-editor :deep(.van-field) {
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
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
