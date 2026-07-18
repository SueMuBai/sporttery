<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import billDefault from '@/assets/icons/navigation/ic_nav_bill_default.svg?url'
import billSelected from '@/assets/icons/navigation/ic_nav_bill_selected.svg?url'
import settingsDefault from '@/assets/icons/navigation/ic_nav_settings_default.svg?url'
import settingsSelected from '@/assets/icons/navigation/ic_nav_settings_selected.svg?url'
import ticketDefault from '@/assets/icons/navigation/ic_nav_ticket_default.svg?url'
import ticketSelected from '@/assets/icons/navigation/ic_nav_ticket_selected.svg?url'

const route = useRoute()

const items = [
  { to: '/ledger', label: '账单', defaultIcon: billDefault, selectedIcon: billSelected },
  { to: '/ticket', label: '选票', defaultIcon: ticketDefault, selectedIcon: ticketSelected },
  { to: '/settings', label: '设置', defaultIcon: settingsDefault, selectedIcon: settingsSelected },
]

const activePath = computed(() => route.path)
</script>

<template>
  <nav class="bottom-nav" aria-label="主导航">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      :class="['bottom-nav__item', { 'bottom-nav__item--active': activePath.startsWith(item.to) }]"
      :aria-current="activePath.startsWith(item.to) ? 'page' : undefined"
    >
      <span class="bottom-nav__icon-wrap">
        <img
          class="bottom-nav__icon"
          :src="activePath.startsWith(item.to) ? item.selectedIcon : item.defaultIcon"
          alt=""
        />
      </span>
      <span class="bottom-nav__label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  z-index: 100;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  min-height: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom));
  padding: 4px 12px env(safe-area-inset-bottom);
  background: rgb(255 255 255 / 96%);
  border-top: 1px solid var(--color-border);
  box-shadow: 0 -6px 18px rgb(65 94 132 / 7%);
  backdrop-filter: blur(16px);
}

.bottom-nav__item {
  display: grid;
  min-width: 0;
  min-height: 58px;
  place-items: center;
  align-content: center;
  gap: 1px;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  line-height: 1.2;
}

.bottom-nav__icon-wrap {
  display: grid;
  width: 46px;
  height: 32px;
  border-radius: 14px;
  place-items: center;
  transition: background var(--duration-normal) var(--ease-standard);
}

.bottom-nav__icon {
  width: 28px;
  height: 28px;
}

.bottom-nav__label {
  line-height: 1.2;
}

.bottom-nav__item--active {
  color: var(--color-primary);
  font-weight: 650;
}

.bottom-nav__item--active .bottom-nav__icon-wrap {
  background: var(--color-primary-soft);
}

@media (min-width: 600px) {
  .bottom-nav {
    right: 50%;
    left: 50%;
    width: 520px;
    transform: translateX(-50%);
  }
}
</style>
