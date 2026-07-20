<script setup lang="ts">
import { showFailToast, showSuccessToast } from "vant";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import deleteIcon from "@/assets/ui/plans/ic_delete_danger.svg?url";
import loadEditIcon from "@/assets/ui/plans/ic_load_edit.svg?url";
import renameIcon from "@/assets/ui/plans/ic_rename.svg?url";
import AppBottomSheet from "@/components/base/AppBottomSheet.vue";
import AppButton from "@/components/base/AppButton.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppIconButton from "@/components/base/AppIconButton.vue";
import AppInlineEditor from "@/components/base/AppInlineEditor.vue";
import AppState from "@/components/base/AppState.vue";
import { confirmAction } from "@/components/base/confirmAction";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import PurchaseSheet from "@/components/ticket/PurchaseSheet.vue";
import { groupSelections } from "@/features/betting/calculator";
import { selectionSettled, selectionWins } from "@/features/betting/settlement";
import { detailChoiceTone } from "@/features/plans/detailPresentation";
import { PLAN_NAME_MAX_LENGTH } from "@/features/plans/planName";
import { usePlanStore } from "@/stores/plans";
import { useTicketStore } from "@/stores/ticket";
import type { MatchResult, PlanSelection, SavedPlan } from "@/types/domain";
import { centsToYuan } from "@/utils/money";

interface DetailRow {
  matchId: number;
  selections: PlanSelection[];
  result?: MatchResult;
  settled: boolean;
  correct: boolean;
}

