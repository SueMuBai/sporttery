<script setup lang="ts">
import { computed } from "vue";

import AppCard from "@/components/base/AppCard.vue";
import deleteIcon from "@/assets/ui/plans/ic_delete_danger.svg?url";
import editTagIcon from "@/assets/ui/plans/ic_edit_tag.svg?url";
import loadIcon from "@/assets/ui/plans/ic_load_edit.svg?url";
import moreIcon from "@/assets/ui/plans/ic_more.svg?url";
import renameIcon from "@/assets/ui/plans/ic_rename.svg?url";
import type { EvaluatedPlan } from "@/stores/plans";
import { PLAN_NAME_MAX_LENGTH } from "@/features/plans/planName";
import { centsToYuan } from "@/utils/money";

const props = defineProps<{
  item: EvaluatedPlan;
  menuOpen?: boolean;
  renaming?: boolean;
  renameValue?: string;
  saving?: boolean;
}>();

const emit = defineEmits<{
  detail: [];
  more: [];
  load: [];
  rename: [];
  tags: [];
  remove: [];
  saveRename: [];
  cancelRename: [];
  "update:renameValue": [value: string];
}>();

const status = computed(() => {
  const evaluation = props.item.evaluation;
  if (!evaluation) return { label: "异常", class: "error" };
  if (!props.item.purchaseCount) return { label: "已保存", class: "saved" };
  if (props.item.purchaseSummary.status === "pending")
    return { label: "进行中", class: "pending" };
  if (props.item.purchaseSummary.profitCents > 0)
    return { label: "已盈利", class: "profit" };
  if (props.item.purchaseSummary.profitCents < 0)
    return { label: "已亏损", class: "loss" };
  return { label: "已完成", class: "settled" };
});
</script>

