<script setup lang="ts">
import { showFailToast, showSuccessToast } from "vant";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import checkedIcon from "@/assets/ui/plans/ic_checkbox_checked.svg?url";
import uncheckedIcon from "@/assets/ui/plans/ic_checkbox_unchecked.svg?url";
import deleteIcon from "@/assets/ui/plans/ic_delete_danger.svg?url";
import warningIcon from "@/assets/ui/plans/ic_warning.svg?url";
import planEmptyIllustration from "@/assets/ui/plans/states/ill_plan_empty.svg?url";
import planLoadErrorIllustration from "@/assets/ui/plans/states/ill_plan_load_error.svg?url";
import planSearchEmptyIllustration from "@/assets/ui/plans/states/ill_plan_search_empty.svg?url";
import AppButton from "@/components/base/AppButton.vue";
import AppBottomSheet from "@/components/base/AppBottomSheet.vue";
import AppChip from "@/components/base/AppChip.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppIconButton from "@/components/base/AppIconButton.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import PlanCard from "@/components/plans/PlanCard.vue";
import {
  usePlanStore,
  type PlanSort,
  type PlanStatusFilter,
} from "@/stores/plans";
import { useTicketStore } from "@/stores/ticket";
import type { SavedPlan } from "@/types/domain";

const store = usePlanStore();
const ticketStore = useTicketStore();
const router = useRouter();
const actionPlan = ref<SavedPlan>();
const loadTarget = ref<SavedPlan>();
const deleteTarget = ref<SavedPlan>();
const showRename = ref(false);
const showLoad = ref(false);
const showDelete = ref(false);
const showFilters = ref(false);
const showHeaderMenu = ref(false);
const renameValue = ref("");
const saving = ref(false);
const loadingPlan = ref(false);
const deleting = ref(false);
const saveBeforeLoad = ref(false);
const deleteLocalDraft = ref(false);
const draftStatus = ref<PlanStatusFilter>("all");
const draftTag = ref("all");
const draftPass = ref<number>();
const draftSort = ref<PlanSort>("updated-desc");
const errorCode = computed(
  () => store.error.match(/[A-Z][A-Z0-9_]{2,}/)?.[0] ?? "LOCAL_READ_ERROR",
);
const searchSuggestions = computed(() => {
  const suggestions = [
    ...store.tags.map((tag) => tag.name),
    ...store.plans.map((plan) => plan.name),
  ];
  return [...new Set(suggestions)].slice(0, 3);
});

const statusFilters: Array<{ value: PlanStatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "saved", label: "仅已保存" },
  { value: "purchased", label: "已购买" },
  { value: "pending", label: "进行中" },
  { value: "settled", label: "已完成" },
  { value: "profit", label: "盈利" },
  { value: "loss", label: "亏损" },
];

const sortOptions: Array<{ text: string; value: PlanSort }> = [
  { text: "最近更新", value: "updated-desc" },
  { text: "最早更新", value: "updated-asc" },
  { text: "投注最高", value: "stake-desc" },
  { text: "盈利最高", value: "profit-desc" },
];

const appliedFilters = computed(() => {
  const filters: Array<{
    key: "status" | "tag" | "pass" | "sort";
    label: string;
  }> = [];
  if (store.statusFilter !== "all") {
    filters.push({
      key: "status",
      label:
        statusFilters.find((item) => item.value === store.statusFilter)
          ?.label ?? store.statusFilter,
    });
  }
  if (store.tagFilter !== "all")
    filters.push({ key: "tag", label: store.tagFilter });
  if (store.passFilter)
    filters.push({ key: "pass", label: `${store.passFilter}关` });
  if (store.sort !== "updated-desc") {
    filters.push({
      key: "sort",
      label:
        sortOptions.find((item) => item.value === store.sort)?.text ??
        store.sort,
    });
  }
  return filters;
});

