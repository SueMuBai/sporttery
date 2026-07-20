import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const planStore = vi.hoisted(() => ({
  loading: false,
  error: "",
  plans: [] as Array<{ name: string; tags: string[] }>,
  tags: [] as Array<{ name: string; color: string }>,
  search: "",
  statusFilter: "all",
  tagFilter: "all",
  passFilter: undefined as number | undefined,
  sort: "updated-desc",
  filteredPlans: [] as unknown[],
  availablePasses: [] as number[],
  load: vi.fn(async () => undefined),
  remove: vi.fn(),
  rename: vi.fn(),
  loadIntoTicket: vi.fn(),
}));

const ticketStore = vi.hoisted(() => ({
  hasUnsavedChanges: false,
  editingPlanId: undefined as string | undefined,
  selectedMatchCount: 0,
  selectedSelections: [] as unknown[],
  clear: vi.fn(),
  savePlan: vi.fn(),
}));

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/stores/plans", () => ({
  usePlanStore: () => planStore,
}));

vi.mock("@/stores/ticket", () => ({
  useTicketStore: () => ticketStore,
}));

vi.mock("vue-router", () => ({
  useRouter: () => router,
}));

vi.mock("vant", () => ({
  showFailToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

import PlanManagerView from "@/views/PlanManagerView.vue";

function mountView() {
  return mount(PlanManagerView, {
    global: {
      stubs: {
        SubpageHeader: {
          template: "<header><slot name='action' /></header>",
        },
        AppBottomSheet: true,
        AppIcon: true,
        AppIconButton: true,
        PlanCard: true,
        "van-field": {
          template: "<div class='van-field'><slot name='left-icon' /></div>",
        },
        "van-loading": true,
        "van-popup": true,
      },
    },
  });
}

describe("PlanManagerView compact empty and filter states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planStore.loading = false;
    planStore.error = "";
    planStore.plans = [];
    planStore.tags = [];
    planStore.search = "";
    planStore.statusFilter = "all";
    planStore.tagFilter = "all";
    planStore.passFilter = undefined;
    planStore.sort = "updated-desc";
    planStore.filteredPlans = [];
    planStore.availablePasses = [];
  });

  it("fills the second toolbar row when there are no tag filters", async () => {
    const wrapper = mountView();
    await flushPromises();

    const row = wrapper.get(".plan-filter-row");
    expect(row.classes()).toContain("plan-filter-row--without-tags");
    expect(row.find(".quick-tags").exists()).toBe(false);
    expect(row.findAll(".toolbar-action")).toHaveLength(2);
  });

  it("keeps all tag filters in one horizontally scrollable region", async () => {
    planStore.tags = [
      { name: "已购", color: "#61D6BF" },
      { name: "AI", color: "#9A91F5" },
      { name: "稳健", color: "#5797F5" },
    ];

    const wrapper = mountView();
    await flushPromises();

    const row = wrapper.get(".plan-filter-row");
    expect(row.classes()).not.toContain("plan-filter-row--without-tags");
    expect(
      row.findAll(".quick-tags button").map((button) => button.text()),
    ).toEqual(["全部", "已购", "AI", "稳健"]);
  });

  it("uses the compact centered shared button for the empty-list action", async () => {
    const wrapper = mountView();
    await flushPromises();

    const action = wrapper.get(".plan-state__ticket-action");
    expect(action.classes()).toContain("app-button--small");
    expect(action.get(".app-button__label").text()).toBe("去选票页");

    await action.trigger("click");
    expect(router.push).toHaveBeenCalledWith("/ticket");
  });
});
