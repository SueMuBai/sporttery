import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanTag } from "@/types/domain";

const settingsStore = vi.hoisted(() => ({
  loading: false,
  saving: false,
  error: "",
  tags: [] as PlanTag[],
  tagUsage: {} as Record<string, number>,
  load: vi.fn(async () => undefined),
  saveTag: vi.fn(),
  deleteTag: vi.fn(),
  moveTag: vi.fn(),
}));

vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => settingsStore,
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
}));

vi.mock("vant", () => ({
  showFailToast: vi.fn(),
}));

import TagManagerView from "@/views/settings/TagManagerView.vue";

function tag(name: string, index: number): PlanTag {
  return {
    name,
    color: ["#5797F5", "#61D6BF", "#9A91F5", "#FF8FB3"][index % 4]!,
    sortOrder: index + 1,
    createdAt: "2026-07-20T00:00:00.000Z",
  };
}

function mountView() {
  return mount(TagManagerView, {
    global: {
      stubs: {
        AppPage: {
          template:
            "<div><slot name='header' /><main><slot /></main><slot name='footer' /></div>",
        },
        SubpageHeader: {
          template: "<header><slot name='action' /></header>",
        },
        AppCard: { template: "<section><slot /></section>" },
        AppButton: {
          props: ["disabled", "loading"],
          emits: ["click"],
          template:
            "<button :disabled='disabled' @click=\"$emit('click', $event)\"><slot /></button>",
        },
        AppIcon: true,
        AppState: true,
        "van-popup": {
          props: ["show"],
          template: "<div v-if='show'><slot /></div>",
        },
      },
    },
  });
}

describe("TagManagerView exceptional states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsStore.loading = false;
    settingsStore.saving = false;
    settingsStore.error = "";
    settingsStore.tags = [];
    settingsStore.tagUsage = {};
  });

  it("renders the eight-tag limit with a warning and disabled add action", async () => {
    settingsStore.tags = Array.from({ length: 8 }, (_, index) =>
      tag(index === 0 ? "已购" : `标签${index + 1}`, index),
    );
    settingsStore.tagUsage = Object.fromEntries(
      settingsStore.tags.map((item, index) => [item.name, index]),
    );

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("最多8个标签 · 已使用8/8");
    expect(wrapper.findAll(".tag-limit-grid > button")).toHaveLength(8);
    expect(wrapper.get(".tag-limit-warning").text()).toContain(
      "标签数量已达上限，删除后可继续添加",
    );
    expect(wrapper.get(".tag-add-collapsed").attributes("disabled")).toBeDefined();
    expect(wrapper.find(".tag-add-section").exists()).toBe(false);
  });

  it("keeps the full add form visible but locked while duplicate-name editing is active", async () => {
    settingsStore.tags = [tag("已购", 0), tag("AI", 1), tag("稳健", 2), tag("世界杯", 3)];
    settingsStore.tagUsage = { 已购: 3, AI: 1, 稳健: 1, 世界杯: 0 };

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('button[aria-label="编辑标签 AI"]').trigger("click");

    const editInput = wrapper.get<HTMLInputElement>('input[aria-label="标签名称"]');
    await editInput.setValue("稳健");

    expect(wrapper.get(".tag-editor-card").exists()).toBe(true);
    expect(wrapper.get(".tag-error").text()).toContain(
      "标签名称已存在，请换一个名称",
    );
    expect(wrapper.get(".tag-edit-main button:last-child").attributes("disabled")).toBeDefined();

    const addCard = wrapper.get(".tag-add-card");
    expect(addCard.classes()).toContain("tag-add-card--locked");
    expect(addCard.get<HTMLInputElement>('input[placeholder="标签名称"]').attributes("disabled")).toBeDefined();
    expect(addCard.findAll(".inline-colors button")).toHaveLength(6);
    expect(addCard.findAll(".inline-colors button").every((item) => item.attributes("disabled") !== undefined)).toBe(true);
    expect(addCard.text()).toContain("请先完成或取消上方标签编辑，再新增标签");

    await wrapper.get(".tag-edit-cancel").trigger("click");
    expect(wrapper.get(".tag-add-card").classes()).not.toContain(
      "tag-add-card--locked",
    );
    expect(
      wrapper
        .get<HTMLInputElement>('.tag-add-card input[placeholder="标签名称"]')
        .attributes("disabled"),
    ).toBeUndefined();
  });
});
