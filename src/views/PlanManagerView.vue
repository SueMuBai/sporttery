<script setup lang="ts">
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import AppChip from '@/components/base/AppChip.vue'
import AppIconButton from '@/components/base/AppIconButton.vue'
import AppState from '@/components/base/AppState.vue'
import SubpageHeader from '@/components/base/SubpageHeader.vue'
import PlanCard from '@/components/plans/PlanCard.vue'
import { usePlanStore, type PlanSort, type PlanStatusFilter } from '@/stores/plans'
import { useTicketStore } from '@/stores/ticket'
import type { SavedPlan } from '@/types/domain'

const store = usePlanStore()
const ticketStore = useTicketStore()
const router = useRouter()
const actionPlan = ref<SavedPlan>()
const showActions = ref(false)
const showRename = ref(false)
const showTags = ref(false)
const showLoad = ref(false)
const renameValue = ref('')
const selectedTags = ref<string[]>([])
const saving = ref(false)

const statusFilters: Array<{ value: PlanStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '进行中' },
  { value: 'settled', label: '已完成' },
  { value: 'profit', label: '盈利' },
  { value: 'loss', label: '亏损' },
]

const sortOptions: Array<{ text: string; value: PlanSort }> = [
  { text: '最近更新', value: 'updated-desc' },
  { text: '最早更新', value: 'updated-asc' },
  { text: '投注最高', value: 'stake-desc' },
  { text: '盈利最高', value: 'profit-desc' },
]

const loadConflicts = computed(() =>
  actionPlan.value ? store.mergeConflicts(actionPlan.value) : [],
)
const tagOptions = computed(() => [
  { text: '全部标签', value: 'all' },
  ...store.tags.map((tag) => ({ text: tag.name, value: tag.name })),
])
const passOptions = computed(() => [
  { text: '全部过关', value: undefined },
  ...store.availablePasses.map((size) => ({ text: `${size}关`, value: size })),
])

onMounted(() => store.load())

function openMore(plan: SavedPlan): void {
  actionPlan.value = plan
  showActions.value = true
}

function openRename(): void {
  if (!actionPlan.value) return
  renameValue.value = actionPlan.value.name
  showActions.value = false
  showRename.value = true
}

function openTags(): void {
  if (!actionPlan.value) return
  selectedTags.value = [...actionPlan.value.tags]
  showActions.value = false
  showTags.value = true
}

async function deletePlan(): Promise<void> {
  const plan = actionPlan.value
  if (!plan) return
  showActions.value = false
  try {
    await showConfirmDialog({
      title: '删除方案？',
      message: `确定删除“${plan.name}”吗？已购账单快照仍会保留。`,
      confirmButtonText: '删除',
      confirmButtonColor: '#EF5B67',
    })
    await store.remove(plan.id)
    showSuccessToast('方案已删除')
  } catch {
    // User cancelled.
  }
}

