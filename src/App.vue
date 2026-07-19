<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppBottomNav from '@/components/base/AppBottomNav.vue'

const route = useRoute()
const showBottomNav = computed(() => !route.meta.hideNav)
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
