import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { DEFAULT_SETTINGS } from "@/types/domain";

const settingsStore = vi.hoisted(() => ({
  settings: undefined as typeof DEFAULT_SETTINGS | undefined,
  loading: false,
  saving: false,
  error: "",
  load: vi.fn<() => Promise<void>>(),
  saveSettings: vi.fn(),
}));

vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => settingsStore,
}));

vi.mock("vue-router", () => ({
  onBeforeRouteLeave: vi.fn(),
}));

import SystemSettingsView from "@/views/settings/SystemSettingsView.vue";

let finishLoad: (() => void) | undefined;

beforeEach(() => {
  settingsStore.settings = { ...DEFAULT_SETTINGS };
  settingsStore.loading = false;
  settingsStore.saving = false;
  settingsStore.error = "";
  settingsStore.saveSettings.mockReset();
  settingsStore.load.mockReset();
  settingsStore.load.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishLoad = resolve;
      }),
  );
});

afterEach(() => {
  document.body.innerHTML = "";
  finishLoad = undefined;
});

describe("SystemSettingsView", () => {
  it("clears a WebView-restored numeric focus after settings finish loading", async () => {
    const wrapper = mount(SystemSettingsView, {
      attachTo: document.body,
      global: {
        stubs: {
          AppPage: {
            template:
              "<div><slot name='header' /><main><slot /></main><slot name='footer' /></div>",
          },
          SubpageHeader: {
            template: "<header><slot name='action' /></header>",
          },
          AppAssetIcon: true,
          AppIcon: true,
          AppState: true,
          AppBottomSheet: true,
          AppButton: {
            props: ["disabled"],
            template: "<button :disabled='disabled'><slot /></button>",
          },
          "van-switch": true,
        },
      },
    });

    await nextTick();
    const firstInput = wrapper.get<HTMLInputElement>("input");
    firstInput.element.focus();
    expect(document.activeElement).toBe(firstInput.element);

    finishLoad?.();
    await flushPromises();

    expect(document.activeElement).not.toBe(firstInput.element);
    expect(firstInput.attributes("autocomplete")).toBe("off");
    wrapper.unmount();
  });

  it("keeps both save actions disabled until the draft is dirty", async () => {
    const wrapper = mount(SystemSettingsView, {
      global: {
        stubs: {
          AppPage: {
            template:
              "<div><slot name='header' /><main><slot /></main><slot name='footer' /></div>",
          },
          SubpageHeader: {
            template: "<header><slot name='action' /></header>",
          },
          AppAssetIcon: true,
          AppIcon: true,
          AppState: true,
          AppBottomSheet: true,
          AppButton: {
            props: ["disabled"],
            template: "<button :disabled='disabled'><slot /></button>",
          },
          "van-switch": true,
        },
      },
    });

    finishLoad?.();
    await flushPromises();

    const saveButtons = wrapper.findAll("button");
    expect(saveButtons).toHaveLength(2);
    expect(saveButtons.every((button) => button.attributes("disabled") !== undefined)).toBe(true);
    wrapper.unmount();
  });
});
