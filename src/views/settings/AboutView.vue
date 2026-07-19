<script setup lang="ts">
import infoIcon from "@/assets/ui/common/ic_info.svg?url";
import AppCard from "@/components/base/AppCard.vue";
import AppAssetIcon from "@/components/base/AppAssetIcon.vue";
import AppPage from "@/components/base/AppPage.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { APP_VERSION } from "@/app/version";
</script>

<template>
  <AppPage secondary content-class="about-content">
    <template #header>
      <SubpageHeader title="关于彩果" subtitle="长期体彩账单与选票管理工具" />
    </template>
    <AppCard class="about-summary">
      <span class="about-summary__icon">
        <AppAssetIcon :src="infoIcon" :size="20" />
      </span>
      <div>
        <h2>彩果</h2>
        <p>版本 {{ APP_VERSION }} · 本地账单与选票管理工具</p>
      </div>
    </AppCard>
    <AppCard class="about-list" :padded="false">
      <section class="about-row">
        <h3>数据与隐私</h3>
        <p>
          比赛、方案、账单和设置默认保存在设备本地。应用不会自动上传你的购买记录或方案。
        </p>
      </section>
      <section class="about-row">
        <h3>数据来源</h3>
        <p>
          比赛、历史交锋和赛果来自中国体育彩票公开接口。接口内容可能调整，请以官方最终公布结果为准。
        </p>
      </section>
      <section class="about-row about-row--warning">
        <h3>理性购彩</h3>
        <p>
          本应用只用于数据整理和账单记录，不保证预测结果或投注收益。请量力而行，理性参与。
        </p>
      </section>
    </AppCard>
  </AppPage>
</template>

<style scoped>
.about-content {
  align-content: start;
  gap: 12px;
}

.about-summary {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.about-summary__icon {
  display: grid;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-control);
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.about-summary h2,
.about-summary p,
.about-row h3,
.about-row p {
  margin: 0;
}

.about-summary h2,
.about-row h3 {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.about-summary p {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.about-list {
  display: grid;
}

.about-row {
  padding: 10px;
}

.about-row + .about-row {
  border-top: 1px solid var(--color-divider);
}

.about-row p {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 18px;
}

.about-row--warning {
  background: rgb(255 248 223 / 48%);
}
</style>
