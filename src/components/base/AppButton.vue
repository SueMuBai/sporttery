<script setup lang="ts">
import type { ButtonHTMLAttributes } from 'vue'

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger'
type ButtonSize = 'small' | 'medium' | 'large'

withDefaults(
  defineProps<{
    variant?: ButtonVariant
    size?: ButtonSize
    block?: boolean
    loading?: boolean
    disabled?: boolean
    nativeType?: ButtonHTMLAttributes['type']
    ariaLabel?: string
  }>(),
  {
    variant: 'primary',
    size: 'medium',
    block: false,
    loading: false,
    disabled: false,
    nativeType: 'button',
    ariaLabel: undefined,
  },
)

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <van-button
    :class="[
      'app-button',
      `app-button--${variant}`,
      `app-button--${size}`,
      { 'app-button--block': block },
    ]"
    :block="block"
    :disabled="disabled"
    :loading="loading"
    :native-type="nativeType"
    :aria-label="ariaLabel"
    @click="emit('click', $event)"
  >
    <span v-if="$slots.icon" class="app-button__icon" aria-hidden="true">
      <slot name="icon" />
    </span>
    <span class="app-button__label"><slot /></span>
  </van-button>
</template>

<style scoped>
.app-button {
  min-width: 0;
  padding: 0 var(--space-4);
  border: 0;
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  transition:
    color var(--duration-fast) var(--ease-standard),
    background var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
}

.app-button :deep(.van-button__content) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: var(--space-2);
  line-height: 1;
}

.app-button :deep(.van-button__text) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  line-height: 1;
}

.app-button__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
}

.app-button__icon {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 20px;
  height: 20px;
}

.app-button--small {
  height: var(--control-height-sm);
  padding-inline: var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.app-button--medium {
  height: var(--control-height);
  border-radius: var(--radius-control);
  font-size: var(--font-size-md);
}

.app-button--large {
  height: var(--control-height-lg);
  border-radius: var(--radius-control);
  font-size: var(--font-size-lg);
}

.app-button--block {
  width: 100%;
}

.app-button--primary {
  color: #fff;
  background: var(--color-primary);
  box-shadow: var(--outline-primary);
}

.app-button--secondary {
  color: var(--color-primary);
  background: var(--color-surface);
  box-shadow: var(--outline-primary);
}

.app-button--accent {
  color: #fff;
  background: var(--color-accent);
  box-shadow: var(--outline-accent);
}

.app-button--ghost {
  color: var(--color-text-secondary);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.app-button--danger {
  color: #fff;
  background: var(--color-danger);
  box-shadow: inset 0 0 0 1.5px var(--color-danger);
}

.app-button:active:not(.van-button--disabled) {
  transform: scale(0.98);
}

.app-button.van-button--disabled {
  color: var(--color-text-tertiary);
  background: #edf1f6;
  box-shadow: var(--outline-default);
  opacity: 1;
}
</style>
