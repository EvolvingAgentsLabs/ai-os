/**
 * The canvas's server: state in, layout out, and two actions that cost money.
 *
 * It owns no flows and no conformation. Both come from `ai-flows`, over its
 * signed HTTP seam, for the reason [ADR-0006](../../doc/adr/0006-signed-seam.md)
 * gives: a second process reaching into the first one's tables is a coupling
 * nobody can see and nobody can revoke. The canvas is a client.
 *
 * What it does own is the layout — because a per-scope arrangement is not flow
 * state and does not belong in the flow tables.
 *
 * ## Two routes spend model calls, and they say so
 *
 * `POST /assign` appends a delegation step. `POST /advance` runs one. Everything
 * else is a read. That split is deliberate: the desk polls itself every few
 * seconds, and a canvas where *rendering* could trigger work would spend money
 * because somebody left a tab open.
 *
 * Neither route decides on its own that a flow should proceed. The rule is the
 * same one `ai-flows` states: **advance is a click, by whoever owns the decision
 * to spend a model call.**
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  type DeskAgent,
  type DeskDoc,
  type DeskView,
  renderDeskHtml,
} from "./desk.ts";
import { type DeskState, propose } from "./layout.ts";
import type { LayoutStore } from "./layout-store.ts";

/**
 * Everything the canvas needs from `ai-flows`, as an interface rather than an
 * import, so the server can be tested without a core, a database or a model.
 */
export interface FlowsClient {
  /** Scopes the caller can see, with their agents and people. */
  conformation(): Promise<{
    harness: string;
    scopes: Array<{
      scopeId: string;
      role: string;
      agents: Array<{
        name: string;
        description: string;
        tools: string[];
        subagents: string[];
        ok: boolean;
      }>;
      members: string[];
    }>;
  }>;
  flows(scopeId: string): Promise<
    Array<{
      id: string;
      title: string;
      goal: string;
      state: string;
      updatedAt: number;
      steps: Array<{ index: number; state: string; intent: string }>;
    }>
  >;
  appendStep(flowId: string, intent: string): Promise<{ index: number }>;
  advance(flowId: string): Promise<{ kind: string }>;
}

export interface DeskServerOptions {
  flows: FlowsClient;
  layouts: LayoutStore;
  now?: () => number;
}

/**
 * Which agent a step is for.
 *
 * Composed steps name the agent in the instruction `compose.ts` writes, and that
 * text is the only record: the flow itself is flat and stores no agent column
 * ([03-ai-flows](../../doc/03-ai-flows.md) — depth is flattened, not honoured).
 * So this reads the name back out of the instruction rather than inventing a
 * field, and returns null when it cannot rather than guessing — a cube shown on
 * the wrong document is worse than a cube shown on the shelf.
 */
