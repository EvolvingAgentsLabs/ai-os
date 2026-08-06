/**
 * The signed HTTP seam to `ai-base`.
 *
 * [ADR-0006](../../doc/adr/0006-ai-flows-lives-outside-core.md) decided that
 * `ai-flows` advances a step by calling the core's public API rather than by
 * importing it, on the argument that the route table already exposes create,
 * advance, inspect, steer and abort. That decision has been standing since
 * 2026-08-02 with **nobody writing the client it requires**, which made it the
 * first real task of M2 rather than a detail of it.
 *
 * ## Why the canonical string is duplicated rather than imported
 *
 * `ai-flows/src` imports nothing from `ai-base` — that is the whole content of
 * ADR-0006, and importing the signer "just for the format" would quietly make
 * this package depend on core again. So the format is restated here:
 *
 *     v0:{unix-seconds}:{METHOD}\n{path-with-query}\n{body}
 *     HMAC-SHA256, hex, prefixed `v0=`
 *     headers: x-timestamp, x-signature
 *
 * Duplication is only safe if something checks it. `test/core-client.test.ts`
 * pins the exact bytes against a known vector, and `scripts/flow-smoke.ts`
 * proves it against a real signed core — because a signature format that has
 * drifted fails as a 401 with no hint about which half is wrong.
 *
 * ## The five-minute window is the caller's problem too
 *
 * Upstream rejects a timestamp more than five minutes from its own clock
 * (`SOURCE_AUTH_REPLAY_WINDOW_MS`). A flow that resumes on Wednesday signs at
 * Wednesday's clock, so this is not a durability concern — but a queued request
 * held longer than the window is, and that is why `signedFetch` stamps at call
 * time rather than at construction.
 */
import { createHmac } from "node:crypto";

export const SIGNATURE_VERSION = "v0";

/** Exactly upstream's `canonicalPayload`. Restated, not imported — see the header. */
export function canonicalPayload(method: string, pathWithQuery: string, body: string): string {
  return `${method}\n${pathWithQuery}\n${body}`;
}

/** Exactly upstream's `signRequest`. */
export function signRequest(secret: string, timestampSec: number, canonical: string): string {
  return `${SIGNATURE_VERSION}=${createHmac("sha256", secret)
    .update(`${SIGNATURE_VERSION}:${timestampSec}:${canonical}`)
    .digest("hex")}`;
}

export function signedHeaders(
  secret: string | undefined,
  method: string,
  pathWithQuery: string,
  body = "",
  nowSec: number = Math.floor(Date.now() / 1000),
): Record<string, string> {
  // An unset secret is a legitimate configuration: a core started with
  // ALLOW_UNAUTHENTICATED_CORE has no secret to check against, and sending a
  // signature it cannot verify would be worse than sending none.
  if (!secret) return {};
  return {
    "x-timestamp": String(nowSec),
    "x-signature": signRequest(secret, nowSec, canonicalPayload(method, pathWithQuery, body)),
  };
}

