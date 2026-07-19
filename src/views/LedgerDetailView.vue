<script setup lang="ts">
import { showSuccessToast } from "vant";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import headerBackground from "@/assets/ui/common/bg_header.svg?url";
import AppButton from "@/components/base/AppButton.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppState from "@/components/base/AppState.vue";
import LedgerHistorySheet from "@/components/ledger/LedgerHistorySheet.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { groupSelections } from "@/features/betting/calculator";
import {
  selectionSettled,
  selectionWins,
} from "@/features/betting/settlement";
import { useLedgerStore } from "@/stores/ledger";
import type { MatchResult, MarketCode, PlanSelection } from "@/types/domain";
import { centsToYuan, yuanToCents } from "@/utils/money";

interface DetailRow {
  matchId: number;
  selections: PlanSelection[];
  result?: MatchResult;
  settled: boolean;
  correct: boolean;
}

const store = useLedgerStore();
const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id ?? ""));
const item = computed(() => store.find(id.value));
const groups = computed(() =>
  item.value
    ? [...groupSelections(item.value.order.planSnapshot.selections)]
    : [],
);
const resultById = computed(
  () => new Map(store.results.map((result) => [result.matchId, result])),
);
const rows = computed<DetailRow[]>(() =>
  groups.value.map(([matchId, selections]) => {
    const result = resultById.value.get(matchId);
    const settled = Boolean(
      selections[0] && selectionSettled(selections[0], result),
    );
    return {
      matchId,
      selections,
      result,
      settled,
      correct:
        settled &&
        Boolean(result) &&
        selections.some((selection) => selectionWins(selection, result!)),
    };
  }),
);
const returnValue = ref("");
const returnError = ref("");
const showHistory = ref(false);
const headerBackgroundImage = `url("${headerBackground}")`;

const marketLabels: Record<MarketCode, string> = {
  had: "胜平负",
  hhad: "让球胜平负",
  crs: "比分",
  ttg: "总进球",
  hafu: "半全场",
};

const previewProfitCents = computed(() => {
  if (!item.value) return 0;
  try {
    return yuanToCents(returnValue.value || "0") - item.value.order.stakeCents;
  } catch {
    return item.value.profitCents;
  }
});

const periodLabel = computed(() => {
  if (!store.range.start || !store.range.end) return "全部账单";
  return `${store.range.start} 至 ${store.range.end}`;
});

onMounted(async () => {
  if (!store.orders.length) await store.load();
  if (item.value) await store.loadAdjustments(item.value.order.id);
});

watch(
  item,
  (value) => {
    if (!value) return;
    returnValue.value = centsToYuan(value.displayedReturnCents);
    returnError.value = "";
  },
  { immediate: true },
);

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

function formatMatchTime(value?: string): string {
  if (!value) return "时间待定";
  const match = value.match(/(?:\d{4}[-/])?(\d{2})[-/](\d{2})[T\s]+(\d{2}:\d{2})/);
  return match ? `${match[1]}/${match[2]} ${match[3]}` : value;
}

function outcomeLabel(selection: PlanSelection): string {
  if (selection.market === "had" || selection.market === "hhad") {
    const outcome = { h: "胜", d: "平", a: "负" }[selection.outcome] ?? selection.outcome;
    return selection.market === "hhad" ? `让${outcome}` : outcome;
  }
  if (selection.market === "hafu") {
    const labels: Record<string, string> = { h: "胜", d: "平", a: "负" };
    const [half, full] = selection.outcome.split("-");
    return `${labels[half ?? ""] ?? half}${labels[full ?? ""] ?? full}`;
  }
  return selection.outcome;
}

function selectionSummary(selections: readonly PlanSelection[]): string {
  return selections.map((selection) => outcomeLabel(selection)).join(" / ");
}

function resetReturn(): void {
  if (!item.value) return;
  returnValue.value = centsToYuan(item.value.displayedReturnCents);
  returnError.value = "";
}

async function saveReturn(): Promise<void> {
  if (!item.value) return;
  try {
    returnError.value = "";
    const cents = yuanToCents(returnValue.value);
    if (cents < 0) {
      throw new RangeError("回款金额不能小于 0.00 元");
    }
    if (cents > 99_999_999) {
      throw new RangeError("回款金额不能超过 999999.99 元");
    }
    if (cents === item.value.displayedReturnCents) {
      showSuccessToast("回款金额未变化");
      return;
    }
    await store.updateReturn(item.value, cents);
    await store.loadAdjustments(id.value);
    showSuccessToast("实际回款已保存");
  } catch (reason) {
    returnError.value = reason instanceof Error ? reason.message : String(reason);
  }
}
</script>

