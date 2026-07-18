<script setup lang="ts">
import { showConfirmDialog, showFailToast, showSuccessToast } from "vant";
import { onMounted, ref } from "vue";

import AppButton from "@/components/base/AppButton.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppChip from "@/components/base/AppChip.vue";
import AppState from "@/components/base/AppState.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { useSettingsStore } from "@/stores/settings";
import type { PlanTag } from "@/types/domain";

const store = useSettingsStore();
const showEditor = ref(false);
const editing = ref<PlanTag>();
const name = ref("");
const color = ref("#5797F5");
const error = ref("");
const colors = [
  "#5797F5",
  "#61D6BF",
  "#9A91F5",
  "#FF8FB3",
  "#E8AA32",
  "#FF7D7D",
];

onMounted(() => store.load());

function openEditor(tag?: PlanTag): void {
  editing.value = tag;
  name.value = tag?.name ?? "";
  color.value = tag?.color ?? colors[store.tags.length % colors.length]!;
  error.value = "";
  showEditor.value = true;
}

async function save(): Promise<void> {
  try {
    error.value = "";
    await store.saveTag(name.value, color.value, editing.value?.name);
    showEditor.value = false;
    showSuccessToast(editing.value ? "标签已更新" : "标签已新增");
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
}

async function remove(tag: PlanTag): Promise<void> {
  const count = store.tagUsage[tag.name] ?? 0;
  try {
    await showConfirmDialog({
      title: `删除“${tag.name}”？`,
      message: count
        ? `该标签正在被 ${count} 个方案使用。删除只会解除关联，不会删除方案。`
        : "删除标签不会删除任何方案。",
      confirmButtonText: "删除标签",
      confirmButtonColor: "#EF5B67",
    });
    await store.deleteTag(tag.name);
    showSuccessToast("标签已删除");
  } catch (reason) {
    if (reason instanceof Error) showFailToast(reason.message);
  }
}
</script>

<template>
  <div class="subpage tag-page">
    <SubpageHeader title="标签管理" :subtitle="`${store.tags.length} 个标签`">
      <template #action>
        <AppButton size="small" @click="openEditor()">
          <van-icon name="plus" />新增
        </AppButton>
      </template>
    </SubpageHeader>
    <main class="subpage-content tag-content">
      <AppCard class="tag-summary">
        <van-icon name="label-o" size="24" />
        <div>
          <strong>方案支持多标签</strong>
          <p>删除标签只解除方案关联，账单快照和方案本身不会丢失。</p>
        </div>
      </AppCard>
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
        action-text="新增标签"
        @action="openEditor()"
      />
      <AppCard v-else class="tag-list" :padded="false">
        <div v-for="(tag, index) in store.tags" :key="tag.name" class="tag-row">
          <span class="tag-color" :style="{ backgroundColor: tag.color }" />
          <div class="tag-copy">
            <strong>{{ tag.name }}</strong><small>{{ store.tagUsage[tag.name] || 0 }} 个方案正在使用</small>
          </div>
          <div class="tag-order">
            <button
              type="button"
              :disabled="index === 0"
              :aria-label="`上移标签 ${tag.name}`"
              @click="store.moveTag(tag.name, -1)"
            >
              <van-icon name="arrow-up" />
            </button>
            <button
              type="button"
              :disabled="index === store.tags.length - 1"
              :aria-label="`下移标签 ${tag.name}`"
              @click="store.moveTag(tag.name, 1)"
            >
              <van-icon name="arrow-down" />
            </button>
          </div>
          <button
            type="button"
            class="tag-action"
            :aria-label="`编辑标签 ${tag.name}`"
            @click="openEditor(tag)"
          >
            <van-icon name="edit" />
          </button>
          <button
            type="button"
            class="tag-action tag-action--danger"
            :aria-label="`删除标签 ${tag.name}`"
            @click="remove(tag)"
          >
            <van-icon name="delete-o" />
          </button>
        </div>
      </AppCard>
    </main>

    <van-popup v-model:show="showEditor" position="bottom" round closeable>
      <div class="tag-editor">
        <h2>{{ editing ? "编辑标签" : "新增标签" }}</h2>
        <van-field
          v-model="name"
          maxlength="12"
          show-word-limit
          label="名称"
          placeholder="请输入标签名称"
          :error-message="error"
          @update:model-value="error = ''"
        />
        <div class="color-section">
          <h3>标签颜色</h3>
          <div class="color-options">
            <AppChip
              v-for="item in colors"
              :key="item"
              :selected="color === item"
              :style="{ color: item }"
              @click="color = item"
            >
              <span class="color-dot" :style="{ backgroundColor: item }" />{{
                item
              }}
            </AppChip>
          </div>
        </div>
        <AppButton
          block
          :loading="store.saving"
          :disabled="!name.trim()"
          @click="save"
        >
          保存标签
        </AppButton>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.tag-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.tag-content {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) var(--page-gutter) var(--space-8);
}

.tag-summary {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.tag-summary div {
  display: grid;
  gap: 3px;
}

.tag-summary p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.45;
}

.tag-list {
  display: grid;
}

.tag-row {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto 40px 40px;
  align-items: center;
  min-height: 70px;
  gap: var(--space-2);
  padding: 8px var(--space-3);
}

.tag-row + .tag-row {
  border-top: 1px solid var(--color-divider);
}

.tag-color {
  width: 10px;
  height: 38px;
  border-radius: var(--radius-pill);
}

.tag-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.tag-copy strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-copy small {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.tag-order {
  display: flex;
}

.tag-order button,
.tag-action {
  display: grid;
  width: 38px;
  height: 40px;
  padding: 0;
  border: 0;
  place-items: center;
  color: var(--color-text-secondary);
  background: transparent;
}

.tag-order button:disabled {
  opacity: 0.25;
}

.tag-action {
  color: var(--color-primary);
}

.tag-action--danger {
  color: var(--color-danger);
}

.tag-editor {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5) var(--page-gutter)
    calc(var(--space-5) + env(safe-area-inset-bottom));
}

.tag-editor h2,
.tag-editor h3 {
  margin: 0;
}

.tag-editor h2 {
  padding-right: 44px;
  font-size: 21px;
}

.tag-editor h3 {
  font-size: 15px;
}

.tag-editor :deep(.van-field) {
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
}

.color-section {
  display: grid;
  gap: var(--space-3);
}

.color-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

@media (max-width: 359px) {
  .tag-row {
    grid-template-columns: 10px minmax(0, 1fr) auto 36px;
  }

  .tag-order {
    display: none;
  }
}
</style>
