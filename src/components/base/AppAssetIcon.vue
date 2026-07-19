<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(
  defineProps<{
    src: string;
    size?: number;
  }>(),
  {
    size: 24,
  },
);

const style = computed<CSSProperties>(() => ({
  width: props.size + "px",
  height: props.size + "px",
  "--app-asset-icon": 'url("' + props.src + '")',
}));
</script>

<template>
  <span class="app-asset-icon" :style="style" aria-hidden="true" />
</template>

<style scoped>
.app-asset-icon {
  display: inline-block;
  flex: 0 0 auto;
  background: currentcolor;
  mask: var(--app-asset-icon) center / contain no-repeat;
  pointer-events: none;
}
</style>
