<script setup lang="ts">
import { showFailToast, showSuccessToast } from "vant";
import { computed, onMounted } from "vue";

import refreshIcon from "@/assets/ui/common/ic_refresh.svg?url";
import AppAssetIcon from "@/components/base/AppAssetIcon.vue";
import AppButton from "@/components/base/AppButton.vue";
import AppCard from "@/components/base/AppCard.vue";
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
    <AppCard class="update-panel" :padded="false">
      <section class="update-summary">
        <span class="update-icon"><AppAssetIcon :src="refreshIcon" :size="20" /></span>
        <div>
          <h2>{{ store.syncing ? "正在更新数据" : "保持比赛数据最新" }}</h2>
          <p>增量保存比赛与赛果，赔率变化时同步覆盖最新记录。</p>
          <small>上次成功：{{ formatSyncTime(store.syncReport?.completedAt) }}</small>
        </div>
      </section>
      <section v-if="store.syncing" class="progress-section">
        <div class="progress-heading">
          <strong>历史交锋</strong><span>{{ store.syncProgress.completed }}/{{
            store.syncProgress.total
          }}</span>
        </div>
        <van-progress
          :percentage="progress"
          color="var(--color-primary)"
          track-color="var(--color-primary-soft)"
        />
        <p>失败 {{ store.syncProgress.failed }} 项，已完成的数据会继续保留。</p>
      </section>
      <section v-if="store.syncReport" class="report-section">
        <h2>最近一次更新报告</h2>
        <div class="report-row">
          <span>比赛</span><strong>新增 {{ store.syncReport.matches.added }} · 更新
            {{ store.syncReport.matches.updated }}</strong><small>失败 {{ store.syncReport.matches.failed }}</small>
        </div>
        <div class="report-row">
          <span>赔率</span><strong>变化 {{ store.syncReport.matches.oddsChanged }}</strong><small>增量记录</small>
        </div>
        <div class="report-row">
          <span>赛果</span><strong>新增 {{ store.syncReport.results.added }} · 更新
            {{ store.syncReport.results.updated }}</strong><small>失败 {{ store.syncReport.results.failed }}</small>
        </div>
        <p class="report-meta">
          {{ store.syncReport.mode === "retry" ? "失败项重试" : "完整同步" }} ·
          耗时 {{ ((store.syncReport.matches.durationMs + store.syncReport.results.durationMs) / 1000).toFixed(1) }} 秒
        </p>
      </section>
      <section v-if="failedCount" class="failed-section">
        <div>
          <h2>{{ failedCount }} 项未完成</h2>
          <p v-if="failedMatchIds.length">涉及比赛：{{ failedMatchIds.join("、") }}</p>
          <p v-else>网络恢复后可只重试失败数据。</p>
        </div>
        <AppButton size="small" variant="secondary" :loading="store.syncing" @click="retryFailed">重试失败项</AppButton>
      </section>
    </AppCard>
    <AppButton block :loading="store.syncing" @click="synchronize">
      {{ store.syncing ? "正在同步…" : "立即更新全部数据" }}
    </AppButton>
  </AppPage>
</template>

<style scoped>
.update-content {
  align-content: start;
  gap: 12px;
}

.update-panel {
  display: grid;
}

.update-summary {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 10px;
}

.update-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: var(--radius-control);
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.update-summary h2,
.update-summary p,
.progress-section p,
.report-section h2,
.failed-section h2,
.failed-section p {
  margin: 0;
}

.update-summary h2,
.report-section h2,
.failed-section h2 {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.update-summary p {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 18px;
}

.update-summary small {
  display: block;
  margin-top: 2px;
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 16px;
}

.progress-section {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--color-divider);
}

.progress-heading {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  line-height: 18px;
}

.progress-section p {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.report-section {
  display: grid;
  border-top: 1px solid var(--color-divider);
}

.report-section h2 {
  padding: 10px;
}

.report-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 48px;
  gap: 8px;
  padding: 0 10px;
  border-top: 1px solid var(--color-divider);
}

.report-row span,
.report-row small {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.report-row strong {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}

.report-section .report-meta {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid var(--color-divider);
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.failed-section {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--color-divider);
  color: var(--color-danger);
  background: var(--color-accent-soft);
}

.failed-section p {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}
</style>