<template>
  <div class="ledger-detail-page">
    <SubpageHeader title="方案详情">
      <template #action>
        <button type="button" class="history-action" @click="showHistory = true">
          修改历史
        </button>
      </template>
    </SubpageHeader>

    <AppState v-if="store.loading && !item" type="loading" title="正在读取账单" />
    <AppState
      v-else-if="!item"
      type="error"
      title="账单不存在"
      action-text="返回账单"
      @action="router.replace('/ledger')"
    />

    <template v-else>
      <section
        class="detail-hero"
        :style="{ backgroundImage: headerBackgroundImage }"
      >
        <div class="detail-hero__title">
          <h1>{{ item.order.planName }}</h1>
          <span :class="['status-pill', `status-pill--${item.status}`]">
            {{ item.status === "settled" ? "已完成" : "进行中" }}
          </span>
        </div>
        <p>方案创建时间：{{ formatDateTime(item.order.planSnapshot.createdAt) }}</p>
        <p>统计周期：{{ periodLabel }}</p>
        <span class="detail-hero__calendar">
          <AppIcon name="calendar" :size="28" />
        </span>
      </section>

      <main class="ledger-detail-content">
        <section class="return-card">
          <div class="return-card__stake">
            <span>投注</span>
            <strong class="numeric">¥{{ centsToYuan(item.order.stakeCents) }}</strong>
          </div>
          <div class="return-card__editor">
            <span>回款金额</span>
            <label :class="{ error: returnError }">
              <input
                v-model="returnValue"
                type="number"
                inputmode="decimal"
                min="0"
                max="999999.99"
                step="0.01"
                aria-label="回款金额"
                @input="returnError = ''"
              />
              <b>元</b>
            </label>
            <small :class="{ error: returnError }">
              {{ returnError || "金额范围 0.00～999999.99" }}
            </small>
            <div>
              <AppButton variant="ghost" size="small" @click="resetReturn">取消</AppButton>
              <AppButton size="small" :loading="store.saving" @click="saveReturn">保存</AppButton>
            </div>
          </div>
          <div class="return-card__profit">
            <span>净盈亏</span>
            <strong
              :class="[
                'numeric',
                previewProfitCents >= 0 ? 'amount-positive' : 'amount-negative',
              ]"
            >
              {{ previewProfitCents >= 0 ? '+' : '-' }}¥{{
                centsToYuan(Math.abs(previewProfitCents))
              }}
            </strong>
          </div>
        </section>

        <section class="result-card">
          <header>
            <span>共{{ item.evaluation.totalMatches }}场比赛</span>
            <p>
              正确 <strong class="amount-positive">{{ item.evaluation.correctMatches }}</strong> 场
              <i />
              错误 <strong class="amount-negative">{{ item.evaluation.wrongMatches }}</strong> 场
            </p>
          </header>
          <div class="result-list">
            <article v-for="(row, index) in rows" :key="row.matchId" class="result-row">
              <span
                :class="[
                  'result-row__state-icon',
                  row.settled
                    ? row.correct
                      ? 'is-correct'
                      : 'is-wrong'
                    : 'is-pending',
                ]"
              >
                <AppIcon
                  v-if="row.settled"
                  :name="row.correct ? 'check' : 'close'"
                  :size="16"
                />
                <b v-else>{{ index + 1 }}</b>
              </span>
              <div class="result-row__meta">
                <p><strong>{{ index + 1 }}</strong><span>{{ store.matchById.get(row.matchId)?.payload.league || "联赛" }}</span></p>
                <time>{{ formatMatchTime(store.matchById.get(row.matchId)?.matchDateTime) }}</time>
              </div>
              <div class="result-row__match">
                <h2>
                  {{ store.matchById.get(row.matchId)?.homeTeam || row.matchId }}
                  <span>vs</span>
                  {{ store.matchById.get(row.matchId)?.awayTeam || "未知球队" }}
                </h2>
                <p>
                  {{ marketLabels[row.selections[0]!.market] }} ·
                  {{ selectionSummary(row.selections) }}
                  <b class="numeric">{{ row.selections[0]?.odds }}</b>
                </p>
              </div>
              <div class="result-row__score">
                <strong>{{ row.result?.fullTimeScore || "—" }}</strong>
                <span
                  :class="
                    row.settled
                      ? row.correct
                        ? 'amount-positive'
                        : 'amount-negative'
                      : 'amount-muted'
                  "
                >
                  {{ row.settled ? (row.correct ? "正确" : "错误") : "待赛" }}
                </span>
              </div>
              <AppIcon name="chevron-down" :size="16" />
            </article>
          </div>
        </section>

        <p class="odds-note"><span />以上赔率为方案创建时的赔率<span /></p>
      </main>
    </template>

    <LedgerHistorySheet v-model:show="showHistory" :item="item" />
  </div>
</template>

<style scoped>
.ledger-detail-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.history-action {
  width: 70px;
  height: 44px;
  margin-right: -12px;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 13px;
  white-space: nowrap;
}

.detail-hero {
  position: relative;
  display: grid;
  min-height: 110px;
  align-content: center;
  gap: 6px;
  overflow: hidden;
  padding: 15px 22px;
  color: #fff;
  background-color: #80c3ff;
  background-position: center;
  background-size: cover;
}

.detail-hero__title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.detail-hero h1,
.detail-hero p {
  margin: 0;
}

