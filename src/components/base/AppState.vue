<script setup lang="ts">
import AppButton from '@/components/base/AppButton.vue'

type StateType = 'loading' | 'empty' | 'error' | 'offline'

withDefaults(
  defineProps<{
    type?: StateType
    title: string
    description?: string
    actionText?: string
  }>(),
  {
    type: 'empty',
    description: '',
    actionText: '',
  },
)

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <div class="app-state" role="status" aria-live="polite">
    <van-loading v-if="type === 'loading'" size="32" color="var(--color-primary)" />
    <van-icon
      v-else
      :name="type === 'error' ? 'warning-o' : type === 'offline' ? 'closed-eye' : 'orders-o'"
      size="44"
      color="var(--color-primary)"
      aria-hidden="true"
    />
    <strong>{{ title }}</strong>
    <p v-if="description">{{ description }}</p>
    <AppButton v-if="actionText" size="small" variant="secondary" @click="emit('action')">
      {{ actionText }}
    </AppButton>
  </div>
</template>

<style scoped>
.app-state {
  display: grid;
  min-height: 220px;
  padding: var(--space-6);
  place-items: center;
  align-content: center;
  gap: var(--space-3);
  color: var(--color-text-secondary);
  text-align: center;
}

.app-state strong {
  color: var(--color-text);
  font-size: var(--font-size-lg);
  line-height: 1.35;
}

.app-state p {
  max-width: 280px;
  margin: -4px 0 4px;
  font-size: var(--font-size-sm);
  line-height: 1.5;
}
</style>