export function agentOfIntent(intent: string): string | null {
  const m =
    /agent="([^"]+)"/.exec(intent) ?? /Act as the agent "([^"]+)"/.exec(intent);
  return m?.[1] ?? null;
}

/** The instruction a dropped cube becomes. Byte-identical to what `compose.ts` writes. */
export function assignIntent(
  agent: { name: string; description: string },
  goal: string,
): string {
  return (
    `Call your \`delegate\` tool with agent="${agent.name}". Its definition is at ` +
    `\`agents/${agent.name}.md\` in this workspace — do not search for it, and do not ` +
    `look under \`global/\`, which is a different scope. Report back exactly what it returns.\n\n` +
    `The task for ${agent.name}: ${goal}\n\n` +
    `${agent.name} is described as: ${agent.description}`
  );
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export function createDeskServer(opts: DeskServerOptions): Server {
  const now = opts.now ?? Date.now;

  async function viewFor(scopeId: string | null): Promise<DeskView> {
    const c = await opts.flows.conformation();
    // Scopes that can hold work. The system scope is mounted read-only into
    // every other one, so a desk for it would show agents nobody can be given a
    // step in — visible everywhere, assignable nowhere.
    const usable = c.scopes.filter((s) => s.role !== "system");
    const chosen =
      usable.find((s) => s.scopeId === scopeId) ?? usable[0] ?? c.scopes[0];
    if (!chosen) {
      return {
        scopeId: "",
        scopeLabel: "no scope",
        harness: c.harness,
        at: now(),
        docs: [],
        agents: [],
        people: [],
        layout: { scopeId: "", docs: {}, cubes: {} },
        scopes: [],
      };
    }

    const flows = await opts.flows.flows(chosen.scopeId);
    const docs: DeskDoc[] = flows.map((f) => ({
      id: f.id,
      title: f.title,
      goal: f.goal,
      state: f.state,
      updatedAt: f.updatedAt,
      done: f.steps.filter((s) => s.state === "done").length,
      total: f.steps.length,
      steps: f.steps.map((s) => ({
        index: s.index,
        state: s.state,
        intent: s.intent,
        agent: agentOfIntent(s.intent),
      })),
    }));

    const declared = new Set(chosen.agents.flatMap((a) => a.subagents));
    const byName = new Map(chosen.agents.map((a) => [a.name, a] as const));
    const agents: DeskAgent[] = chosen.agents.map((a) => ({
      name: a.name,
      description: a.description,
      tools: a.tools,
      child: declared.has(a.name),
      missing: false,
    }));
    // A name declared with no file is drawn, struck through and undraggable.
    // Hiding it would make a typo in a subagents list invisible, which is the
    // failure the explorer already refuses to hide.
    for (const name of declared) {
      if (!byName.has(name)) {
        agents.push({
          name,
          description: "Declared in a subagents list. No file behind it.",
          tools: [],
          child: true,
          missing: true,
        });
      }
    }

    const state: DeskState = {
      scopeId: chosen.scopeId,
      flows: docs.map((d) => ({
        id: d.id,
        title: d.title,
        state: d.state,
        agents: d.steps
          .map((s) => s.agent)
          .filter((x): x is string => Boolean(x)),
      })),
      agents: agents.map((a) => a.name),
    };
    const layout = propose(state, await opts.layouts.get(chosen.scopeId));

    return {
      scopeId: chosen.scopeId,
      scopeLabel: chosen.scopeId,
      harness: c.harness,
      at: now(),
      docs,
      agents,
      people: chosen.members,
      layout,
      scopes: usable.map((s) => ({ scopeId: s.scopeId, label: s.scopeId })),
    };
  }

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://desk");
    const send = (status: number, body: unknown, type = "application/json") => {
      const text = type === "text/html" ? String(body) : JSON.stringify(body);
      res.writeHead(status, {
        "content-type": `${type}; charset=utf-8`,
        "cache-control": "no-store",
      });
      res.end(text);
    };

    try {
      if (req.method === "GET" && url.pathname === "/") {
        return send(
          200,
          renderDeskHtml(await viewFor(url.searchParams.get("scope"))),
          "text/html",
        );
      }
      if (req.method === "GET" && url.pathname === "/state") {
        const v = await viewFor(url.searchParams.get("scope"));
        const busy: Record<string, boolean> = {};
        for (const d of v.docs)
          for (const s of d.steps)
            if (s.state === "running" && s.agent) busy[s.agent] = true;
        return send(200, {
          at: v.at,
          docs: v.docs,
          agents: v.agents,
          layout: v.layout,
          busy,
        });
      }
      if (req.method === "GET" && url.pathname === "/healthz")
        return send(200, { ok: true });

      if (req.method === "PUT" && url.pathname === "/layout") {
        const body = JSON.parse((await readBody(req)) || "{}");
        if (!body?.layout?.scopeId || body.layout.scopeId !== body.scopeId) {
          // The scope in the payload is the one the layout is stored under. A
          // mismatch means the page and the body disagree about which desk this
          // is, and writing either one would put a layout on the wrong scope.
          return send(400, { error: "scopeId must match layout.scopeId" });
        }
        await opts.layouts.put(body.layout);
        return send(200, { ok: true });
      }

      if (req.method === "POST" && url.pathname === "/assign") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const { scopeId, flowId, agent } = body ?? {};
        if (!scopeId || !flowId || !agent)
          return send(400, { error: "scopeId, flowId and agent are required" });
        const c = await opts.flows.conformation();
        const scope = c.scopes.find((s) => s.scopeId === scopeId);
        const def = scope?.agents.find((a) => a.name === agent);
        if (!def) {
          // Declared-with-no-file lands here. Appending a step for it would
          // create work that reports the agent is missing and settles `done`.
          return send(400, {
            error: `no agent file for "${agent}" in ${scopeId}`,
          });
        }
        const flow = (await opts.flows.flows(scopeId)).find(
          (f) => f.id === flowId,
        );
        if (!flow) return send(404, { error: "no such flow in this scope" });
        const { index } = await opts.flows.appendStep(
          flowId,
          assignIntent(def, flow.goal),
        );
        return send(200, { ok: true, stepIndex: index, flowTitle: flow.title });
      }

      if (req.method === "POST" && url.pathname === "/advance") {
        const body = JSON.parse((await readBody(req)) || "{}");
        if (!body?.flowId) return send(400, { error: "flowId is required" });
        const outcome = await opts.flows.advance(body.flowId);
        return send(200, { ok: true, outcome: outcome.kind });
      }

      return send(404, { error: "not found" });
    } catch (e) {
      return send(500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
}