.detail-hero h1 {
  max-width: calc(100% - 145px);
  overflow: hidden;
  font-size: 20px;
  line-height: 28px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-hero p {
  color: rgb(255 255 255 / 92%);
  font-size: 12px;
  line-height: 18px;
}

.detail-hero__calendar {
  position: absolute;
  top: 26px;
  right: 34px;
  display: grid;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  color: #fff;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 72%);
  place-items: center;
}

.status-pill {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  padding: 0 9px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.status-pill--pending {
  color: var(--color-primary-strong);
  background: var(--color-primary-soft);
}

.status-pill--settled {
  color: var(--color-success);
  background: #effbf6;
}

.ledger-detail-content {
  display: grid;
  gap: 10px;
  padding: 10px var(--page-gutter) calc(20px + env(safe-area-inset-bottom));
}

.return-card,
.result-card {
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default), var(--shadow-card);
}

.return-card {
  display: grid;
  grid-template-columns: minmax(74px, 0.85fr) minmax(144px, 1.65fr) minmax(82px, 0.95fr);
  min-height: 140px;
  padding: 12px 10px;
}

.return-card > div {
  display: grid;
  min-width: 0;
  align-content: start;
  justify-items: center;
  gap: 10px;
  text-align: center;
}

.return-card > div + div {
  border-left: 1px solid var(--color-divider);
}

.return-card span {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.return-card__stake strong,
.return-card__profit strong {
  margin-top: 12px;
  font-size: 18px;
  font-weight: 600;
  white-space: nowrap;
}

.return-card__editor label {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  width: calc(100% - 12px);
  height: 42px;
  padding: 0 9px;
  border-radius: var(--radius-control);
  box-shadow: var(--outline-primary);
}

.return-card__editor label.error {
  box-shadow: inset 0 0 0 1.5px var(--color-danger);
}

.return-card__editor input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font-size: 16px;
}

.return-card__editor label b {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.return-card__editor small {
  color: var(--color-text-secondary);
  font-size: 9px;
  line-height: 13px;
}

.return-card__editor small.error {
  color: var(--color-danger);
}

.return-card__editor > div {
  display: grid;
  width: calc(100% - 12px);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.result-card {
  overflow: hidden;
  padding: 0 8px 8px;
}

.result-card > header {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.result-card > header p {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
}

.result-card > header i {
  width: 1px;
  height: 14px;
  margin: 0 5px;
  background: var(--color-divider);
}

.result-list {
  display: grid;
  gap: 8px;
}

.result-row {
  display: grid;
  grid-template-columns: 26px minmax(56px, 0.72fr) minmax(0, 1.7fr) minmax(42px, 0.55fr) 16px;
  align-items: center;
  min-height: 62px;
  gap: 7px;
  padding: 6px 8px;
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
}

.result-row__state-icon {
  display: grid;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #fff;
  place-items: center;
}

.result-row__state-icon.is-correct {
  background: var(--color-mint);
}

.result-row__state-icon.is-wrong {
  background: var(--color-danger);
}

.result-row__state-icon.is-pending {
  background: var(--color-primary);
}

.result-row__state-icon b {
  font-size: 11px;
}

.result-row__meta,
.result-row__match,
.result-row__score {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.result-row__meta {
  padding-right: 7px;
  border-right: 1px solid var(--color-divider);
}

.result-row__meta p,
.result-row__match h2,
.result-row__match p {
  margin: 0;
}

.result-row__meta p {
  display: flex;
  align-items: center;
  gap: 6px;
}

.result-row__meta p strong {
  color: var(--color-text);
  font-size: 15px;
}

.result-row__meta p span,
.result-row__meta time,
.result-row__match p {
  color: var(--color-text-secondary);
  font-size: 9px;
  line-height: 14px;
}

.result-row__match h2 {
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-row__match h2 span {
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.result-row__match p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-row__match p b {
  margin-left: 6px;
  font-weight: 400;
}

.result-row__score {
  justify-items: center;
  padding-left: 6px;
  border-left: 1px solid var(--color-divider);
}

.result-row__score strong {
  font-size: 14px;
  font-weight: 500;
}

.result-row__score span {
  font-size: 11px;
}

.result-row > :deep(.app-icon:last-child) {
  color: var(--color-text-secondary);
}

.odds-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 6px 0 0;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.odds-note span {
  width: 30px;
  height: 1px;
  background: var(--color-divider);
}

.amount-positive {
  color: var(--color-success);
}

.amount-negative {
  color: var(--color-danger);
}

.amount-muted {
  color: var(--color-placeholder);
}

@media (max-width: 359px) {
  .return-card {
    grid-template-columns: minmax(64px, 0.8fr) minmax(132px, 1.7fr) minmax(72px, 0.9fr);
    padding-inline: 6px;
  }

  .return-card__stake strong,
  .return-card__profit strong {
    font-size: 15px;
  }

  .result-row {
    grid-template-columns: 24px minmax(50px, 0.66fr) minmax(0, 1.6fr) minmax(38px, 0.5fr) 14px;
    gap: 4px;
    padding-inline: 5px;
  }
}
</style>
