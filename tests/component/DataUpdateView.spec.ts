import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncSnapshot } from "@/features/sync/SyncService";

const mocks = vi.hoisted(() => ({
  store: {
    syncing: false,
    syncProgress: { completed: 0, total: 0, failed: 0 },
    syncReport: undefined as SyncSnapshot | undefined,
    load: vi.fn(async () => undefined),
    synchronizeMatches: vi.fn(),
    synchronizeResults: vi.fn(),
    retryFailed: vi.fn(),
  },
  initialize: vi.fn(async () => undefined),
  listEvents: vi.fn(async () => []),
  routerBack: vi.fn(),
  showFailToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => mocks.store,
}));

vi.mock("@/services/database/createDatabase", () => ({
  getDatabase: () => ({
    initialize: mocks.initialize,
    listEvents: mocks.listEvents,
  }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ back: mocks.routerBack }),
}));

vi.mock("vant", () => ({
  showFailToast: mocks.showFailToast,
  showSuccessToast: mocks.showSuccessToast,
  showToast: mocks.showToast,
}));

import DataUpdateView from "@/views/settings/DataUpdateView.vue";

const completedAt = "2026-07-20T09:41:23.000Z";

function report(overrides: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    matches: {
      added: 4,
      updated: 0,
      unchanged: 0,
      failed: 0,
      affectedPlans: 0,
      errors: [],
    },
    results: {
      added: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      affectedPlans: 0,
      errors: [],
    },
    completedAt,
    mode: "full",
    ...overrides,
  };
}

function mountView() {
  return mount(DataUpdateView, {
    global: {
      stubs: {
        AppPage: {
          template:
            "<div><slot name='header' /><main><slot /></main><slot name='footer' /></div>",
        },
        SubpageHeader: { template: "<header>数据更新</header>" },
        AppCard: { template: "<section><slot /></section>" },
        AppButton: {
          props: ["disabled", "loading"],
          emits: ["click"],
          template:
            "<button :disabled='disabled' @click=\"$emit('click', $event)\"><slot name='icon' /><slot /></button>",
        },
        AppAssetIcon: true,
        AppIcon: true,
        "van-loading": true,
      },
    },
  });
}

describe("DataUpdateView states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.syncing = false;
    mocks.store.syncProgress = { completed: 0, total: 0, failed: 0 };
    mocks.store.syncReport = undefined;
    mocks.store.synchronizeMatches.mockResolvedValue(report());
    mocks.store.synchronizeResults.mockResolvedValue(report());
    mocks.store.retryFailed.mockResolvedValue(report());
  });

  it("renders the latest-data summary and both independent update actions", async () => {
    mocks.store.syncReport = report();
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get(".sync-state-heading").text()).toContain("数据已是最新");
    expect(wrapper.get(".sync-metrics").text()).toContain("比赛4");
    expect(wrapper.get(".sync-metrics").text()).toContain("成功4");
    expect(wrapper.get(".sync-actions").text()).toContain("获取最新比赛");
    expect(wrapper.get(".sync-actions").text()).toContain("更新比赛结果");
  });

  it("renders progress, live logs and the retained background action while syncing", async () => {
    mocks.store.syncing = true;
    mocks.store.syncProgress = { completed: 42, total: 128, failed: 0 };
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get(".sync-state-heading").text()).toContain(
      "正在同步比赛数据",
    );
    expect(wrapper.get(".sync-progress-count").text()).toContain("42 / 128");
    expect(wrapper.get(".sync-progress-panel").text()).toContain("33%");
    expect(wrapper.get(".sync-log-section").text()).toContain("同步日志");
    expect(wrapper.get(".sync-log-section").text()).toContain("后台继续");
    expect(
      wrapper
        .findAll(".sync-actions button")
        .every((button) => button.attributes("disabled") !== undefined),
    ).toBe(true);
  });

  it("renders partial failures, expands all errors and retries the failed items", async () => {
    const errors = Array.from({ length: 4 }, (_, index) => ({
      matchId: 201 + index,
      message: index === 0 ? "请求超时" : `数据格式异常${index}`,
    }));
    mocks.store.syncReport = report({
      matches: {
        added: 124,
        updated: 0,
        unchanged: 0,
        failed: 4,
        affectedPlans: 0,
        errors,
      },
    });
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get(".sync-state-heading").text()).toContain(
      "部分数据更新失败",
    );
    expect(wrapper.get(".sync-failure-count").text()).toContain("成功124项");
    expect(wrapper.get(".sync-failure-count").text()).toContain("失败4项");
    expect(wrapper.findAll(".failure-row")).toHaveLength(2);

    const showAll = wrapper
      .findAll(".failure-actions button")
      .find((button) => button.text().includes("查看全部4条"));
    expect(showAll).toBeDefined();
    await showAll!.trigger("click");
    expect(wrapper.findAll(".failure-row")).toHaveLength(4);

    const retry = wrapper
      .findAll(".failure-actions button")
      .find((button) => button.text().includes("重试失败项"));
    expect(retry).toBeDefined();
    await retry!.trigger("click");
    await flushPromises();
    expect(mocks.store.retryFailed).toHaveBeenCalledOnce();
  });
});
