<script setup lang="ts">
import { showFailToast, showSuccessToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import checkboxChecked from '@/assets/ui/plans/ic_checkbox_checked.svg?url'
import checkboxUnchecked from '@/assets/ui/plans/ic_checkbox_unchecked.svg?url'
import AppButton from '@/components/base/AppButton.vue'
import AppCard from '@/components/base/AppCard.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppState from '@/components/base/AppState.vue'
import SubpageHeader from '@/components/base/SubpageHeader.vue'
import { usePlanStore } from '@/stores/plans'

const store = usePlanStore()
const route = useRoute()
const router = useRouter()
const selected = ref<string[]>([])
const saving = ref(false)
const planId = computed(() => String(route.params.id ?? ''))
const plan = computed(() => store.find(planId.value)?.plan)
const tagUsage = computed(() =>
  Object.fromEntries(
    store.tags.map((tag) => [
      tag.name,
      store.plans.filter((item) => item.tags.includes(tag.name)).length,
    ]),
  ),
)

onMounted(async () => {
  if (!store.plans.length) await store.load()
  selected.value = [...(plan.value?.tags ?? [])]
})

function toggle(name: string): void {
  const next = new Set(selected.value)
  if (next.has(name)) next.delete(name)
  else {
    if (next.size >= 3) {
      showFailToast('每个方案最多选择3个标签')
      return
    }
    next.add(name)
  }
  selected.value = [...next]
}

async function save(): Promise<void> {
  if (!plan.value || saving.value) return
  saving.value = true
  try {
    await store.updateTags(plan.value, selected.value)
    showSuccessToast('方案标签已更新')
    await router.back()
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="subpage plan-tags-page">
    <SubpageHeader title="编辑标签">
      <template #action>
        <button v-if="plan" type="button" class="header-save" :disabled="saving" @click="save">
          {{ saving ? '保存中' : '保存' }}
        </button>
      </template>
    </SubpageHeader>

    <main class="subpage-content plan-tags-content">
      <AppState v-if="store.loading && !plan" type="loading" title="正在读取标签" />
      <AppState v-else-if="!plan" type="error" title="方案不存在" action-text="返回" @action="router.back()" />
      <template v-else>
        <AppCard class="plan-summary">
          <strong>{{ plan.name }}</strong>
          <span>
            {{ new Set(plan.selections.map((selection) => selection.matchId)).size }}场 ·
            {{ plan.passCounts.map((size) => `${size}关`).join('/') }} · {{ plan.multiplier }}倍
          </span>
        </AppCard>

        <section class="tag-section">
          <div class="tag-heading">
            <h2>选择标签</h2>
            <strong>{{ selected.length }}/3</strong>
          </div>
          <p class="tag-help">每个方案最多3个标签</p>
        </section>

        <AppState
          v-if="!store.tags.length"
          type="empty"
          title="还没有可用标签"
          description="请先到标签管理创建标签"
          action-text="前往标签管理"
          @action="router.push('/settings/tags')"
        />
        <AppCard v-else class="tag-choice-list" :padded="false">
          <button
            v-for="tag in store.tags"
            :key="tag.name"
            type="button"
            :aria-pressed="selected.includes(tag.name)"
            @click="toggle(tag.name)"
          >
            <span class="tag-color" :style="{ backgroundColor: tag.color }" />
            <strong>{{ tag.name }}</strong>
            <small>{{ tagUsage[tag.name] || 0 }}个方案</small>
            <img :src="selected.includes(tag.name) ? checkboxChecked : checkboxUnchecked" alt="" aria-hidden="true" />
          </button>
        </AppCard>

        <button type="button" class="new-tag-link" @click="router.push('/settings/tags')">
          <AppIcon name="add" :size="18" />
          <span>新建标签</span>
        </button>
      </template>
    </main>

    <div v-if="plan" class="tag-footer">
      <div class="tag-footer-actions">
        <AppButton block variant="secondary" @click="router.back()">取消</AppButton>
        <AppButton block :loading="saving" @click="save">保存标签</AppButton>
      </div>
      <p>保存后方案列表立即更新</p>
    </div>
  </div>
</template>

<style scoped>
.plan-tags-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.header-save {
  display: grid;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  place-items: center;
}

.header-save:disabled {
  color: var(--color-text-tertiary);
}

.plan-tags-content {
  display: grid;
  gap: 12px;
  padding: 12px var(--page-gutter) calc(112px + env(safe-area-inset-bottom));
}

.plan-summary {
  display: grid;
  min-height: 60px;
  align-content: center;
  gap: 5px;
}

.plan-summary strong {
  overflow: hidden;
  font-size: 14px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-summary span {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.tag-section {
  display: grid;
  gap: 4px;
  padding: 4px 4px 0;
}

.tag-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tag-heading h2 {
  margin: 0;
  font-size: 15px;
  line-height: 21px;
}

.tag-heading strong {
  font-size: 14px;
  font-weight: 500;
}

.tag-help {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.tag-choice-list {
  display: grid;
}

.tag-choice-list button {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto 24px;
  align-items: center;
  min-height: 50px;
  gap: 10px;
  padding: 0 12px;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.tag-choice-list button + button {
  border-top: 1px solid var(--color-divider);
}

.tag-choice-list button:active {
  background: var(--color-surface-soft);
}

.tag-color {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}

.tag-choice-list strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-choice-list small {
  min-width: 70px;
  color: var(--color-text-secondary);
  font-size: 11px;
  text-align: left;
}

.tag-choice-list img {
  width: 22px;
  height: 22px;
}

.new-tag-link {
  display: inline-flex;
  align-items: center;
  width: max-content;
  min-height: 44px;
  gap: 5px;
  padding: 0 4px;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 13px;
}

.tag-footer {
  position: fixed;
  z-index: 40;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  gap: 7px;
  padding: 8px var(--page-gutter) calc(8px + env(safe-area-inset-bottom));
  background: rgb(255 255 255 / 97%);
  border-top: 1px solid var(--color-divider);
}

.tag-footer-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.tag-footer p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
  text-align: center;
}

@media (min-width: 600px) {
  .tag-footer {
    right: 50%;
    left: 50%;
    width: 520px;
    transform: translateX(-50%);
  }
}
</style>
