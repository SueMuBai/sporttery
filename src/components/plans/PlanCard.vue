<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

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

const renameInput = ref<HTMLInputElement>();

watch(
  () => props.renaming,
  async (renaming) => {
    if (!renaming) return;
    await nextTick();
    renameInput.value?.focus();
    renameInput.value?.select();
  },
  { immediate: true },
);

function tagTone(tag: string): string {
  if (/^ai$/i.test(tag)) return "violet";
  if (tag === "稳健") return "mint";
  return "blue";
}
</script>

<template>
  <AppCard
    :class="['plan-card', { 'plan-card--menu-open': menuOpen }]"
    interactive
    tabindex="0"
    :aria-label="`查看方案详情：${item.plan.name}`"
    @click="emit('detail')"
    @keydown.enter.self="emit('detail')"
    @keydown.space.self.prevent="emit('detail')"
  >
    <div :class="['plan-card__top', { 'plan-card__top--editing': renaming }]">
      <div
        :class="[
          'plan-card__title-line',
          { 'plan-card__title-line--editing': renaming },
        ]"
      >
        <div v-if="renaming" class="inline-rename" @click.stop>
          <div class="inline-rename__main">
            <input
              ref="renameInput"
              :value="renameValue"
              :maxlength="PLAN_NAME_MAX_LENGTH"
              aria-label="方案名称"
              @input="
                emit(
                  'update:renameValue',
                  ($event.target as HTMLInputElement).value,
                )
              "
              @keydown.enter.prevent="emit('saveRename')"
              @keydown.escape.prevent="emit('cancelRename')"
            />
            <button type="button" @click="emit('cancelRename')">取消</button>
            <button
              type="button"
              class="save"
              :disabled="saving || !renameValue?.trim()"
              @click="emit('saveRename')"
            >
              保存
            </button>
          </div>
          <div class="inline-rename__helper">
            <span>名称1～{{ PLAN_NAME_MAX_LENGTH }}个字</span><span>{{ renameValue?.length || 0 }}/{{ PLAN_NAME_MAX_LENGTH }}</span>
          </div>
          <div
            v-if="item.plan.tags.length"
            class="plan-tags plan-tags--editing"
          >
            <span
              v-for="tag in item.plan.tags.slice(0, 3)"
              :key="tag"
              :class="'plan-tag--' + tagTone(tag)"
            >{{ tag }}</span>
          </div>
        </div>
        <h2 v-else>{{ item.plan.name }}</h2>
        <div v-if="!renaming" class="plan-tags">
          <span
            v-for="tag in item.plan.tags.slice(0, 3)"
            :key="tag"
            :class="'plan-tag--' + tagTone(tag)"
          >{{ tag }}</span>
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
      <Transition name="plan-menu">
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
      </Transition>
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
    <span v-if="item.purchaseCount" class="plan-card__purchase-summary">
      购买{{ item.purchaseCount }}笔
    </span>

    <div v-if="item.evaluation" class="plan-card__stats">
      <div>
        <span>已完成</span><strong class="numeric">{{ item.evaluation.settledMatches }}/{{
          item.evaluation.totalMatches
        }}</strong>
      </div>
      <div>
        <span>猜对</span><strong class="numeric positive">{{
          item.evaluation.correctMatches
        }}</strong>
      </div>
      <div>
        <span>猜错</span><strong class="numeric negative">{{
          Math.max(
            0,
            item.evaluation.settledMatches - item.evaluation.correctMatches,
          )
        }}</strong>
      </div>
    </div>
    <div
      v-if="item.evaluation && item.purchaseCount"
      class="plan-card__finance"
    >
      <div>
        <span>实际投入</span><strong class="numeric">¥{{ centsToYuan(item.purchaseSummary.stakeCents) }}</strong>
      </div>
      <div>
        <span>{{
          item.purchaseSummary.status === "settled" ? "实际回款" : "当前已结算"
        }}</span>
        <strong class="numeric positive">¥{{ centsToYuan(item.purchaseSummary.returnCents) }}</strong>
      </div>
      <div>
        <span>{{
          item.purchaseSummary.status === "settled" ? "实际盈亏" : "当前收益"
        }}</span>
        <strong
          :class="[
            'numeric',
            item.purchaseSummary.profitCents >= 0 ? 'positive' : 'negative',
          ]"
        >
          {{ item.purchaseSummary.profitCents >= 0 ? "+" : "-" }}¥{{
            centsToYuan(Math.abs(item.purchaseSummary.profitCents))
          }}
        </strong>
      </div>
    </div>
    <div v-else-if="item.evaluation" class="plan-card__finance">
      <div>
        <span>投注</span><strong class="numeric">¥{{ centsToYuan(item.evaluation.stakeCents) }}</strong>
      </div>
      <div>
        <span>奖金</span><strong class="numeric positive">¥{{ centsToYuan(item.evaluation.currentReturnCents) }}</strong>
      </div>
      <div>
        <span>收益</span>
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
  gap: 4px;
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

.plan-card__top--editing {
  padding-right: 0;
}

.inline-rename {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 4px;
}

.inline-rename__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px 48px;
  align-items: center;
  gap: 4px;
}

.inline-rename input {
  width: 100%;
  height: 40px;
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
  height: 40px;
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
  font-size: 11px;
  line-height: 16px;
}

.plan-card__title-line--editing {
  display: block;
}

.plan-menu {
  position: absolute;
  z-index: 20;
  top: 30px;
  right: -1px;
  display: grid;
  width: 142px;
  padding: 4px;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--outline-strong), var(--shadow-float);
  transform-origin: top right;
}

.plan-menu-enter-active,
.plan-menu-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.plan-menu-enter-from,
.plan-menu-leave-to {
  opacity: 0;
  transform: translateY(-3px) scale(0.98);
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

.plan-more {
  position: absolute;
  top: -2px;
  right: 0;
  display: grid;
  width: 32px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  place-items: center;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.plan-more::before {
  position: absolute;
  inset: -10px -6px;
  content: "";
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

.plan-card__purchase-summary {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
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
  font-size: 10px;
  line-height: 20px;
  padding: 0 7px;
  border-radius: var(--radius-pill);
}

.plan-tags--editing {
  margin-top: 1px;
}

.plan-tags span.plan-tag--blue {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.plan-tags span.plan-tag--violet {
  color: #7c51ec;
  background: #f2edff;
}

.plan-tags span.plan-tag--mint {
  color: #328f78;
  background: #eaf8f3;
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
