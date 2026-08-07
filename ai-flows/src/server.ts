/**
 * The flow API — M2's fifth deliverable, and the thing that turns a library into
 * a system.
 *
 * Until this existed, a flow could only be created by a script somebody ran by
 * hand. Nothing in the running application could start one, advance one or look
 * at one, which meant the engine worked and the system did not have flows.
 *
 * ## Why this is its own process and not a route in core
 *
 * [ADR-0006](../../doc/adr/0006-ai-flows-lives-outside-core.md): `ai-flows` owns
 * its own `flow_` tables and its own database handle, and reaches the core only
 * over the signed HTTP seam. A route inside `ai-base/src/` would be a line we
 * merge by hand every week, forever. So this is a zero-dependency `node:http`
 * server that imports nothing from core — the same posture `plugins/web-ui` takes
 * upstream.
 *
 * ## Authentication is not optional, and the refusal is the feature
 *
 * This is a write surface: it starts model runs that cost money and touch a
 * scope's workspace. So it will **not start** without either a signing secret or
 * an explicit acknowledgement that it is running open — mirroring upstream's own
 * `ALLOW_UNAUTHENTICATED_CORE`, which had to be *combined with an absent secret*
 * before it did anything. A server that silently defaults to open is how an
 * internal tool ends up on a public interface.
 *
 * ## What it deliberately does not do
 *
 * No advance-in-background, no queue, no scheduler. `POST /flows/:id/advance`
 * runs one step and answers with what happened. A flow that needs many steps is
 * advanced many times, by whoever owns the decision to spend a model call —
 * turning that into a daemon is the first step towards the general workflow
 * runtime [08-roadmap](../../doc/08-roadmap.md) says not to build.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { FlowEngine } from "./engine.ts";
import type { FlowStore } from "./flow-store.ts";
import { verifySignature } from "./core-client.ts";
import { FLOW_SHAPES, type FlowShape } from "./types.ts";
import { composeFromAgent } from "./compose.ts";
import type { ScopeNode } from "./conformation.ts";

export interface FlowServerOptions {
  store: FlowStore;
  engine: FlowEngine;
  /** Required unless `allowUnauthenticated` is explicitly true. */
  signingSecret?: string;
  /** Say it out loud. Mirrors upstream's escape hatch, and is refused silently nowhere. */
  allowUnauthenticated?: boolean;
  /** Optional page renderer, so the view can be served live rather than written to a file. */
  renderView?: () => Promise<string>;
  /**
   * Resolves a scope's agents, so a declared tree can be turned into steps.
   * Absent, `POST /flows/from-agent` answers 501 rather than half-working.
   */
  scopeAgents?: (scopeId: string) => Promise<{ scope: ScopeNode; systemScope?: ScopeNode } | null>;
  now?: () => number;
}

type Handler = (ctx: {
  params: Record<string, string>;
  body: unknown;
  query: URLSearchParams;
}) => Promise<{ status: number; body: unknown }>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

