<script setup lang="ts">
import { showFailToast, showLoadingToast, showSuccessToast } from "vant";
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";

import AppCard from "@/components/base/AppCard.vue";
import AppHeader from "@/components/base/AppHeader.vue";
import {
  createExportBundle,
  exportFilename,
  saveTextFile,
  serializeJsonExport,
  serializeMarkdownExport,
} from "@/services/export/exportData";
import { useSettingsStore } from "@/stores/settings";

interface SettingsItem {
  title: string;
  description: string;
  icon: string;
  color: string;
  route?: string;
  value?: string;
  action?: "markdown" | "json";
}

const router = useRouter();
const store = useSettingsStore();

const groups = computed<Array<{ title: string; items: SettingsItem[] }>>(() => [
  {
    title: "数据配置",
    items: [
      {
        title: "系统设置",
        description: "历史条数、并发、超时与重试",
        icon: "setting-o",
        color: "#5797F5",
        value: store.settingsSummary,
        route: "/settings/system",
      },
      {
        title: "数据更新",
        description: "获取最新比赛并同步比赛结果",
        icon: "replay",
        color: "#61D6BF",
        route: "/settings/update",
      },
    ],
  },
  {
    title: "内容管理",
    items: [
      {
        title: "标签管理",
        description: "新增、编辑、排序和删除方案标签",
        icon: "label-o",
        color: "#9A91F5",
        value: `${store.tags.length} 个`,
        route: "/settings/tags",
      },
      {
        title: "方案管理",
        description: "查看和整理已保存方案",
        icon: "orders-o",
        color: "#72AEFF",
        route: "/plans",
      },
    ],
  },
  {
    title: "数据导出",
    items: [
      {
        title: "导出 Markdown",
        description: "适合阅读和归档的账单报告",
        icon: "description",
        color: "#FF8FB3",
        action: "markdown",
      },
      {
        title: "导出 JSON",
        description: "可重新解析的完整结构化数据",
        icon: "records-o",
        color: "#E8AA32",
        action: "json",
      },
    ],
  },
  {
    title: "其他",
    items: [
      {
        title: "关于彩果",
        description: "版本、数据说明与隐私信息",
        icon: "info-o",
        color: "#61D6BF",
        value: "v2.0.0",
        route: "/settings/about",
      },
    ],
  },
]);

onMounted(() => store.load());

async function activate(item: SettingsItem): Promise<void> {
  if (item.route) {
    await router.push(item.route);
    return;
  }
  if (!item.action) return;
  const toast = showLoadingToast({
    message: "正在生成导出文件…",
    forbidClick: true,
    duration: 0,
  });
  try {
    const bundle = await createExportBundle();
    const markdown = item.action === "markdown";
    const filename = exportFilename(markdown ? "md" : "json");
    const result = await saveTextFile(
      filename,
      markdown ? serializeMarkdownExport(bundle) : serializeJsonExport(bundle),
      markdown
        ? "text/markdown;charset=utf-8"
        : "application/json;charset=utf-8",
    );
    showSuccessToast(`已生成 ${result.filename}`);
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  } finally {
    toast.close();
  }
}
</script>

<template>
  <div class="page settings-page">
    <AppHeader title="彩果 · 设置" subtitle="配置数据、标签与应用" />

    <div class="page-content settings-content">
      <section
        v-for="group in groups"
        :key="group.title"
        class="settings-section"
      >
        <h2>{{ group.title }}</h2>
        <AppCard class="settings-group" :padded="false">
          <button
            v-for="item in group.items"
            :key="item.title"
            type="button"
            class="settings-row"
            @click="activate(item)"
          >
            <span
              class="settings-row__icon"
              :style="{ color: item.color, backgroundColor: `${item.color}18` }"
            >
              <van-icon :name="item.icon" size="22" aria-hidden="true" />
            </span>
            <span class="settings-row__copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.description }}</small>
            </span>
            <span v-if="item.value" class="settings-row__value numeric">{{
              item.value
            }}</span>
            <van-icon
              name="arrow"
              size="18"
              color="var(--color-text-tertiary)"
              aria-hidden="true"
            />
          </button>
        </AppCard>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-content {
  gap: var(--space-6);
}

.settings-section {
  display: grid;
  gap: var(--space-3);
}

.settings-section h2 {
  margin: 0 4px;
  font-size: 18px;
  line-height: 1.35;
}

.settings-group {
  display: grid;
}

.settings-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto 18px;
  align-items: center;
  min-height: 72px;
  gap: var(--space-3);
  padding: 10px var(--space-4);
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.settings-row + .settings-row {
  border-top: 1px solid var(--color-divider);
}

.settings-row:active {
  background: var(--color-surface-soft);
}

.settings-row__icon {
  display: grid;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-control);
  place-items: center;
}

.settings-row__copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.settings-row__copy strong,
.settings-row__copy small,
.settings-row__value {
  overflow: hidden;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-row__copy strong {
  font-size: var(--font-size-md);
}

.settings-row__copy small {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.settings-row__value {
  max-width: 92px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

@media (max-width: 359px) {
  .settings-row {
    grid-template-columns: 40px minmax(0, 1fr) 16px;
  }

  .settings-row__value {
    display: none;
  }
}
</style>
