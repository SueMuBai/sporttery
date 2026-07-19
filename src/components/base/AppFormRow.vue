<script setup lang="ts">
import AppIcon, { type AppIconName } from '@/components/base/AppIcon.vue'
import AppAssetIcon from '@/components/base/AppAssetIcon.vue'

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
    <span v-if="icon || iconSrc || $slots.leading" class="app-form-row__icon" :style="{ color: iconColor, backgroundColor: `${iconColor}18` }">
      <slot name="leading">
        <AppAssetIcon v-if="iconSrc" :src="iconSrc" :size="20" />
        <AppIcon v-else-if="icon" :name="icon" :size="20" />
      </slot>
    </span>
    <span class="app-form-row__copy">
      <strong>{{ title }}</strong>
      <small v-if="description">{{ description }}</small>
    </span>
    <span v-if="value" class="app-form-row__value numeric">{{ value }}</span>
    <slot name="trailing"><AppIcon v-if="interactive" name="chevron-right" :size="18" /></slot>
  </button>
</template>

<style scoped>
.app-form-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto 18px;
  align-items: center;
  width: 100%;
  min-height: 52px;
  gap: var(--space-2);
  padding: 6px 10px;
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
  width: 34px;
  height: 34px;
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
  font-size: 14px;
}

.app-form-row__copy small,
.app-form-row__value {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.app-form-row__value {
  max-width: 92px;
}

.app-form-row--static {
  grid-template-columns: 34px minmax(0, 1fr) auto;
}

@media (max-width: 359px) {
  .app-form-row {
    grid-template-columns: 34px minmax(0, 1fr) 18px;
  }

  .app-form-row__value {
    display: none;
  }
}
</style>