const targetMatchCount = computed(
  () =>
    new Set(
      loadTarget.value?.selections.map((selection) => selection.matchId) ?? [],
    ).size,
);
const targetSelectionCount = computed(
  () => loadTarget.value?.selections.length ?? 0,
);

onMounted(() => {
  void store.load();
  window.addEventListener("scroll", closeMenuOnScroll, {
    capture: true,
    passive: true,
  });
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", closeMenuOnScroll, { capture: true });
});

function closeActions(event: MouseEvent): void {
  if (!(event.target as Element).closest(".header-plan-menu")) {
    showHeaderMenu.value = false;
  }
  if ((event.target as Element).closest(".plan-card")) return;
  if (showRename.value) return;
  actionPlan.value = undefined;
}

function closeMenuOnScroll(): void {
  if (showRename.value || showLoad.value || showDelete.value) return;
  actionPlan.value = undefined;
}

function openMore(plan: SavedPlan): void {
  actionPlan.value = actionPlan.value?.id === plan.id ? undefined : plan;
  showRename.value = false;
}

function openFilters(): void {
  showHeaderMenu.value = false;
  draftStatus.value = store.statusFilter;
  draftTag.value = store.tagFilter;
  draftPass.value = store.passFilter;
  draftSort.value = store.sort;
  showFilters.value = true;
}

function clearAllFilters(): void {
  store.search = "";
  store.statusFilter = "all";
  store.tagFilter = "all";
  store.passFilter = undefined;
  store.sort = "updated-desc";
}

function applySuggestion(value: string): void {
  const tag = store.tags.find((item) => item.name === value);
  if (tag) {
    store.search = "";
    store.tagFilter = tag.name;
    return;
  }
  store.search = value;
}

function resetFilterDraft(): void {
  draftStatus.value = "all";
  draftTag.value = "all";
  draftPass.value = undefined;
  draftSort.value = "updated-desc";
}

function applyFilters(): void {
  store.statusFilter = draftStatus.value;
  store.tagFilter = draftTag.value;
  store.passFilter = draftPass.value;
  store.sort = draftSort.value;
  showFilters.value = false;
}

function removeAppliedFilter(key: "status" | "tag" | "pass" | "sort"): void {
  if (key === "status") store.statusFilter = "all";
  else if (key === "tag") store.tagFilter = "all";
  else if (key === "pass") store.passFilter = undefined;
  else store.sort = "updated-desc";
}

function openRename(): void {
  if (!actionPlan.value) return;
  renameValue.value = actionPlan.value.name;
  showRename.value = true;
}

function openTags(): void {
  if (!actionPlan.value) return;
  router.push(`/plans/${actionPlan.value.id}/tags`);
}

function requestDelete(plan: SavedPlan): void {
  actionPlan.value = undefined;
  deleteTarget.value = plan;
  deleteLocalDraft.value = false;
  showDelete.value = true;
}

async function confirmDelete(): Promise<void> {
  const plan = deleteTarget.value;
  if (!plan || deleting.value) return;
  deleting.value = true;
  try {
    await store.remove(plan.id);
    if (deleteLocalDraft.value && ticketStore.editingPlanId === plan.id) {
      ticketStore.clear();
    }
    showDelete.value = false;
    deleteTarget.value = undefined;
    showSuccessToast("方案已删除");
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  } finally {
    deleting.value = false;
  }
}

async function saveRename(): Promise<void> {
  if (!actionPlan.value || !renameValue.value.trim()) return;
  saving.value = true;
  try {
    await store.rename(actionPlan.value, renameValue.value);
    showRename.value = false;
    actionPlan.value = undefined;
    showSuccessToast("方案已改名");
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  } finally {
    saving.value = false;
  }
}

function requestLoad(plan: SavedPlan): void {
  if (!ticketStore.hasUnsavedChanges) {
    actionPlan.value = undefined;
    store.loadIntoTicket(plan);
    router.push("/ticket");
    return;
  }
  actionPlan.value = undefined;
  loadTarget.value = plan;
  saveBeforeLoad.value = false;
  showLoad.value = true;
}

