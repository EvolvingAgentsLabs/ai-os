/**
 * The canvas's server: state in, layout out, and two actions that cost money.
 *
 * It owns no flows and no conformation. Both come from `ai-flows`, over its
 * signed HTTP seam, for the reason
 * [ADR-0006](../../doc/adr/0006-ai-flows-lives-outside-core.md)
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
import { type FlowTrace, traceOf } from "./trace.ts";
import { MEMORY_LEVELS, type MemoryNote, proposeNote } from "./memory.ts";
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
      steps: Array<{
        index: number;
        state: string;
        intent: string;
        result?: string | null;
        /** The trace. Without these the desk can draw a skeleton and nothing else. */
        attempts?: Array<{
          n: number;
          state: string;
          runId: string | null;
          error: string | null;
          observation: { digest: string; source: string } | null;
        }>;
      }>;
    }>
  >;
  appendStep(flowId: string, intent: string): Promise<{ index: number }>;
  /**
   * Remove a step that has not started.
   *
   * `ok: false` carries why. The only reason that matters is that the step has
   * begun, and the desk has to be able to say so rather than silently leaving a
   * cube where the user did not put it.
   */
  removeStep(
    flowId: string,
    index: number,
  ): Promise<{ ok: true } | { ok: false; reason: string; state?: string }>;
  /**
   * Settle an attempt whose run has already finished.
   *
   * This launches nothing. `advance` starts a step and returns `in_flight` when
   * the run has not come back yet, and something has to collect it — every other
   * caller in this repository pairs the two. The desk did not, and a step
   * started from it stayed `running` for as long as anyone watched: the cube
   * pulsed forever over a run that had finished minutes earlier.
   */
  resume(flowId: string): Promise<{ resumed: number }>;
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
  /**
   * Flows with a resume already in the air.
   *
   * The desk polls every few seconds and a resume can outlive one poll, so
   * without this a slow run accumulates overlapping collectors racing to settle
   * the same attempt.
   */
  const resuming = new Set<string>();

  /**
   * Collect finished runs without making the caller wait for them.
   *
   * Deliberately not awaited: reading the desk must stay fast, and the result of
   * a settle shows up on the next poll a few seconds later. Errors are dropped
   * on purpose — a failed collection is retried by the next poll, and a desk
   * that 500s because a background settle failed is worse than one that is five
   * seconds stale.
   */
  function collectInBackground(
    flows: Array<{ id: string; steps: Array<{ state: string }> }>,
  ): void {
    for (const f of flows) {
      if (!f.steps.some((s) => s.state === "running")) continue;
      if (resuming.has(f.id)) continue;
      resuming.add(f.id);
      void opts.flows
        .resume(f.id)
        .catch(() => {})
        .finally(() => resuming.delete(f.id));
    }
  }

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
        notes: [],
        memoryLevels: MEMORY_LEVELS,
        scopes: [],
      };
    }

    const flows = await opts.flows.flows(chosen.scopeId);
    collectInBackground(flows);
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
      // What actually happened, computed with ai-flows' own instruments rather
      // than re-derived here: a second answer to "is this drifting" is a second
      // answer, and the one on screen would be the untested one.
      trace: traceOf(f.steps, agentOfIntent),
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

    /**
     * The memory drawer, proposed from what the flows produced.
     *
     * Nothing is stored: `ai-storage` does not exist. These notes are recomputed
     * on every read from the traces above, which is exactly what makes them a
     * sketch rather than memory — a memory that vanishes when you stop looking
     * is not one. The UI says so on every card.
     */
    const notes: MemoryNote[] = docs
      .filter((d) => d.state === "done")
      .map((d) =>
        proposeNote({
          id: d.id,
          title: d.title,
          goal: d.goal,
          steps: d.trace.steps.map((s) => ({
            agent: s.agent,
            result: s.result,
            ignored: Boolean(s.ignoredInput),
          })),
        }),
      );

    return {
      scopeId: chosen.scopeId,
      scopeLabel: chosen.scopeId,
      harness: c.harness,
      at: now(),
      docs,
      agents,
      people: chosen.members,
      layout,
      notes,
      memoryLevels: MEMORY_LEVELS,
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
          notes: v.notes,
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

      if (req.method === "POST" && url.pathname === "/unassign") {
        // The inverse of /assign, and it has to exist. Dropping a cube on a
        // document creates work; if dragging it off did nothing, the desk would
        // show an agent as idle while its step sat queued and ready to run --
        // a picture that renders cleanly and is wrong, which is the failure this
        // whole system is built to refuse.
        const body = JSON.parse((await readBody(req)) || "{}");
        const { scopeId, flowId, agent } = body ?? {};
        if (!scopeId || !flowId || !agent) {
          return send(400, { error: "scopeId, flowId and agent are required" });
        }
        const flow = (await opts.flows.flows(scopeId)).find(
          (f) => f.id === flowId,
        );
        if (!flow) return send(404, { error: "no such flow in this scope" });
        const steps = flow.steps.filter(
          (s) => agentOfIntent(s.intent) === agent,
        );
        if (!steps.length) {
          // Nothing queued for this agent: the cube was only ever a placement,
          // so taking it off is a layout change and nothing more.
          return send(200, {
            ok: true,
            removed: 0,
            note: "no step was queued for this agent",
          });
        }
        let removed = 0;
        const kept: string[] = [];
        for (const step of steps) {
          const r = await opts.flows.removeStep(flowId, step.index);
          if (r.ok) removed += 1;
          else kept.push(`step ${step.index} (${r.state ?? r.reason})`);
        }
        return send(200, {
          ok: true,
          removed,
          kept,
          ...(kept.length
            ? {
                note: `${kept.join(", ")} already started and cannot be removed — an attempt is history`,
              }
            : {}),
        });
      }

      if (req.method === "POST" && url.pathname === "/advance") {
        const body = JSON.parse((await readBody(req)) || "{}");
        if (!body?.flowId) return send(400, { error: "flowId is required" });
        // Collect anything already in flight before starting more. Without this
        // a second click launches a step while the previous one is still open,
        // and the flow ends up with two running attempts nobody asked for.
        await opts.flows.resume(body.flowId);
        const outcome = await opts.flows.advance(body.flowId);
        return send(200, { ok: true, outcome: outcome.kind });
      }

      return send(404, { error: "not found" });
    } catch (e) {
      return send(500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
}
