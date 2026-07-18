<script setup lang="ts">
import { showFailToast, showSuccessToast } from "vant";
import { computed } from "vue";

import AppButton from "@/components/base/AppButton.vue";
import AppCard from "@/components/base/AppCard.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { useSettingsStore } from "@/stores/settings";

const store = useSettingsStore();
const progress = computed(() => {
  if (!store.syncProgress.total) return 0;
  return Math.round(
    (store.syncProgress.completed / store.syncProgress.total) * 100,
  );
});

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
</script>

<template>
  <div class="subpage update-page">
    <SubpageHeader title="数据更新" subtitle="同步最新比赛、历史交锋与赛果" />
    <main class="subpage-content update-content">
      <AppCard class="update-hero">
        <span class="update-icon"><van-icon name="replay" size="32" /></span>
        <div>
          <h2>{{ store.syncing ? "正在更新数据" : "保持比赛数据最新" }}</h2>
          <p>同步采用增量保存；赔率或赛果发生变化时会更新最新记录。</p>
        </div>
      </AppCard>
      <AppCard v-if="store.syncing" class="progress-card">
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
      </AppCard>
      <AppCard v-if="store.syncReport" class="report-card" :padded="false">
        <h2>最近一次更新报告</h2>
        <div>
          <span>比赛与历史</span><strong>新增 {{ store.syncReport.matches.added }} · 更新
            {{ store.syncReport.matches.updated }}</strong><small>失败 {{ store.syncReport.matches.failed }}</small>
        </div>
        <div>
          <span>赛果</span><strong>新增 {{ store.syncReport.results.added }} · 更新
            {{ store.syncReport.results.updated }}</strong><small>失败 {{ store.syncReport.results.failed }}</small>
        </div>
      </AppCard>
      <AppButton block :loading="store.syncing" @click="synchronize">
        {{ store.syncing ? "正在同步…" : "立即更新全部数据" }}
      </AppButton>
    </main>
  </div>
</template>

<style scoped>
.update-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.update-content {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) var(--page-gutter) var(--space-8);
}

.update-hero {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.update-icon {
  display: grid;
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  border-radius: 50%;
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.update-hero h2,
.update-hero p,
.progress-card p,
.report-card h2 {
  margin: 0;
}

.update-hero h2 {
  font-size: 19px;
}

.update-hero p,
.progress-card p {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.progress-card {
  display: grid;
  gap: var(--space-3);
}

.progress-heading {
  display: flex;
  justify-content: space-between;
}

.report-card {
  display: grid;
  padding-top: var(--space-3);
}

.report-card h2 {
  padding: 0 var(--space-4) var(--space-3);
  font-size: 17px;
}

.report-card > div {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 56px;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  border-top: 1px solid var(--color-divider);
}

.report-card span,
.report-card small {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.report-card strong {
  font-size: 13px;
}
</style>
