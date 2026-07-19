import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import type { Router } from "vue-router";

const ROOT_ROUTES = new Set(["/ledger", "/ticket", "/settings"]);

export function nativeBackFallback(path: string): string {
  if (path === "/ticket/current") return "/ticket";
  if (/^\/ledger\/[^/]+$/.test(path)) return "/ledger";
  if (/^\/plans\/[^/]+\/(?:tags|combinations)$/.test(path)) {
    return path.replace(/\/(?:tags|combinations)$/, "");
  }
  if (/^\/plans\/[^/]+$/.test(path)) return "/plans";
  if (path === "/plans") return "/ticket";
  if (/^\/settings\/[^/]+$/.test(path)) return "/settings";
  return "/ticket";
}

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
    const close = dialog.querySelector<HTMLElement>(
      ".van-dialog__close, [data-overlay-close]",
    );
    if (close) close.click();
    // Never navigate the page underneath a still-visible modal dialog.
    return true;
  }

  const popups = [
    ...documentRoot.querySelectorAll<HTMLElement>(
      ".van-popup, .van-action-sheet",
    ),
  ].filter(visible);
  const popup = popups.at(-1);
  if (!popup) return false;

  const close = popup.querySelector<HTMLElement>(
    ".van-popup__close-icon, [data-overlay-close]",
  );
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
  // Consume Back even for a non-dismissible popup. Navigating underneath it
  // leaves an orphaned mask and can make the next screen untouchable.
  return true;
}

export async function initializeNativeLifecycle(
  router: Router,
): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) return async () => undefined;
  await router.isReady();
  let handlingBack = false;

  const backListener = await CapacitorApp.addListener(
    "backButton",
    async ({ canGoBack }) => {
      if (handlingBack) return;
      handlingBack = true;
      try {
        if (dismissTopOverlay()) return;
        const route = router.currentRoute.value;
        if (route.meta.hideNav || !ROOT_ROUTES.has(route.path)) {
          if (canGoBack) await router.back();
          else await router.replace(nativeBackFallback(route.path));
          return;
        }
        await CapacitorApp.exitApp();
      } finally {
        handlingBack = false;
      }
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
