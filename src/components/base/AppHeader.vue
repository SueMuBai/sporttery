<script setup lang="ts">
import headerBackground from '@/assets/ui/common/bg_header.svg?url'

const headerBackgroundImage = `url("${headerBackground}")`

defineProps<{
  title: string
  subtitle: string
}>()
</script>

<template>
  <header class="app-header" :style="{ backgroundImage: headerBackgroundImage }">
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: calc(80px + env(safe-area-inset-top));
  overflow: hidden;
  gap: var(--space-4);
  padding:
    calc(12px + env(safe-area-inset-top))
    22px
    12px;
  color: #fff;
  background-color: #80c3ff;
  background-position: center;
  background-size: cover;
}

.app-header__copy {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.app-header__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 28px;
  letter-spacing: 0.02em;
}

.app-header__subtitle {
  margin: 4px 0 0;
  color: rgb(255 255 255 / 92%);
  font-size: 13px;
  line-height: 18px;
}

.app-header__action {
  position: relative;
  z-index: 1;
  display: grid;
  flex: 0 0 var(--control-height-lg);
  place-items: center;
}

</style>
