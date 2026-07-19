<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'

import AppBottomNav from '@/components/base/AppBottomNav.vue'

const route = useRoute()
const showBottomNav = computed(() => !route.meta.hideNav)

watch(
  () => route.meta.hideNav,
  (hideNav) => {
    const statusBar = (
      window as Window & {
        NativeStatusBar?: { setPrimary(primary: boolean): void }
      }
    ).NativeStatusBar
    statusBar?.setPrimary(!hideNav)
  },
  { immediate: true },
)
</script>

<template>
  <div class="app-shell">
    <div class="app-main">
      <RouterView v-slot="{ Component, route: renderedRoute }">
        <KeepAlive>
          <component
            :is="Component"
            v-if="renderedRoute.meta.keepAlive"
            :key="String(renderedRoute.name)"
          />
        </KeepAlive>
        <component
          :is="Component"
          v-if="!renderedRoute.meta.keepAlive"
          :key="renderedRoute.fullPath"
        />
      </RouterView>
    </div>
    <AppBottomNav v-if="showBottomNav" />
  </div>
</template>
