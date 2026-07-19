<script setup lang="ts">
import { showFailToast } from "vant";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import AppButton from "@/components/base/AppButton.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppPage from "@/components/base/AppPage.vue";
import AppState from "@/components/base/AppState.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { MAX_PLAN_TAG_NAME_LENGTH } from "@/features/plans/tagValidation";
import { useSettingsStore } from "@/stores/settings";
import type { PlanTag } from "@/types/domain";

const store = useSettingsStore();
const editing = ref<PlanTag>();
const name = ref("");
const color = ref("#5797F5");
const newName = ref("");
const newColor = ref("#5797F5");
const addError = ref("");
const editError = ref("");
const addInput = ref<HTMLInputElement>();
const addSection = ref<HTMLElement>();
const addExpanded = ref(true);
const dragging = ref<string>();
const reordering = ref(false);
const deleteTarget = ref<PlanTag>();
const deleteSheetVisible = ref(false);
const toastMessage = ref("");
const toastVisible = ref(false);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const colors = [
  "#5797F5",
  "#61D6BF",
  "#9A91F5",
  "#FF8FB3",
  "#E8AA32",
  "#FF7D7D",
];

const deleteUsage = computed(() =>
  deleteTarget.value ? (store.tagUsage[deleteTarget.value.name] ?? 0) : 0,
);

onMounted(() => store.load());
onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer);
});

function showTagToast(message: string): void {
  if (toastTimer) clearTimeout(toastTimer);
  toastMessage.value = message;
  toastVisible.value = true;
  toastTimer = setTimeout(() => {
    toastVisible.value = false;
  }, 1800);
}

async function focusAdd(): Promise<void> {
  editing.value = undefined;
  editError.value = "";
  addExpanded.value = true;
  await nextTick();
  addSection.value?.scrollIntoView({ behavior: "smooth", block: "center" });
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
  } catch (reason) {
    showFailToast({
      message: reason instanceof Error ? reason.message : String(reason),
      duration: 3000,
    });
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
  editError.value = "";
  addError.value = "";
  addExpanded.value = false;
}

function cancelEdit(): void {
  editing.value = undefined;
  editError.value = "";
}

async function saveEdit(): Promise<void> {
  try {
    editError.value = "";
    const saved = await store.saveTag(
      name.value,
      color.value,
      editing.value?.name,
    );
    editing.value = saved;
    name.value = saved.name;
    color.value = saved.color;
    showTagToast("标签已更新");
  } catch (reason) {
    editError.value = reason instanceof Error ? reason.message : String(reason);
  }
}

async function addTag(): Promise<void> {
  try {
    addError.value = "";
    const saved = await store.saveTag(newName.value, newColor.value);
    newName.value = saved.name;
    newColor.value = saved.color;
    showTagToast("标签已添加");
  } catch (reason) {
    addError.value = reason instanceof Error ? reason.message : String(reason);
  }
}

function remove(tag: PlanTag): void {
  if (editing.value) cancelEdit();
  addExpanded.value = true;
  deleteTarget.value = tag;
  deleteSheetVisible.value = true;
}