export interface CoreClientOptions {
  baseUrl: string;
  /** Omit for an unauthenticated core. Present, every request is signed. */
  signingSecret?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface TurnRequest {
  surface: string;
  actor: { externalId: string; displayName?: string };
  conversation: { kind: "dm" | "channel" | "group"; threadRef: string; channelRef?: string };
  text: string;
}

/** What `POST /v1/turns?async=1` answers with. */
export interface QueuedTurn {
  status: string;
  runId?: string;
  sessionId?: string;
  reply?: string;
  reason?: string;
}

/**
 * The turn's own outcome, nested inside the run.
 *
 * Discovered by running it, not by reading. `GET /v1/runs/:id` answers
 * `{ status: "done", result: { status: "ok", reply: "…" } }` — **two statuses at
 * two levels**, and the reply is on the inner one. The first version of this
 * client read `reply` off the top level, got `undefined`, and produced flows
 * whose steps completed successfully with an empty result and an observation
 * that fingerprinted the empty string. Every check about state passed; only the
 * check about content failed.
 */
export interface RunResult {
  status: string;
  sessionId?: string;
  reply?: string;
  reason?: string;
}

export interface RunState {
  id?: string;
  /** Run-level: `done`, `failed`, `running`, … */
  status: string;
  /** Present once the run is terminal. The reply lives here. */
  result?: RunResult;
  /** Streamed text so far. The best available answer for a run still running. */
  partial?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

/** Everything a step can say about what its run produced, in preference order. */
export function replyOf(run: RunState): string {
  return run.result?.reply ?? run.result?.reason ?? run.partial ?? run.error ?? "";
}

/** True when the run finished but the turn inside it did not succeed. */
export function runFailed(run: RunState): boolean {
  const outer = run.status.toLowerCase();
  if (outer !== "done" && outer !== "ok" && outer !== "completed") return true;
  const inner = run.result?.status?.toLowerCase();
  return inner !== undefined && inner !== "ok" && inner !== "done";
}

/** Terminal run states. Anything else means keep waiting. */
const TERMINAL = new Set(["ok", "done", "completed", "failed", "error", "aborted", "cancelled", "rejected"]);

export function isTerminal(status: string): boolean {
  return TERMINAL.has(status.toLowerCase());
}

export class CoreError extends Error {
  status: number;
  path: string;
  body: string;
  constructor(status: number, path: string, body: string) {
    super(`core ${status} on ${path}: ${body.slice(0, 300)}`);
    this.name = "CoreError";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

/**
 * A thin, honest client. It does not retry, and that is deliberate: a step's
 * attempt is the unit that gets retried, and a retry hidden inside the transport
 * would make one attempt look like one call when it was three
 * ([ADR-0007](../../doc/adr/0007-observation-captured-not-derived.md) wants the
 * attempt record to be what happened).
 */
export function createCoreClient(opts: CoreClientOptions) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;

  async function call<T>(method: string, path: string, payload?: unknown): Promise<T> {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const headers: Record<string, string> = {
      ...signedHeaders(opts.signingSecret, method, path, body, Math.floor(now() / 1000)),
      ...(body ? { "content-type": "application/json" } : {}),
    };
    const res = await doFetch(`${base}${path}`, {
      method,
      headers,
      ...(body ? { body } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new CoreError(res.status, path, text);
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    /** Synchronous turn — blocks until the core answers. Used by smoke tests. */
    turn: (req: TurnRequest) => call<QueuedTurn>("POST", "/v1/turns", req),

    /** Asynchronous turn — the shape a flow step uses, so it can be resumed. */
    queueTurn: (req: TurnRequest) => call<QueuedTurn>("POST", "/v1/turns?async=1", req),

    run: (runId: string) => call<RunState>("GET", `/v1/runs/${encodeURIComponent(runId)}`),

    /** `steer` mid-flight, or `abort`. The multiplayer primitive that exists. */
    signal: (runId: string, kind: "steer" | "abort", text?: string) =>
      call<{ ok?: boolean }>("POST", `/v1/runs/${encodeURIComponent(runId)}/signal`, {
        kind,
        ...(text ? { text } : {}),
      }),

    /**
     * Poll a run to a terminal state.
     *
     * Polling rather than streaming because a flow that resumes days later has
     * no stream to rejoin — the run id in the attempt record is the whole of the
     * durable handle, and rebuilding an SSE subscription would add a channel the
     * flow cannot use on Wednesday.
     */
    async awaitRun(
      runId: string,
      o: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
    ): Promise<RunState> {
      const interval = o.intervalMs ?? 1500;
      const timeout = o.timeoutMs ?? 300_000;
      const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
      const started = now();
      for (;;) {
        const state = await this.run(runId);
        if (isTerminal(state.status)) return state;
        if (now() - started > timeout) return { ...state, status: "timeout" };
        await sleep(interval);
      }
    },
  };
}

export type CoreClient = ReturnType<typeof createCoreClient>;