async function applyLoad(): Promise<void> {
  const plan = loadTarget.value;
  if (!plan || loadingPlan.value) return;
  loadingPlan.value = true;
  try {
    if (saveBeforeLoad.value) await ticketStore.savePlan();
    store.loadIntoTicket(plan);
    showLoad.value = false;
    loadTarget.value = undefined;
    router.push("/ticket");
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  } finally {
    loadingPlan.value = false;
  }
}
</script>

<template>
  <div class="plan-page" @click="closeActions">
    <SubpageHeader title="方案管理">
      <template #action>
        <AppIconButton
          label="方案管理菜单"
          icon="more"
          variant="plain"
          :aria-expanded="showHeaderMenu"
          @click.stop="showHeaderMenu = !showHeaderMenu"
        />
      </template>
    </SubpageHeader>

    <Transition name="header-plan-menu">
      <div v-if="showHeaderMenu" class="header-plan-menu" @click.stop>
        <button type="button" @click="router.push('/settings/tags?new=1')">
          <AppIcon name="add" :size="20" /><span>新建标签</span>
        </button>
        <button type="button" @click="router.push('/settings/tags')">
          <AppIcon name="tag" :size="20" /><span>标签管理</span>
        </button>
        <button type="button" @click="router.push('/settings/data')">
          <AppIcon name="save" :size="20" /><span>导入方案</span>
        </button>
        <button type="button" @click="openFilters">
          <AppIcon name="sort" :size="20" /><span>排序方式</span>
        </button>
      </div>
    </Transition>

    <main class="plan-page__content">
      <div class="plan-toolbar">
        <van-field
          v-model="store.search"
          class="plan-search"
          clearable
          placeholder="搜索方案"
        >
          <template #left-icon><AppIcon name="search" :size="20" /></template>
        </van-field>
        <button type="button" class="toolbar-action" @click="openFilters">
          <AppIcon name="filter" :size="18" /><span>筛选</span>
          <b
            v-if="
              appliedFilters.filter(
                (item) => item.key !== 'sort' && item.key !== 'tag',
              ).length
            "
          >{{
            appliedFilters.filter(
              (item) => item.key !== "sort" && item.key !== "tag",
            ).length
          }}</b>
        </button>
        <button
          type="button"
          class="toolbar-action toolbar-action--sort"
          @click="openFilters"
        >
          <AppIcon name="sort" :size="18" /><span>{{
            sortOptions
              .find((item) => item.value === store.sort)
              ?.text.replace("更新", "")
          }}</span><AppIcon name="chevron-down" :size="12" />
        </button>
      </div>

      <div class="quick-tags" aria-label="标签筛选">
        <button
          type="button"
          :class="{ active: store.tagFilter === 'all' }"
          @click="store.tagFilter = 'all'"
        >
          全部
        </button>
        <button
          v-for="tag in store.tags"
          :key="tag.name"
          type="button"
          :class="{ active: store.tagFilter === tag.name }"
          @click="store.tagFilter = tag.name"
        >
          {{ tag.name }}
        </button>
      </div>

      <div
        v-if="
          appliedFilters.some(
            (item) => item.key !== 'tag' && item.key !== 'sort',
          )
        "
        class="applied-filters"
        aria-label="已应用筛选"
      >
        <button
          v-for="filter in appliedFilters.filter(
            (item) => item.key !== 'tag' && item.key !== 'sort',
          )"
          :key="filter.key"
          type="button"
          @click="removeAppliedFilter(filter.key)"
        >
          {{ filter.label }}<AppIcon name="close" :size="13" />
        </button>
      </div>

      <section
        v-if="store.loading && !store.plans.length"
        class="plan-state plan-state--loading"
        aria-live="polite"
      >
        <van-loading size="32" color="var(--color-primary)" />
        <strong>正在读取方案</strong>
      </section>

      <section
        v-else-if="store.error && !store.plans.length"
        class="plan-state plan-state--error"
        role="alert"
      >
        <img
          class="plan-state__illustration"
          :src="planLoadErrorIllustration"
          alt=""
        />
        <strong>方案加载失败</strong>
        <p>无法读取本机方案，请检查存储后重试</p>
        <code>{{ errorCode }}</code>
        <div class="plan-state__actions">
          <AppButton variant="secondary" @click="router.push('/settings')">
            返回设置
          </AppButton>
          <AppButton @click="store.load">重新加载</AppButton>
        </div>
      </section>

      <section
        v-else-if="!store.plans.length"
        class="plan-state plan-state--empty"
      >
        <img
          class="plan-state__illustration"
          :src="planEmptyIllustration"
          alt=""
        />
        <strong>还没有保存方案</strong>
        <p>在选票页完成选择后即可保存</p>
        <AppButton @click="router.push('/ticket')">去选票页</AppButton>
      </section>

      <section
        v-else-if="!store.filteredPlans.length"
        class="plan-state plan-state--no-result"
      >
        <img
          class="plan-state__illustration"
          :src="planSearchEmptyIllustration"
          alt=""
        />
        <strong>未找到相关方案</strong>
        <p>试试其他名称、标签或筛选条件</p>
        <AppButton variant="secondary" @click="clearAllFilters">
          清除筛选
        </AppButton>
        <div v-if="searchSuggestions.length" class="search-suggestions">
          <span>搜索建议</span>
          <div>
            <button
              v-for="suggestion in searchSuggestions"
              :key="suggestion"
              type="button"
              @click="applySuggestion(suggestion)"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>
      </section>

      <template v-else>
        <section
          v-if="store.error"
          class="plan-state plan-state--error plan-state--error-cached"
          role="alert"
        >
          <img
            class="plan-state__illustration"
            :src="planLoadErrorIllustration"
            alt=""
          />
          <strong>方案加载失败</strong>
          <p>无法读取本机方案，请检查存储后重试</p>
          <code>{{ errorCode }}</code>
          <div class="plan-state__actions">
            <AppButton variant="secondary" @click="router.push('/settings')">
              返回设置
            </AppButton>
            <AppButton @click="store.load">重新加载</AppButton>
          </div>
        </section>
        <div v-if="store.error" class="offline-notice" role="status">
          <AppIcon name="warning" :size="18" />
          <span>当前为离线模式，已显示本地缓存数据，部分信息可能过期</span>
          <button type="button" @click="store.load">重试</button>
        </div>
        <div class="plan-list">
          <PlanCard
            v-for="item in store.filteredPlans"
            :key="item.plan.id"
            :item="item"
            :menu-open="actionPlan?.id === item.plan.id && !showRename"
            :renaming="actionPlan?.id === item.plan.id && showRename"
            :rename-value="renameValue"
            :saving="saving"
            @detail="router.push(`/plans/${item.plan.id}`)"
            @click.stop
            @more="openMore(item.plan)"
            @load="requestLoad(item.plan)"
            @rename="
              actionPlan = item.plan;
              openRename();
            "
            @tags="
              actionPlan = item.plan;
              openTags();
            "
            @remove="requestDelete(item.plan)"
            @update:rename-value="renameValue = $event"
            @save-rename="saveRename"
            @cancel-rename="
              showRename = false;
              actionPlan = undefined;
            "
          />
        </div>
      </template>
    </main>

    <AppBottomSheet
      v-model:show="showFilters"
      title="筛选与排序"
      description="筛选条件应用后会保留在方案列表中"
    >
      <div class="filter-sheet">
        <section>
          <h3>方案状态</h3>
          <div class="filter-options">
            <AppChip
              v-for="item in statusFilters"
              :key="item.value"
              :selected="draftStatus === item.value"
              @click="draftStatus = item.value"
            >
              {{ item.label }}
            </AppChip>
          </div>
        </section>
        <section>
          <h3>用户标签</h3>
          <div class="filter-options">
            <AppChip :selected="draftTag === 'all'" @click="draftTag = 'all'">
              全部标签
            </AppChip>
            <AppChip
              v-for="tag in store.tags"
              :key="tag.name"
              :selected="draftTag === tag.name"
              @click="draftTag = tag.name"
            >
              {{ tag.name }}
            </AppChip>
          </div>
        </section>
        <section>
          <h3>过关方式</h3>
          <div class="filter-options">
            <AppChip
              :selected="draftPass === undefined"
              @click="draftPass = undefined"
            >
              全部过关
            </AppChip>
            <AppChip
              v-for="size in store.availablePasses"
              :key="size"
              :selected="draftPass === size"
              @click="draftPass = size"
            >
              {{ size }}关
            </AppChip>
          </div>
        </section>
        <section>
          <h3>排序</h3>
          <div class="filter-options">
            <AppChip
              v-for="item in sortOptions"
              :key="item.value"
              :selected="draftSort === item.value"
              @click="draftSort = item.value"
            >
              {{ item.text }}
            </AppChip>
          </div>
        </section>
      </div>
      <template #footer>
        <div class="filter-actions">
          <AppButton variant="secondary" block @click="resetFilterDraft">
            重置
          </AppButton>
          <AppButton block @click="applyFilters">应用</AppButton>
        </div>
      </template>
    </AppBottomSheet>

    <van-popup
      v-model:show="showLoad"
      position="bottom"
      round
      close-on-click-overlay
      class="compact-confirm-popup"
    >
      <section
        class="compact-confirm-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="载入方案"
      >
        <div class="compact-confirm-sheet__handle" aria-hidden="true"></div>
        <header class="compact-confirm-sheet__title">
          <img :src="warningIcon" alt="" />
          <h2>载入方案</h2>
        </header>
        <p class="compact-confirm-sheet__lead">
          当前选票有未保存的选择，载入「{{ loadTarget?.name }}」后将被替换。
        </p>
        <div class="load-comparison" aria-label="载入前后方案比较">
          <div>
            <span>当前选票</span>
            <strong>{{ ticketStore.selectedMatchCount }}场 /
              {{ ticketStore.selectedSelections.length }}个选项</strong>
          </div>
          <b aria-hidden="true">→</b>
          <div>
            <span>目标方案</span>
            <strong>{{ targetMatchCount }}场 /
              {{ targetSelectionCount }}个选项</strong>
          </div>
        </div>
        <button
          type="button"
          class="sheet-checkbox"
          role="checkbox"
          :aria-checked="saveBeforeLoad"
          @click="saveBeforeLoad = !saveBeforeLoad"
        >
          <img :src="saveBeforeLoad ? checkedIcon : uncheckedIcon" alt="" />
          <span>载入前先保存当前方案</span>
        </button>
        <div class="compact-confirm-sheet__actions">
          <AppButton
            data-overlay-close
            block
            variant="ghost"
            @click="showLoad = false"
          >
            取消
          </AppButton>
          <AppButton block :loading="loadingPlan" @click="applyLoad">
            确认载入
          </AppButton>
        </div>
        <p class="compact-confirm-sheet__footnote">
          载入成功后返回选票页，可继续修改
        </p>
      </section>
    </van-popup>

    <van-popup
      v-model:show="showDelete"
      position="bottom"
      round
      close-on-click-overlay
      class="compact-confirm-popup"
    >
      <section
        class="compact-confirm-sheet compact-confirm-sheet--danger"
        role="dialog"
        aria-modal="true"
        aria-label="删除方案"
      >
        <div class="compact-confirm-sheet__handle" aria-hidden="true"></div>
        <header class="compact-confirm-sheet__title">
          <img :src="deleteIcon" alt="" />
          <h2>删除方案</h2>
        </header>
        <p class="compact-confirm-sheet__question">
          确定删除「{{ deleteTarget?.name }}」吗？
        </p>
        <p class="compact-confirm-sheet__description">
          删除后无法恢复；已有购买账单中的方案快照仍会保留。
        </p>
        <button
          type="button"
          class="sheet-checkbox"
          role="checkbox"
          :aria-checked="deleteLocalDraft"
          @click="deleteLocalDraft = !deleteLocalDraft"
        >
          <img :src="deleteLocalDraft ? checkedIcon : uncheckedIcon" alt="" />
          <span>同时清除当前选票中的本地编辑草稿</span>
        </button>
        <div class="compact-confirm-sheet__actions">
          <AppButton
            data-overlay-close
            block
            variant="ghost"
            @click="showDelete = false"
          >
            取消
          </AppButton>
          <AppButton
            block
            variant="danger"
            :loading="deleting"
            @click="confirmDelete"
          >
            删除
          </AppButton>
        </div>
      </section>
    </van-popup>
  </div>
