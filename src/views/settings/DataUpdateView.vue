<script setup lang="ts">
import { showFailToast, showSuccessToast, showToast } from "vant";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import refreshIcon from "@/assets/ui/common/ic_refresh.svg?url";
import cloudLocalIcon from "@/assets/ui/settings/ic_cloud_local.svg?url";
import dataUpdateIcon from "@/assets/ui/settings/ic_data_update.svg?url";
import trophyIcon from "@/assets/ui/settings/ic_trophy.svg?url";
import AppAssetIcon from "@/components/base/AppAssetIcon.vue";
import AppButton from "@/components/base/AppButton.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppPage from "@/components/base/AppPage.vue";
import AppRowChevron from "@/components/base/AppRowChevron.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import type { SyncSnapshot } from "@/features/sync/SyncService";
import { getDatabase } from "@/services/database/createDatabase";
import { useSettingsStore } from "@/stores/settings";

type SyncAction = "matches" | "results" | "retry" | "";
type TaskStatus = "success" | "failed";
type LogStatus = "completed" | "syncing" | "failed";

interface RecentTask {
  id: string;
  label: string;
  completedAt: string;
  status: TaskStatus;
  statusText: string;
  icon: "download" | "refresh";
}

interface SyncLog {
  id: string;
  label: string;
  time: string;
  status: LogStatus;
}

const store = useSettingsStore();
const router = useRouter();
const activeSync = ref<SyncAction>("");
const syncStartedAt = ref("");
const historySnapshots = ref<SyncSnapshot[]>([]);
const showAllFailures = ref(false);

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

const syncErrors = computed(() => [
  ...(store.syncReport?.matches.errors ?? []),
  ...(store.syncReport?.results.errors ?? []),
]);

const visibleSyncErrors = computed(() =>
  showAllFailures.value ? syncErrors.value : syncErrors.value.slice(0, 2),
);

const processedMatches = computed(() => {
  const report = store.syncReport?.matches;
  return report ? report.added + report.updated + report.unchanged : 0;
});

const totalMatches = computed(
  () => processedMatches.value + (store.syncReport?.matches.failed ?? 0),
);

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

const syncingTitle = computed(() => {
  if (activeSync.value === "matches") return "正在获取最新比赛";
  if (activeSync.value === "results") return "正在更新比赛结果";
  if (activeSync.value === "retry") return "正在重试失败项";
  return "正在同步比赛数据";
});

const syncingDetail = computed(() => {
  if (!store.syncProgress.total) return "正在连接数据服务…";
  if (activeSync.value === "results") return "正在读取并校验官方比赛结果…";
  return `正在同步第 ${Math.min(
    store.syncProgress.completed + 1,
    store.syncProgress.total,
  )} / ${store.syncProgress.total} 场比赛…`;
});

const recentTasks = computed<RecentTask[]>(() =>
  historySnapshots.value.slice(0, 3).map((snapshot, index) => {
    const matchesProcessed =
      snapshot.matches.added +
      snapshot.matches.updated +
      snapshot.matches.unchanged;
    const resultsProcessed =
      snapshot.results.added +
      snapshot.results.updated +
      snapshot.results.unchanged;
    const failures = snapshot.matches.failed + snapshot.results.failed;
    const resultsOnly = matchesProcessed === 0 && resultsProcessed > 0;
    const count = resultsOnly ? resultsProcessed : matchesProcessed;
    return {
      id: `${snapshot.completedAt}-${index}`,
      label: resultsOnly ? "更新比赛结果" : "获取最新比赛",
      completedAt: snapshot.completedAt,
      status: failures ? "failed" : "success",
      statusText: `${failures ? "失败" : "成功"} ${failures || count}`,
      icon: resultsOnly ? "refresh" : "download",
    };
  }),
);

const liveLogs = computed<SyncLog[]>(() => {
  const base = syncStartedAt.value || new Date().toISOString();
  const logs: SyncLog[] = [
    {
      id: "started",
      label: "开始同步数据",
      time: formatLogTime(base),
      status: "completed",
    },
    {
      id: "connected",
      label: store.syncProgress.total
        ? "已连接到数据服务"
        : "正在连接数据服务…",
      time: formatLogTime(base),
      status: store.syncProgress.total ? "completed" : "syncing",
    },
  ];

  if (store.syncProgress.total) {
    logs.push(
      {
        id: "list",
        label:
          activeSync.value === "results"
            ? "已获取官方赛果列表"
            : "已获取最新比赛列表",
        time: formatLogTime(base),
        status: "completed",
      },
      {
        id: "progress",
        label: `${syncingTitle.value} ${store.syncProgress.completed}/${store.syncProgress.total}`,
        time: formatLogTime(new Date().toISOString()),
        status: "syncing",
      },
    );
  }

  if (store.syncProgress.completed) {
    logs.push({
      id: "saved",
      label: `已安全保存 ${store.syncProgress.completed} 项数据`,
      time: formatLogTime(new Date().toISOString()),
      status: "completed",
    });
  }

  if (store.syncProgress.failed) {
    logs.push({
      id: "failed",
      label: `${store.syncProgress.failed} 项数据暂未更新`,
      time: formatLogTime(new Date().toISOString()),
      status: "failed",
    });
  }

  return logs;
});

