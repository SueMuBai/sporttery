<script setup lang="ts">
import AppIcon from '@/components/base/AppIcon.vue'

withDefaults(
  defineProps<{
    /** Visual size of the chevron glyph. Default matches list-row density. */
    size?: number
  }>(),
  { size: 18 },
)
</script>

<template>
  <span class="app-row-chevron" aria-hidden="true">
    <AppIcon name="chevron-right" :size="size" />
  </span>
</template>

<style scoped>
.app-row-chevron {
  display: grid;
  flex: 0 0 auto;
  width: 20px;
  min-width: 20px;
  height: 20px;
  color: var(--color-text-tertiary);
  place-items: center;
  pointer-events: none;
}

.app-row-chevron :deep(.app-icon) {
  display: block;
}
</style>