</template>

<style scoped>
.plan-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.plan-page__content {
  display: grid;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  padding: 10px var(--page-gutter) var(--space-8);
}

.header-plan-menu {
  position: fixed;
  z-index: 80;
  top: calc(48px + env(safe-area-inset-top));
  right: var(--page-gutter);
  display: grid;
  width: 144px;
  padding: 4px;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--outline-strong), var(--shadow-float);
  transform-origin: top right;
}

.header-plan-menu button {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  min-height: 42px;
  gap: 9px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-xs);
  color: var(--color-text);
  background: transparent;
  font-size: 13px;
  text-align: left;
}

.header-plan-menu button:active {
  background: var(--color-surface-soft);
}

.header-plan-menu-enter-active,
.header-plan-menu-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.header-plan-menu-enter-from,
.header-plan-menu-leave-to {
  opacity: 0;
  transform: translateY(-3px) scale(0.98);
}

.plan-toolbar {
  display: grid;
  min-width: 0;
  max-width: 100%;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  height: 40px;
  overflow: hidden;
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
  background: var(--color-surface);
}

.plan-search {
  min-width: 0;
  min-height: 40px;
  padding: 0 10px;
  background: transparent;
}

.toolbar-action {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  gap: 5px;
  padding: 0 10px;
  border: 0;
  border-left: 1px solid var(--color-divider);
  color: var(--color-text);
  background: transparent;
  font-size: 13px;
  white-space: nowrap;
}

