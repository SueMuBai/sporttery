<script setup lang="ts">
import AppIcon from '@/components/base/AppIcon.vue'

export interface SyncIndicatorStat {
  label: string
  value: string | number
}

withDefaults(
  defineProps<{
    message: string
    loading?: boolean
    error?: boolean
    stats?: SyncIndicatorStat[]
  }>(),
  {
    loading: false,
    error: false,
    stats: () => [],
  },
)
</script>

<template>
  <section :class="['app-sync-indicator', { 'app-sync-indicator--error': error }]" role="status" aria-live="polite">
    <div class="app-sync-indicator__status">
      <van-loading v-if="loading" size="18" color="var(--color-primary)" />
      <AppIcon v-else :name="error ? 'warning' : 'success'" :size="18" />
      <span>{{ message }}</span>
    </div>
    <div v-if="stats.length" class="app-sync-indicator__stats">
      <div v-for="stat in stats" :key="stat.label">
        <strong class="numeric">{{ stat.value }}</strong><span>{{ stat.label }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.app-sync-indicator {
  overflow: hidden;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.app-sync-indicator__status {
  display: flex;
  align-items: center;
  min-height: 48px;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  color: var(--color-text-secondary);
  background: var(--color-primary-soft);
  font-size: var(--font-size-sm);
}

.app-sync-indicator__status > .app-icon {
  color: var(--color-success);
}

.app-sync-indicator--error .app-sync-indicator__status {
  background: var(--color-accent-soft);
}

.app-sync-indicator--error .app-sync-indicator__status > .app-icon {
  color: var(--color-danger);
}

.app-sync-indicator__status span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-sync-indicator__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.app-sync-indicator__stats div {
  display: grid;
  min-width: 0;
  min-height: 62px;
  padding: 8px 4px;
  place-items: center;
  align-content: center;
  gap: 4px;
  text-align: center;
}

.app-sync-indicator__stats div + div {
  border-left: 1px solid var(--color-divider);
}

.app-sync-indicator__stats strong {
  font-size: 16px;
  line-height: 1.1;
}

.app-sync-indicator__stats span {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
