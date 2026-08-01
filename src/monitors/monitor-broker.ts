import type { Destination, Monitor, ScopeId } from "../types.ts";
import type { MonitorStore } from "./monitor-store.ts";
import type { ProcessRegistry } from "../processes/process-registry.ts";

export interface BackgroundWatchResult {
  monitorId: string;
  processId: string;
  reattached: boolean;
  expiresAt: number;
}

export interface BackgroundUnwatchResult {
  monitorId: string;
  removed: boolean;
}

export interface MonitorBroker {
  watch(
    processId: string,
    opts?: { instructions?: string; pattern?: string; sinceCursor?: number },
  ): Promise<BackgroundWatchResult>;
  unwatch(monitorId: string): Promise<BackgroundUnwatchResult>;
  list(): Promise<Monitor[]>;
}

const EXPIRY_GRACE_MS = 5 * 60_000;
const MAX_PATTERN_CHARS = 256;

export function compileMonitorPattern(pattern: string): (line: string) => boolean {
  if (!pattern || pattern.length > MAX_PATTERN_CHARS)
    throw new Error(`pattern must be 1-${MAX_PATTERN_CHARS} characters`);
  if (/[\\[\](){}`*+?]/.test(pattern))
    throw new Error("pattern must use literal alternatives, with optional ^ and $ anchors");
  const alternatives = pattern.split("|").map((raw) => {
    if (!raw) throw new Error("pattern alternatives must not be empty");
    const starts = raw.startsWith("^");
    const ends = raw.endsWith("$");
    const literal = raw.slice(starts ? 1 : 0, ends ? -1 : undefined);
    if (!literal || literal.includes("^") || literal.includes("$"))
      throw new Error("^ and $ are supported only as alternative anchors");
    return { literal, starts, ends };
  });
  return (line) =>
    alternatives.some(({ literal, starts, ends }) => {
      if (starts && ends) return line === literal;
      if (starts) return line.startsWith(literal);
      if (ends) return line.endsWith(literal);
      return line.includes(literal);
    });
}

export interface MonitorBrokerDeps {
  store: MonitorStore;
  registry: ProcessRegistry;
  scopeId: string;
  owner: string;
  ownerScopeId: ScopeId;
  threadRef: string;
  destination?: Destination;
  graceMs?: number;
}

export function createMonitorBroker(deps: MonitorBrokerDeps): MonitorBroker {
  const graceMs = deps.graceMs ?? EXPIRY_GRACE_MS;
  return {
    async watch(processId, opts) {
      const rec = await deps.registry.get(processId);
      if (!rec || rec.scopeId !== deps.scopeId || rec.kind !== "background") {
        throw new Error("no such background job to watch");
      }
      if (rec.status !== "running") {
        throw new Error(`background job already ${rec.status} — nothing left to watch`);
      }
      if (opts?.pattern !== undefined) {
        try {
          compileMonitorPattern(opts.pattern);
        } catch (e) {
          throw new Error(`invalid pattern: ${e instanceof Error ? e.message : "unsafe regex"}`, { cause: e });
        }
      }
      const existing = (await deps.store.list()).find(
        (m) => m.enabled && m.processId === processId && m.threadRef === deps.threadRef,
      );
      if (existing) {
        await deps.store.update(existing.id, {
          ...(opts?.instructions !== undefined ? { instructions: opts.instructions } : {}),
          ...(opts?.pattern !== undefined ? { pattern: opts.pattern } : {}),
          ...(opts?.sinceCursor !== undefined ? { cursor: opts.sinceCursor } : {}),
        });
        return { monitorId: existing.id, processId, reattached: true, expiresAt: existing.expiresAt };
      }
      const monitor = await deps.store.create({
        owner: deps.owner,
        createdBy: deps.owner,
        ownerScopeId: deps.ownerScopeId,
        ...(deps.destination ? { destination: deps.destination } : {}),
        processId,
        command: rec.command,
        threadRef: deps.threadRef,
        ...(opts?.instructions !== undefined ? { instructions: opts.instructions } : {}),
        ...(opts?.pattern !== undefined ? { pattern: opts.pattern } : {}),
        ...(opts?.sinceCursor !== undefined ? { cursor: opts.sinceCursor } : {}),
        expiresAt: rec.expiresAt + graceMs,
      });
      return { monitorId: monitor.id, processId, reattached: false, expiresAt: monitor.expiresAt };
    },
    async unwatch(monitorId) {
      const m = await deps.store.get(monitorId);
      if (!m || m.ownerScopeId !== deps.ownerScopeId) return { monitorId, removed: false };
      await deps.store.delete(monitorId);
      return { monitorId, removed: true };
    },
    async list() {
      return (await deps.store.list()).filter((m) => m.ownerScopeId === deps.ownerScopeId);
    },
  };
}