<template>
  <AppCard
    :class="['plan-card', { 'plan-card--menu-open': menuOpen }]"
    interactive
    tabindex="0"
    :aria-label="`查看方案详情：${item.plan.name}`"
    @click="emit('detail')"
    @keydown.enter="emit('detail')"
    @keydown.space.prevent="emit('detail')"
  >
    <div class="plan-card__top">
      <div :class="['plan-card__title-line', { 'plan-card__title-line--editing': renaming }]">
        <div v-if="renaming" class="inline-rename" @click.stop>
          <div class="inline-rename__main">
            <input
              :value="renameValue"
              :maxlength="PLAN_NAME_MAX_LENGTH"
              aria-label="方案名称"
              @input="emit('update:renameValue', ($event.target as HTMLInputElement).value)"
              @keydown.enter.prevent="emit('saveRename')"
              @keydown.escape.prevent="emit('cancelRename')"
            />
            <button type="button" @click="emit('cancelRename')">取消</button>
            <button type="button" class="save" :disabled="saving || !renameValue?.trim()" @click="emit('saveRename')">保存</button>
          </div>
          <div class="inline-rename__helper"><span>名称1～{{ PLAN_NAME_MAX_LENGTH }}个字</span><span>{{ renameValue?.length || 0 }}/{{ PLAN_NAME_MAX_LENGTH }}</span></div>
        </div>
        <h2 v-else>{{ item.plan.name }}</h2>
        <span v-if="!renaming" :class="['plan-status', `plan-status--${status.class}`]">{{ status.label }}</span>
        <div v-if="!renaming" class="plan-tags">
          <span v-for="tag in item.plan.tags.slice(0, 2)" :key="tag">{{
            tag
          }}</span>
        </div>
      </div>
      <button
        v-if="!renaming"
        type="button"
        class="plan-more"
        aria-label="更多方案操作"
        @click.stop="emit('more')"
      >
        <img :src="moreIcon" alt="" />
      </button>
      <div v-if="menuOpen" class="plan-menu" @click.stop>
        <button type="button" @click="emit('load')">
          <img :src="loadIcon" alt="" />载入编辑
        </button>
        <button type="button" @click="emit('rename')">
          <img :src="renameIcon" alt="" />重命名
        </button>
        <button type="button" @click="emit('tags')">
          <img :src="editTagIcon" alt="" />编辑标签
        </button>
        <button type="button" class="danger" @click="emit('remove')">
          <img :src="deleteIcon" alt="" />删除
        </button>
      </div>
    </div>

    <div class="plan-card__meta">
      <span>{{ item.evaluation?.totalMatches ?? 0 }}场</span>
      <i>·</i>
      <span>{{
        item.plan.passCounts.map((size) => `${size}关`).join("、") || "未选过关"
      }}</span>
      <i>·</i>
      <span>{{ item.plan.multiplier }}倍</span>
    </div>

    <div v-if="item.evaluation && item.purchaseCount" class="plan-card__stats">
      <div>
        <span>购买</span><strong class="numeric">{{ item.purchaseCount }}笔</strong>
      </div>
      <div>
        <span>已完成</span><strong class="numeric">{{ item.purchaseSummary.settledCount }}笔</strong>
      </div>
      <div>
        <span>进行中</span><strong class="numeric">{{ item.purchaseSummary.pendingCount }}笔</strong>
      </div>
    </div>
    <div v-else-if="item.evaluation" class="plan-card__stats">
      <div>
        <span>已完成</span><strong class="numeric">{{ item.evaluation.settledMatches }}/{{
          item.evaluation.totalMatches
        }}</strong>
      </div>
      <div>
        <span>猜对</span><strong class="numeric">{{ item.evaluation.correctMatches }}</strong>
      </div>
      <div>
        <span>猜错</span><strong class="numeric">{{
          Math.max(
            0,
            item.evaluation.settledMatches - item.evaluation.correctMatches,
          )
        }}</strong>
      </div>
    </div>
    <div v-if="item.evaluation && item.purchaseCount" class="plan-card__finance">
      <div>
        <span>实际投入</span><strong class="numeric">¥{{ centsToYuan(item.purchaseSummary.stakeCents) }}</strong>
      </div>
      <div>
        <span>{{ item.purchaseSummary.status === "settled" ? "实际回款" : "当前已结算" }}</span>
        <strong class="numeric positive">¥{{ centsToYuan(item.purchaseSummary.returnCents) }}</strong>
      </div>
      <div>
        <span>{{ item.purchaseSummary.status === "settled" ? "实际盈亏" : "当前收益" }}</span>
        <strong :class="['numeric', item.purchaseSummary.profitCents >= 0 ? 'positive' : 'negative']">
          {{ item.purchaseSummary.profitCents >= 0 ? "+" : "-" }}¥{{ centsToYuan(Math.abs(item.purchaseSummary.profitCents)) }}
        </strong>
      </div>
    </div>
    <div v-else-if="item.evaluation" class="plan-card__finance">
      <div>
        <span>预计投入</span><strong class="numeric">¥{{ centsToYuan(item.evaluation.stakeCents) }}</strong>
      </div>
      <div>
        <span>{{
          item.evaluation.status === "settled" ? "理论回款" : "当前已结算"
        }}</span><strong class="numeric positive">¥{{ centsToYuan(item.evaluation.currentReturnCents) }}</strong>
      </div>
      <div>
        <span>{{
          item.evaluation.status === "settled" ? "净盈亏" : "当前收益"
        }}</span>
        <strong
          :class="[
            'numeric',
            (item.evaluation.finalProfitCents ??
              item.evaluation.currentProfitCents) >= 0
              ? 'positive'
              : 'negative',
          ]"
        >
          {{
            (item.evaluation.finalProfitCents ??
              item.evaluation.currentProfitCents) >= 0
              ? "+"
              : "-"
          }}¥{{
            centsToYuan(
              Math.abs(
                item.evaluation.finalProfitCents ??
                  item.evaluation.currentProfitCents,
              ),
            )
          }}
        </strong>
      </div>
    </div>
    <p v-else class="plan-card__error">{{ item.error }}</p>
  </AppCard>
</template>