async function confirmRemove(): Promise<void> {
  if (!deleteTarget.value) return;
  const target = deleteTarget.value;
  try {
    await store.deleteTag(target.name);
    deleteSheetVisible.value = false;
    if (editing.value?.name === target.name) cancelEdit();
    showTagToast("标签已删除");
  } catch (reason) {
    showFailToast({
      message: reason instanceof Error ? reason.message : String(reason),
      duration: 3000,
    });
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
        :class="[
          'tag-row',
          {
            'tag-row--dragging': dragging === tag.name,
            'tag-row--editing': editing?.name === tag.name,
          },
        ]"
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
        <strong class="tag-name">{{ tag.name }}</strong>
        <span class="tag-usage">{{ store.tagUsage[tag.name] || 0 }}个方案</span>
        <button
          v-if="editing?.name === tag.name"
          type="button"
          class="tag-action"
          :aria-label="`收起标签编辑 ${tag.name}`"
          @click="cancelEdit"
        >
          <AppIcon name="chevron-up" :size="18" />
        </button>
        <button
          v-else
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
          :disabled="store.saving"
          @click="remove(tag)"
        >
          <AppIcon name="delete" :size="18" />
        </button>
        <div v-if="editing?.name === tag.name" class="tag-inline-editor">
          <div class="tag-edit-main">
            <label class="tag-edit-input">
              <input
                v-model="name"
                :maxlength="MAX_PLAN_TAG_NAME_LENGTH"
                aria-label="标签名称"
                @input="editError = ''"
                @keydown.enter.prevent="saveEdit"
                @keydown.esc.prevent="cancelEdit"
              />
              <span>{{ name.length }}/{{ MAX_PLAN_TAG_NAME_LENGTH }}</span>
            </label>
            <button type="button" class="tag-edit-cancel" @click="cancelEdit">
              取消
            </button>
            <AppButton
              :loading="store.saving"
              :disabled="!name.trim()"
              @click="saveEdit"
            >
              保存
            </AppButton>
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
            <span
              class="tag-preview"
              :style="{ color, backgroundColor: `${color}18` }"
            >{{ name.trim() || tag.name }}</span>
          </div>
          <small>修改后，已关联的{{
            store.tagUsage[tag.name] || 0
          }}个方案同步更新</small>
          <p v-if="editError" class="tag-error" role="alert">{{ editError }}</p>
        </div>
      </div>
    </AppCard>
    <section ref="addSection" class="tag-add-section">
      <h2>新增标签</h2>
      <AppCard v-if="addExpanded && !editing" class="tag-add-card">
        <div class="tag-add-row">
          <label
            :class="['tag-add-input', { 'tag-add-input--error': addError }]"
          >
            <input
              ref="addInput"
              v-model="newName"
              :maxlength="MAX_PLAN_TAG_NAME_LENGTH"
              placeholder="标签名称"
              @input="addError = ''"
              @keydown.enter.prevent="addTag"
            />
            <span>{{ newName.length }}/{{ MAX_PLAN_TAG_NAME_LENGTH }}</span>
          </label>
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
        <p v-if="addError" class="tag-error" role="alert">{{ addError }}</p>
      </AppCard>
      <button v-else type="button" class="tag-add-collapsed" @click="focusAdd">
        <AppIcon name="add" :size="18" />
        <span>新增标签</span>
      </button>
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
    <Transition name="tag-toast">
      <div v-if="toastVisible" class="tag-feedback-toast" role="status">
        <span class="tag-feedback-toast__icon">
          <AppIcon name="check" :size="17" />
        </span>
        <span>{{ toastMessage }}</span>
      </div>
    </Transition>
    <van-popup
      v-model:show="deleteSheetVisible"
      position="bottom"
      round
      class="tag-delete-popup"
      :close-on-click-overlay="!store.saving"
      @closed="deleteTarget = undefined"
    >
      <section
        v-if="deleteTarget"
        class="tag-delete-sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="`删除标签 ${deleteTarget.name}`"
      >
        <span class="tag-delete-sheet__handle" aria-hidden="true" />
        <header class="tag-delete-sheet__title">
          <AppIcon name="delete" :size="22" />
          <h2>删除标签</h2>
        </header>
        <p class="tag-delete-sheet__question">
          确定删除「{{ deleteTarget.name }}」标签吗？
        </p>
        <p class="tag-delete-sheet__impact">
          <template v-if="deleteUsage">
            该标签已关联<strong>{{ deleteUsage }}个</strong>方案；
          </template>
          <template v-else>该标签未关联方案；</template>
          删除标签不会删除方案。
        </p>
        <div class="tag-delete-sheet__actions">
          <button
            type="button"
            class="tag-delete-sheet__button tag-delete-sheet__button--cancel"
            data-overlay-close
            :disabled="store.saving"
            @click="deleteSheetVisible = false"
          >
            取消
          </button>
          <button
            type="button"
            class="tag-delete-sheet__button tag-delete-sheet__button--danger"
            :disabled="store.saving"
            @click="confirmRemove"
          >
            {{ store.saving ? "删除中…" : "删除标签" }}
          </button>
        </div>
        <p class="tag-delete-sheet__note">删除后方案将自动移除此标签</p>
      </section>
    </van-popup>
  </AppPage>
</template>

<style scoped>
.tag-content {
  align-content: start;
  gap: 12px;
}

.header-add {
  display: grid;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 13px;
  line-height: 1;
  place-items: center;
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
  line-height: 16px;
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

.tag-add-row :deep(.app-button--primary),
.tag-edit-main :deep(.app-button--primary) {
  background: linear-gradient(135deg, #69b5ff, var(--color-primary));
}

.tag-add-input,
.tag-edit-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  height: 40px;
  min-width: 0;
  gap: 6px;
  padding: 0 10px;
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
  background: var(--color-surface);
  transition: box-shadow var(--duration-fast) var(--ease-standard);
}

.tag-add-input:focus-within,
.tag-edit-input:focus-within {
  box-shadow: var(--outline-primary);
}

.tag-add-input--error {
  box-shadow: inset 0 0 0 1px var(--color-danger);
}

.tag-add-input input,
.tag-edit-input input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 13px;
  line-height: 18px;
}

.tag-add-input input::placeholder {
  color: var(--color-placeholder);
}

.tag-add-input > span,
.tag-edit-input > span {
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 16px;
}

.inline-colors {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding-top: 8px;
  border-top: 1px solid var(--color-divider);
}

.inline-colors::before {
  content: "颜色";
  flex: 0 0 auto;
  color: var(--color-text);
  font-size: 13px;
}

.inline-colors button,
.tag-edit-colors button {
  position: relative;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px #fff;
}

.inline-colors button.selected,
.tag-edit-colors button.selected {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.inline-colors > span {
  margin-left: auto;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  font-size: 10px;
}

.tag-add-collapsed {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 44px;
  gap: 8px;
  padding: 0 12px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-control);
  color: var(--color-text-secondary);
  background: rgb(255 255 255 / 54%);
  font-size: 13px;
  line-height: 18px;
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
  column-gap: 6px;
  row-gap: 0;
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

.tag-row--editing {
  align-items: center;
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
  width: 100%;
  min-width: 0;
  padding: 8px 0 10px;
}

.tag-edit-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px 64px;
  align-items: center;
  gap: 6px;
}

.tag-edit-input {
  box-shadow: var(--outline-primary);
}

.tag-inline-editor small {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.tag-edit-cancel {
  height: 40px;
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
  min-height: 30px;
}

.tag-edit-colors > span:first-child {
  font-size: 13px;
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
  color: var(--color-text);
  background: transparent;
}

.tag-action--danger {
  color: var(--color-text);
}

.tag-action:disabled {
  opacity: 0.45;
}

.tag-error {
  margin: 0;
  color: var(--color-danger);
  font-size: 11px;
  line-height: 16px;
}

.tag-feedback-toast {
  position: fixed;
  z-index: 3000;
  bottom: calc(54px + env(safe-area-inset-bottom));
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 126px;
  min-height: 48px;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 8px;
  color: #fff;
  background: rgb(29 37 48 / 92%);
  box-shadow: 0 10px 28px rgb(29 37 48 / 20%);
  font-size: 13px;
  line-height: 18px;
  transform: translateX(-50%);
  pointer-events: none;
}

.tag-feedback-toast__icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border-radius: 50%;
  place-items: center;
  color: var(--color-text);
  background: #fff;
}

.tag-toast-enter-active,
.tag-toast-leave-active {
  transition:
    opacity 160ms var(--ease-standard),
    transform 160ms var(--ease-standard);
}

.tag-toast-enter-from,
.tag-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}

