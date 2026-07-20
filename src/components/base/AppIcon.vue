<script setup lang="ts">
export type AppIconName =
  | "add"
  | "back"
  | "calendar"
  | "calendar-filter"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "chevron-up"
  | "close"
  | "concurrency"
  | "copy"
  | "delete"
  | "download"
  | "edit"
  | "export-json"
  | "export-markdown"
  | "filter"
  | "feedback"
  | "folder"
  | "grip"
  | "history"
  | "help"
  | "info"
  | "monitor"
  | "multiplier"
  | "more"
  | "refresh"
  | "retry"
  | "save"
  | "search"
  | "shield"
  | "sort"
  | "success"
  | "system"
  | "tag"
  | "timeout"
  | "update"
  | "warning";

withDefaults(defineProps<{ name: AppIconName; size?: number }>(), { size: 24 });
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <template v-if="name === 'add'"><path d="M12 5v14M5 12h14" /></template>
      <template v-else-if="name === 'back'">
        <path d="m15 5-7 7 7 7" />
      </template>
      <template v-else-if="name === 'calendar'">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </template>
      <template v-else-if="name === 'calendar-filter'">
        <rect x="3" y="4" width="15" height="17" rx="2" />
        <path d="M7 2v4M14 2v4M3 9h15M15 14h6M18 11v6M15 19h6" />
      </template>
      <template v-else-if="name === 'check'">
        <path d="m5 12 4 4L19 6" />
      </template>
      <template v-else-if="name === 'chevron-down'">
        <path d="m5 9 7 7 7-7" />
      </template>
      <template v-else-if="name === 'chevron-right'">
        <path d="m9 5 7 7-7 7" />
      </template>
      <template v-else-if="name === 'chevron-up'">
        <path d="m5 15 7-7 7 7" />
      </template>
      <template v-else-if="name === 'close'">
        <path d="m6 6 12 12M18 6 6 18" />
      </template>
      <template v-else-if="name === 'concurrency'">
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="18" cy="18" r="2" />
        <path d="M8 11 16 7M8 13l8 4" />
      </template>
      <template v-else-if="name === 'copy'">
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
      </template>
      <template v-else-if="name === 'delete'">
        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
      </template>
      <template v-else-if="name === 'download'">
        <path d="M12 3v11m0 0 4-4m-4 4-4-4" />
        <path d="M5 15v4h14v-4" />
      </template>
      <template v-else-if="name === 'edit'">
        <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
        <path d="m14 7 3 3" />
      </template>
      <template v-else-if="name === 'export-json'">
        <path d="M6 3h9l4 4v14H6zM15 3v5h4" />
        <path
          d="M9 12c-1 0-1.5.7-1.5 1.5S7 15 6 15c1 0 1.5.7 1.5 1.5S8 18 9 18M15 12c1 0 1.5.7 1.5 1.5S17 15 18 15c-1 0-1.5.7-1.5 1.5S16 18 15 18M12 12v6"
        />
      </template>
      <template v-else-if="name === 'export-markdown'">
        <path d="M5 3h10l4 4v14H5zM15 3v5h4" />
        <path d="M8 17v-5l2 3 2-3v5M14 12v5l2-2 2 2v-5" />
      </template>
      <template v-else-if="name === 'filter'">
        <path d="M4 6h16M7 12h10M10 18h4" />
        <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
      </template>
      <template v-else-if="name === 'feedback'">
        <path d="M4 4h16v12H8l-4 4V4Z" />
        <path d="M8 8h8M8 12h5" />
      </template>
      <template v-else-if="name === 'folder'">
        <path d="M3 6h7l2 2h9v12H3z" />
        <path d="M7 12h10M7 16h10" />
      </template>
      <template v-else-if="name === 'grip'">
        <circle cx="8" cy="6" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="6" r="1" fill="currentColor" stroke="none" />
        <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="8" cy="18" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="18" r="1" fill="currentColor" stroke="none" />
      </template>
      <template v-else-if="name === 'history'">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2M4 4v5h5" />
      </template>
      <template v-else-if="name === 'help'">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.8 9a2.3 2.3 0 1 1 3.2 2.1c-.7.4-1 1-1 1.9M12 17h.01" />
      </template>
      <template v-else-if="name === 'info'">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </template>
      <template v-else-if="name === 'monitor'">
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </template>
      <template v-else-if="name === 'multiplier'">
        <path d="m7 7 10 10M17 7 7 17" />
        <circle cx="5" cy="5" r="2" />
        <circle cx="19" cy="19" r="2" />
      </template>
      <template v-else-if="name === 'more'">
        <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
      </template>
      <template v-else-if="name === 'refresh'">
        <path d="M20 11a8 8 0 1 0 2 5M20 4v7h-7" />
      </template>
      <template v-else-if="name === 'retry'">
        <path d="M20 11a8 8 0 1 0 1 5M20 4v7h-7" />
        <path d="M12 8v4l3 2" />
      </template>
      <template v-else-if="name === 'save'">
        <path d="M5 3h12l2 2v16H5zM8 3v6h8V3M8 21v-7h8v7" />
      </template>
      <template v-else-if="name === 'search'">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </template>
      <template v-else-if="name === 'shield'">
        <path d="M12 3 5 6v5c0 4.6 2.8 7.7 7 10 4.2-2.3 7-5.4 7-10V6l-7-3Z" />
        <rect x="9.5" y="10" width="5" height="5" rx="1" />
        <path d="M10.5 10V8.8a1.5 1.5 0 0 1 3 0V10" />
      </template>
      <template v-else-if="name === 'sort'">
        <path d="M8 5v14M5 16l3 3 3-3M16 19V5M13 8l3-3 3 3" />
      </template>
      <template v-else-if="name === 'success'">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </template>
      <template v-else-if="name === 'system'">
        <path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h7M15 17h5" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="12" r="2" />
        <circle cx="13" cy="17" r="2" />
      </template>
      <template v-else-if="name === 'tag'">
        <path d="M3 12 12 3h7l2 2v7l-9 9z" />
        <circle cx="17" cy="7" r="1" />
      </template>
      <template v-else-if="name === 'timeout'">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v5l3 2M9 3h6M12 3v2" />
      </template>
      <template v-else-if="name === 'update'">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16V8m0 0-3 3m3-3 3 3" />
      </template>
      <template v-else-if="name === 'warning'">
        <path d="m12 3 10 18H2z" />
        <path d="M12 9v5M12 18h.01" />
      </template>
    </g>
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex: 0 0 auto;
  color: inherit;
  pointer-events: none;
}
</style>
