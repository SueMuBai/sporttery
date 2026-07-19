import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/ticket",
  },
  {
    path: "/ledger",
    name: "ledger",
    component: () => import("@/views/LedgerView.vue"),
    meta: { keepAlive: true },
  },
  {
    path: "/ledger/:id",
    name: "ledger-detail",
    component: () => import("@/views/LedgerDetailView.vue"),
    meta: { hideNav: true },
  },
  {
    path: "/ticket",
    name: "ticket",
    component: () => import("@/views/TicketView.vue"),
    meta: { keepAlive: true },
  },
  {
    path: "/ticket/current",
    name: "current-ticket",
    component: () => import("@/views/CurrentTicketView.vue"),
    meta: { hideNav: true },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/views/SettingsView.vue"),
    meta: { keepAlive: true },
  },
  {
    path: "/plans",
    name: "plans",
    component: () => import("@/views/PlanManagerView.vue"),
    meta: { hideNav: true },
  },
  {
    path: "/plans/:id",
    name: "plan-detail",
    component: () => import("@/views/PlanDetailView.vue"),
    meta: { hideNav: true },
  },
  {
    path: "/plans/:id/tags",
    name: "plan-tags",
    component: () => import("@/views/PlanTagsView.vue"),
    meta: { hideNav: true },
  },
  {
    path: "/plans/:id/combinations",
    name: "plan-combinations",
    component: () => import("@/views/PlanCombinationsView.vue"),
    meta: { hideNav: true },
  },
  {
    path: "/settings/system",
    name: "system-settings",
    component: () => import("@/views/settings/SystemSettingsView.vue"),
    meta: { hideNav: true },
  },
  {
    path: "/settings/tags",
    name: "tag-manager",
    component: () => import("@/views/settings/TagManagerView.vue"),
    meta: { hideNav: true },
  },
  {
    path: "/settings/update",
    name: "data-update",
    component: () => import("@/views/settings/DataUpdateView.vue"),
    meta: { hideNav: true },
  },
  {
    path: "/settings/about",
    name: "about",
    component: () => import("@/views/settings/AboutView.vue"),
    meta: { hideNav: true },
  },
  {
    path: "/settings/data",
    name: "data-management",
    component: () => import("@/views/settings/DataManagementView.vue"),
    meta: { hideNav: true },
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
