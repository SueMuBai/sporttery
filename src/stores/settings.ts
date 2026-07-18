import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { SyncService } from "@/features/sync/SyncService";
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

type FullSyncReport = Awaited<ReturnType<SyncService["fullSync"]>>;

export const useSettingsStore = defineStore("settings", () => {
  const database = getDatabase();
  const syncService = new SyncService(database);
  const loading = ref(false);
  const saving = ref(false);
  const syncing = ref(false);
  const error = ref("");
  const settings = ref<AppSettings>();
  const tags = ref<PlanTag[]>([]);
  const tagUsage = ref<Record<string, number>>({});
  const syncReport = ref<FullSyncReport>();
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
      const [storedSettings, storedTags, storedPlans] = await Promise.all([
        database.getSettings(),
        database.listTags(),
        database.listPlans(),
      ]);
      settings.value = storedSettings;
      tags.value = storedTags;
      tagUsage.value = Object.fromEntries(
        storedTags.map((tag) => [
          tag.name,
          storedPlans.filter((plan) => plan.tags.includes(tag.name)).length,
        ]),
      );
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
    if (normalized.length > 12) throw new RangeError("标签名称最多 12 个字符");
    const duplicate = tags.value.find(
      (tag) =>
        tag.name.toLocaleLowerCase() === normalized.toLocaleLowerCase() &&
        tag.name !== originalName,
    );
    if (duplicate) throw new Error("已存在同名标签");

    saving.value = true;
    try {
      if (originalName && originalName !== normalized) {
        const plans = await database.listPlans();
        await Promise.all(
          plans
            .filter((plan) => plan.tags.includes(originalName))
            .map((plan) =>
              database.savePlan({
                ...plan,
                tags: plan.tags.map((tag) =>
                  tag === originalName ? normalized : tag,
                ),
                updatedAt: new Date().toISOString(),
              }),
            ),
        );
        await database.deleteTag(originalName);
      }
      const existing = tags.value.find(
        (tag) => tag.name === originalName || tag.name === normalized,
      );
      const saved = await database.saveTag({
        id: originalName === normalized ? existing?.id : undefined,
        name: normalized,
        color: color || TAG_COLORS[tags.value.length % TAG_COLORS.length]!,
        sortOrder: existing?.sortOrder ?? tags.value.length + 1,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      });
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
    const names = tags.value.map((tag) => tag.name);
    const index = names.indexOf(name);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= names.length) return;
    [names[index], names[target]] = [names[target]!, names[index]!];
    await database.reorderTags(names);
    await load();
  }

  async function synchronize(): Promise<FullSyncReport> {
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
  };
});

export function validateSettings(value: AppSettings): void {
  const limits: Record<keyof AppSettings, [number, number, string]> = {
    historyLimits: [1, 50, "每场历史条数"],
    workers: [1, 12, "并发请求数"],
    timeoutSeconds: [5, 120, "接口超时"],
    retries: [0, 8, "失败重试次数"],
    defaultMultiplier: [1, 999, "默认倍数"],
  };
  for (const [key, [minimum, maximum, label]] of Object.entries(
    limits,
  ) as Array<[keyof AppSettings, [number, number, string]]>) {
    const current = value[key];
    if (!Number.isInteger(current) || current < minimum || current > maximum) {
      throw new RangeError(`${label}必须是 ${minimum}～${maximum} 的整数`);
    }
  }
}
