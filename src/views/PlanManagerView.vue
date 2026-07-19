<script setup lang="ts">
import { showFailToast, showSuccessToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import AppBottomSheet from '@/components/base/AppBottomSheet.vue'
import AppChip from '@/components/base/AppChip.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppState from '@/components/base/AppState.vue'
import SubpageHeader from '@/components/base/SubpageHeader.vue'
import { confirmAction } from '@/components/base/confirmAction'
import PlanCard from '@/components/plans/PlanCard.vue'
import { usePlanStore, type PlanSort, type PlanStatusFilter } from '@/stores/plans'
import { useTicketStore } from '@/stores/ticket'
import type { SavedPlan } from '@/types/domain'

const store = usePlanStore()
const ticketStore = useTicketStore()
const router = useRouter()
const actionPlan = ref<SavedPlan>()
const showRename = ref(false)
const showLoad = ref(false)
const showFilters = ref(false)
const renameValue = ref('')
const saving = ref(false)
const draftStatus = ref<PlanStatusFilter>('all')
const draftTag = ref('all')
const draftPass = ref<number>()
const draftSort = ref<PlanSort>('updated-desc')

const statusFilters: Array<{ value: PlanStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'saved', label: '仅已保存' },
  { value: 'purchased', label: '已购买' },
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

const appliedFilters = computed(() => {
  const filters: Array<{ key: 'status' | 'tag' | 'pass' | 'sort'; label: string }> = []
  if (store.statusFilter !== 'all') {
    filters.push({ key: 'status', label: statusFilters.find((item) => item.value === store.statusFilter)?.label ?? store.statusFilter })
  }
  if (store.tagFilter !== 'all') filters.push({ key: 'tag', label: store.tagFilter })
  if (store.passFilter) filters.push({ key: 'pass', label: `${store.passFilter}关` })
  if (store.sort !== 'updated-desc') {
    filters.push({ key: 'sort', label: sortOptions.find((item) => item.value === store.sort)?.text ?? store.sort })
  }
  return filters
})

onMounted(() => store.load())

function closeActions(event: MouseEvent): void {
  if ((event.target as Element).closest('.plan-card')) return
  actionPlan.value = undefined
  showRename.value = false
}

function openMore(plan: SavedPlan): void {
  actionPlan.value = actionPlan.value?.id === plan.id ? undefined : plan
  showRename.value = false
}

function openFilters(): void {
  draftStatus.value = store.statusFilter
  draftTag.value = store.tagFilter
  draftPass.value = store.passFilter
  draftSort.value = store.sort
  showFilters.value = true
}

function resetFilterDraft(): void {
  draftStatus.value = 'all'
  draftTag.value = 'all'
  draftPass.value = undefined
  draftSort.value = 'updated-desc'
}

function applyFilters(): void {
  store.statusFilter = draftStatus.value
  store.tagFilter = draftTag.value
  store.passFilter = draftPass.value
  store.sort = draftSort.value
  showFilters.value = false
}

function removeAppliedFilter(key: 'status' | 'tag' | 'pass' | 'sort'): void {
  if (key === 'status') store.statusFilter = 'all'
  else if (key === 'tag') store.tagFilter = 'all'
  else if (key === 'pass') store.passFilter = undefined
  else store.sort = 'updated-desc'
}

function openRename(): void {
  if (!actionPlan.value) return
  renameValue.value = actionPlan.value.name
  showRename.value = true
}

function openTags(): void {
  if (!actionPlan.value) return
  router.push(`/plans/${actionPlan.value.id}/tags`)
}

async function deletePlan(): Promise<void> {
  const plan = actionPlan.value
  if (!plan) return
  actionPlan.value = undefined
  try {
    await confirmAction({
      title: '删除方案？',
      message: `确定删除“${plan.name}”吗？已有购买账单的快照仍会保留。`,
      confirmText: '删除',
      danger: true,
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
    actionPlan.value = undefined
    showSuccessToast('方案已改名')
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

function requestLoad(plan: SavedPlan): void {
  actionPlan.value = plan
  if (!ticketStore.selectedSelections.length) {
    store.loadIntoTicket(plan)
    router.push('/ticket')
    return
  }
  showLoad.value = true
}

async function applyLoad(saveCurrent: boolean): Promise<void> {
  if (!actionPlan.value) return
  try {
    if (saveCurrent) await ticketStore.savePlan()
    store.loadIntoTicket(actionPlan.value)
    showLoad.value = false
    router.push('/ticket')
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  }
}
</script>

<template>
  <div class="plan-page" @click="closeActions">
    <SubpageHeader title="方案管理">
      <template #action>
        <button type="button" class="header-tags" @click="router.push('/settings/tags')">标签</button>
      </template>
    </SubpageHeader>

    <main class="plan-page__content">
      <div class="plan-toolbar">
        <van-field v-model="store.search" class="plan-search" clearable placeholder="搜索方案">
          <template #left-icon><AppIcon name="search" :size="20" /></template>
        </van-field>
        <button type="button" class="toolbar-action" @click="openFilters">
          <AppIcon name="filter" :size="18" /><span>筛选</span>
          <b v-if="appliedFilters.filter((item) => item.key !== 'sort' && item.key !== 'tag').length">{{ appliedFilters.filter((item) => item.key !== 'sort' && item.key !== 'tag').length }}</b>
        </button>
        <button type="button" class="toolbar-action toolbar-action--sort" @click="openFilters">
          <AppIcon name="sort" :size="18" /><span>{{ sortOptions.find((item) => item.value === store.sort)?.text.replace('更新', '') }}</span><AppIcon name="chevron-down" :size="12" />
        </button>
      </div>

      <div class="quick-tags" aria-label="标签筛选">
        <button type="button" :class="{ active: store.tagFilter === 'all' }" @click="store.tagFilter = 'all'">全部</button>
        <button v-for="tag in store.tags" :key="tag.name" type="button" :class="{ active: store.tagFilter === tag.name }" @click="store.tagFilter = tag.name">
          {{ tag.name }}
        </button>
      </div>

      <div v-if="appliedFilters.some((item) => item.key !== 'tag' && item.key !== 'sort')" class="applied-filters" aria-label="已应用筛选">
        <button v-for="filter in appliedFilters.filter((item) => item.key !== 'tag' && item.key !== 'sort')" :key="filter.key" type="button" @click="removeAppliedFilter(filter.key)">{{ filter.label }}<AppIcon name="close" :size="13" /></button>
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
          :menu-open="actionPlan?.id === item.plan.id && !showRename"
          :renaming="actionPlan?.id === item.plan.id && showRename"
          :rename-value="renameValue"
          :saving="saving"
          @detail="router.push(`/plans/${item.plan.id}`)"
          @click.stop
          @more="openMore(item.plan)"
          @load="requestLoad(item.plan)"
          @rename="actionPlan = item.plan; openRename()"
          @tags="actionPlan = item.plan; openTags()"
          @remove="actionPlan = item.plan; deletePlan()"
          @update:rename-value="renameValue = $event"
          @save-rename="saveRename"
          @cancel-rename="showRename = false; actionPlan = undefined"
        />
      </div>
    </main>

    <AppBottomSheet v-model:show="showFilters" title="筛选与排序" description="筛选条件应用后会保留在方案列表中">
      <div class="filter-sheet">
        <section>
          <h3>方案状态</h3>
          <div class="filter-options">
            <AppChip v-for="item in statusFilters" :key="item.value" :selected="draftStatus === item.value" @click="draftStatus = item.value">
              {{ item.label }}
            </AppChip>
          </div>
        </section>
        <section>
          <h3>用户标签</h3>
          <div class="filter-options">
            <AppChip :selected="draftTag === 'all'" @click="draftTag = 'all'">全部标签</AppChip>
            <AppChip v-for="tag in store.tags" :key="tag.name" :selected="draftTag === tag.name" @click="draftTag = tag.name">{{ tag.name }}</AppChip>
          </div>
        </section>
        <section>
          <h3>过关方式</h3>
          <div class="filter-options">
            <AppChip :selected="draftPass === undefined" @click="draftPass = undefined">全部过关</AppChip>
            <AppChip v-for="size in store.availablePasses" :key="size" :selected="draftPass === size" @click="draftPass = size">{{ size }}关</AppChip>
          </div>
        </section>
        <section>
          <h3>排序</h3>
          <div class="filter-options">
            <AppChip v-for="item in sortOptions" :key="item.value" :selected="draftSort === item.value" @click="draftSort = item.value">{{ item.text }}</AppChip>
          </div>
        </section>
      </div>
      <template #footer>
        <div class="filter-actions">
          <AppButton variant="secondary" block @click="resetFilterDraft">重置</AppButton>
          <AppButton block @click="applyFilters">应用</AppButton>
        </div>
      </template>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showLoad" :title="`载入“${actionPlan?.name || ''}”`" description="载入后将替换当前临时选票">
      <div class="edit-sheet load-sheet">
        <p>当前选票已有 {{ ticketStore.selectedMatchCount }} 场，载入后会替换当前内容。</p>
        <AppButton block @click="applyLoad(true)">保存当前方案后载入</AppButton>
        <AppButton block variant="secondary" @click="applyLoad(false)">放弃当前内容并载入</AppButton>
      </div>
    </AppBottomSheet>
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

.header-tags {
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 13px;
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

.edit-sheet {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) var(--page-gutter) calc(var(--space-4) + env(safe-area-inset-bottom));
}

.edit-sheet p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.edit-sheet :deep(.van-field) {
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
}

</style>