async function saveRename(): Promise<void> {
  if (!actionPlan.value || !renameValue.value.trim()) return
  saving.value = true
  try {
    await store.rename(actionPlan.value, renameValue.value)
    showRename.value = false
    showSuccessToast('方案已改名')
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

function toggleTag(tag: string): void {
  const next = new Set(selectedTags.value)
  if (next.has(tag)) next.delete(tag)
  else next.add(tag)
  selectedTags.value = [...next]
}

async function saveTags(): Promise<void> {
  if (!actionPlan.value) return
  saving.value = true
  try {
    await store.updateTags(actionPlan.value, selectedTags.value)
    showTags.value = false
    showSuccessToast('标签已更新')
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

function requestLoad(plan: SavedPlan): void {
  actionPlan.value = plan
  if (!ticketStore.selectedSelections.length) {
    store.loadIntoTicket(plan, 'replace')
    router.push('/ticket')
    return
  }
  showLoad.value = true
}

function applyLoad(mode: 'replace' | 'merge'): void {
  if (!actionPlan.value) return
  try {
    store.loadIntoTicket(actionPlan.value, mode)
    showLoad.value = false
    router.push('/ticket')
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  }
}
</script>

<template>
  <div class="plan-page">
    <SubpageHeader title="方案管理" :subtitle="`${store.plans.length} 个已保存方案`">
      <template #action>
        <AppIconButton label="刷新方案状态" icon="replay" variant="plain" :loading="store.loading" @click="store.load" />
      </template>
    </SubpageHeader>

    <main class="plan-page__content">
      <van-field
        v-model="store.search"
        class="plan-search"
        left-icon="search"
        clearable
        placeholder="搜索方案名称或标签…"
      />

      <div class="filter-scroll">
        <AppChip
          v-for="item in statusFilters"
          :key="item.value"
          :selected="store.statusFilter === item.value"
          @click="store.statusFilter = item.value"
        >
          {{ item.label }}
        </AppChip>
      </div>

      <div class="filter-row">
        <van-dropdown-menu class="plan-dropdown">
          <van-dropdown-item v-model="store.tagFilter" :options="tagOptions" />
          <van-dropdown-item v-model="store.passFilter" :options="passOptions" />
          <van-dropdown-item v-model="store.sort" :options="sortOptions" />
        </van-dropdown-menu>
      </div>

      <AppState v-if="store.loading && !store.plans.length" type="loading" title="正在读取方案" />
      <AppState
        v-else-if="store.error"
        type="error"
        title="方案读取失败"
        :description="store.error"
        action-text="重试"
        @action="store.load"
      />
      <AppState
        v-else-if="!store.filteredPlans.length"
        type="empty"
        title="没有符合条件的方案"
        description="可以修改筛选条件，或返回选票保存新方案"
      />
      <div v-else class="plan-list">
        <PlanCard
          v-for="item in store.filteredPlans"
          :key="item.plan.id"
          :item="item"
          @detail="router.push(`/plans/${item.plan.id}`)"
          @load="requestLoad(item.plan)"
          @more="openMore(item.plan)"
        />
      </div>
    </main>

    <van-action-sheet v-model:show="showActions" title="方案操作">
      <div class="action-list">
        <button type="button" @click="openRename"><van-icon name="edit" />改名</button>
        <button type="button" @click="openTags"><van-icon name="label-o" />修改标签</button>
        <button type="button" class="danger" @click="deletePlan"><van-icon name="delete-o" />删除方案</button>
      </div>
    </van-action-sheet>

    <van-popup v-model:show="showRename" position="bottom" round closeable>
      <div class="edit-sheet">
        <h2>修改方案名称</h2>
        <van-field v-model="renameValue" maxlength="30" show-word-limit placeholder="请输入方案名称" />
        <AppButton block :loading="saving" :disabled="!renameValue.trim()" @click="saveRename">保存名称</AppButton>
      </div>
    </van-popup>

    <van-popup v-model:show="showTags" position="bottom" round closeable>
      <div class="edit-sheet">
        <h2>修改方案标签</h2>
        <div class="tag-options">
          <AppChip
            v-for="tag in store.tags"
            :key="tag.name"
            :selected="selectedTags.includes(tag.name)"
            @click="toggleTag(tag.name)"
          >
            {{ tag.name }}
          </AppChip>
        </div>
        <AppButton block :loading="saving" @click="saveTags">保存标签</AppButton>
      </div>
    </van-popup>

    <van-popup v-model:show="showLoad" position="bottom" round closeable>
      <div class="edit-sheet load-sheet">
        <h2>导入“{{ actionPlan?.name }}”</h2>
        <p>当前选票已有 {{ ticketStore.selectedMatchCount }} 场。请选择导入方式。</p>
        <div v-if="loadConflicts.length" class="conflict-banner">
          有 {{ loadConflicts.length }} 场存在不同玩法冲突，不能直接合并。
        </div>
        <AppButton block @click="applyLoad('replace')">替换当前选票并编辑</AppButton>
        <AppButton block variant="secondary" :disabled="Boolean(loadConflicts.length)" @click="applyLoad('merge')">
          合并为新方案
        </AppButton>
      </div>
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
  gap: var(--space-3);
  padding: var(--space-4) var(--page-gutter) var(--space-8);
}

.plan-search {
  min-height: var(--control-height-lg);
  padding-inline: var(--space-4);
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
}

.filter-scroll {
  display: flex;
  gap: var(--space-2);
  margin-inline: calc(var(--page-gutter) * -1);
  padding: 2px var(--page-gutter);
  overflow-x: auto;
  scrollbar-width: none;
}

.filter-scroll::-webkit-scrollbar {
  display: none;
}

.filter-row {
  overflow: hidden;
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
}

.plan-dropdown {
  --van-dropdown-menu-height: 44px;
  --van-dropdown-menu-background: var(--color-surface);
  --van-dropdown-menu-shadow: none;
}

.plan-list {
  display: grid;
  gap: var(--space-3);
}

.action-list {
  display: grid;
  padding: 0 var(--page-gutter) calc(var(--space-4) + env(safe-area-inset-bottom));
}

.action-list button {
  display: flex;
  align-items: center;
  min-height: 54px;
  gap: var(--space-3);
  padding: 0 var(--space-3);
  border: 0;
  color: var(--color-text);
  background: transparent;
  border-bottom: 1px solid var(--color-divider);
  font-size: var(--font-size-md);
  text-align: left;
}

.action-list .danger {
  color: var(--color-danger);
}

.edit-sheet {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5) var(--page-gutter) calc(var(--space-5) + env(safe-area-inset-bottom));
}

.edit-sheet h2,
.edit-sheet p {
  margin: 0;
}

.edit-sheet h2 {
  padding-right: 40px;
  font-size: 21px;
}

.edit-sheet p {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.edit-sheet :deep(.van-field) {
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
}

.tag-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.conflict-banner {
  padding: var(--space-3);
  border-radius: var(--radius-control);
  color: var(--color-danger);
  background: var(--color-accent-soft);
  box-shadow: inset 0 0 0 1px rgb(239 91 103 / 25%);
  font-size: var(--font-size-sm);
}
</style>
