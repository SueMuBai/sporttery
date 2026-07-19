<script setup lang="ts">
import AppIconButton from '@/components/base/AppIconButton.vue'

withDefaults(
  defineProps<{
    show: boolean
    title: string
    description?: string
    closeLabel?: string
  }>(),
  {
    description: '',
    closeLabel: '关闭',
  },
)

const emit = defineEmits<{ 'update:show': [show: boolean] }>()
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    class="app-bottom-sheet"
    :close-on-click-overlay="true"
    @update:show="emit('update:show', $event)"
  >
    <section class="app-bottom-sheet__panel" role="dialog" aria-modal="true" :aria-label="title">
      <header class="app-bottom-sheet__header">
        <div>
          <h2>{{ title }}</h2>
          <p v-if="description">{{ description }}</p>
        </div>
        <AppIconButton
          class="app-bottom-sheet__close"
          data-overlay-close
          :label="closeLabel"
          icon="close"
          variant="plain"
          @click="emit('update:show', false)"
        />
      </header>
      <div class="app-bottom-sheet__body"><slot /></div>
      <footer v-if="$slots.footer" class="app-bottom-sheet__footer"><slot name="footer" /></footer>
    </section>
  </van-popup>
</template>

<style scoped>
.app-bottom-sheet {
  overflow: hidden;
  max-height: min(88dvh, 760px);
  background: var(--color-surface);
}

.app-bottom-sheet__panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  max-height: min(88dvh, 760px);
}

.app-bottom-sheet__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  align-items: center;
  min-height: 64px;
  gap: var(--space-3);
  padding: 10px var(--page-gutter) 8px;
  border-bottom: 1px solid var(--color-divider);
}

.app-bottom-sheet__header h2,
.app-bottom-sheet__header p {
  margin: 0;
}

.app-bottom-sheet__header h2 {
  font-size: 17px;
  line-height: 1.35;
}

.app-bottom-sheet__header p {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.app-bottom-sheet__body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.app-bottom-sheet__footer {
  padding: 10px var(--page-gutter) calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-divider);
  background: rgb(255 255 255 / 96%);
}
</style>
