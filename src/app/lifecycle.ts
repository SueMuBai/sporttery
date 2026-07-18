import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import type { Router } from "vue-router";

const ROOT_ROUTES = new Set(["/ledger", "/ticket", "/settings"]);

function visible(element: HTMLElement): boolean {
  const style = globalThis.getComputedStyle?.(element);
  return style?.display !== "none" && style?.visibility !== "hidden";
}

export function dismissTopOverlay(documentRoot: Document = document): boolean {
  const dialogs = [
    ...documentRoot.querySelectorAll<HTMLElement>(".van-dialog"),
  ].filter(visible);
  const dialog = dialogs.at(-1);
  if (dialog) {
    const cancel = dialog.querySelector<HTMLElement>(".van-dialog__cancel");
    if (cancel) {
      cancel.click();
      return true;
    }
    return false;
  }

  const popups = [
    ...documentRoot.querySelectorAll<HTMLElement>(
      ".van-popup, .van-action-sheet",
    ),
  ].filter(visible);
  const popup = popups.at(-1);
  if (!popup) return false;

  const close = popup.querySelector<HTMLElement>(".van-popup__close-icon");
  if (close) {
    close.click();
    return true;
  }
  const overlays = [
    ...documentRoot.querySelectorAll<HTMLElement>(".van-overlay"),
  ].filter(visible);
  const overlay = overlays.at(-1);
  if (overlay) {
    overlay.click();
    return true;
  }
  return false;
}

export async function initializeNativeLifecycle(
  router: Router,
): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) return async () => undefined;
  await router.isReady();

  const backListener = await CapacitorApp.addListener(
    "backButton",
    async () => {
      if (dismissTopOverlay()) return;
      const route = router.currentRoute.value;
      if (route.meta.hideNav || !ROOT_ROUTES.has(route.path)) {
        await router.back();
        return;
      }
      await CapacitorApp.exitApp();
    },
  );

  const stateListener = await CapacitorApp.addListener(
    "appStateChange",
    ({ isActive }) => {
      document.documentElement.classList.toggle(
        "app-is-backgrounded",
        !isActive,
      );
    },
  );

  return async () => {
    await backListener.remove();
    await stateListener.remove();
  };
}
