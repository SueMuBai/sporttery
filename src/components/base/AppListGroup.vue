<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<template>
  <section class="app-list-group">
    <h2 v-if="title">{{ title }}</h2>
    <div class="app-list-group__body"><slot /></div>
  </section>
</template>

<style scoped>
.app-list-group {
  display: grid;
  gap: var(--space-2);
}

.app-list-group h2 {
  margin: 0 4px;
  font-size: 15px;
  line-height: 1.35;
}

.app-list-group__body {
  overflow: hidden;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.app-list-group__body > :deep(* + *) {
  border-top: 1px solid var(--color-divider);
}
</style>