/* stylelint-disable-next-line selector-pseudo-class-no-unknown */
:global(.tag-delete-popup) {
  overflow: hidden;
  border-radius: 20px 20px 0 0;
  background: var(--color-surface);
}

.tag-delete-sheet {
  display: grid;
  gap: 16px;
  padding: 10px 18px calc(22px + env(safe-area-inset-bottom));
}

.tag-delete-sheet__handle {
  width: 40px;
  height: 5px;
  margin: 0 auto 2px;
  border-radius: var(--radius-pill);
  background: #d9dee7;
}

.tag-delete-sheet__title {
  display: flex;
  align-items: center;
  min-height: 34px;
  gap: 10px;
  color: var(--color-danger);
}

.tag-delete-sheet__title h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 17px;
  line-height: 24px;
}

.tag-delete-sheet__question,
.tag-delete-sheet__impact,
.tag-delete-sheet__note {
  margin: 0;
}

.tag-delete-sheet__question {
  color: var(--color-text);
  font-size: 14px;
  line-height: 22px;
}

.tag-delete-sheet__impact {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 20px;
}

.tag-delete-sheet__impact strong {
  color: var(--color-danger);
  font-weight: 500;
}

.tag-delete-sheet__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 6px;
}

.tag-delete-sheet__button {
  height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-control);
  font-size: 13px;
  line-height: 18px;
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
}

.tag-delete-sheet__button:active:not(:disabled) {
  transform: scale(0.985);
}

.tag-delete-sheet__button:disabled {
  opacity: 0.62;
}

.tag-delete-sheet__button--cancel {
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-strong);
}

.tag-delete-sheet__button--danger {
  color: #fff;
  background: linear-gradient(135deg, #ff6857, #ff5049);
}

.tag-delete-sheet__note {
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
}

@media (max-width: 359px) {
  .tag-row {
    grid-template-columns: 28px 14px minmax(0, 1fr) auto 36px 36px;
    gap: 4px;
  }

  .inline-colors,
  .tag-edit-colors {
    gap: 6px;
  }

  .inline-colors button,
  .tag-edit-colors button {
    width: 22px;
    height: 22px;
  }
}
</style>