const route = useRoute();
const router = useRouter();
const store = usePlanStore();
const ticketStore = useTicketStore();
const planId = computed(() => String(route.params.id ?? ""));
const item = computed(() => store.find(planId.value));
const plan = computed(() => item.value?.plan);
const groups = computed(() =>
  plan.value ? [...groupSelections(plan.value.selections)] : [],
);
const resultById = computed(
  () => new Map(store.results.map((result) => [result.matchId, result])),
);
const detailRows = computed<DetailRow[]>(() =>
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
const detailStatus = computed(() => {
  const evaluation = item.value?.evaluation;
  if (!evaluation || evaluation.settledMatches === 0) {
    return { label: "待结算", kind: "waiting" } as const;
  }
  if (evaluation.pendingMatches > 0) {
    return { label: "进行中", kind: "progress" } as const;
  }
  return { label: "已完成", kind: "settled" } as const;
});
const hasSettledResult = computed(
  () => (item.value?.evaluation?.settledMatches ?? 0) > 0,
);
const showMenu = ref(false);
const renaming = ref(false);
const renameValue = ref("");
const showLoad = ref(false);
const showPurchase = ref(false);
const purchasing = ref(false);

onMounted(async () => {
  if (!store.plans.length) await store.load();
});

function plainOutcomeLabel(selection: PlanSelection): string {
  if (selection.market === "had" || selection.market === "hhad") {
    const value =
      { h: "胜", d: "平", a: "负" }[selection.outcome] ?? selection.outcome;
    return selection.market === "hhad" ? `让${value}` : value;
  }
  if (selection.market === "hafu") {
    const labels: Record<string, string> = { h: "胜", d: "平", a: "负" };
    const [half, full] = selection.outcome.split("-");
    return `${labels[half ?? ""] ?? half}${labels[full ?? ""] ?? full}`;
  }
  return selection.outcome;
}

function selectionSummary(selections: readonly PlanSelection[]): string {
  return selections.map(plainOutcomeLabel).join(" / ");
}

function matchTime(matchId: number): string {
  const value = store.matchById.get(matchId)?.matchDateTime || "";
  const match = value.match(
    /(?:\d{4}[-/])?(\d{2})[-/](\d{2})[T\s]+(\d{2}:\d{2})/,
  );
  return match ? `${match[1]}/${match[2]} ${match[3]}` : value;
}

function matchLeague(matchId: number): string {
  return String(store.matchById.get(matchId)?.payload.league || "");
}

function tagColor(tagName: string): string {
  return store.tags.find((tag) => tag.name === tagName)?.color ?? "#5797F5";
}

function requestLoad(): void {
  if (!plan.value) return;
  showMenu.value = false;
  if (ticketStore.hasUnsavedChanges) {
    showLoad.value = true;
    return;
  }
  store.loadIntoTicket(plan.value);
  router.push("/ticket");
}

async function applyLoad(saveCurrent: boolean): Promise<void> {
  if (!plan.value) return;
  try {
    if (saveCurrent) await ticketStore.savePlan();
    store.loadIntoTicket(plan.value);
    showLoad.value = false;
    await router.push("/ticket");
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  }
}

function beginRename(): void {
  if (!plan.value) return;
  renameValue.value = plan.value.name;
  renaming.value = true;
  showMenu.value = false;
}

async function saveRename(): Promise<void> {
  if (!plan.value || !renameValue.value.trim()) return;
  try {
    await store.rename(plan.value, renameValue.value);
    renaming.value = false;
    showSuccessToast("方案已改名");
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  }
}

async function recordPurchase(value: {
  name: string;
  stakeCents: number;
  purchasedAt: string;
  notes: string;
}): Promise<void> {
  if (!plan.value) return;
  purchasing.value = true;
  try {
    const purchasePlan: SavedPlan = { ...plan.value, name: value.name };
    await store.recordPurchase(purchasePlan, value);
    showPurchase.value = false;
    showSuccessToast("购买记录已加入账单");
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  } finally {
    purchasing.value = false;
  }
}

async function deletePlan(): Promise<void> {
  if (!plan.value) return;
  const current = plan.value;
  showMenu.value = false;
  try {
    await confirmAction({
      title: "删除方案？",
      message: `确定删除“${current.name}”吗？已有购买账单快照不会受到影响。`,
      confirmText: "删除",
      danger: true,
    });
    await store.remove(current.id);
    showSuccessToast("方案已删除");
    await router.replace("/plans");
  } catch {
    // User cancelled.
  }
}
</script>

<template>
  <div class="plan-detail-page" @click="showMenu = false">
    <SubpageHeader title="方案详情">
      <template #action>
        <AppIconButton
          class="detail-more"
          label="更多方案操作"
          icon="more"
          variant="plain"
          :aria-expanded="showMenu"
          @click.stop="showMenu = !showMenu"
        />
      </template>
    </SubpageHeader>

    <Transition name="detail-menu">
      <div v-if="showMenu && plan" class="detail-menu" @click.stop>
        <button type="button" @click="requestLoad">
          <img :src="loadEditIcon" alt="" aria-hidden="true" />
          <span>继续选号</span>
        </button>
        <button type="button" @click="beginRename">
          <img :src="renameIcon" alt="" aria-hidden="true" />
          <span>重命名方案</span>
        </button>
        <button type="button" class="danger" @click="deletePlan">
          <img :src="deleteIcon" alt="" aria-hidden="true" />
          <span>删除方案</span>
        </button>
      </div>
    </Transition>

    <main class="plan-detail-content">
      <AppState
        v-if="store.loading && !plan"
        type="loading"
        title="正在读取方案"
      />
      <AppState
        v-else-if="!plan"
        type="error"
        title="方案不存在"
        description="方案可能已被删除"
        action-text="返回方案管理"
        @action="router.replace('/plans')"
      />

      <template v-else-if="item?.evaluation">
        <AppInlineEditor
          v-if="renaming"
          v-model="renameValue"
          label="方案名称"
          :max-length="PLAN_NAME_MAX_LENGTH"
          @save="saveRename"
          @cancel="renaming = false"
        />

        <section class="plan-overview-card">
          <div class="plan-overview-card__heading">
            <h1>{{ plan.name }}</h1>
            <span :class="['plan-status', `plan-status--${detailStatus.kind}`]">
              {{ detailStatus.label }}
            </span>
            <button
              type="button"
              class="card-more"
              aria-label="更多方案操作"
              @click.stop="showMenu = !showMenu"
            >
              <AppIcon name="more" :size="22" />
            </button>
          </div>

          <div v-if="plan.tags.length" class="plan-tags">
            <span
              v-for="tag in plan.tags.slice(0, 3)"
              :key="tag"
              :style="{
                color: tagColor(tag),
                backgroundColor: `${tagColor(tag)}18`,
              }"
            >
              {{ tag }}
            </span>
          </div>

          <div class="result-summary">
            <div>
              <span>已完成</span>
              <strong class="numeric result-summary__completed">
                {{ item.evaluation.settledMatches }}/{{
                  item.evaluation.totalMatches
                }}
              </strong>
            </div>
            <div>
              <span>猜对</span>
              <strong class="numeric result-summary__correct">{{
                item.evaluation.correctMatches
              }}</strong>
            </div>
            <div>
              <span>猜错</span>
              <strong class="numeric result-summary__wrong">{{
                item.evaluation.wrongMatches
              }}</strong>
            </div>
          </div>

          <div class="finance-summary">
            <div>
              <span>投注</span>
              <strong class="numeric">¥{{ centsToYuan(item.evaluation.stakeCents) }}</strong>
            </div>
            <div>
              <span>当前奖金</span>
              <strong v-if="hasSettledResult" class="numeric">
                ¥{{ centsToYuan(item.evaluation.currentReturnCents) }}
              </strong>
              <strong v-else>—</strong>
            </div>
            <div>
              <span>当前收益</span>
              <strong
                v-if="hasSettledResult"
                :class="[
                  'numeric',
                  item.evaluation.currentProfitCents >= 0
                    ? 'finance-summary__profit'
                    : 'finance-summary__loss',
                ]"
              >
                {{ item.evaluation.currentProfitCents >= 0 ? "+" : "-" }}¥{{
                  centsToYuan(Math.abs(item.evaluation.currentProfitCents))
                }}
              </strong>
              <strong v-else>—</strong>
            </div>
          </div>
        </section>

        <section
          :class="[
            'match-result-card',
            { 'match-result-card--no-results': !hasSettledResult },
          ]"
          aria-label="方案比赛明细"
        >
          <article
            v-for="(row, index) in detailRows"
            :key="row.matchId"
            :class="[
              'match-result-row',
              { 'match-result-row--settled': row.settled },
            ]"
          >
            <span class="match-index numeric">{{ index + 1 }}</span>
            <div class="match-copy">
              <h2>
                {{ store.matchById.get(row.matchId)?.homeTeam || row.matchId }}
                <span>vs</span>
                {{ store.matchById.get(row.matchId)?.awayTeam || "未知球队" }}
              </h2>
              <p>
                {{
                  matchLeague(row.matchId) ||
                    store.matchById.get(row.matchId)?.matchNum ||
                    "比赛"
                }}
              </p>
            </div>
            <div class="match-choice">
              <span>选择</span>
              <strong
                :class="`choice--${detailChoiceTone(row.selections, {
                  anySettled: hasSettledResult,
                  settled: row.settled,
                  correct: row.correct,
                })}`"
              >
                {{ selectionSummary(row.selections) }}
              </strong>
            </div>
            <div v-if="row.settled" class="match-score">
              <span>赛果</span>
              <strong :class="row.correct ? 'score--correct' : 'score--wrong'">
                {{ row.result?.fullTimeScore || "—" }}
              </strong>
            </div>
            <div
              v-else-if="hasSettledResult"
              class="match-score match-score--pending"
            >
              <span>赛果</span>
              <strong>—</strong>
            </div>
            <div class="match-state">
              <span
                v-if="row.settled"
                :class="row.correct ? 'is-correct' : 'is-wrong'"
              >
                {{ row.correct ? "正确" : "错误" }}
              </span>
              <template v-else>
                <span class="is-pending">待赛</span>
                <time>{{ matchTime(row.matchId) }}</time>
              </template>
            </div>
          </article>
        </section>
      </template>
    </main>

    <footer v-if="plan && item?.evaluation" class="detail-actions">
      <AppButton variant="secondary" size="large" block @click="requestLoad">
        继续选号
      </AppButton>
      <AppButton
        v-if="hasSettledResult"
        size="large"
        block
        @click="router.push(`/plans/${plan.id}/combinations`)"
      >
        查看方案
      </AppButton>
      <AppButton v-else size="large" block @click="showPurchase = true">
        记录购买
      </AppButton>
    </footer>

    <PurchaseSheet
      v-if="plan && item?.evaluation"
      v-model:show="showPurchase"
      :default-name="plan.name"
      :default-stake-cents="item.evaluation.stakeCents"
      :loading="purchasing"
      @confirm="recordPurchase"
    />

    <AppBottomSheet
      v-model:show="showLoad"
      :title="`载入“${plan?.name || ''}”`"
      description="载入后将替换当前临时选票"
    >
      <div class="load-sheet">
        <p>
          当前选票已有
          {{ ticketStore.selectedMatchCount }} 场，载入后将替换当前临时内容。
        </p>
        <AppButton block @click="applyLoad(true)">保存当前方案后载入</AppButton>
        <AppButton block variant="secondary" @click="applyLoad(false)">
          放弃当前内容并载入
        </AppButton>
      </div>
    </AppBottomSheet>
  </div>
</template>

<style scoped>
.plan-detail-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.detail-more {
  width: 44px;
  height: 44px;
  color: var(--color-text);
  background: transparent;
  box-shadow: none;
}

.detail-menu {
  position: fixed;
  z-index: 70;
  top: calc(48px + env(safe-area-inset-top));
  right: var(--page-gutter);
  display: grid;
  width: 138px;
  border-radius: 10px;
  background: var(--color-surface);
  box-shadow:
    var(--outline-default),
    0 8px 24px rgb(52 78 112 / 14%);
}

.detail-menu button {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  min-height: 42px;
  gap: 8px;
  padding: 0 12px;
  border: 0;
  color: var(--color-text);
  background: transparent;
  font-size: 13px;
  text-align: left;
}

.detail-menu button + button {
  border-top: 1px solid var(--color-divider);
}

.detail-menu button:active {
  background: var(--color-surface-soft);
}

.detail-menu img {
  width: 20px;
  height: 20px;
}

.detail-menu .danger {
  color: var(--color-danger);
}

.detail-menu-enter-active,
.detail-menu-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
  transform-origin: top right;
}

.detail-menu-enter-from,
.detail-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}

.plan-detail-content {
  display: grid;
  gap: 10px;
  padding: 12px var(--page-gutter) calc(76px + env(safe-area-inset-bottom));
}

.plan-overview-card,
.match-result-card {
  overflow: hidden;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default), var(--shadow-card);
}

.plan-overview-card {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
}

.plan-overview-card__heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 36px;
  align-items: center;
  gap: 8px;
}

.plan-overview-card__heading h1 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-status {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}

.plan-status--waiting {
  color: #dc8c15;
  background: #fff3de;
}

.plan-status--progress {
  color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: inset 0 0 0 1px rgb(87 151 245 / 28%);
}

.plan-status--settled {
  color: var(--color-success);
  background: rgb(97 214 191 / 14%);
}

.card-more {
  display: grid;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: var(--color-text);
  background: transparent;
  place-items: center;
}

.plan-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.plan-tags span {
  padding: 4px 9px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 18px;
}

.result-summary,
.finance-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.result-summary {
  min-height: 72px;
  border-radius: 8px;
  box-shadow: var(--outline-default);
}

.result-summary > div,
.finance-summary > div {
  display: grid;
  min-width: 0;
  align-content: center;
  justify-items: center;
  gap: 4px;
  text-align: center;
}

.result-summary > div + div,
.finance-summary > div + div {
  position: relative;
}

.result-summary > div + div::before,
.finance-summary > div + div::before {
  position: absolute;
  top: 18%;
  bottom: 18%;
  left: 0;
  width: 1px;
  content: "";
  background: var(--color-divider);
}

.result-summary span,
.finance-summary span {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.result-summary strong {
  font-size: 20px;
  font-weight: 500;
}

.result-summary__completed {
  color: var(--color-primary);
}

.result-summary__correct {
  color: var(--color-success);
}

.result-summary__wrong {
  color: var(--color-danger);
}

.finance-summary {
  min-height: 50px;
}

.finance-summary strong {
  overflow: hidden;
  max-width: 100%;
  color: var(--color-text);
  font-size: 16px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.finance-summary .finance-summary__profit {
  color: var(--color-success);
}

.finance-summary .finance-summary__loss {
  color: var(--color-danger);
}

.match-result-row {
  display: grid;
  grid-template-columns:
    30px minmax(0, 1.6fr) minmax(48px, 0.62fr) minmax(44px, 0.56fr)
    minmax(68px, 0.8fr);
  align-items: center;
  min-height: 78px;
  gap: 8px;
  padding: 8px 12px;
}

.match-result-card--no-results .match-result-row {
  grid-template-columns: 30px minmax(0, 1.72fr) minmax(54px, 0.72fr) minmax(
      76px,
      0.9fr
    );
}

.match-result-row + .match-result-row {
  border-top: 1px solid var(--color-divider);
}

.match-index {
  display: grid;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #fff;
  background: var(--color-primary);
  font-size: 12px;
  place-items: center;
}

.match-copy {
  min-width: 0;
}

.match-copy h2,
.match-copy p {
  margin: 0;
}

.match-copy h2 {
  overflow: hidden;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-copy h2 span {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.match-copy p {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 16px;
}

.match-choice,
.match-score,
.match-state {
  display: grid;
  min-width: 0;
  align-content: center;
  justify-items: center;
  gap: 4px;
  text-align: center;
}

.match-choice,
.match-score {
  min-height: 48px;
  border-left: 1px solid var(--color-divider);
}

.match-choice span,
.match-score span {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.match-choice strong,
.match-score strong {
  overflow: hidden;
  max-width: 100%;
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.choice--win,
.choice--correct,
.score--correct {
  color: var(--color-success);
}

.choice--draw {
  color: var(--color-violet);
}

.choice--loss,
.choice--wrong,
.score--wrong {
  color: var(--color-danger);
}

.choice--pending,
.choice--default {
  color: var(--color-primary);
}

.match-state span {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}

.match-state time {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}

.match-state .is-pending {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.match-state .is-correct {
  color: var(--color-success);
  background: rgb(97 214 191 / 14%);
}

.match-state .is-wrong {
  color: var(--color-danger);
  background: var(--color-accent-soft);
}

.detail-actions {
  position: fixed;
  z-index: 40;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 8px var(--page-gutter) calc(8px + env(safe-area-inset-bottom));
  background: rgb(255 255 255 / 97%);
  border-top: 1px solid var(--color-border);
  box-shadow: 0 -4px 16px rgb(70 112 164 / 5%);
}

.load-sheet {
  display: grid;
  gap: 12px;
  padding: 12px var(--page-gutter) calc(12px + env(safe-area-inset-bottom));
}

.load-sheet p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

@media (min-width: 600px) {
  .detail-actions {
    right: 50%;
    left: 50%;
    width: 520px;
    transform: translateX(-50%);
  }
}

@media (max-width: 374px) {
  .match-result-row {
    grid-template-columns:
      26px minmax(0, 1.45fr) minmax(44px, 0.6fr) minmax(40px, 0.52fr)
      minmax(62px, 0.72fr);
    gap: 5px;
    padding-inline: 8px;
  }

  .match-copy h2 {
    font-size: 12px;
  }

  .match-choice strong,
  .match-score strong {
    font-size: 13px;
  }
}
</style>
