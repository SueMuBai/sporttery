<script setup lang="ts">
withDefaults(
  defineProps<{
    selected?: boolean
    disabled?: boolean
    count?: number
  }>(),
  {
    selected: false,
    disabled: false,
    count: undefined,
  },
)

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    type="button"
    :class="['app-chip', { 'app-chip--selected': selected }]"
    :disabled="disabled"
    :aria-pressed="selected"
    @click="emit('click', $event)"
  >
    <span class="app-chip__label"><slot /></span>
    <span v-if="count !== undefined" class="app-chip__count numeric">{{ count }}</span>
  </button>
</template>

<style scoped>
.app-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  min-height: var(--control-height-sm);
  gap: 6px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius-pill);
  color: var(--color-text-secondary);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: var(--font-size-sm);
  font-weight: 600;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}

.app-chip__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1.2;
}

.app-chip__count {
  display: inline-grid;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  place-items: center;
  color: var(--color-text-secondary);
  background: var(--color-page-raised);
  font-size: 11px;
  line-height: 1;
}

.app-chip--selected {
  color: #fff;
  background: var(--color-accent);
  box-shadow: var(--outline-accent);
}

.app-chip--selected .app-chip__count {
  color: var(--color-accent-strong);
  background: #fff;
}

.app-chip:active:not(:disabled) {
  transform: scale(0.97);
}

.app-chip:disabled {
  color: var(--color-text-tertiary);
  background: #edf1f6;
  opacity: 1;
}
</style>
