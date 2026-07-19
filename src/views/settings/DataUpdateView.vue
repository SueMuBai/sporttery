<script setup lang="ts">
import { showFailToast, showSuccessToast } from "vant";
import { computed, onMounted } from "vue";

import refreshIcon from "@/assets/ui/common/ic_refresh.svg?url";
import AppAssetIcon from "@/components/base/AppAssetIcon.vue";
import AppButton from "@/components/base/AppButton.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppPage from "@/components/base/AppPage.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { useSettingsStore } from "@/stores/settings";

const store = useSettingsStore();
const progress = computed(() => {
  if (!store.syncProgress.total) return 0;
  return Math.round(
    (store.syncProgress.completed / store.syncProgress.total) * 100,
  );
});
const failedCount = computed(
  () =>
    (store.syncReport?.matches.failed ?? 0) +
    (store.syncReport?.results.failed ?? 0),
);
const failedMatchIds = computed(() =>
  [
    ...new Set(
      (store.syncReport?.matches.errors ?? []).flatMap((error) =>
        error.matchId === undefined ? [] : [error.matchId],
      ),
    ),
  ].slice(0, 12),
);
const processedMatches = computed(() => {
  const report = store.syncReport?.matches;
  return report ? report.added + report.updated + report.unchanged : 0;
});
const changedResults = computed(() => {
  const report = store.syncReport?.results;
  return report ? report.added + report.updated : 0;
});
const successfulCount = computed(() => {
  const report = store.syncReport;
  if (!report) return 0;
  return (
    report.matches.added +
    report.matches.updated +
    report.matches.unchanged +
    report.results.added +
    report.results.updated +
    report.results.unchanged
  );
});
const syncErrors = computed(() =>
  [
    ...(store.syncReport?.matches.errors ?? []),
    ...(store.syncReport?.results.errors ?? []),
  ].slice(0, 4),
);

onMounted(() => store.load());

function formatSyncTime(value?: string): string {
  if (!value) return "尚未完成同步";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

async function synchronize(): Promise<void> {
  try {
    const report = await store.synchronize();
    const failed = report.matches.failed + report.results.failed;
    if (failed) showFailToast(`同步完成，${failed} 项失败`);
    else showSuccessToast("比赛和赛果已更新");
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  }
}

async function retryFailed(): Promise<void> {
  try {
    const report = await store.retryFailed();
    const failed = report.matches.failed + report.results.failed;
    if (failed) showFailToast(`重试完成，仍有 ${failed} 项失败`);
    else showSuccessToast("失败项目已重新同步");
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  }
}
</script>

<template>
  <AppPage secondary content-class="update-content">
    <template #header><SubpageHeader title="数据更新" subtitle="同步最新比赛、历史交锋与赛果" /></template>
    <AppCard
      :class="['sync-state-card', { 'sync-state-card--failed': failedCount }]"
      :padded="false"
    >
      <section class="sync-state-heading">
        <span
          :class="[
            'sync-state-icon',
            {
              'sync-state-icon--success': store.syncReport && !failedCount,
              'sync-state-icon--failed': failedCount,
            },
          ]"
        >
          <van-loading v-if="store.syncing" size="28" color="var(--color-primary)" />
          <AppIcon v-else-if="failedCount" name="warning" :size="30" />
          <AppIcon v-else-if="store.syncReport" name="success" :size="28" />
          <AppAssetIcon v-else :src="refreshIcon" :size="26" />
        </span>
        <div>
          <h2 v-if="store.syncing">正在更新比赛数据</h2>
          <h2 v-else-if="failedCount">部分数据更新失败</h2>
          <h2 v-else-if="store.syncReport">数据已是最新</h2>
          <h2 v-else>尚未同步数据</h2>
          <p v-if="store.syncing" class="sync-progress-count">
            <strong>{{ store.syncProgress.completed }}</strong> /
            {{ store.syncProgress.total || "--" }}
          </p>
          <p v-else-if="failedCount" class="sync-failure-count">
            <strong>成功 {{ successfulCount }}</strong>
            <span>失败 {{ failedCount }}</span>
          </p>
          <p v-else>
            最后更新：{{ formatSyncTime(store.syncReport?.completedAt) }}
          </p>
        </div>
      </section>

      <section v-if="store.syncing" class="sync-progress-panel">
        <div class="sync-progress-track">
          <span :style="{ width: progress + '%' }" />
        </div>
        <strong>{{ progress }}%</strong>
        <p>失败 {{ store.syncProgress.failed }} 项；已完成的数据会继续保留。</p>
      </section>

      <section v-else-if="failedCount" class="failure-detail">
        <h3>失败详情（{{ failedCount }}项）</h3>
        <div
          v-for="(error, index) in syncErrors"
          :key="(error.matchId || 'general') + '-' + index"
        >
          <span aria-hidden="true" />
          <strong>{{ error.matchId ? "比赛 " + error.matchId : "同步任务" }}</strong>
          <small>{{ error.message }}</small>
        </div>
        <p v-if="failedMatchIds.length">涉及比赛：{{ failedMatchIds.join("、") }}</p>
        <AppButton block :loading="store.syncing" @click="retryFailed">
          重试失败项
        </AppButton>
      </section>

      <section v-else-if="store.syncReport" class="sync-metrics">
        <div><span>比赛</span><strong>{{ processedMatches }}</strong></div>
        <div><span>新增</span><strong>{{ store.syncReport.matches.added }}</strong></div>
        <div><span>赛果</span><strong>{{ changedResults }}</strong></div>
        <div><span>失败</span><strong>{{ failedCount }}</strong></div>
      </section>
    </AppCard>

    <AppButton
      block
      :loading="store.syncing"
      :disabled="store.syncing"
      @click="synchronize"
    >
      <template #icon><AppAssetIcon :src="refreshIcon" :size="20" /></template>
      {{ store.syncing ? "正在同步…" : "立即更新全部数据" }}
    </AppButton>

    <section v-if="store.syncReport && !store.syncing" class="recent-report">
      <h2>最近一次更新报告</h2>
      <AppCard :padded="false">
        <div class="report-row">
          <span class="report-row__icon">
            <AppAssetIcon :src="refreshIcon" :size="20" />
          </span>
          <div>
            <small>{{ formatSyncTime(store.syncReport.completedAt) }}</small>
            <strong>比赛数据</strong>
          </div>
          <span>
            {{ store.syncReport.matches.added }} 新增 ·
            {{ store.syncReport.matches.updated }} 更新
          </span>
        </div>
        <div class="report-row">
          <span class="report-row__icon report-row__icon--result">
            <AppIcon name="success" :size="20" />
          </span>
          <div>
            <small>{{ formatSyncTime(store.syncReport.completedAt) }}</small>
            <strong>比赛结果</strong>
          </div>
          <span>
            {{ store.syncReport.results.added }} 新增 ·
            {{ store.syncReport.results.updated }} 更新
          </span>
        </div>
        <p class="report-meta">
          {{ store.syncReport.mode === "retry" ? "失败项重试" : "完整同步" }} ·
          耗时
          {{
            (
              (store.syncReport.matches.durationMs +
                store.syncReport.results.durationMs) /
              1000
            ).toFixed(1)
          }}
          秒
        </p>
      </AppCard>
    </section>

    <AppCard class="update-info">
      <AppIcon name="info" :size="20" />
      <p>同步采用增量保存；赔率或赛果变化时会更新最新记录，已成功的数据不会回退。</p>
    </AppCard>
  </AppPage>
