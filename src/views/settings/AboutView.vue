<script setup lang="ts">
import AppCard from "@/components/base/AppCard.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppPage from "@/components/base/AppPage.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
</script>

<template>
  <AppPage secondary content-class="about-content">
    <template #header><SubpageHeader title="关于彩果" subtitle="长期体彩账单与选票管理工具" /></template>
    <div class="brand-mark"><AppIcon name="folder" :size="38" /></div>
    <div class="brand-copy">
      <h2>彩果</h2>
      <p>版本 2.0.0 · 全新架构</p>
    </div>
    <AppCard class="about-card">
      <h3>数据与隐私</h3>
      <p>
        比赛、方案、账单和设置默认保存在设备本地。应用不会自动上传你的购买记录或方案。
      </p>
    </AppCard>
    <AppCard class="about-card">
      <h3>数据来源</h3>
      <p>
        比赛、历史交锋和赛果来自中国体育彩票公开接口。接口内容可能调整，请以官方最终公布结果为准。
      </p>
    </AppCard>
    <AppCard class="about-card warning-card">
      <h3>理性购彩</h3>
      <p>
        本应用只用于数据整理和账单记录，不保证预测结果或投注收益。请量力而行，理性参与。
      </p>
    </AppCard>
  </AppPage>
</template>

<style scoped>
.about-content {
  justify-items: center;
  padding-top: var(--space-6);
}

.brand-mark {
  display: grid;
  width: 82px;
  height: 82px;
  border-radius: 24px;
  place-items: center;
  color: white;
  background: linear-gradient(145deg, var(--color-primary), #72aeff);
  box-shadow: 0 12px 30px rgb(87 151 245 / 24%);
}

.brand-copy {
  text-align: center;
}

.brand-copy h2,
.brand-copy p,
.about-card h3,
.about-card p {
  margin: 0;
}

.brand-copy h2 {
  font-size: 26px;
}

.brand-copy p {
  margin-top: 4px;
  color: var(--color-text-secondary);
}

.about-card {
  width: 100%;
}

.about-card h3 {
  font-size: 16px;
}

.about-card p {
  margin-top: 7px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.warning-card {
  background: #fffaf0;
}
</style>
