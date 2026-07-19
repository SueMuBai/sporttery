<script setup lang="ts">
import { showFailToast, showSuccessToast } from "vant";
import { computed, onMounted, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";

import AppButton from "@/components/base/AppButton.vue";
import AppBottomSheet from "@/components/base/AppBottomSheet.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppState from "@/components/base/AppState.vue";
import AppIcon, { type AppIconName } from "@/components/base/AppIcon.vue";
import AppPage from "@/components/base/AppPage.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { useSettingsStore } from "@/stores/settings";
import { DEFAULT_SETTINGS, type AppSettings } from "@/types/domain";

interface SettingDefinition {
  key: keyof AppSettings;
  title: string;
  description: string;
  icon: AppIconName;
  suffix?: string;
  min: number;
  max: number;
}

const store = useSettingsStore();
const draft = ref<AppSettings>({ ...DEFAULT_SETTINGS });
const initial = ref<AppSettings>({ ...DEFAULT_SETTINGS });
const saved = ref(false);
const leaveSheetVisible = ref(false);
let resolveLeaveDecision: ((allow: boolean) => void) | undefined;

const definitions: SettingDefinition[] = [
  {
    key: "historyLimits",
    title: "每场历史条数",
    description: "历史交锋最多读取的比赛数量",
    icon: "history",
    min: 1,
    max: 50,
  },
  {
    key: "workers",
    title: "并发请求数",
    description: "同时请求历史数据的任务数量",
    icon: "concurrency",
    min: 1,
    max: 12,
  },
  {
    key: "timeoutSeconds",
    title: "接口超时",
    description: "单次网络请求的最长等待时间",
    icon: "timeout",
    suffix: "秒",
    min: 5,
    max: 120,
  },
  {
    key: "retries",
    title: "失败重试次数",
    description: "网络失败后的自动重试次数",
    icon: "retry",
    min: 0,
    max: 8,
  },
  {
    key: "defaultMultiplier",
    title: "默认倍数",
    description: "新选票默认使用的投注倍数",
    icon: "multiplier",
    suffix: "倍",
    min: 1,
    max: 999,
  },
];

const dirty = computed(
  () => JSON.stringify(draft.value) !== JSON.stringify(initial.value),
);

onMounted(async () => {
  await store.load();
  if (store.settings) {
    draft.value = { ...store.settings };
    initial.value = { ...store.settings };
  }
});

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  return new Promise<boolean>((resolve) => {
    resolveLeaveDecision?.(false);
    resolveLeaveDecision = resolve;
    leaveSheetVisible.value = true;
  });
});

function finishLeaveDecision(allow: boolean): void {
  leaveSheetVisible.value = false;
  const resolve = resolveLeaveDecision;
  resolveLeaveDecision = undefined;
  resolve?.(allow);
}

function discardAndLeave(): void {
  draft.value = { ...initial.value };
  saved.value = false;
  finishLeaveDecision(true);
}

async function saveAndLeave(): Promise<void> {
  try {
    await store.saveSettings(draft.value);
    initial.value = { ...draft.value };
    finishLeaveDecision(true);
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  }
}

function update(key: keyof AppSettings, value: number): void {
  draft.value = { ...draft.value, [key]: value };
  saved.value = false;
}

async function save(): Promise<void> {
  try {
    await store.saveSettings(draft.value);
    initial.value = { ...draft.value };
    saved.value = true;
    showSuccessToast("系统设置已保存");
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  }
}
</script>

