import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataManagementView from "@/views/settings/DataManagementView.vue";

const mocks = vi.hoisted(() => ({
  confirmAction: vi.fn(),
  initialize: vi.fn(),
  getCounts: vi.fn(),
  createBackupSnapshot: vi.fn(),
  restoreBackupSnapshot: vi.fn(),
  clearLocalData: vi.fn(),
  showFailToast: vi.fn(),
  showLoadingToast: vi.fn(() => ({ close: vi.fn() })),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/components/base/confirmAction", () => ({
  confirmAction: mocks.confirmAction,
}));

vi.mock("@/services/database/createDatabase", () => ({
  getDatabase: () => ({
    initialize: mocks.initialize,
    getCounts: mocks.getCounts,
    createBackupSnapshot: mocks.createBackupSnapshot,
    restoreBackupSnapshot: mocks.restoreBackupSnapshot,
    clearLocalData: mocks.clearLocalData,
  }),
}));

vi.mock("vant", () => ({
  showFailToast: mocks.showFailToast,
  showLoadingToast: mocks.showLoadingToast,
  showSuccessToast: mocks.showSuccessToast,
}));

const counts = {
  settings: 1,
  tags: 2,
  plans: 3,
  planSelections: 4,
  matches: 5,
  results: 6,
  ledgerOrders: 7,
};

const emptySnapshot = {
  settings: {
    historyLimits: 10,
    workers: 4,
    timeoutSeconds: 15,
    retries: 2,
    defaultMultiplier: 1,
    autoSyncMatches: true,
    expandMatchDetails: false,
  },
  tags: [],
  plans: [],
  ledgerOrders: [],
  ledgerAdjustments: [],
  matches: [],
  results: [],
  syncJobs: [],
  oddsHistory: [],
  appEvents: [],
};

function buttonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper
    .findAll("button")
    .find((item) => item.text() === text || item.attributes("aria-label") === text);
  if (!button) throw new Error(`未找到按钮：${text}`);
  return button;
}

describe("DataManagementView clear local data", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.initialize.mockResolvedValue(undefined);
    mocks.getCounts.mockResolvedValue(counts);
    mocks.createBackupSnapshot.mockResolvedValue(emptySnapshot);
    mocks.restoreBackupSnapshot.mockResolvedValue(counts);
    mocks.clearLocalData.mockResolvedValue({
      ...counts,
      tags: 0,
      plans: 0,
      planSelections: 0,
      matches: 0,
      results: 0,
      ledgerOrders: 0,
    });
    mocks.confirmAction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires a danger confirmation and the exact confirmation phrase", async () => {
    localStorage.setItem("caiguo.lastBackupAt", "2026-07-20T00:00:00.000Z");
    localStorage.setItem("caiguo.ticket-draft.v1", "draft");
    const wrapper = mount(DataManagementView, {
      global: {
        stubs: {
          SubpageHeader: { template: "<header>数据与备份</header>" },
          "van-loading": { template: "<span />" },
          "van-popup": {
            props: ["show"],
            template: '<div v-if="show"><slot /></div>',
          },
          "van-button": {
            props: ["disabled", "loading"],
            emits: ["click"],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
          },
        },
      },
    });
    await flushPromises();

    await buttonByText(wrapper, "清空本机数据").trigger("click");
    await flushPromises();

    expect(mocks.confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "清空本机数据？",
        confirmText: "继续",
        danger: true,
        message: expect.stringContaining("此操作不可撤销"),
      }),
    );
    const finalButton = buttonByText(wrapper, "永久清空");
    expect(finalButton.attributes("disabled")).toBeDefined();
    expect(mocks.clearLocalData).not.toHaveBeenCalled();

    const input = wrapper.get('input[placeholder="清空数据"]');
    await input.setValue("清空");
    expect(buttonByText(wrapper, "永久清空").attributes("disabled")).toBeDefined();
    await input.setValue("清空数据");
    expect(buttonByText(wrapper, "永久清空").attributes("disabled")).toBeUndefined();

    await buttonByText(wrapper, "永久清空").trigger("click");
    await flushPromises();

    expect(mocks.clearLocalData).toHaveBeenCalledOnce();
    expect(localStorage.getItem("caiguo.lastBackupAt")).toBeNull();
    expect(localStorage.getItem("caiguo.ticket-draft.v1")).toBeNull();
    expect(mocks.showSuccessToast).toHaveBeenCalledWith("本机数据已清空");
  });

  it("does not open the final confirmation when the first step is cancelled", async () => {
    mocks.confirmAction.mockRejectedValue("cancel");
    const wrapper = mount(DataManagementView, {
      global: {
        stubs: {
          SubpageHeader: { template: "<header>数据与备份</header>" },
          "van-loading": { template: "<span />" },
          "van-popup": {
            props: ["show"],
            template: '<div v-if="show"><slot /></div>',
          },
          "van-button": {
            props: ["disabled"],
            emits: ["click"],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
          },
        },
      },
    });
    await flushPromises();

    await buttonByText(wrapper, "清空本机数据").trigger("click");
    await flushPromises();

    expect(wrapper.find('input[placeholder="清空数据"]').exists()).toBe(false);
    expect(mocks.clearLocalData).not.toHaveBeenCalled();
  });

  it("requires an exact phrase before replacing local data from a complete backup", async () => {
    const wrapper = mount(DataManagementView, {
      global: {
        stubs: {
          SubpageHeader: { template: "<header><slot name='action' /></header>" },
          "van-loading": { template: "<span />" },
          "van-popup": {
            props: ["show"],
            template: '<div v-if="show"><slot /></div>',
          },
          "van-button": {
            props: ["disabled", "loading"],
            emits: ["click"],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
          },
        },
      },
    });
    await flushPromises();

    const backup = JSON.stringify({
      formatVersion: 2,
      exportedAt: "2026-07-20T12:00:00.000Z",
      ...emptySnapshot,
    });
    const file = new File([backup], "caiguo-backup.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: vi.fn(async () => backup),
    });
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      configurable: true,
      value: [file],
    });
    await input.trigger("change");
    await flushPromises();

    const restoreButton = buttonByText(wrapper, "完整恢复");
    expect(restoreButton.attributes("disabled")).toBeDefined();
    const phrase = wrapper.get('input[placeholder="恢复备份"]');
    await phrase.setValue("恢复");
    expect(buttonByText(wrapper, "完整恢复").attributes("disabled")).toBeDefined();
    await phrase.setValue("恢复备份");
    await buttonByText(wrapper, "完整恢复").trigger("click");
    await flushPromises();

    expect(mocks.restoreBackupSnapshot).toHaveBeenCalledWith(emptySnapshot);
    expect(localStorage.getItem("caiguo.lastBackupAt")).toBe(
      "2026-07-20T12:00:00.000Z",
    );
    expect(mocks.showSuccessToast).toHaveBeenCalledWith("完整备份已恢复");
  });
});
