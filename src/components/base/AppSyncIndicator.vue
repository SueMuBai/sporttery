<script setup lang="ts">
import AppIcon from '@/components/base/AppIcon.vue'

export interface SyncIndicatorStat {
  label: string
  value: string | number
  accent?: boolean
}

type SyncIndicatorState = 'idle' | 'loading' | 'success' | 'warning' | 'error'

withDefaults(
  defineProps<{
    title: string
    detail?: string
    state?: SyncIndicatorState
    actionText?: string
    actionDisabled?: boolean
    stats?: SyncIndicatorStat[]
  }>(),
  {
    detail: '',
    state: 'idle',
    actionText: '',
    actionDisabled: false,
    stats: () => [],
  },
)

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <section class="app-sync-indicator" role="status" aria-live="polite">
    <div :class="['app-sync-indicator__status', `app-sync-indicator__status--${state}`]">
      <span class="app-sync-indicator__icon" aria-hidden="true">
        <van-loading v-if="state === 'loading'" size="22" color="var(--color-primary)" />
        <AppIcon
          v-else
          :name="state === 'success' ? 'success' : state === 'warning' || state === 'error' ? 'warning' : 'refresh'"
          :size="24"
        />
      </span>
      <span class="app-sync-indicator__copy">
        <strong>{{ title }}</strong>
        <small v-if="detail">{{ detail }}</small>
      </span>
      <button
        v-if="actionText"
        type="button"
        class="app-sync-indicator__action"
        :disabled="actionDisabled"
        @click="emit('action')"
      >
        {{ actionText }}
        <AppIcon v-if="state === 'warning' || state === 'error'" name="chevron-right" :size="16" />
      </button>
    </div>

    <div v-if="stats.length" class="app-sync-indicator__stats" aria-label="选票统计">
      <div v-for="stat in stats" :key="stat.label">
        <span>{{ stat.label }}</span>
        <strong :class="['numeric', { 'is-accent': stat.accent }]">{{ stat.value }}</strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.app-sync-indicator {
  display: grid;
  gap: 8px;
}

.app-sync-indicator__status,
.app-sync-indicator__stats {
  border-radius: 12px;
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.app-sync-indicator__status {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 64px;
  gap: 10px;
  padding: 8px 10px;
}

.app-sync-indicator__icon {
  display: grid;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.app-sync-indicator__status--success .app-sync-indicator__icon {
  color: var(--color-success);
  background: rgb(97 214 191 / 12%);
}

.app-sync-indicator__status--warning .app-sync-indicator__icon {
  color: var(--color-warning);
  background: rgb(229 162 58 / 12%);
}

.app-sync-indicator__status--error .app-sync-indicator__icon {
  color: var(--color-danger);
  background: var(--color-accent-soft);
}

.app-sync-indicator__copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.app-sync-indicator__copy strong,
.app-sync-indicator__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-sync-indicator__copy strong {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}

.app-sync-indicator__copy small {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.app-sync-indicator__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 92px;
  height: 40px;
  gap: 2px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  color: var(--color-primary);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 13px;
  font-weight: 500;
}

.app-sync-indicator__action:disabled {
  color: var(--color-text-tertiary);
  background: var(--color-disabled);
}

.app-sync-indicator__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  min-height: 64px;
  padding: 8px 0;
}

.app-sync-indicator__stats div {
  display: grid;
  min-width: 0;
  place-items: center;
  align-content: center;
  gap: 2px;
  text-align: center;
}

.app-sync-indicator__stats div + div {
  border-left: 1px solid var(--color-divider);
}

.app-sync-indicator__stats span {
  overflow: hidden;
  max-width: 100%;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-sync-indicator__stats strong {
  color: var(--color-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 20px;
}

.app-sync-indicator__stats strong.is-accent {
  color: var(--color-accent-strong);
}
</style>
