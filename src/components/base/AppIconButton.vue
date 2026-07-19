<script setup lang="ts">
import AppIcon, { type AppIconName } from '@/components/base/AppIcon.vue'

type IconButtonVariant = 'primary' | 'secondary' | 'plain' | 'danger'

withDefaults(
  defineProps<{
    label: string
    icon?: AppIconName
    variant?: IconButtonVariant
    loading?: boolean
    disabled?: boolean
  }>(),
  {
    variant: 'secondary',
    icon: undefined,
    loading: false,
    disabled: false,
  },
)

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    type="button"
    :class="['app-icon-button', `app-icon-button--${variant}`]"
    :aria-label="label"
    :disabled="disabled || loading"
    @click="emit('click', $event)"
  >
    <van-loading v-if="loading" size="22" aria-hidden="true" />
    <slot v-else>
      <AppIcon v-if="icon" :name="icon" />
    </slot>
  </button>
</template>

<style scoped>
.app-icon-button {
  display: inline-grid;
  flex: 0 0 var(--control-height-lg);
  width: var(--control-height-lg);
  height: var(--control-height-lg);
  padding: 0;
  border: 0;
  border-radius: 50%;
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: var(--outline-strong);
  transition:
    transform var(--duration-fast) var(--ease-standard),
    background var(--duration-fast) var(--ease-standard);
}

.app-icon-button--primary {
  color: #fff;
  background: var(--color-primary);
  box-shadow: var(--outline-primary);
}

.app-icon-button--plain {
  color: var(--color-text-secondary);
  background: transparent;
  box-shadow: none;
}

.app-icon-button--danger {
  color: var(--color-danger);
  background: var(--color-accent-soft);
  box-shadow: inset 0 0 0 1px rgb(239 91 103 / 35%);
}

.app-icon-button:active:not(:disabled) {
  transform: scale(0.94);
}

.app-icon-button:disabled {
  color: var(--color-text-tertiary);
  background: #edf1f6;
  opacity: 1;
}
</style>
