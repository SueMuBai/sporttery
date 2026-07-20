<script setup lang="ts">
import { computed, ref } from "vue";
import { showToast } from "vant";

import brandIcon from "@/assets/ui/settings/ic_app_caiguo.svg?url";
import AppBottomSheet from "@/components/base/AppBottomSheet.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppIcon, { type AppIconName } from "@/components/base/AppIcon.vue";
import AppPage from "@/components/base/AppPage.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { APP_VERSION } from "@/app/version";

type TopicKey = "help" | "privacy" | "license" | "feedback";

const activeTopic = ref<TopicKey>();
const topicContent: Record<TopicKey, { title: string; paragraphs: string[] }> =
  {
    help: {
      title: "使用帮助",
      paragraphs: [
        "在选票页同步比赛后选择一种玩法和赔率，再选择过关方式、倍数并保存方案或记录购买。",
        "账单页会根据已记录的购买和最新赛果计算回款与盈亏；已完成账单支持直接修改实际回款。",
        "比赛、赛果和历史交锋均采用增量保存，已经成功保存的数据不会因单次同步失败而被清除。",
      ],
    },
    privacy: {
      title: "隐私说明",
      paragraphs: [
        "比赛、方案、账单、标签和设置默认保存在设备本地。应用不会自动上传你的购买记录或保存方案。",
        "导出、分享或恢复备份只会在你主动操作时执行。卸载应用或清除应用数据可能导致本地记录丢失，请及时备份。",
      ],
    },
    license: {
      title: "开源许可",
      paragraphs: [
        "本应用使用 Vue、Vant、Pinia、Capacitor、Dexie 等开源软件。各依赖仍遵循其原始开源许可证。",
        "体育彩票比赛与赛果数据来自公开接口，数据权利归相应发布方所有，请以官方最终公布结果为准。",
      ],
    },
    feedback: {
      title: "意见反馈",
      paragraphs: [
        "如遇数据显示、结算或界面问题，请记录比赛编号、操作步骤、应用版本并附上截图。",
        "项目反馈地址：github.com/SueMuBai/sporttery/issues",
      ],
    },
  };

const activeContent = computed(() =>
  activeTopic.value ? topicContent[activeTopic.value] : undefined,
);

const menuItems: Array<{
  key?: TopicKey;
  action?: "check-version";
  label: string;
  icon: AppIconName;
  color: string;
  value?: string;
}> = [
  {
    label: "版本更新",
    icon: "update",
    color: "#5797F5",
    value: "已是最新",
    action: "check-version",
  },
  { key: "help", label: "使用帮助", icon: "help", color: "#61D6BF" },
  { key: "privacy", label: "隐私说明", icon: "shield", color: "#9A91F5" },
  { key: "license", label: "开源许可", icon: "export-json", color: "#5797F5" },
  { key: "feedback", label: "意见反馈", icon: "feedback", color: "#FF7D7D" },
];

function activateMenuItem(item: (typeof menuItems)[number]): void {
  if (item.action === "check-version") {
    showToast({
      message: `当前版本 v${APP_VERSION}\n已是最新版`,
      duration: 2200,
    });
    return;
  }
  if (item.key) activeTopic.value = item.key;
}
</script>

<template>
  <AppPage secondary content-class="about-content">
    <template #header><SubpageHeader title="关于彩果" /></template>

    <section class="about-hero">
      <span class="about-brand"><img :src="brandIcon" alt="" /></span>
      <h2>彩果</h2>
      <p>v{{ APP_VERSION }}</p>
      <strong>清爽记录每一次选择</strong>
    </section>

    <AppCard class="about-menu" :padded="false">
      <button
        v-for="item in menuItems"
        :key="item.label"
        type="button"
        @click="activateMenuItem(item)"
      >
        <span class="about-menu__icon" :style="{ color: item.color }">
          <AppIcon :name="item.icon" :size="24" />
        </span>
        <strong>{{ item.label }}</strong>
        <small v-if="item.value">{{ item.value }}</small>
        <AppIcon name="chevron-right" :size="17" />
      </button>
    </AppCard>

    <p class="about-copyright">© 2026 彩果 · 数据仅供个人记录</p>

    <AppBottomSheet
      :show="Boolean(activeContent)"
      :title="activeContent?.title || '说明'"
      drag-handle
      @update:show="!$event && (activeTopic = undefined)"
    >
      <div class="about-topic">
        <p
          v-for="paragraph in activeContent?.paragraphs || []"
          :key="paragraph"
        >
          {{ paragraph }}
        </p>
      </div>
    </AppBottomSheet>
  </AppPage>
</template>

<style scoped>
.about-content {
  align-content: start;
  gap: 16px;
}

.about-hero {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 38px 0 18px;
}

.about-brand {
  display: grid;
  width: 84px;
  height: 84px;
  margin-bottom: 12px;
  border-radius: 22px;
  place-items: center;
  background: var(--color-surface);
  box-shadow: var(--outline-default), var(--shadow-card);
}

.about-brand img {
  width: 64px;
  height: 64px;
}

.about-hero h2,
.about-hero p,
.about-hero strong,
.about-topic p {
  margin: 0;
}

.about-hero h2 {
  font-size: 20px;
  line-height: 26px;
}

.about-hero p,
.about-hero strong {
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 400;
  line-height: 18px;
}

.about-menu {
  display: grid;
}

.about-menu button {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto 18px;
  align-items: center;
  min-height: 66px;
  gap: 10px;
  padding: 0 16px;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.about-menu button + button {
  border-top: 1px solid var(--color-divider);
}

.about-menu__icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
}

.about-menu strong {
  font-size: 14px;
  font-weight: 500;
}

.about-menu small {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.about-copyright {
  margin: 8px 0 0;
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
}

.about-topic {
  display: grid;
  gap: 12px;
  padding: 8px var(--page-gutter) 22px;
}

.about-topic p {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}
</style>