</template>

<style scoped>
.update-content {
  align-content: start;
  gap: 12px;
}

.sync-state-card {
  display: grid;
}

.sync-state-heading {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 14px 12px;
}

.sync-state-heading h2,
.sync-state-heading p,
.sync-progress-panel p,
.failure-detail h3,
.failure-detail p,
.recent-report h2,
.report-meta,
.update-info p {
  margin: 0;
}

.sync-state-heading h2 {
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}

.sync-state-heading p {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 18px;
}

.sync-state-icon {
  display: grid;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-control);
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.sync-state-icon--success {
  color: var(--color-success);
  background: rgb(97 214 191 / 12%);
}

.sync-state-icon--failed {
  color: var(--color-danger);
  background: var(--color-accent-soft);
}

.sync-progress-count strong {
  color: var(--color-primary);
  font-size: 16px;
}

.sync-failure-count {
  display: flex;
  gap: 10px;
}

.sync-failure-count strong {
  color: var(--color-success);
  font-weight: 500;
}

.sync-failure-count span {
  color: var(--color-danger);
}

.sync-progress-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--color-divider);
}

.sync-progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--color-disabled);
}

.sync-progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary);
}

.sync-progress-panel > strong {
  color: var(--color-primary);
  font-size: 13px;
}

.sync-progress-panel p {
  grid-column: 1 / -1;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.sync-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 10px 0;
  border-top: 1px solid var(--color-divider);
}

.sync-metrics > div {
  display: grid;
  justify-items: center;
  gap: 3px;
}

.sync-metrics > div + div {
  border-left: 1px solid var(--color-divider);
}

.sync-metrics span {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.sync-metrics strong {
  font-size: 16px;
  line-height: 22px;
}

.failure-detail {
  display: grid;
  gap: 8px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--color-divider);
}

.failure-detail h3 {
  font-size: 14px;
  line-height: 20px;
}

.failure-detail > div {
  display: grid;
  grid-template-columns: 8px 86px minmax(0, 1fr);
  align-items: center;
  min-height: 36px;
  gap: 8px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
}

.failure-detail > div > span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-danger);
}

.failure-detail strong {
  font-size: 13px;
}

.failure-detail small,
.failure-detail p {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-report {
  display: grid;
  gap: 8px;
}

.recent-report h2 {
  font-size: 15px;
  line-height: 20px;
}

.report-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 52px;
  gap: 8px;
  padding: 6px 10px;
}

.report-row + .report-row {
  border-top: 1px solid var(--color-divider);
}

.report-row__icon {
  display: grid;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-control);
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.report-row__icon--result {
  color: var(--color-success);
  background: rgb(97 214 191 / 12%);
}

.report-row > div {
  display: grid;
  gap: 2px;
}

.report-row small,
.report-row > span:last-child {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.report-row strong {
  font-size: 13px;
  line-height: 18px;
}

.report-meta {
  padding: 8px 10px;
  border-top: 1px solid var(--color-divider);
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.update-info {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.update-info p {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}
</style>
