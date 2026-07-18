<script setup lang="ts">
defineProps<{
  title: string
  subtitle: string
}>()
</script>

<template>
  <header class="app-header">
    <div class="app-header__copy">
      <h1 class="app-header__title">{{ title }}</h1>
      <p class="app-header__subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.action" class="app-header__action">
      <slot name="action" />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  min-height: 132px;
  gap: var(--space-4);
  padding:
    calc(22px + env(safe-area-inset-top))
    var(--page-gutter)
    24px;
  color: #fff;
  background:
    radial-gradient(circle at 84% 16%, rgb(255 255 255 / 18%) 0 46px, transparent 47px),
    linear-gradient(145deg, #77b7ff 0%, #68a5f8 58%, #82c6ff 100%);
}

.app-header__copy {
  min-width: 0;
}

.app-header__title {
  margin: 0;
  font-size: var(--font-size-title);
  font-weight: 750;
  line-height: 1.25;
  letter-spacing: 0.02em;
}

.app-header__subtitle {
  margin: 8px 0 0;
  color: rgb(255 255 255 / 88%);
  font-size: 14px;
  line-height: 1.4;
}

.app-header__action {
  display: grid;
  flex: 0 0 var(--control-height-lg);
  place-items: center;
}
</style>
