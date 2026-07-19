import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { getSyncService } from "@/features/sync/getSyncService";
import type { SyncSnapshot } from "@/features/sync/SyncService";
import { validateSettings } from "@/features/settings/validation";
import { MAX_PLAN_TAG_NAME_LENGTH } from "@/features/plans/tagValidation";
import { getDatabase } from "@/services/database/createDatabase";
import type { AppSettings, PlanTag } from "@/types/domain";

const TAG_COLORS = [
  "#5797F5",
  "#61D6BF",
  "#9A91F5",
  "#FF8FB3",
  "#E8AA32",
  "#FF7D7D",
];

export const useSettingsStore = defineStore("settings", () => {
  const database = getDatabase();
  const syncService = getSyncService();
  const loading = ref(false);
  const saving = ref(false);
  const syncing = ref(false);
  const error = ref("");
  const settings = ref<AppSettings>();
  const tags = ref<PlanTag[]>([]);
  const tagUsage = ref<Record<string, number>>({});
  const syncReport = ref<SyncSnapshot>();
  const syncProgress = ref({ completed: 0, total: 0, failed: 0 });

  const settingsSummary = computed(() =>
    settings.value
      ? `${settings.value.historyLimits} / ${settings.value.workers} / ${settings.value.timeoutSeconds}s`
      : "读取中",
  );

  async function load(): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
      await database.initialize();
      const [storedSettings, storedTags, storedPlans, latestSync] =
        await Promise.all([
          database.getSettings(),
          database.listTags(),
          database.listPlans(),
          syncService.latestSnapshot(),
        ]);
      settings.value = storedSettings;
      tags.value = storedTags;
      tagUsage.value = Object.fromEntries(
        storedTags.map((tag) => [
          tag.name,
          storedPlans.filter((plan) => plan.tags.includes(tag.name)).length,
        ]),
      );
      syncReport.value = latestSync;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loading.value = false;
    }
  }

  async function saveSettings(value: AppSettings): Promise<void> {
    validateSettings(value);
    saving.value = true;
    try {
      await database.saveSettings({ ...value });
      settings.value = { ...value };
    } finally {
      saving.value = false;
    }
  }

  async function saveTag(
    name: string,
    color: string,
    originalName?: string,
  ): Promise<PlanTag> {
    const normalized = name.trim();
    if (!normalized) throw new TypeError("请输入标签名称");
    if (normalized.length > MAX_PLAN_TAG_NAME_LENGTH) {
      throw new RangeError(`标签名称最多 ${MAX_PLAN_TAG_NAME_LENGTH} 个字符`);
    }
    if (!originalName && tags.value.length >= 8)
      throw new RangeError("最多只能创建 8 个标签");
    const duplicate = tags.value.find(
      (tag) =>
        tag.name.toLocaleLowerCase() === normalized.toLocaleLowerCase() &&
        tag.name !== originalName,
    );
    if (duplicate) throw new Error("标签名称已存在，请换一个名称");

    saving.value = true;
    try {
      const existing = tags.value.find(
        (tag) => tag.name === originalName || tag.name === normalized,
      );
      const nextTag: PlanTag = {
        id: existing?.id,
        name: normalized,
        color: color || TAG_COLORS[tags.value.length % TAG_COLORS.length]!,
        sortOrder: existing?.sortOrder ?? tags.value.length + 1,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      const saved =
        originalName && originalName !== normalized
          ? await database.renameTag(originalName, nextTag)
          : await database.saveTag(nextTag);
      await load();
      return saved;
    } finally {
      saving.value = false;
    }
  }

  async function deleteTag(name: string): Promise<number> {
    const affectedPlans = (await database.listPlans()).filter((plan) =>
      plan.tags.includes(name),
    );
    saving.value = true;
    try {
      await database.deleteTag(name);
      await load();
      return affectedPlans.length;
    } finally {
      saving.value = false;
    }
  }

  async function moveTag(name: string, direction: -1 | 1): Promise<void> {
    const previous = [...tags.value];
    const names = previous.map((tag) => tag.name);
    const index = names.indexOf(name);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= names.length) return;
    [names[index], names[target]] = [names[target]!, names[index]!];
    tags.value = names.map((item, sortIndex) => ({
      ...previous.find((tag) => tag.name === item)!,
      sortOrder: sortIndex + 1,
    }));
    try {
      await database.reorderTags(names);
    } catch (reason) {
      tags.value = previous;
      throw reason;
    }
  }

  async function synchronize(): Promise<SyncSnapshot> {
    if (syncing.value) throw new Error("数据更新正在进行中");
    syncing.value = true;
    syncProgress.value = { completed: 0, total: 0, failed: 0 };
    try {
      const report = await syncService.fullSync((progress) => {
        syncProgress.value = progress;
      });
      syncReport.value = report;
      return report;
    } finally {
      syncing.value = false;
    }
  }

  async function synchronizeMatches(): Promise<SyncSnapshot> {
    if (syncing.value) throw new Error("数据更新正在进行中");
    syncing.value = true;
    syncProgress.value = { completed: 0, total: 0, failed: 0 };
    try {
      const report = await syncService.syncMatchesOnly((progress) => {
        syncProgress.value = progress;
      });
      syncReport.value = report;
      return report;
    } finally {
      syncing.value = false;
    }
  }

  async function synchronizeResults(): Promise<SyncSnapshot> {
    if (syncing.value) throw new Error("数据更新正在进行中");
    syncing.value = true;
    syncProgress.value = { completed: 0, total: 0, failed: 0 };
    try {
      const report = await syncService.syncResultsOnly();
      syncReport.value = report;
      return report;
    } finally {
      syncing.value = false;
    }
  }

  async function retryFailed(): Promise<SyncSnapshot> {
    if (!syncReport.value) return synchronize();
    if (syncing.value) throw new Error("数据更新正在进行中");
    syncing.value = true;
    syncProgress.value = { completed: 0, total: 0, failed: 0 };
    try {
      const report = await syncService.retryFailed(
        syncReport.value,
        (progress) => {
          syncProgress.value = progress;
        },
      );
      syncReport.value = report;
      return report;
    } finally {
      syncing.value = false;
    }
  }

  return {
    loading,
    saving,
    syncing,
    error,
    settings,
    tags,
    tagUsage,
    syncReport,
    syncProgress,
    settingsSummary,
    load,
    saveSettings,
    saveTag,
    deleteTag,
    moveTag,
    synchronize,
    synchronizeMatches,
    synchronizeResults,
    retryFailed,
  };
});

export { validateSettings } from "@/features/settings/validation";
