<script setup lang="ts">
import { useRouter } from 'vue-router'

import AppIconButton from '@/components/base/AppIconButton.vue'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
  }>(),
  {
    subtitle: '',
  },
)

const router = useRouter()
</script>

<template>
  <header class="subpage-header">
    <AppIconButton label="返回" icon="arrow-left" variant="plain" @click="router.back()" />
    <div class="subpage-header__copy">
      <h1>{{ title }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <div class="subpage-header__action">
      <slot name="action" />
    </div>
  </header>
</template>

<style scoped>
.subpage-header {
  position: sticky;
  z-index: 50;
  top: 0;
  display: grid;
  grid-template-columns: var(--control-height-lg) minmax(0, 1fr) var(--control-height-lg);
  align-items: center;
  min-height: calc(72px + env(safe-area-inset-top));
  gap: var(--space-2);
  padding: env(safe-area-inset-top) var(--page-gutter) 0;
  background: rgb(255 255 255 / 96%);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: blur(18px);
}

.subpage-header__copy {
  min-width: 0;
  text-align: center;
}

.subpage-header h1,
.subpage-header p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subpage-header h1 {
  font-size: 19px;
  line-height: 1.35;
}

.subpage-header p {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.subpage-header__action {
  display: grid;
  place-items: center;
}
</style>
