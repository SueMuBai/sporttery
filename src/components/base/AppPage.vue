<script setup lang="ts">
withDefaults(
  defineProps<{
    secondary?: boolean
    compact?: boolean
    contentClass?: string
  }>(),
  {
    secondary: false,
    compact: false,
    contentClass: '',
  },
)
</script>

<template>
  <div :class="['app-page', { 'app-page--secondary': secondary, 'app-page--compact': compact }]">
    <slot name="header" />
    <main :class="['app-page__content', contentClass]"><slot /></main>
    <slot name="footer" />
  </div>
</template>

<style scoped>
.app-page {
  min-height: calc(100dvh - var(--bottom-nav-height) - env(safe-area-inset-bottom));
  background: var(--color-page);
}

.app-page--secondary {
  min-height: 100dvh;
}

.app-page__content {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) var(--page-gutter) var(--space-8);
}

.app-page--compact .app-page__content {
  gap: var(--space-3);
  padding-top: var(--space-3);
}

@supports (padding: max(0px)) {
  .app-page--secondary .app-page__content {
    padding-bottom: max(var(--space-8), env(safe-area-inset-bottom));
  }
}
</style>