<style scoped>
.plan-card {
  position: relative;
  display: grid;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  grid-template-columns: minmax(0, 1fr);
  gap: 5px;
  min-height: 112px;
  overflow: visible;
}

.plan-card--menu-open {
  z-index: 30;
}

.plan-card__top {
  position: relative;
  min-width: 0;
  min-height: 20px;
  padding-right: 32px;
}

.inline-rename {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 3px;
}

.inline-rename__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px 42px;
  align-items: center;
  gap: 4px;
}

.inline-rename input {
  width: 100%;
  height: 34px;
  min-width: 0;
  padding: 0 8px;
  border: 0;
  outline: 0;
  border-radius: var(--radius-xs);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-primary);
  font-size: 14px;
}

.inline-rename button {
  height: 34px;
  padding: 0;
  border: 0;
  color: var(--color-text);
  background: transparent;
  font-size: 13px;
}

.inline-rename button.save {
  color: var(--color-primary);
}

.inline-rename button:disabled {
  opacity: 0.45;
}

.inline-rename__helper {
  display: flex;
  justify-content: space-between;
  color: var(--color-text-secondary);
  font-size: 10px;
}

.plan-card__title-line--editing {
  display: block;
}

.plan-menu {
  position: absolute;
  z-index: 20;
  top: 28px;
  right: -6px;
  display: grid;
  width: 142px;
  padding: 4px;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--outline-strong), var(--shadow-float);
}

.plan-menu button {
  display: flex;
  align-items: center;
  min-height: 40px;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-xs);
  color: var(--color-text);
  background: transparent;
  font-size: 13px;
  text-align: left;
}

.plan-menu button:active {
  background: var(--color-surface-soft);
}

.plan-menu .danger {
  color: var(--color-danger);
}

.plan-card__title-line {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.plan-card h2,
.plan-card p {
  margin: 0;
}

.plan-card h2 {
  min-width: 0;
  overflow: hidden;
  flex: 0 1 auto;
  font-size: 14px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-status {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
}

.plan-status--pending {
  color: #956f18;
  background: #fff6dc;
}

.plan-status--saved {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.plan-status--profit {
  color: var(--color-success);
  background: #eafaf5;
}

.plan-status--loss,
.plan-status--error {
  color: var(--color-danger);
  background: var(--color-accent-soft);
}

.plan-status--settled {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.plan-more {
  position: absolute;
  top: -8px;
  right: -6px;
  display: grid;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  place-items: center;
  color: var(--color-text-secondary);
  background: transparent;
}

.plan-more img,
.plan-menu img {
  width: 20px;
  height: 20px;
}

.plan-card__meta {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.plan-card__meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-card__meta i {
  color: var(--color-text-placeholder);
  font-style: normal;
}

.plan-card__stats {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 2px 0;
}

.plan-card__stats div {
  display: grid;
  grid-template-columns: auto auto;
  justify-content: center;
  min-width: 0;
  gap: 5px;
  padding: 0 4px;
  text-align: center;
}

.plan-card__stats div + div {
  border-left: 1px solid var(--color-divider);
}

.plan-card__stats span {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.plan-card__stats strong {
  overflow: hidden;
  font-size: 13px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.positive {
  color: var(--color-success);
}

.negative,
.plan-card__error {
  color: var(--color-danger);
}

.plan-card__error {
  font-size: var(--font-size-sm);
}

.plan-tags {
  display: flex;
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  gap: 5px;
}

.plan-tags span {
  flex: 0 0 auto;
  color: var(--color-primary);
  font-size: 10px;
  padding: 3px 7px;
  border-radius: var(--radius-pill);
  background: var(--color-primary-soft);
}

.plan-card__finance {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding-top: 2px;
  border-top: 1px solid var(--color-divider);
}

.plan-card__finance div {
  display: grid;
  min-width: 0;
  gap: 0;
  text-align: center;
}

.plan-card__finance div + div {
  border-left: 1px solid var(--color-divider);
}

.plan-card__finance span {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.plan-card__finance strong {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
