<script setup lang="ts">
import { computed, onActivated } from "vue";
import { useRouter } from "vue-router";

import AppFormRow from "@/components/base/AppFormRow.vue";
import AppHeader from "@/components/base/AppHeader.vue";
import type { AppIconName } from "@/components/base/AppIcon.vue";
import AppListGroup from "@/components/base/AppListGroup.vue";
import AppPage from "@/components/base/AppPage.vue";
import { useSettingsStore } from "@/stores/settings";

interface SettingsItem {
  title: string;
  description: string;
  icon: AppIconName;
  color: string;
  route?: string;
  value?: string;
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
        icon: "system",
        color: "#5797F5",
        value: store.settingsSummary,
        route: "/settings/system",
      },
      {
        title: "数据更新",
        description: "获取最新比赛并同步比赛结果",
        icon: "refresh",
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
        icon: "tag",
        color: "#9A91F5",
        value: `${store.tags.length} 个`,
        route: "/settings/tags",
      },
      {
        title: "方案管理",
        description: "查看和整理已保存方案",
        icon: "folder",
        color: "#72AEFF",
        route: "/plans",
      },
    ],
  },
  {
    title: "数据与备份",
    items: [
      {
        title: "数据与备份",
        description: "导出账单报告或完整数据备份",
        icon: "export-json",
        color: "#FF8FB3",
        route: "/settings/data",
      },
    ],
  },
  {
    title: "其他",
    items: [
      {
        title: "关于彩果",
        description: "版本、数据说明与隐私信息",
        icon: "info",
        color: "#61D6BF",
        value: "v2.0.0",
        route: "/settings/about",
      },
    ],
  },
]);

onActivated(() => store.load());

async function activate(item: SettingsItem): Promise<void> {
  if (item.route) {
    await router.push(item.route);
    return;
  }
}
</script>

<template>
  <AppPage>
    <template #header><AppHeader title="彩果 · 设置" subtitle="配置数据、标签与应用" /></template>
    <AppListGroup
      v-for="group in groups"
      :key="group.title"
      :title="group.title"
    >
      <AppFormRow
        v-for="item in group.items"
        :key="item.title"
        :title="item.title"
        :description="item.description"
        :value="item.value"
        :icon="item.icon"
        :icon-color="item.color"
        @click="activate(item)"
      />
    </AppListGroup>
  </AppPage>
</template>
