<script setup lang="ts">
import { ref, watch } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import AppChip from '@/components/base/AppChip.vue'
import type { PlanTag } from '@/types/domain'

const props = defineProps<{
  show: boolean
  tags: PlanTag[]
  loading: boolean
  defaultName?: string
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  save: [value: { name: string; tags: string[] }]
}>()

const name = ref('')
const selectedTags = ref<string[]>([])

watch(
  () => props.show,
  (show) => {
    if (!show) return
    const date = new Date()
    name.value = props.defaultName || `方案 ${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    selectedTags.value = []
  },
)

function toggleTag(tag: string): void {
  const next = new Set(selectedTags.value)
  if (next.has(tag)) next.delete(tag)
  else next.add(tag)
  selectedTags.value = [...next]
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    closeable
    class="save-plan-sheet"
    @update:show="emit('update:show', $event)"
  >
    <div class="save-plan-sheet__content">
      <header>
        <h2>保存方案</h2>
        <p>保存后可在方案管理中重新导入、修改或删除</p>
      </header>

      <van-field
        v-model="name"
        label="方案名称"
        maxlength="30"
        show-word-limit
        placeholder="请输入方案名称"
        class="plan-name-field"
      />

      <section>
        <h3>方案标签</h3>
        <div class="tag-list">
          <AppChip
            v-for="tag in tags"
            :key="tag.name"
            :selected="selectedTags.includes(tag.name)"
            @click="toggleTag(tag.name)"
          >
            {{ tag.name }}
          </AppChip>
        </div>
        <p v-if="!tags.length" class="empty-tags">暂无标签，可稍后在设置中创建</p>
      </section>

      <AppButton
        block
        :loading="loading"
        :disabled="!name.trim()"
        @click="emit('save', { name: name.trim(), tags: selectedTags })"
      >
        确认保存
      </AppButton>
    </div>
  </van-popup>
</template>

<style scoped>
.save-plan-sheet__content {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5) var(--page-gutter) calc(var(--space-5) + env(safe-area-inset-bottom));
}

.save-plan-sheet header {
  padding-right: 40px;
}

.save-plan-sheet h2,
.save-plan-sheet h3,
.save-plan-sheet p {
  margin: 0;
}

.save-plan-sheet h2 {
  font-size: 21px;
}

.save-plan-sheet header p,
.empty-tags {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.plan-name-field {
  border-radius: var(--radius-control);
  box-shadow: var(--outline-default);
}

.plan-name-field:focus-within {
  box-shadow: var(--outline-primary);
}

.save-plan-sheet section {
  display: grid;
  gap: var(--space-3);
}

.save-plan-sheet h3 {
  font-size: var(--font-size-md);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
