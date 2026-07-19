<script setup lang="ts">
import { computed, onActivated } from "vue";
import { useRouter } from "vue-router";

import { APP_VERSION } from "@/app/version";
import infoIcon from "@/assets/ui/common/ic_info.svg?url";
import refreshIcon from "@/assets/ui/common/ic_refresh.svg?url";
import exportJsonIcon from "@/assets/ui/settings/ic_export_json.svg?url";
import folderIcon from "@/assets/ui/settings/ic_folder.svg?url";
import systemSettingsIcon from "@/assets/ui/settings/ic_system_settings.svg?url";
import tagIcon from "@/assets/ui/settings/ic_tag.svg?url";
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
  iconSrc: string;
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
        iconSrc: systemSettingsIcon,
        color: "#5797F5",
        value: store.settingsSummary,
        route: "/settings/system",
      },
      {
        title: "数据更新",
        description: "获取最新比赛并同步比赛结果",
        icon: "refresh",
        iconSrc: refreshIcon,
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
        iconSrc: tagIcon,
        color: "#9A91F5",
        value: `${store.tags.length} 个`,
        route: "/settings/tags",
      },
      {
        title: "方案管理",
        description: "查看和整理已保存方案",
        icon: "folder",
        iconSrc: folderIcon,
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
        iconSrc: exportJsonIcon,
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
        iconSrc: infoIcon,
        color: "#61D6BF",
        value: `v${APP_VERSION}`,
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
  <AppPage content-class="settings-page__content">
    <template #header>
      <AppHeader
        class="settings-page__header"
        title="彩果·设置"
        subtitle="配置数据、标签与应用"
      />
    </template>
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
        :icon-src="item.iconSrc"
        :icon-color="item.color"
        @click="activate(item)"
      />
    </AppListGroup>
  </AppPage>
</template>

<style scoped>
:deep(.settings-page__header) {
  min-height: calc(86px + env(safe-area-inset-top));
  padding-inline: 24px;
}

:deep(.settings-page__content) {
  gap: 22px;
  padding-top: 20px;
}
</style>