.toolbar-action b {
  display: grid;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  place-items: center;
  color: #fff;
  background: var(--color-accent);
  font-size: 9px;
}

.toolbar-action--sort {
  padding-right: 8px;
}

.quick-tags {
  display: flex;
  min-width: 0;
  max-width: 100%;
  min-height: 36px;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.quick-tags::-webkit-scrollbar {
  display: none;
}

.quick-tags button {
  min-width: 64px;
  height: 28px;
  flex: 0 0 auto;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 13px;
}

.quick-tags button.active {
  color: #fff;
  background: var(--color-primary);
  box-shadow: var(--outline-primary);
}

.plan-list {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.plan-state {
  display: grid;
  min-height: calc(100dvh - 190px);
  align-content: center;
  justify-items: center;
  gap: 10px;
  padding: 28px 18px;
  border-radius: var(--radius-card);
  color: var(--color-text-secondary);
  text-align: center;
}

.plan-state--no-result,
.plan-state--error {
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.plan-state--error {
  min-height: 228px;
}

.plan-state--error-cached {
  grid-template-columns: 88px minmax(0, 1fr);
  align-content: center;
  justify-items: start;
  column-gap: 14px;
  padding: 20px 18px;
  text-align: left;
}

.plan-state--error-cached .plan-state__illustration {
  grid-row: 1 / span 4;
  align-self: center;
  width: 80px;
  height: 60px;
}

.plan-state--error-cached strong {
  align-self: end;
}

.plan-state--error-cached p {
  margin: 0;
}

.plan-state--error-cached code {
  margin: 0;
}

.plan-state--error-cached .plan-state__actions {
  width: 100%;
  margin-top: 4px;
}

.plan-state strong {
  color: var(--color-text);
  font-size: 18px;
  line-height: 26px;
}

.plan-state p {
  margin: -2px 0 4px;
  font-size: 13px;
  line-height: 20px;
}

.plan-state code {
  margin-bottom: 8px;
  color: var(--color-text-tertiary);
  font-family: var(--font-family);
  font-size: 11px;
}

.plan-state__illustration {
  display: block;
  width: 160px;
  height: 120px;
  object-fit: contain;
}

.plan-state__actions {
  display: grid;
  width: min(100%, 280px);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.search-suggestions {
  display: grid;
  width: 100%;
  justify-items: start;
  gap: 10px;
  margin-top: 26px;
  text-align: left;
}

.search-suggestions > span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.search-suggestions > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.search-suggestions button {
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 12px;
}

.offline-notice {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 38px;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius-control);
  color: var(--color-text-secondary);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 11px;
  line-height: 16px;
}

.offline-notice :deep(.app-icon) {
  color: var(--color-mint);
}

.offline-notice button {
  padding: 6px;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 11px;
}

.applied-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.applied-filters button {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  gap: 4px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-pill);
  color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: var(--outline-primary);
  font-size: 11px;
}

.filter-sheet {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) var(--page-gutter);
}

.filter-sheet h3 {
  margin: 0;
  font-size: 13px;
}

.filter-sheet section {
  display: grid;
  gap: 8px;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.compact-confirm-popup {
  overflow: hidden;
  border-radius: 24px 24px 0 0;
  background: var(--color-surface);
}

.compact-confirm-sheet {
  display: grid;
  gap: 12px;
  padding: 8px 20px calc(14px + env(safe-area-inset-bottom));
}

.compact-confirm-sheet__handle {
  width: 38px;
  height: 4px;
  margin: 0 auto 4px;
  border-radius: var(--radius-pill);
  background: #d4dbe6;
}

.compact-confirm-sheet__title {
  display: flex;
  align-items: center;
  min-height: 28px;
  gap: 8px;
}

.compact-confirm-sheet__title img {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
}

.compact-confirm-sheet__title h2,
.compact-confirm-sheet p {
  margin: 0;
}

.compact-confirm-sheet__title h2 {
  color: var(--color-text);
  font-size: 17px;
  line-height: 24px;
}

.compact-confirm-sheet__lead,
.compact-confirm-sheet__question {
  color: var(--color-text);
  font-size: 13px;
  line-height: 20px;
}

.compact-confirm-sheet__description,
.compact-confirm-sheet__footnote {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.compact-confirm-sheet__question {
  margin-top: 2px;
}

.load-comparison {
  display: grid;
  min-height: 66px;
  grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.load-comparison div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.load-comparison span {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.load-comparison strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: 14px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.load-comparison b {
  color: var(--color-text-tertiary);
  font-size: 22px;
  font-weight: 400;
  text-align: center;
}

.sheet-checkbox {
  display: flex;
  align-items: center;
  min-height: 44px;
  gap: 8px;
  padding: 0;
  border: 0;
  color: var(--color-text);
  background: transparent;
  font-size: 13px;
  text-align: left;
}

.sheet-checkbox img {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
}

.compact-confirm-sheet__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.compact-confirm-sheet__actions :deep(.app-button) {
  height: 40px;
  font-size: 13px;
}

.compact-confirm-sheet__footnote {
  text-align: center;
}

.compact-confirm-sheet--danger {
  gap: 10px;
}

.compact-confirm-sheet--danger .compact-confirm-sheet__actions {
  margin-top: 2px;
}
</style>
