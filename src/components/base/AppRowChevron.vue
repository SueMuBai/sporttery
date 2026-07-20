<script setup lang="ts">
import AppIcon from '@/components/base/AppIcon.vue'
</script>

<template>
  <span class="app-row-chevron" aria-hidden="true">
    <AppIcon name="chevron-right" :size="18" />
  </span>
</template>

<style scoped>
.app-row-chevron {
  display: grid;
  width: 20px;
  height: var(--touch-target);
  color: var(--color-text-tertiary);
  place-items: center;
  pointer-events: none;
}
</style>