<template>
  <AppPage secondary content-class="system-content">
    <template #header><SubpageHeader title="系统设置" subtitle="调整数据获取与投注默认参数" /></template>
    <AppState
      v-if="store.loading && !store.settings"
      type="loading"
      title="正在读取设置"
    />
    <AppState
      v-else-if="store.error"
      type="error"
      title="设置读取失败"
      :description="store.error"
      action-text="重试"
      @action="store.load"
    />
    <template v-else>
      <AppCard class="setting-list" :padded="false">
        <div v-for="item in definitions" :key="item.key" class="setting-row">
          <span class="setting-row__icon"><AppIcon :name="item.icon" :size="20" /></span>
          <div class="setting-row__copy">
            <strong>{{ item.title }}</strong>
            <small>{{ item.description }}</small>
          </div>
          <van-stepper
            :model-value="draft[item.key]"
            :min="item.min"
            :max="item.max"
            integer
            :aria-label="`${item.title}，当前 ${draft[item.key]}${item.suffix || ''}`"
            @update:model-value="update(item.key, Number($event))"
          />
          <span v-if="item.suffix" class="setting-row__suffix">{{
            item.suffix
          }}</span>
        </div>
      </AppCard>
      <AppCard class="info-banner">
        <AppIcon name="info" :size="21" />
        <p>并发数过高可能触发接口限制。修改会在下一次数据同步或新建方案时生效。</p>
      </AppCard>
      <p v-if="dirty" class="save-state">有尚未保存的修改</p>
      <p v-else-if="saved" class="save-state save-state--success">
        所有设置已保存
      </p>
    </template>
    <template #footer>
      <div v-if="store.settings && !store.error" class="system-footer">
        <AppButton block :loading="store.saving" :disabled="!dirty" @click="save">保存设置</AppButton>
      </div>
    </template>
    <AppBottomSheet
      :show="leaveSheetVisible"
      title="设置尚未保存"
      description="请选择如何处理本次修改"
      close-label="继续编辑"
      @update:show="!$event && finishLeaveDecision(false)"
    >
      <div class="leave-actions">
        <AppButton block :loading="store.saving" @click="saveAndLeave">
          保存修改后离开
        </AppButton>
        <AppButton block variant="danger" @click="discardAndLeave">
          放弃修改
        </AppButton>
        <AppButton block variant="secondary" @click="finishLeaveDecision(false)">
          继续编辑
        </AppButton>
      </div>
    </AppBottomSheet>
  </AppPage>
</template>

<style scoped>
.system-content {
  align-content: start;
  padding-bottom: calc(76px + env(safe-area-inset-bottom));
}

.info-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.info-banner p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.setting-list {
  display: grid;
}

.setting-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto auto;
  align-items: center;
  min-height: 52px;
  gap: 8px;
  padding: 6px 10px;
}

.setting-row + .setting-row {
  border-top: 1px solid var(--color-divider);
}

.setting-row__icon {
  display: grid;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-control);
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.setting-row__copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.setting-row__copy strong {
  font-size: 14px;
}

.setting-row__copy small {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 1.35;
}

.setting-row__suffix {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.setting-row :deep(.van-stepper__minus),
.setting-row :deep(.van-stepper__plus),
.setting-row :deep(.van-stepper__input) {
  height: 36px;
  background: var(--color-surface-soft);
}

.setting-row :deep(.van-stepper__minus),
.setting-row :deep(.van-stepper__plus) {
  width: 36px;
  color: var(--color-primary);
}

.setting-row :deep(.van-stepper__input) {
  width: 40px;
}

.save-state {
  margin: 0;
  color: var(--color-warning);
  font-size: var(--font-size-sm);
  text-align: center;
}

.save-state--success {
  color: var(--color-success);
}

.leave-actions {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--page-gutter) calc(var(--space-4) + env(safe-area-inset-bottom));
}

.system-footer {
  position: fixed;
  z-index: 40;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 8px var(--page-gutter) calc(8px + env(safe-area-inset-bottom));
  background: rgb(255 255 255 / 96%);
  border-top: 1px solid var(--color-divider);
}

@media (max-width: 380px) {
  .setting-row {
    grid-template-columns: 34px minmax(0, 1fr) auto;
    gap: 8px;
    padding-inline: 10px;
  }

  .setting-row__suffix {
    display: none;
  }

  .setting-row__copy small {
    display: none;
  }
}
</style>
