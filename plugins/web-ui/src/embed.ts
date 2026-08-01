import { densityTierFor, type DensityTier } from "./density";

export const PANE_STATE_MSG = "webui:pane-state";
export const PANE_DELIVERY_MSG = "webui:pane-delivery";
export const PANE_FOCUS_MSG = "webui:pane-focus";
export const PANE_EXPAND_MSG = "webui:pane-expand";
export const PANE_COLLAPSE_MSG = "webui:pane-collapse";

export interface PaneStateMsg {
  type: typeof PANE_STATE_MSG;
  threadRef: string | null;
  sessionId: string | null;
  working: boolean;
}

export const embedMode: boolean = (() => {
  try {
    return new URLSearchParams(location.search).get("embed") === "1" && window.parent !== window;
  } catch {
    return false;
  }
})();

let densityTier: DensityTier = embedMode ? densityTierFor(window.innerWidth, window.innerHeight) : "full";
const densityHandlers: Array<() => void> = [];

export function currentDensity(): DensityTier {
  return densityTier;
}

export function onDensityChange(handler: () => void): void {
  densityHandlers.push(handler);
}

if (embedMode) {
  document.documentElement.dataset.density = densityTier;
  window.addEventListener("resize", () => {
    const next = densityTierFor(window.innerWidth, window.innerHeight);
    if (next === densityTier) return;
    densityTier = next;
    document.documentElement.dataset.density = next;
    for (const handler of densityHandlers) handler();
  });
}

let lastPosted = "";

export function postPaneState(state: Omit<PaneStateMsg, "type">): void {
  if (!embedMode) return;
  const key = `${state.threadRef}|${state.sessionId}|${state.working}`;
  if (key === lastPosted) return;
  lastPosted = key;
  try {
    window.parent.postMessage({ type: PANE_STATE_MSG, ...state } satisfies PaneStateMsg, location.origin);
  } catch {
    void 0;
  }
}

export function requestPaneExpand(): void {
  if (!embedMode) return;
  try {
    window.parent.postMessage({ type: PANE_EXPAND_MSG }, location.origin);
  } catch {
    void 0;
  }
}

if (embedMode) {
  window.addEventListener("focus", () => {
    try {
      window.parent.postMessage({ type: PANE_FOCUS_MSG }, location.origin);
    } catch {
      void 0;
    }
  });
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], .menu-popover, .slash-popover, .session-menu-popover')) return;
      try {
        window.parent.postMessage({ type: PANE_COLLAPSE_MSG }, location.origin);
      } catch {
        void 0;
      }
    },
    true,
  );
}

export function onRelayedDelivery(handler: (threadRef: string) => void): void {
  if (!embedMode) return;
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    const d = e.data as { type?: string; threadRef?: string };
    if (d?.type === PANE_DELIVERY_MSG && typeof d.threadRef === "string" && d.threadRef) handler(d.threadRef);
  });
}
