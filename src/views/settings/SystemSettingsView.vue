<script setup lang="ts">
import { showConfirmDialog, showFailToast, showSuccessToast } from "vant";
import { computed, onMounted, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";

import AppButton from "@/components/base/AppButton.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppState from "@/components/base/AppState.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { useSettingsStore } from "@/stores/settings";
import { DEFAULT_SETTINGS, type AppSettings } from "@/types/domain";

interface SettingDefinition {
  key: keyof AppSettings;
  title: string;
  description: string;
  icon: string;
  suffix?: string;
  min: number;
  max: number;
}

const store = useSettingsStore();
const draft = ref<AppSettings>({ ...DEFAULT_SETTINGS });
const initial = ref<AppSettings>({ ...DEFAULT_SETTINGS });
const saved = ref(false);

const definitions: SettingDefinition[] = [
  {
    key: "historyLimits",
    title: "每场历史条数",
    description: "历史交锋最多读取的比赛数量",
    icon: "clock-o",
    min: 1,
    max: 50,
  },
  {
    key: "workers",
    title: "并发请求数",
    description: "同时请求历史数据的任务数量",
    icon: "cluster-o",
    min: 1,
    max: 12,
  },
  {
    key: "timeoutSeconds",
    title: "接口超时",
    description: "单次网络请求的最长等待时间",
    icon: "underway-o",
    suffix: "秒",
    min: 5,
    max: 120,
  },
  {
    key: "retries",
    title: "失败重试次数",
    description: "网络失败后的自动重试次数",
    icon: "replay",
    min: 0,
    max: 8,
  },
  {
    key: "defaultMultiplier",
    title: "默认倍数",
    description: "新选票默认使用的投注倍数",
    icon: "balance-o",
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
  try {
    await showConfirmDialog({
      title: "设置尚未保存",
      message: "离开后本次修改将丢失。",
      confirmButtonText: "放弃修改",
      cancelButtonText: "继续编辑",
      confirmButtonColor: "#EF5B67",
    });
    return true;
  } catch {
    return false;
  }
});

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
  <div class="subpage settings-subpage">
    <SubpageHeader title="系统设置" subtitle="调整数据获取与投注默认参数" />
    <main class="subpage-content system-content">
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
        <AppCard class="info-banner">
          <van-icon name="info-o" size="21" />
          <p>并发数过高可能触发接口限制。修改会在下一次数据同步时生效。</p>
        </AppCard>
        <AppCard class="setting-list" :padded="false">
          <div v-for="item in definitions" :key="item.key" class="setting-row">
            <span class="setting-row__icon"><van-icon :name="item.icon" size="21" /></span>
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
        <p v-if="dirty" class="save-state">有尚未保存的修改</p>
        <p v-else-if="saved" class="save-state save-state--success">
          所有设置已保存
        </p>
        <AppButton
          block
          :loading="store.saving"
          :disabled="!dirty"
          @click="save"
        >
          保存设置
        </AppButton>
      </template>
    </main>
  </div>
</template>

<style scoped>
.settings-subpage {
  min-height: 100dvh;
  background: var(--color-page);
}

.system-content {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) var(--page-gutter) var(--space-8);
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
  grid-template-columns: 38px minmax(0, 1fr) auto auto;
  align-items: center;
  min-height: 78px;
  gap: var(--space-3);
  padding: 10px var(--space-4);
}

.setting-row + .setting-row {
  border-top: 1px solid var(--color-divider);
}

.setting-row__icon {
  display: grid;
  width: 38px;
  height: 38px;
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
