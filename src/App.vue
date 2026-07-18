<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppBottomNav from '@/components/base/AppBottomNav.vue'

const route = useRoute()
const showBottomNav = computed(() => !route.meta.hideNav)
</script>

<template>
  <div class="app-shell">
    <main class="app-main">
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>
    <AppBottomNav v-if="showBottomNav" />
  </div>
</template>
