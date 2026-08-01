import type { RunSignalKind } from "../runs/run-signal-store.ts";

export function isHalt(text: string): boolean {
  return /^stop[.!]?$/i.test(text.trim());
}

type WakeSituation = "addressed" | "engagedUpdate" | "ambientUpdate" | "scheduled";

export interface Wake {
  situation: WakeSituation;
  ts: string;
  text?: string;
  isSelf?: boolean;
  halt?: boolean;
}

export type WakeRoute =
  { kind: "engage" } | { kind: "steer"; signal: RunSignalKind; text?: string } | { kind: "drop"; reason: string };

export function routeWake(wake: Wake, runIsLive: boolean, liveRunGated = false): WakeRoute {
  if (wake.isSelf) return { kind: "drop", reason: "self" };
  if (!runIsLive) {
    if (wake.halt) return { kind: "drop", reason: "halt-nothing-running" };
    return { kind: "engage" };
  }
  if (wake.halt) return { kind: "steer", signal: "abort" };
  if (liveRunGated && wake.situation === "addressed") return { kind: "engage" };
  const text = wake.text?.trim();
  if (!text) return { kind: "drop", reason: "empty-mid-turn" };
  return { kind: "steer", signal: "steer", text };
}
