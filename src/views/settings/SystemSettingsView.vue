<script setup lang="ts">
import { showFailToast, showSuccessToast } from "vant";
import { computed, onMounted, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";

import AppButton from "@/components/base/AppButton.vue";
import AppBottomSheet from "@/components/base/AppBottomSheet.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppState from "@/components/base/AppState.vue";
import AppAssetIcon from "@/components/base/AppAssetIcon.vue";
import AppPage from "@/components/base/AppPage.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import systemSettingsIcon from "@/assets/ui/settings/ic_system_settings.svg?url";
import { useSettingsStore } from "@/stores/settings";
import { DEFAULT_SETTINGS, type AppSettings } from "@/types/domain";

interface SettingDefinition {
  key: NumericSettingKey;
  title: string;
  description: string;
  min: number;
  max: number;
}

type NumericSettingKey =
  | "historyLimits"
  | "workers"
  | "timeoutSeconds"
  | "retries"
  | "defaultMultiplier";
type BooleanSettingKey = "autoSyncMatches" | "expandMatchDetails";

const store = useSettingsStore();
const draft = ref<AppSettings>({ ...DEFAULT_SETTINGS });
const initial = ref<AppSettings>({ ...DEFAULT_SETTINGS });
const saved = ref(false);
const leaveSheetVisible = ref(false);
let resolveLeaveDecision: ((allow: boolean) => void) | undefined;

const settingItems: SettingDefinition[] = [
  {
    key: "historyLimits",
    title: "每场历史条数",
    description: "每场比赛保留的历史记录条数",
    min: 1,
    max: 50,
  },
  {
    key: "workers",
    title: "并发请求数",
    description: "同时向接口发起的最大请求数",
    min: 1,
    max: 12,
  },
  {
    key: "timeoutSeconds",
    title: "接口超时（秒）",
    description: "接口请求超时时间，单位：秒",
    min: 5,
    max: 120,
  },
  {
    key: "retries",
    title: "失败重试次数",
    description: "接口请求失败后的重试次数",
    min: 0,
    max: 8,
  },
  {
    key: "defaultMultiplier",
    title: "默认倍数",
    description: "生成方案的默认倍数",
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

function updateNumeric(key: NumericSettingKey, value: number): void {
  if (!Number.isFinite(value)) return;
  draft.value = { ...draft.value, [key]: value };
  saved.value = false;
}

function updateBoolean(key: BooleanSettingKey, value: boolean): void {
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
    <template #header>
      <SubpageHeader title="系统设置">
        <template #action>
          <button
            type="button"
            class="header-save"
            :disabled="!dirty || store.saving"
            @click="save"
          >
            保存
          </button>
        </template>
      </SubpageHeader>
    </template>
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
      <section class="setting-group">
        <h2>
          <AppAssetIcon :src="systemSettingsIcon" :size="22" />
          <span>系统参数</span>
        </h2>
        <div class="setting-list">
          <label
            v-for="item in settingItems"
            :key="item.key"
            class="setting-row"
          >
            <span class="setting-row__copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.description }}</small>
            </span>
            <input
              :value="draft[item.key]"
              type="number"
              inputmode="numeric"
              :min="item.min"
              :max="item.max"
              :aria-label="item.title"
              @input="
                updateNumeric(
                  item.key,
                  Number(($event.target as HTMLInputElement).value),
                )
              "
            />
          </label>
        </div>
      </section>
      <section class="setting-group setting-group--behavior">
        <h2>
          <span class="behavior-heading-icon">
            <AppIcon name="system" :size="22" />
          </span>
          <span>显示与行为</span>
        </h2>
        <div class="setting-list setting-list--toggles">
          <label class="setting-row setting-toggle-row">
            <span class="setting-row__copy">
              <strong>自动同步比赛</strong>
              <small>启动应用时自动同步最新比赛数据</small>
            </span>
            <van-switch
              :model-value="draft.autoSyncMatches"
              size="26px"
              aria-label="自动同步比赛"
              @update:model-value="updateBoolean('autoSyncMatches', $event)"
            />
          </label>
          <label class="setting-row setting-toggle-row">
            <span class="setting-row__copy">
              <strong>展开比赛明细</strong>
              <small>进入方案详情时默认展开比赛明细</small>
            </span>
            <van-switch
              :model-value="draft.expandMatchDetails"
              size="26px"
              aria-label="展开比赛明细"
              @update:model-value="updateBoolean('expandMatchDetails', $event)"
            />
          </label>
        </div>
      </section>
      <p v-if="dirty" class="save-state">有尚未保存的修改</p>
      <p v-else-if="saved" class="save-state save-state--success">
        所有设置已保存
      </p>
    </template>
    <template #footer>
      <div v-if="store.settings && !store.error" class="system-footer">
        <AppButton
          block
          :loading="store.saving"
          :disabled="!dirty"
          @click="save"
        >
          保存设置
        </AppButton>
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
        <AppButton
          block
          variant="secondary"
          @click="finishLeaveDecision(false)"
        >
          继续编辑
        </AppButton>
      </div>
    </AppBottomSheet>
  </AppPage>
</template>

<style scoped>
.system-content {
  align-content: start;
  gap: 16px;
  padding-top: 18px;
  padding-bottom: calc(76px + env(safe-area-inset-bottom));
}

.header-save {
  display: grid;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 14px;
  line-height: 20px;
  place-items: center;
}

.header-save:disabled {
  color: var(--color-text-tertiary);
}

.setting-group {
  display: grid;
  gap: 12px;
}

.setting-group h2 {
  display: flex;
  align-items: center;
  min-height: 28px;
  gap: 10px;
  margin: 0 4px;
  color: var(--color-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 21px;
}

.setting-group h2 :deep(.app-asset-icon) {
  color: var(--color-primary);
}

.behavior-heading-icon {
  display: grid;
  width: 22px;
  height: 22px;
  color: var(--color-violet);
  place-items: center;
}

.setting-list {
  display: grid;
  overflow: hidden;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default), var(--shadow-card);
}

.setting-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px;
  align-items: center;
  min-height: 68px;
  gap: 10px;
  padding: 8px 16px;
}

.setting-row + .setting-row {
  border-top: 1px solid var(--color-divider);
}

.setting-row__copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.setting-row__copy strong {
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}

.setting-row__copy small {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.setting-row input {
  width: 112px;
  height: 40px;
  padding: 0 12px;
  border: 0;
  outline: 0;
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font: inherit;
  font-size: 14px;
  line-height: 40px;
}

.setting-row input:focus {
  box-shadow: var(--outline-primary);
}

.setting-toggle-row {
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 68px;
}

.setting-toggle-row :deep(.van-switch) {
  flex: 0 0 auto;
  --van-switch-on-background: linear-gradient(135deg, #68b8ff, #5797f5);
  --van-switch-background: #dce4f1;
}

.save-state {
  margin: -4px 0 0;
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
  padding: var(--space-4) var(--page-gutter)
    calc(var(--space-4) + env(safe-area-inset-bottom));
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
</style>
