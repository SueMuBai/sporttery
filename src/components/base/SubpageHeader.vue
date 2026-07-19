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
    <AppIconButton label="返回" icon="back" variant="plain" @click="router.back()" />
    <div class="subpage-header__copy">
      <h1>{{ title }}</h1>
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
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  height: calc(44px + env(safe-area-inset-top));
  gap: var(--space-2);
  padding: env(safe-area-inset-top) var(--page-gutter) 0;
  background: var(--color-surface);
  box-shadow: inset 0 -1px 0 var(--color-divider);
}

.subpage-header__copy {
  min-width: 0;
  text-align: center;
}

.subpage-header h1 {
  margin: 0;
  overflow: hidden;
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subpage-header__action {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
}

.subpage-header > :deep(.app-icon-button:first-child) {
  color: var(--color-text);
}
</style>
