<script setup lang="ts">
import { showFailToast, showSuccessToast } from "vant";
import { nextTick, onMounted, ref } from "vue";
import type { ComponentPublicInstance } from "vue";

import AppButton from "@/components/base/AppButton.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppPage from "@/components/base/AppPage.vue";
import AppState from "@/components/base/AppState.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { confirmAction } from "@/components/base/confirmAction";
import { useSettingsStore } from "@/stores/settings";
import type { PlanTag } from "@/types/domain";

const store = useSettingsStore();
const editing = ref<PlanTag>();
const name = ref("");
const color = ref("#5797F5");
const newName = ref("");
const newColor = ref("#5797F5");
const error = ref("");
const addInput = ref<ComponentPublicInstance & { focus: () => void }>();
const addSection = ref<HTMLElement>();
const dragging = ref<string>();
const reordering = ref(false);
const colors = [
  "#5797F5",
  "#61D6BF",
  "#9A91F5",
  "#FF8FB3",
  "#E8AA32",
  "#FF7D7D",
];

onMounted(() => store.load());

async function focusAdd(): Promise<void> {
  addSection.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  await nextTick();
  addInput.value?.focus();
}

function beginReorder(event: PointerEvent, name: string): void {
  dragging.value = name;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

async function continueReorder(event: PointerEvent): Promise<void> {
  if (!dragging.value || reordering.value) return;
  const row = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>("[data-tag-name]");
  const targetName = row?.dataset.tagName;
  if (!targetName || targetName === dragging.value) return;
  const sourceIndex = store.tags.findIndex(
    (tag) => tag.name === dragging.value,
  );
  const targetIndex = store.tags.findIndex((tag) => tag.name === targetName);
  if (sourceIndex < 0 || targetIndex < 0) return;
  reordering.value = true;
  try {
    await store.moveTag(dragging.value, targetIndex > sourceIndex ? 1 : -1);
  } finally {
    reordering.value = false;
  }
}

function endReorder(): void {
  dragging.value = undefined;
}

function openEditor(tag?: PlanTag): void {
  editing.value = tag;
  name.value = tag?.name ?? "";
  color.value = tag?.color ?? colors[store.tags.length % colors.length]!;
  error.value = "";
}

async function saveEdit(): Promise<void> {
  try {
    error.value = "";
    await store.saveTag(name.value, color.value, editing.value?.name);
    editing.value = undefined;
    showSuccessToast("标签已更新");
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
}

async function addTag(): Promise<void> {
  try {
    error.value = "";
    await store.saveTag(newName.value, newColor.value);
    newName.value = "";
    newColor.value = colors[store.tags.length % colors.length]!;
    showSuccessToast("标签已新增");
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
}

async function remove(tag: PlanTag): Promise<void> {
  const count = store.tagUsage[tag.name] ?? 0;
  try {
    await confirmAction({
      title: `删除“${tag.name}”？`,
      message: count
        ? `该标签正在被 ${count} 个方案使用。删除只会解除关联，不会删除方案。`
        : "删除标签不会删除任何方案。",
      confirmText: "删除标签",
      danger: true,
    });
    await store.deleteTag(tag.name);
    showSuccessToast("标签已删除");
  } catch (reason) {
    if (reason instanceof Error) showFailToast(reason.message);
  }
}
</script>

<template>
  <AppPage secondary content-class="tag-content">
    <template #header>
      <SubpageHeader title="标签管理">
        <template #action>
          <button type="button" class="header-add" @click="focusAdd">
            新增
          </button>
        </template>
      </SubpageHeader>
    </template>
    <p class="tag-tip">
      <AppIcon name="info" :size="18" />标签用于方案筛选与整理，最多8个
    </p>
    <AppCard v-if="store.tags.length" class="tag-list" :padded="false">
      <div class="tag-list__heading">
        <strong>已有标签</strong><span>{{ store.tags.length }}/8</span>
      </div>
      <div
        v-for="tag in store.tags"
        :key="tag.name"
        :data-tag-name="tag.name"
        :class="['tag-row', { 'tag-row--dragging': dragging === tag.name }]"
      >
        <button
          type="button"
          class="tag-grip"
          :aria-label="`拖动排序 ${tag.name}`"
          @pointerdown.prevent="beginReorder($event, tag.name)"
          @pointermove.prevent="continueReorder"
          @pointerup="endReorder"
          @pointercancel="endReorder"
        >
          <AppIcon name="grip" :size="20" />
        </button>
        <span class="tag-color" :style="{ backgroundColor: tag.color }" />
        <div v-if="editing?.name === tag.name" class="tag-inline-editor">
          <div class="tag-edit-main">
            <input
              v-model="name"
              maxlength="12"
              aria-label="标签名称"
              @keydown.enter.prevent="saveEdit"
            />
            <button
              type="button"
              class="tag-edit-cancel"
              @click="editing = undefined; error = ''"
            >
              取消
            </button>
            <AppButton size="small" :loading="store.saving" @click="saveEdit">保存</AppButton>
          </div>
          <div class="tag-edit-colors">
            <span>颜色</span>
            <button
              v-for="item in colors"
              :key="item"
              type="button"
              :class="{ selected: color === item }"
              :style="{ backgroundColor: item }"
              :aria-label="item"
              @click="color = item"
            />
            <span class="tag-preview" :style="{ color, backgroundColor: `${color}18` }">{{ name || tag.name }}</span>
          </div>
          <small>修改后，已关联的{{
            store.tagUsage[tag.name] || 0
          }}个方案同步更新</small>
        </div>
        <strong v-else class="tag-name">{{ tag.name }}</strong>
        <span v-if="editing?.name !== tag.name" class="tag-usage">{{ store.tagUsage[tag.name] || 0 }}个方案</span>
        <template v-if="editing?.name !== tag.name">
          <button
            type="button"
            class="tag-action"
            :aria-label="`编辑标签 ${tag.name}`"
            @click="openEditor(tag)"
          >
            <AppIcon name="edit" :size="18" />
          </button>
          <button
            type="button"
            class="tag-action tag-action--danger"
            :aria-label="`删除标签 ${tag.name}`"
            @click="remove(tag)"
          >
            <AppIcon name="delete" :size="18" />
          </button>
        </template>
      </div>
    </AppCard>
    <section ref="addSection" class="tag-add-section">
      <h2>新增标签</h2>
      <AppCard class="tag-add-card">
        <div class="tag-add-row">
          <van-field
            ref="addInput"
            v-model="newName"
            maxlength="12"
            placeholder="输入新标签名称"
            :error-message="!editing ? error : ''"
            @update:model-value="error = ''"
          />
          <AppButton
            :disabled="!newName.trim() || store.tags.length >= 8"
            :loading="store.saving"
            @click="addTag"
          >
            添加
          </AppButton>
        </div>
        <div class="inline-colors" aria-label="新标签颜色">
          <button
            v-for="item in colors"
            :key="item"
            type="button"
            :class="{ selected: newColor === item }"
            :style="{ backgroundColor: item }"
            :aria-label="item"
            @click="newColor = item"
          />
          <span
            :style="{ color: newColor, backgroundColor: `${newColor}18` }"
          >{{ newName.trim() || "标签预览" }}</span>
        </div>
      </AppCard>
      <p class="tag-note">名称不可重复，添加后可在方案菜单中关联</p>
    </section>
    <AppState
      v-if="store.loading && !store.tags.length"
      type="loading"
      title="正在读取标签"
    />
    <AppState
      v-else-if="store.error"
      type="error"
      title="标签读取失败"
      :description="store.error"
      action-text="重试"
      @action="store.load"
    />
    <AppState
      v-else-if="!store.tags.length"
      type="empty"
      title="还没有标签"
      description="新增标签后，可以在保存和管理方案时直接选择"
      action-text=""
    />
  </AppPage>
</template>

<style scoped>
.tag-content {
  align-content: start;
  gap: 12px;
}

.header-add {
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 13px;
}

.tag-tip {
  display: flex;
  align-items: center;
  min-height: 32px;
  gap: 8px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.tag-tip :deep(.app-icon) {
  color: var(--color-primary);
}

.tag-add-section {
  display: grid;
  gap: 8px;
}

.tag-add-section h2 {
  margin: 0;
  font-size: 15px;
  line-height: 21px;
}

.tag-note {
  margin: 0 10px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.tag-add-card {
  display: grid;
  gap: 8px;
}

.tag-add-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 76px;
  gap: 8px;
}

.tag-add-row :deep(.van-field) {
  min-height: 40px;
  padding: 8px 10px;
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
}

.inline-colors {
  display: flex;
  align-items: center;
  gap: 8px;
}

.inline-colors button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px #fff;
}

.inline-colors button.selected {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.inline-colors > span {
  margin-left: auto;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  font-size: 10px;
}

.tag-list {
  display: grid;
}

.tag-list__heading {
  display: flex;
  align-items: center;
  height: 42px;
  gap: 12px;
  padding: 0 10px;
  border-bottom: 1px solid var(--color-divider);
}

.tag-list__heading strong {
  font-size: 15px;
}

.tag-list__heading span {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.tag-row {
  display: grid;
  grid-template-columns: 32px 16px minmax(0, 1fr) auto 40px 40px;
  align-items: center;
  min-height: 46px;
  gap: 6px;
  padding: 0 6px;
  transition: background var(--duration-fast) var(--ease-standard);
}

.tag-row + .tag-row {
  border-top: 1px solid var(--color-divider);
}

.tag-row--dragging {
  position: relative;
  z-index: 2;
  background: var(--color-primary-soft);
}

.tag-grip {
  display: grid;
  width: 32px;
  height: 44px;
  padding: 0;
  border: 0;
  place-items: center;
  color: var(--color-text-placeholder);
  background: transparent;
  touch-action: none;
}

.tag-color {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}

.tag-name {
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-usage {
  color: var(--color-text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.tag-inline-editor {
  display: grid;
  grid-column: 3 / 7;
  gap: 8px;
  padding-block: 8px;
}

.tag-edit-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px 64px;
  align-items: center;
  gap: 6px;
}

.tag-edit-main input {
  width: 100%;
  height: 32px;
  min-width: 0;
  padding: 0 8px;
  border: 0;
  outline: 0;
  border-radius: var(--radius-xs);
  box-shadow: var(--outline-primary);
}

.tag-inline-editor small {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.tag-edit-cancel {
  height: 36px;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 13px;
}

.tag-edit-colors {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-edit-colors > span:first-child {
  font-size: 13px;
}

.tag-edit-colors button {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px #fff;
}

.tag-edit-colors button.selected {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.tag-preview {
  margin-left: auto;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  font-size: 10px;
}

.tag-action {
  display: grid;
  width: 38px;
  height: 40px;
  padding: 0;
  border: 0;
  place-items: center;
  color: var(--color-primary);
  background: transparent;
}

.tag-action--danger {
  color: var(--color-danger);
}

@media (max-width: 359px) {
  .tag-row {
    grid-template-columns: 28px 14px minmax(0, 1fr) auto 36px 36px;
    gap: 4px;
  }
}
</style>
