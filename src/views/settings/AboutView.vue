<script setup lang="ts">
import infoIcon from "@/assets/ui/common/ic_info.svg?url";
import brandIcon from "@/assets/icons/navigation/ic_nav_ticket_selected.svg?url";
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
    <section class="about-hero">
      <span class="about-brand"><img :src="brandIcon" alt="" /></span>
      <h2>彩果</h2>
      <p>v{{ APP_VERSION }}</p>
      <strong>清爽记录每一次选择</strong>
    </section>
    <AppCard class="about-list" :padded="false">
      <section class="about-row">
        <span class="about-row__icon about-row__icon--privacy">
          <AppAssetIcon :src="infoIcon" :size="20" />
        </span>
        <div>
          <h3>数据与隐私</h3>
          <p>
            比赛、方案、账单和设置默认保存在设备本地。应用不会自动上传你的购买记录或方案。
          </p>
        </div>
      </section>
      <section class="about-row">
        <span class="about-row__icon about-row__icon--source">
          <AppAssetIcon :src="infoIcon" :size="20" />
        </span>
        <div>
          <h3>数据来源</h3>
          <p>
            比赛、历史交锋和赛果来自中国体育彩票公开接口。接口内容可能调整，请以官方最终公布结果为准。
          </p>
        </div>
      </section>
      <section class="about-row about-row--warning">
        <span class="about-row__icon about-row__icon--warning">
          <AppAssetIcon :src="infoIcon" :size="20" />
        </span>
        <div>
          <h3>理性购彩</h3>
          <p>
            本应用只用于数据整理和账单记录，不保证预测结果或投注收益。请量力而行，理性参与。
          </p>
        </div>
      </section>
    </AppCard>
    <p class="about-copyright">© 2026 彩果 · 数据仅供个人记录</p>
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
  padding: 14px 0 4px;
}

.about-brand {
  display: grid;
  width: 64px;
  height: 64px;
  margin-bottom: 6px;
  border-radius: 18px;
  place-items: center;
  background: var(--color-surface);
  box-shadow: var(--outline-default), var(--shadow-card);
}

.about-brand img {
  width: 42px;
  height: 42px;
}

.about-hero h2,
.about-hero p,
.about-hero strong,
.about-row h3,
.about-row p {
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

.about-row h3 {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.about-list {
  display: grid;
}

.about-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 10px;
}

.about-row + .about-row {
  border-top: 1px solid var(--color-divider);
}

.about-row p {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.about-row--warning {
  background: rgb(255 248 223 / 48%);
}

.about-row__icon {
  display: grid;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-control);
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.about-row__icon--source {
  color: var(--color-mint);
  background: rgb(97 214 191 / 12%);
}

.about-row__icon--privacy {
  color: var(--color-violet);
  background: rgb(154 145 245 / 12%);
}

.about-row__icon--warning {
  color: var(--color-warning);
  background: rgb(232 170 50 / 12%);
}

.about-copyright {
  margin: 4px 0 0;
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
}
</style>
