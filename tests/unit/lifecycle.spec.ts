import { describe, expect, it, vi } from "vitest";

import { dismissTopOverlay } from "@/app/lifecycle";

describe("native lifecycle overlay handling", () => {
  it("uses a dialog cancel action before touching lower popups", () => {
    document.body.innerHTML = `
      <div class="van-popup"><button class="van-popup__close-icon">close</button></div>
      <div class="van-dialog"><button class="van-dialog__cancel">cancel</button></div>
    `;
    const cancel = vi.fn();
    const close = vi.fn();
    document
      .querySelector(".van-dialog__cancel")
      ?.addEventListener("click", cancel);
    document
      .querySelector(".van-popup__close-icon")
      ?.addEventListener("click", close);

    expect(dismissTopOverlay()).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });

  it("closes a popup by its close button and falls back to the overlay", () => {
    document.body.innerHTML = `
      <div class="van-overlay"></div>
      <div class="van-popup"><button class="van-popup__close-icon">close</button></div>
    `;
    const close = vi.fn();
    document
      .querySelector(".van-popup__close-icon")
      ?.addEventListener("click", close);
    expect(dismissTopOverlay()).toBe(true);
    expect(close).toHaveBeenCalledOnce();

    document.body.innerHTML = `<div class="van-overlay"></div><div class="van-popup"></div>`;
    const overlay = vi.fn();
    document.querySelector(".van-overlay")?.addEventListener("click", overlay);
    expect(dismissTopOverlay()).toBe(true);
    expect(overlay).toHaveBeenCalledOnce();
  });

  it("does nothing when no dismissible overlay is visible", () => {
    document.body.innerHTML = "<main>content</main>";
    expect(dismissTopOverlay()).toBe(false);
  });
});
