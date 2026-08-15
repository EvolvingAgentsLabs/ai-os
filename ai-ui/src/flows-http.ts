/**
 * The canvas's client for `ai-flows`, over the signed seam.
 *
 * The desk server takes a `FlowsClient` interface so it can be tested without a
 * core; this is the implementation that talks to a real one. It signs exactly
 * the way [ADR-0006](../../doc/adr/0006-ai-flows-lives-outside-core.md) specifies and
 * `core-client.ts` implements — same canonical string, same headers — because
 * two signing schemes in one system is one scheme and one bug.
 */
import { createHmac } from "node:crypto";

export interface FlowsHttpOptions {
  baseUrl: string;
  signingSecret?: string;
  now?: () => number;
}

/** `v0:{unix}:{METHOD}\n{path}\n{body}` — the string both ends agree on. */
function canonical(
  unix: number,
  method: string,
  path: string,
  body: string,
): string {
  return `v0:${unix}:${method.toUpperCase()}\n${path}\n${body}`;
}

export function createFlowsHttpClient(opts: FlowsHttpOptions) {
  const now = opts.now ?? Date.now;
  const base = opts.baseUrl.replace(/\/$/, "");

  /** Extracted so `DELETE`, which reads its own response codes, can sign too. */
  function signed(
    method: string,
    path: string,
    raw: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (!opts.signingSecret) return headers;
    const unix = Math.floor(now() / 1000);
    headers["x-timestamp"] = String(unix);
    headers["x-signature"] = createHmac("sha256", opts.signingSecret)
      .update(canonical(unix, method, path, raw))
      .digest("hex");
    return headers;
  }

  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const raw = body === undefined ? "" : JSON.stringify(body);
    const headers = signed(method, path, raw);
    const res = await fetch(base + path, {
      method,
      headers,
      ...(raw ? { body: raw } : {}),
    });
    const text = await res.text();
    // 409 is `halted` on advance -- a real answer about the flow, not a
    // transport failure, and turning it into an exception would make "this flow
    // cannot proceed" indistinguishable from "the server is down".
    if (!res.ok && res.status !== 409) {
      throw new Error(
        `ai-flows ${res.status} on ${method} ${path}: ${text.slice(0, 300)}`,
      );
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    async conformation() {
      const c = await call<{
        harness: string;
        scopes: Array<{
          scopeId: string;
          role: string;
          roster?: { members: string[] };
          agents: Array<{
            name: string;
            description: string;
            tools: string[];
            subagents: string[];
            ok: boolean;
          }>;
        }>;
      }>("GET", "/conformation");
      return {
        harness: c.harness,
        scopes: c.scopes.map((s) => ({
          scopeId: s.scopeId,
          role: s.role,
          agents: s.agents,
          members: s.roster?.members ?? [],
        })),
      };
    },

    async flows(scopeId: string) {
      const list = await call<{ flows: Array<{ id: string }> }>(
        "GET",
        `/flows?scopeId=${encodeURIComponent(scopeId)}`,
      );
      // The list endpoint returns summaries; the desk needs steps, and a
      // document drawn without its steps has no strip, which is the one thing
      // the desk is for.
      return await Promise.all(
        (list.flows ?? []).map((f) =>
          call<{
            id: string;
            title: string;
            goal: string;
            state: string;
            updatedAt: number;
            // `GET /flows/:id` already returns attempts and results. Declaring
            // only index/state/intent is what made the desk able to draw a
            // skeleton and nothing else — the data was on the wire the whole time.
            steps: Array<{
              index: number;
              state: string;
              intent: string;
              result: string | null;
              attempts: Array<{
                n: number;
                state: string;
                runId: string | null;
                error: string | null;
                observation: { digest: string; source: string } | null;
              }>;
            }>;
          }>("GET", `/flows/${encodeURIComponent(f.id)}`),
        ),
      );
    },

    /**
     * Create a flow. The one thing the desk could not do.
     *
     * Everything else the desk offers acts on a document that already exists:
     * assign, unassign, advance, fork, ask. So a person could arrange work and
     * could not *start* it — the first step of every project had to be a curl
     * command or a seed script, which is a strange shape for an interface whose
     * whole claim is that work outlives the conversation.
     *
     * `actorId` is required and has no default, for the reason
     * [ADR-0009](../../doc/adr/0009-a-flow-records-who-it-acts-for.md) gives:
     * a flow with no actor is not created rather than created and attributed to
     * a service account.
     */
    async createFlow(input: {
      scopeId: string;
      actorId: string;
      title: string;
      goal: string;
      steps?: string[];
    }) {
      return await call<{ id: string; title: string; state: string }>(
        "POST",
        "/flows",
        input,
      );
    },

    async appendStep(flowId: string, intent: string) {
      const step = await call<{ index: number }>(
        "POST",
        `/flows/${encodeURIComponent(flowId)}/steps`,
        { intent },
      );
      return { index: step.index };
    },

    async removeStep(flowId: string, index: number) {
      const res = await fetch(
        `${base}/flows/${encodeURIComponent(flowId)}/steps/${index}`,
        {
          method: "DELETE",
          headers: signed(
            "DELETE",
            `/flows/${encodeURIComponent(flowId)}/steps/${index}`,
            "",
          ),
        },
      );
      if (res.status === 200) return { ok: true } as const;
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        state?: string;
      };
      // 409 is "the step has started" — a fact about the step, not a failure of
      // the call, and the desk needs it to explain why the cube came back.
      return {
        ok: false as const,
        reason: body.error ?? `HTTP ${res.status}`,
        ...(body.state ? { state: body.state } : {}),
      };
    },

    async resume(flowId: string) {
      const r = await call<{ resumed?: number }>(
        "POST",
        `/flows/${encodeURIComponent(flowId)}/resume`,
      );
      return { resumed: r.resumed ?? 0 };
    },

    async advance(flowId: string) {
      const r = await call<{ outcome: { kind: string; reason?: string } }>(
        "POST",
        `/flows/${encodeURIComponent(flowId)}/advance`,
      );
      // The reason is carried, not dropped. A `gated` flow halts naming the gate
      // that stopped it, and "halted" alone sends the person to a log file to
      // find out which -- which is the desk failing at the one thing it is for.
      return { kind: r.outcome?.kind ?? "unknown", reason: r.outcome?.reason };
    },

    async fork(flowId: string, atStep: number) {
      const r = await call<{ id: string; title?: string }>(
        "POST",
        `/flows/${encodeURIComponent(flowId)}/fork`,
        { atStep },
      );
      return { id: r.id, title: r.title ?? "fork" };
    },

    async ask(flowId: string, question: string, step?: number) {
      const r = await call<{
        answer?: string;
        spent?: boolean;
        evidence?: number;
      }>("POST", `/flows/${encodeURIComponent(flowId)}/ask`, {
        question,
        ...(step === undefined ? {} : { step }),
      });
      return {
        answer: r.answer ?? "",
        // Defaulting `spent` to true is the safe direction: reporting a spend
        // that did not happen costs a person nothing, and hiding one costs them
        // the habit of counting.
        spent: r.spent ?? true,
        evidence: r.evidence ?? 0,
      };
    },
  };
}
