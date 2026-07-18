<script setup lang="ts">
withDefaults(
  defineProps<{
    interactive?: boolean;
    padded?: boolean;
  }>(),
  {
    interactive: false,
    padded: true,
  },
);
</script>

<template>
  <section
    :class="[
      'app-card',
      { 'app-card--interactive': interactive, 'app-card--padded': padded },
    ]"
  >
    <slot />
  </section>
</template>

<style scoped>
.app-card {
  overflow: hidden;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default), var(--shadow-card);
}

.app-card--padded {
  padding: var(--space-4);
}

.app-card--interactive {
  transition:
    transform var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.app-card--interactive:active {
  transform: scale(0.995);
  box-shadow:
    var(--outline-strong),
    0 3px 12px rgb(70 112 164 / 6%);
}

.app-card--interactive:focus-visible {
  box-shadow: var(--outline-primary), var(--shadow-card);
}
</style>