function route(method: string, path: string, handler: Handler): Route {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${path.replace(/:[A-Za-z0-9_]+/g, (m) => {
      keys.push(m.slice(1));
      return "([^/]+)";
    })}$`,
  );
  return { method, pattern, keys, handler };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function isShape(s: unknown): s is FlowShape {
  return typeof s === "string" && (FLOW_SHAPES as readonly string[]).includes(s);
}

export function createFlowServer(opts: FlowServerOptions) {
  if (!opts.signingSecret && !opts.allowUnauthenticated) {
    throw new Error(
      "refusing to start: set signingSecret, or pass allowUnauthenticated:true to say out loud that this flow API is open. " +
        "It starts model runs and writes to a scope's workspace.",
    );
  }
  const now = opts.now ?? Date.now;
  const { store, engine } = opts;

  const routes: Route[] = [
    route("POST", "/flows", async ({ body }) => {
      const b = (body ?? {}) as Record<string, unknown>;
      if (typeof b.scopeId !== "string" || !b.scopeId) return { status: 400, body: { error: "scopeId is required" } };
      if (typeof b.goal !== "string" || !b.goal) return { status: 400, body: { error: "goal is required" } };
      if (b.shape !== undefined && !isShape(b.shape)) {
        // Named explicitly rather than defaulted: a caller asking for `sequence`
        // today is asking for M6, and silently giving them `open` would answer a
        // different question than the one they asked.
        return { status: 400, body: { error: `unknown shape; this build has ${FLOW_SHAPES.join(", ")}` } };
      }
      const flow = await store.createFlow({
        scopeId: b.scopeId,
        title: typeof b.title === "string" && b.title ? b.title : b.goal.slice(0, 80),
        goal: b.goal,
        ...(isShape(b.shape) ? { shape: b.shape } : {}),
      });
      const steps = Array.isArray(b.steps) ? b.steps : [];
      for (const s of steps) {
        if (typeof s === "string" && s.trim()) await store.appendStep({ flowId: flow.id, intent: s });
      }
      return { status: 201, body: await store.getFlow(flow.id) };
    }),

    route("GET", "/flows", async ({ query }) => {
      const scopeId = query.get("scopeId");
      if (!scopeId) return { status: 400, body: { error: "scopeId is required" } };
      return { status: 200, body: { flows: await store.listFlows(scopeId) } };
    }),

    route("GET", "/flows/:id", async ({ params }) => {
      const flow = await store.getFlow(params.id!);
      return flow ? { status: 200, body: flow } : { status: 404, body: { error: "not_found" } };
    }),

    route("POST", "/flows/:id/steps", async ({ params, body }) => {
      const intent = (body as { intent?: unknown })?.intent;
      if (typeof intent !== "string" || !intent.trim()) return { status: 400, body: { error: "intent is required" } };
      const step = await store.appendStep({ flowId: params.id!, intent });
      return step ? { status: 201, body: step } : { status: 404, body: { error: "not_found" } };
    }),

    route("POST", "/flows/:id/advance", async ({ params }) => {
      const outcome = await engine.advance(params.id!);
      // `in_flight` is 202: accepted, still running, come back. Answering 200
      // would tell a caller the step finished when its run is still executing.
      const status = outcome.kind === "halted" ? 409 : outcome.kind === "in_flight" ? 202 : 200;
      return { status, body: { outcome, flow: await store.getFlow(params.id!) } };
    }),

    route("POST", "/flows/:id/resume", async ({ params }) => {
      const resumed = await engine.resume(params.id!);
      return { status: 200, body: { ...resumed, flow: await store.getFlow(params.id!) } };
    }),

    route("POST", "/flows/:id/fork", async ({ params, body }) => {
      const atStep = Number((body as { atStep?: unknown })?.atStep);
      if (!Number.isInteger(atStep) || atStep < 0) return { status: 400, body: { error: "atStep must be an index" } };
      const forked = await store.fork({ flowId: params.id!, atStep });
      return forked ? { status: 201, body: forked } : { status: 404, body: { error: "not_found" } };
    }),

    /**
     * Build a flow from an agent's declared `subagents` tree and, optionally, run
     * it. This is what turns composition from a drawing into work.
     *
     * `?dryRun=1` returns the plan without creating anything — the tree is
     * hand-declared, so being able to see what it would run before it runs is the
     * difference between a composition and a surprise.
     */
    route("POST", "/flows/from-agent", async ({ body, query }) => {
      if (!opts.scopeAgents) {
        return { status: 501, body: { error: "not_configured", message: "no agent source is wired into this server" } };
      }
      const b = (body ?? {}) as Record<string, unknown>;
      if (typeof b.scopeId !== "string" || !b.scopeId) return { status: 400, body: { error: "scopeId is required" } };
      if (typeof b.agent !== "string" || !b.agent) return { status: 400, body: { error: "agent is required" } };
      if (typeof b.goal !== "string" || !b.goal) return { status: 400, body: { error: "goal is required" } };

      const found = await opts.scopeAgents(b.scopeId);
      if (!found) return { status: 404, body: { error: "no_such_scope" } };
      const plan = composeFromAgent({
        scope: found.scope,
        ...(found.systemScope ? { systemScope: found.systemScope } : {}),
        root: b.agent,
        goal: b.goal,
      });
      if (!plan) {
        return {
          status: 404,
          body: { error: "no_such_agent", message: `no agents/${b.agent}.md in ${b.scopeId} or the system scope` },
        };
      }
      if (!plan.steps.length) {
        // A tree whose every branch was missing produces no work. Creating an
        // empty flow would report success for a composition that is broken.
        return { status: 422, body: { error: "nothing_to_run", plan } };
      }
      if (query.get("dryRun") === "1") return { status: 200, body: { plan } };

      const flow = await store.createFlow({ scopeId: plan.scopeId, title: plan.title, goal: plan.goal });
      for (const step of plan.steps) await store.appendStep({ flowId: flow.id, intent: step.intent });
      return { status: 201, body: { plan, flow: await store.getFlow(flow.id) } };
    }),

    route("GET", "/healthz", async () => ({ status: 200, body: { ok: true } })),
  ];

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = (req.method ?? "GET").toUpperCase();
    const raw = method === "GET" || method === "HEAD" ? "" : await readBody(req);

    if (method === "GET" && url.pathname === "/" && opts.renderView) {
      const html = await opts.renderView();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    const send = (status: number, body: unknown) => {
      const text = JSON.stringify(body ?? {});
      res.writeHead(status, { "content-type": "application/json" });
      res.end(text);
    };

    if (opts.signingSecret) {
      // The path is signed WITH its query string, because that is what the
      // canonical payload covers — signing only the pathname would let a
      // signature for `?scopeId=mine` be replayed against `?scopeId=yours`.
      const verdict = verifySignature(
        opts.signingSecret,
        {
          signature: typeof req.headers["x-signature"] === "string" ? req.headers["x-signature"] : undefined,
          timestamp: Number(req.headers["x-timestamp"] ?? NaN),
          method,
          path: url.pathname + url.search,
          body: raw,
        },
        now(),
      );
      if (!verdict.ok) return send(401, { error: "unauthorized", reason: verdict.reason });
    }

    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.pattern.exec(url.pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] ?? "")));
      let parsed: unknown = undefined;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          return send(400, { error: "bad_json" });
        }
      }
      try {
        const out = await r.handler({ params, body: parsed, query: url.searchParams });
        return send(out.status, out.body);
      } catch (e) {
        return send(500, { error: "internal", message: e instanceof Error ? e.message : String(e) });
      }
    }
    send(404, { error: "not_found" });
  }

  return {
    handle,
    listen(port: number) {
      const server = createServer((req, res) => {
        void handle(req, res).catch(() => {
          if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "internal" }));
        });
      });
      return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
        server.listen(port, () => {
          const addr = server.address();
          resolve({
            port: typeof addr === "object" && addr ? addr.port : port,
            close: () => new Promise<void>((r) => server.close(() => r())),
          });
        });
      });
    },
  };
}