onMounted(async () => {
  await store.load();
  await loadHistory();
});

function formatSyncTime(value?: string): string {
  if (!value) return "尚未完成同步";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatLogTime(value: string): string {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function loadHistory(): Promise<void> {
  try {
    const database = getDatabase();
    await database.initialize();
    const events = await database.listEvents("sync.completed", 3);
    historySnapshots.value = events.flatMap((event) => {
      const payload = event.payload as Partial<SyncSnapshot>;
      if (!payload.matches || !payload.results) return [];
      return [
        {
          matches: payload.matches,
          results: payload.results,
          completedAt: String(payload.completedAt || event.createdAt),
          mode: payload.mode === "retry" ? "retry" : "full",
        } satisfies SyncSnapshot,
      ];
    });
  } catch {
    historySnapshots.value = store.syncReport ? [store.syncReport] : [];
  }
}

function beginSync(action: Exclude<SyncAction, "">): void {
  activeSync.value = action;
  syncStartedAt.value = new Date().toISOString();
  showAllFailures.value = false;
}

async function synchronizeMatches(): Promise<void> {
  beginSync("matches");
  try {
    const report = await store.synchronizeMatches();
    if (report.matches.failed) {
      showFailToast(`比赛更新完成，${report.matches.failed} 项失败`);
    } else {
      showSuccessToast("最新比赛已获取");
    }
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  } finally {
    activeSync.value = "";
    await loadHistory();
  }
}

async function synchronizeResults(): Promise<void> {
  beginSync("results");
  try {
    const report = await store.synchronizeResults();
    if (report.results.failed) {
      showFailToast(`赛果更新完成，${report.results.failed} 项失败`);
    } else {
      showSuccessToast("比赛结果已更新");
    }
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  } finally {
    activeSync.value = "";
    await loadHistory();
  }
}

async function retryFailed(): Promise<void> {
  beginSync("retry");
  try {
    const report = await store.retryFailed();
    const failed = report.matches.failed + report.results.failed;
    if (failed) showFailToast(`重试完成，仍有 ${failed} 项失败`);
    else showSuccessToast("失败项目已重新同步");
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  } finally {
    activeSync.value = "";
    await loadHistory();
  }
}

function continueInBackground(): void {
  showToast({
    message: "同步将在后台继续",
    duration: 1800,
  });
  void router.back();
}

function showTask(task: RecentTask): void {
  showToast({
    message: `${task.label}\n${formatSyncTime(task.completedAt)}\n${task.statusText}`,
    duration: 2400,
  });
}
</script>

<template>
  <AppPage secondary content-class="update-content">
    <template #header><SubpageHeader title="数据更新" /></template>

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
          <van-loading
            v-if="store.syncing"
            type="spinner"
            size="30"
            color="var(--color-primary)"
          />
          <AppIcon v-else-if="failedCount" name="warning" :size="34" />
          <template v-else>
            <AppAssetIcon :src="dataUpdateIcon" :size="36" />
            <AppIcon
              v-if="store.syncReport"
              class="sync-state-badge"
              name="success"
              :size="16"
            />
          </template>
        </span>
        <div>
          <h2 v-if="store.syncing">{{ syncingTitle }}</h2>
          <h2 v-else-if="failedCount">部分数据更新失败</h2>
          <h2 v-else-if="store.syncReport">数据已是最新</h2>
          <h2 v-else>尚未同步数据</h2>
          <p v-if="store.syncing" class="sync-progress-count">
            <strong>{{ store.syncProgress.completed }}</strong> /
            {{ store.syncProgress.total || "--" }}
          </p>
          <p v-else-if="failedCount" class="sync-failure-count">
            <strong>成功{{ successfulCount }}项</strong>
            <span>失败{{ failedCount }}项</span>
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
        <p>{{ syncingDetail }}</p>
      </section>

      <section v-else-if="failedCount" class="failure-detail">
        <h3>失败详情（共{{ failedCount }}条）</h3>
        <div
          v-for="(error, index) in visibleSyncErrors"
          :key="(error.matchId || 'general') + '-' + index"
          class="failure-row"
        >
          <span aria-hidden="true" />
          <strong>{{
            error.matchId ? "比赛 " + error.matchId : "同步任务"
          }}</strong>
          <small>{{ error.message }}</small>
          <AppRowChevron />
        </div>
        <div class="failure-actions">
          <AppButton
            variant="secondary"
            :disabled="syncErrors.length <= 2"
            @click="showAllFailures = !showAllFailures"
          >
            {{ showAllFailures ? "收起详情" : `查看全部${failedCount}条` }}
          </AppButton>
          <AppButton :loading="store.syncing" @click="retryFailed">
            重试失败项
          </AppButton>
        </div>
      </section>

      <section v-else-if="store.syncReport" class="sync-metrics">
        <div>
          <span class="metric-icon metric-icon--match">
            <AppAssetIcon :src="trophyIcon" :size="22" />
          </span>
          <small>比赛</small><strong>{{ totalMatches }}</strong>
        </div>
        <div>
          <span class="metric-icon metric-icon--success"><AppIcon name="success" :size="20" /></span>
          <small>成功</small><strong>{{ processedMatches }}</strong>
        </div>
        <div>
          <span class="metric-icon metric-icon--failed"><AppIcon name="close" :size="20" /></span>
          <small>失败</small><strong>{{ failedCount }}</strong>
        </div>
        <div>
          <span class="metric-icon metric-icon--local">
            <AppAssetIcon :src="cloudLocalIcon" :size="22" />
          </span>
          <small>本地</small><strong>{{ store.syncReport.matches.unchanged }}</strong>
        </div>
      </section>
    </AppCard>

    <section class="sync-actions" aria-label="数据更新操作">
      <AppButton
        block
        size="large"
        :disabled="store.syncing"
        @click="synchronizeMatches"
      >
        <template #icon>
          <AppAssetIcon :src="cloudLocalIcon" :size="20" />
        </template>
        获取最新比赛
      </AppButton>
      <AppButton
        block
        size="large"
        variant="secondary"
        :disabled="store.syncing"
        @click="synchronizeResults"
      >
        <template #icon>
          <AppAssetIcon :src="refreshIcon" :size="20" />
        </template>
        更新比赛结果
      </AppButton>
    </section>

    <section v-if="store.syncing" class="sync-log-section">
      <h2>同步日志</h2>
      <AppCard class="sync-log-list" :padded="false">
        <div v-for="log in liveLogs" :key="log.id" class="sync-log-row">
          <span :class="['sync-log-status', `sync-log-status--${log.status}`]">
            <van-loading
              v-if="log.status === 'syncing'"
              type="spinner"
              size="18"
            />
            <AppIcon
              v-else
              :name="log.status === 'failed' ? 'close' : 'success'"
              :size="18"
            />
          </span>
          <div>
            <small>{{ log.time }}</small><strong>{{ log.label }}</strong>
          </div>
          <span :class="['task-pill', `task-pill--${log.status}`]">
            {{
              log.status === "syncing"
                ? "同步中"
                : log.status === "failed"
                  ? "失败"
                  : "已完成"
            }}
          </span>
        </div>
      </AppCard>
      <AppButton
        block
        size="large"
        variant="secondary"
        @click="continueInBackground"
      >
        后台继续
      </AppButton>
    </section>

    <section v-else-if="recentTasks.length" class="recent-tasks">
      <h2>最近任务</h2>
      <AppCard :padded="false">
        <button
          v-for="task in recentTasks"
          :key="task.id"
          type="button"
          class="recent-task-row"
          @click="showTask(task)"
        >
          <span :class="['recent-task-icon', `recent-task-icon--${task.icon}`]">
            <AppIcon :name="task.icon" :size="22" />
          </span>
          <span class="recent-task-copy">
            <small>{{ formatSyncTime(task.completedAt) }}</small>
            <strong>{{ task.label }}</strong>
          </span>
          <span :class="['task-pill', `task-pill--${task.status}`]">
            {{ task.statusText }}
          </span>
          <AppRowChevron />
        </button>
      </AppCard>
    </section>

    <AppCard class="update-info">
      <AppIcon name="info" :size="20" />
      <p>
        数据采用增量保存；赔率或赛果变化时更新最新记录，已成功的数据不会回退。
      </p>
    </AppCard>
  </AppPage>
</template>

<style scoped>
.update-content {
  align-content: start;
  gap: 14px;
  padding-top: 18px;
}

.sync-state-card {
  display: grid;
}

.sync-state-heading {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  align-items: center;
  min-height: 86px;
  gap: 12px;
  padding: 16px;
}

.sync-state-heading h2,
.sync-state-heading p,
.sync-progress-panel p,
.failure-detail h3,
.sync-log-section h2,
.recent-tasks h2,
.update-info p {
  margin: 0;
}

.sync-state-heading h2 {
  font-size: 17px;
  font-weight: 600;
  line-height: 22px;
}

.sync-state-heading p {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 18px;
}

.sync-state-icon {
  position: relative;
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  color: var(--color-primary);
  background: transparent;
}

.sync-state-icon--success {
  color: var(--color-primary);
}

.sync-state-icon--failed {
  color: var(--color-danger);
  background: transparent;
}

.sync-state-badge {
  position: absolute;
  right: 3px;
  bottom: 3px;
  padding: 1px;
  border-radius: 50%;
  color: var(--color-success);
  background: var(--color-surface);
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
  color: var(--color-mint);
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
  padding: 12px 16px 16px;
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
  background: linear-gradient(90deg, #5797f5, #72aeff);
}

.sync-progress-panel > strong {
  color: var(--color-primary);
  font-size: 13px;
}

.sync-progress-panel p {
  grid-column: 1 / -1;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 17px;
}

.sync-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 16px 0;
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

.metric-icon {
  display: grid;
  width: 26px;
  height: 26px;
  margin-bottom: 1px;
  place-items: center;
  color: var(--color-primary);
}

.metric-icon--success {
  color: var(--color-mint);
}

.metric-icon--failed {
  color: var(--color-danger);
}

.metric-icon--local {
  color: var(--color-violet);
}

.sync-metrics small {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.sync-metrics strong {
  font-size: 17px;
  line-height: 22px;
}

.sync-actions {
  display: grid;
  gap: 10px;
}

.failure-detail {
  display: grid;
  gap: 0;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--color-divider);
}

.failure-detail h3 {
  margin-bottom: 10px;
  font-size: 14px;
  line-height: 20px;
}

.failure-row {
  display: grid;
  grid-template-columns: 8px 92px minmax(0, 1fr) 20px;
  align-items: center;
  min-height: 48px;
  gap: 8px;
  padding: 0 10px;
  background: rgb(255 240 242 / 72%);
  box-shadow: inset 0 0 0 1px rgb(255 100 117 / 20%);
}

.failure-row:first-of-type {
  border-radius: 10px 10px 0 0;
}

.failure-row:nth-last-of-type(1) {
  border-radius: 0 0 10px 10px;
}

.failure-row + .failure-row {
  border-top: 1px solid rgb(255 100 117 / 16%);
}

.failure-row > span:first-child {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-danger);
}

.failure-row strong {
  font-size: 13px;
  line-height: 18px;
}

.failure-row small {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.failure-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.sync-log-section,
.recent-tasks {
  display: grid;
  gap: 8px;
}

.sync-log-section h2,
.recent-tasks h2 {
  margin-left: 2px;
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}

.sync-log-list {
  display: grid;
}

.sync-log-row,
.recent-task-row {
  display: grid;
  align-items: center;
  min-height: 58px;
  gap: 10px;
  padding: 7px 12px;
}

.sync-log-row {
  grid-template-columns: 36px minmax(0, 1fr) auto;
}

.sync-log-row + .sync-log-row,
.recent-task-row + .recent-task-row {
  border-top: 1px solid var(--color-divider);
}

.sync-log-status,
.recent-task-icon {
  display: grid;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  place-items: center;
}

.sync-log-status--syncing {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.sync-log-status--completed {
  color: var(--color-mint);
  background: rgb(97 214 191 / 10%);
}

.sync-log-status--failed {
  color: var(--color-danger);
  background: var(--color-accent-soft);
}

.sync-log-row > div,
.recent-task-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.sync-log-row small,
.recent-task-copy small {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-log-row strong,
.recent-task-copy strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-pill {
  min-width: 58px;
  padding: 5px 9px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  white-space: nowrap;
}

.task-pill--success,
.task-pill--completed {
  color: var(--color-success);
  background: rgb(97 214 191 / 14%);
}

.task-pill--syncing {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.task-pill--failed {
  color: var(--color-danger);
  background: var(--color-accent-soft);
}

.recent-task-row {
  grid-template-columns: 42px minmax(0, 1fr) auto 20px;
  width: 100%;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.recent-task-row:active {
  background: var(--color-surface-soft);
}

.recent-task-icon {
  width: 42px;
  height: 42px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.recent-task-icon--refresh {
  color: var(--color-violet);
  background: rgb(154 145 245 / 11%);
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
  line-height: 17px;
}

@media (max-width: 359px) {
  .failure-row {
    grid-template-columns: 8px 78px minmax(0, 1fr) 20px;
  }

  .recent-task-row {
    grid-template-columns: 38px minmax(0, 1fr) auto 20px;
    gap: 8px;
    padding-inline: 10px;
  }
}
</style>
