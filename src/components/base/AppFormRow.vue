<script setup lang="ts">
import AppIcon, { type AppIconName } from '@/components/base/AppIcon.vue'
import AppAssetIcon from '@/components/base/AppAssetIcon.vue'
import AppRowChevron from '@/components/base/AppRowChevron.vue'

withDefaults(
  defineProps<{
    title: string
    description?: string
    value?: string
    icon?: AppIconName
    iconSrc?: string
    iconColor?: string
    interactive?: boolean
  }>(),
  {
    description: '',
    value: '',
    icon: undefined,
    iconSrc: '',
    iconColor: '#5797F5',
    interactive: true,
  },
)

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    :class="['app-form-row', { 'app-form-row--static': !interactive }]"
    :disabled="!interactive"
    @click="emit('click')"
  >
    <span
      v-if="icon || iconSrc || $slots.leading"
      class="app-form-row__icon"
      :style="{ color: iconColor }"
    >
      <slot name="leading">
        <AppAssetIcon v-if="iconSrc" :src="iconSrc" :size="26" />
        <AppIcon v-else-if="icon" :name="icon" :size="26" />
      </slot>
    </span>
    <span class="app-form-row__copy">
      <strong>{{ title }}</strong>
      <small v-if="description">{{ description }}</small>
    </span>
    <span v-if="value" class="app-form-row__value numeric">{{ value }}</span>
    <span class="app-form-row__trailing">
      <slot name="trailing"><AppRowChevron v-if="interactive" /></slot>
    </span>
  </button>
</template>

<style scoped>
.app-form-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto 20px;
  align-items: center;
  width: 100%;
  min-height: 72px;
  gap: var(--space-3);
  padding: 8px 18px;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.app-form-row:active:not(:disabled) {
  background: var(--color-surface-soft);
}

.app-form-row:disabled {
  opacity: 1;
}

.app-form-row__icon {
  display: grid;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-control);
  place-items: center;
}

.app-form-row__copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.app-form-row__copy strong,
.app-form-row__copy small,
.app-form-row__value {
  overflow: hidden;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-form-row__copy strong {
  font-size: 16px;
  font-weight: 600;
}

.app-form-row__copy small,
.app-form-row__value {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.app-form-row__value {
  max-width: 92px;
}

.app-form-row__trailing {
  display: grid;
  width: 20px;
  min-width: 20px;
  align-self: center;
  justify-self: end;
  place-items: center;
}

.app-form-row--static {
  grid-template-columns: 40px minmax(0, 1fr) auto 20px;
}

@media (max-width: 359px) {
  .app-form-row {
    grid-template-columns: 40px minmax(0, 1fr) 20px;
    gap: 10px;
    padding-inline: 14px;
  }

  .app-form-row__value {
    display: none;
  }

  .app-form-row__trailing {
    grid-column: 3;
  }
}
</style>
