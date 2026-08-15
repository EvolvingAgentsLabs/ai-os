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
import type { Conformation, ScopeNode } from "./conformation.ts";
import { agentMarkdown, agentPath, parseRoster, validateAgent } from "./agent-file.ts";
import { type SkillFile, indexSaving, readSkills, resolveSkill, routingIndex } from "./skills.ts";
import { WIKI_MIRROR, consolidate, loadWiki, parseNotes, recall } from "./memory.ts";
import { answerWithoutEvidence, askPrompt, type AskInput } from "./ask.ts";

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
   * The projected conformation, so another surface can read the shape of the
   * system without reaching into this one's stores.
   *
   * Injected rather than computed here for the same reason `renderView` is: the
   * projector needs a workspace, a project store and a session store, and
   * wiring those in would make this module depend on `ai-base`. The canvas
   * (`ai-ui`) is the first caller — it needs the agent list to draw cubes, and
   * a second copy of the projection would be a second answer to "what does this
   * system look like".
   */
  conformation?: () => Promise<Conformation>;
  /**
   * Resolves a scope's agents, so a declared tree can be turned into steps.
   * Absent, `POST /flows/from-agent` answers 501 rather than half-working.
   */
  scopeAgents?: (scopeId: string) => Promise<{ scope: ScopeNode; systemScope?: ScopeNode } | null>;
  /**
   * Runs one short turn to answer a question about a flow ([ask.ts](ask.ts)).
   *
   * Injected for the same reason `scopeAgents` is: the route needs a core
   * client, and constructing one here would give this module a second way to
   * reach the core beside the engine's. Absent, `POST /flows/:id/ask` answers
   * 501 — the desk then shows the computed digest and no prose, which is the
   * degradation this whole surface is designed to survive.
   */
  ask?: (prompt: string) => Promise<string>;
  /**
   * Create a project and return the scope its work happens in.
   *
   * Injected for the reason `conformation` is: the project store lives in
   * `ai-base` and reaching it from here would give this module a second way
   * into the core.
   *
   * The route exists because without it **a project cannot be born in this
   * system**. Every scope on the desk today was created by a seed script run
   * from a shell, and a system whose projects can only be created by its
   * maintainers is a demo of the projects, not of the system. Absent the
   * dependency this answers 501 rather than inventing a scope id that no store
   * has heard of.
   */
  /**
   * Write an agent file into a scope's workspace.
   *
   * Injected for the same reason `createProject` is. Absent, the route answers
   * 501: an empty project is honest, and an empty project that silently
   * accepted agents nobody could see would not be.
   */
  writeAgent?: (scopeId: string, path: string, markdown: string) => Promise<void>;
  /**
   * Put material into the place an agent can actually read it — the scope's
   * **sandbox**, not its workspace.
   *
   * These are two different stores and the distinction was learned the
   * expensive way. The first version of `POST /scopes/:id/files` wrote through
   * `workspace.write`, read the file back through `workspace.read`, reported
   * `201 … bytes: 37691` — and the agent asked to summarise that file replied
   * that it did not exist. The route had confirmed its own write with its own
   * reader, which is not a check.
   *
   * The workspace is where agent *definitions* live, because the core loads
   * those host-side. Everything an agent reads or runs lives in the sandbox,
   * the same layer `scripts/provision-project.ts` writes to.
   *
   * The implementation must verify **from inside the sandbox**. Anything else
   * repeats the defect one layer down.
   */
  /**
   * Read a file back out of a scope's **sandbox**, so material an agent wrote
   * there can be brought into the workspace. `null` when it is not there.
   */
  readMaterial?: (scopeId: string, path: string) => Promise<string | null>;
  /**
   * The skill files a scope can reach. Injected because they live on disk in
   * two places — the seed tree and the scope's own `skills/` — and deciding
   * which is which is wiring, not routing.
   */
  skillFiles?: (scopeId: string) => Promise<SkillFile[]>;
  /**
   * A scope's memory mirror, read and written. Separate from `writeAgent` only
   * so the wiring can put it somewhere else later; both are the workspace today.
   */
  readWorkspaceFile?: (scopeId: string, path: string) => Promise<string | null>;
  putMaterial?: (
    scopeId: string,
    path: string,
    content: string,
  ) => Promise<{ verified: boolean; detail: string }>;
  createProject?: (input: {
    name: string;
    ownerId: string;
  }) => Promise<{ id: string; name: string; scopeId: string }>;
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
      /**
       * Required, with no default. [ADR-0009](../../doc/adr/0009-a-flow-records-who-it-acts-for.md):
       * a flow with no actor is not created, rather than created and silently
       * attributed to a service account. An optional field with a fallback
       * behind it is the same shared-account attribution with an extra step.
       */
      if (typeof b.actorId !== "string" || !b.actorId) {
        return { status: 400, body: { error: "actorId is required — a flow records the principal it acts for" } };
      }
      if (b.shape !== undefined && !isShape(b.shape)) {
        // Named explicitly rather than defaulted: a caller asking for `sequence`
        // today is asking for M6, and silently giving them `open` would answer a
        // different question than the one they asked.
        return { status: 400, body: { error: `unknown shape; this build has ${FLOW_SHAPES.join(", ")}` } };
      }
      // A gated flow must name its gates at creation. Refused rather than
      // defaulted to an empty set: a gated flow with nothing to check is a flow
      // whose only content has been configured away, and the shape exists to
      // stop exactly that from finishing quietly.
      const gates = Array.isArray(b.requiredGates) ? b.requiredGates : null;
      if (b.shape === "gated") {
        if (!gates?.length || gates.some((g) => typeof g !== "string" || !g.trim())) {
          return {
            status: 400,
            body: { error: "a gated flow requires a non-empty requiredGates array of names" },
          };
        }
      }
      const flow = await store.createFlow({
        scopeId: b.scopeId,
        actorId: b.actorId,
        title: typeof b.title === "string" && b.title ? b.title : b.goal.slice(0, 80),
        goal: b.goal,
        ...(isShape(b.shape) ? { shape: b.shape } : {}),
        ...(gates?.length ? { requiredGates: gates as string[] } : {}),
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

    route("DELETE", "/flows/:id/steps/:index", async ({ params }) => {
      // Addressed by index, not by the internal step id: the index is what every
      // surface displays, and asking a caller to look up an id it never sees is
      // an invitation to delete the wrong thing.
      const flow = await store.getFlow(params.id!);
      if (!flow) return { status: 404, body: { error: "not_found" } };
      const step = flow.steps.find((s) => s.index === Number(params.index));
      if (!step) return { status: 404, body: { error: "no step with that index" } };
      const removed = await store.removeStep(step.id);
      if (!removed) {
        // 409 rather than 404: the step is there, and the reason it survives is
        // a fact about it worth reporting.
        return {
          status: 409,
          body: {
            error: "step has started",
            state: step.state,
            detail: "only a pending step with no attempts can be removed; an attempt is history",
          },
        };
      }
      return { status: 200, body: { removed, flow: await store.getFlow(params.id!) } };
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

    /**
     * Answer a question about a flow, or about one step of it.
     *
     * `POST /flows/:id/ask { question, step? }`. The `step` is the pronoun —
     * whatever the person had selected — and it is what makes a three-word
     * question answerable.
     *
     * Two things this route does before it will spend a turn. It refuses an
     * empty question, and it answers from `answerWithoutEvidence` when the trace
     * holds nothing, because buying a model call to be told "there is no
     * information here" is paying for a worse copy of a sentence already known
     * to be true. `spent` says which happened, so the caller is never guessing
     * whether it was billed.
     */
    route("POST", "/flows/:id/ask", async ({ params, body }) => {
      const b = (body ?? {}) as Record<string, unknown>;
      const question = typeof b.question === "string" ? b.question.trim() : "";
      if (!question) return { status: 400, body: { error: "question is required" } };

      const flow = await store.getFlow(params.id!);
      if (!flow) return { status: 404, body: { error: "not_found" } };

      const stepIndex = Number.isInteger(b.step) ? (b.step as number) : undefined;
      const input: AskInput = {
        title: flow.title,
        goal: flow.goal,
        state: flow.state,
        steps: flow.steps,
        selection: stepIndex === undefined ? { kind: "flow" } : { kind: "step", index: stepIndex },
        question,
      };

      const prompt = askPrompt(input);
      if (prompt.evidenceCount === 0)
        return { status: 200, body: { answer: answerWithoutEvidence(input), spent: false, evidence: 0 } };

      if (!opts.ask)
        return {
          status: 501,
          body: { error: "not_configured", message: "no model seam is wired into this server" },
        };

      return {
        status: 200,
        body: { answer: await opts.ask(prompt.text), spent: true, evidence: prompt.evidenceCount },
      };
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
      if (typeof b.actorId !== "string" || !b.actorId) {
        return { status: 400, body: { error: "actorId is required — a flow records the principal it acts for" } };
      }

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

      const flow = await store.createFlow({
        scopeId: plan.scopeId,
        actorId: b.actorId,
        title: plan.title,
        goal: plan.goal,
      });
      for (const step of plan.steps) await store.appendStep({ flowId: flow.id, intent: step.intent });
      return { status: 201, body: { plan, flow: await store.getFlow(flow.id) } };
    }),

    /**
     * Create a project. The one gesture that was missing for a project to start
     * inside ai-os rather than beside it.
     */
    route("POST", "/projects", async ({ body }) => {
      if (!opts.createProject) {
        return {
          status: 501,
          body: { error: "no project store is wired into this server" },
        };
      }
      const b = (body ?? {}) as Record<string, unknown>;
      const name = typeof b.name === "string" ? b.name.trim() : "";
      const ownerId = typeof b.ownerId === "string" ? b.ownerId.trim() : "";
      // Both required and neither defaulted. A project with a guessed owner is
      // manufactured provenance -- the same rule `Flow.actorId` states, applied
      // one level up, where it decides who may see the work at all.
      if (!name) return { status: 400, body: { error: "name is required" } };
      if (!ownerId) {
        return {
          status: 400,
          body: { error: "ownerId is required — a project records who it belongs to" },
        };
      }
      return { status: 201, body: await opts.createProject({ name, ownerId }) };
    }),

    /**
     * Furnish a project — write an agent into its workspace.
     *
     * An agent here **is** a markdown file, so this route writes one and does
     * nothing else. That is not a shortcut: `scripts/seed-cochlea.ts` furnishes
     * a scope by asking a model to use its write tool, which spends a turn and
     * can fail in ways a file write cannot. The file is the artefact either way.
     */
    route("POST", "/scopes/:scope/agents", async ({ params, body }) => {
      if (!opts.writeAgent) {
        return { status: 501, body: { error: "no workspace is wired into this server" } };
      }
      const scopeId = decodeURIComponent(params.scope ?? "");
      if (!scopeId.includes(":")) {
        return { status: 400, body: { error: "a scope id looks like kind:ref" } };
      }
      const b = (body ?? {}) as Record<string, unknown>;
      const draft = {
        name: typeof b.name === "string" ? b.name.trim() : "",
        description: typeof b.description === "string" ? b.description : "",
        tools: Array.isArray(b.tools) ? (b.tools as string[]) : [],
        subagents: Array.isArray(b.subagents) ? (b.subagents as string[]) : [],
        instructions: typeof b.instructions === "string" ? b.instructions : "",
      };
      const why = validateAgent(draft);
      if (why) return { status: 400, body: { error: why } };
      const path = agentPath(draft.name);
      await opts.writeAgent(scopeId, path, agentMarkdown(draft));
      return { status: 201, body: { ok: true, scopeId, path, name: draft.name } };
    }),

    /**
     * Put material into a project — the specification, a dataset, a note.
     *
     * A project started from the desk has agents and **nothing to work on**,
     * and an agent asked to check a result with no material in front of it
     * correctly answers that it has none. That was measured, not assumed: the
     * first agent to run in a project created this way replied asking which
     * matrix it was supposed to look at.
     *
     * Paths are refused rather than repaired. A sanitiser that silently turns
     * `../../etc/x` into `etc/x` writes a file somewhere the caller did not ask
     * for and reports success.
     */
    route("POST", "/scopes/:scope/files", async ({ params, body }) => {
      if (!opts.putMaterial) {
        return { status: 501, body: { error: "no sandbox is wired into this server" } };
      }
      const scopeId = decodeURIComponent(params.scope ?? "");
      if (!scopeId.includes(":")) {
        return { status: 400, body: { error: "a scope id looks like kind:ref" } };
      }
      const b = (body ?? {}) as Record<string, unknown>;
      const path = typeof b.path === "string" ? b.path.trim() : "";
      const content = typeof b.content === "string" ? b.content : null;
      if (!path) return { status: 400, body: { error: "path is required" } };
      if (path.startsWith("/") || path.split("/").includes("..")) {
        return { status: 400, body: { error: "path must be relative and may not climb out of the scope" } };
      }
      if (content === null) {
        // Not defaulted to "". A caller that forgot the field would otherwise
        // truncate a file it meant to write.
        return { status: 400, body: { error: "content is required — send an empty string to write an empty file" } };
      }
      const out = await opts.putMaterial(scopeId, path, content);
      if (!out.verified) {
        // 500 and not 201. A furnished project that is empty is the failure this
        // route exists to make impossible, and reporting success is how it hid.
        return { status: 500, body: { error: `wrote ${path} and the sandbox does not have it: ${out.detail}` } };
      }
      return { status: 201, body: { ok: true, scopeId, path, verifiedInSandbox: out.detail } };
    }),

    /**
     * Install an agent an **agent** wrote.
     *
     * This is the gesture llmunix-marketplace was built around — the kernel
     * reads a goal and writes the roster that goal needs, rather than being
     * handed one. It could not work here without a route, and the reason is the
     * seam this file already documents: an agent writes into its sandbox, and
     * the core loads agent definitions from the scope's workspace. A roster an
     * agent wrote lands where nothing reads it.
     *
     * What ai-os adds to that gesture is this route's middle line: the draft is
     * **validated before it becomes an agent**. A model that writes
     * `tools: [excecute]` produces a file that loads without complaint and an
     * agent that can run nothing, and llmunix had nothing between the model and
     * the roster. Here a bad draft is refused and named, and the flow can see
     * that it was.
     */
    route("POST", "/scopes/:scope/agents/from-sandbox", async ({ params, body }) => {
      if (!opts.writeAgent || !opts.readMaterial) {
        return { status: 501, body: { error: "no sandbox is wired into this server" } };
      }
      const scopeId = decodeURIComponent(params.scope ?? "");
      if (!scopeId.includes(":")) {
        return { status: 400, body: { error: "a scope id looks like kind:ref" } };
      }
      const b = (body ?? {}) as Record<string, unknown>;
      const path = typeof b.path === "string" ? b.path.trim() : "";
      if (!path || path.startsWith("/") || path.split("/").includes("..")) {
        return { status: 400, body: { error: "a relative path inside the sandbox is required" } };
      }
      const raw = await opts.readMaterial(scopeId, path);
      if (raw === null) return { status: 404, body: { error: `no ${path} in the sandbox` } };

      const drafts = parseRoster(raw);
      if ("error" in drafts) return { status: 400, body: { error: drafts.error } };

      // Validate every draft **before installing any**. A roster half-installed
      // because the fourth entry was malformed is a scope whose agents do not
      // match what anyone approved, and no later step could tell.
      const refused = drafts.agents
        .map((d) => ({ name: d.name, why: validateAgent(d) }))
        .filter((x): x is { name: string; why: string } => x.why !== null);
      if (refused.length) {
        return {
          status: 400,
          body: {
            error: "the roster was refused and nothing was installed",
            refused,
            installed: [],
          },
        };
      }
      for (const d of drafts.agents) await opts.writeAgent(scopeId, agentPath(d.name), agentMarkdown(d));
      return {
        status: 201,
        body: { ok: true, scopeId, installed: drafts.agents.map((d) => d.name) },
      };
    }),

    /**
     * The routing index — every skill's name and description, no skill's body.
     *
     * This is skillos's lazy load, and the whole argument is the size of what
     * comes back: to *choose* a skill an agent needs one line about each; to
     * *use* one it needs that one's body and no other. Measured on the seed tree
     * the index is 4,397 characters against 105,423 — 95.8% of the choosing
     * phase removed. `savedFraction` is recomputed per scope and can come back
     * near zero, which is the honest answer for a small catalogue.
     *
     * `broken` is returned rather than logged. A skill that fell out of the
     * index is invisible to the agent, which then correctly reports that
     * nothing covers the task — and the reason would be in a log nobody reads.
     */
    route("GET", "/scopes/:scope/skills", async ({ params, query }) => {
      if (!opts.skillFiles) {
        return { status: 501, body: { error: "no skill tree is wired into this server" } };
      }
      const scopeId = decodeURIComponent(params.scope ?? "");
      if (!scopeId.includes(":")) {
        return { status: 400, body: { error: "a scope id looks like kind:ref" } };
      }
      const { skills, broken } = readSkills(await opts.skillFiles(scopeId));
      const wanted = query.get("path");
      if (wanted) {
        const skill = resolveSkill(skills, wanted);
        // 404 rather than the nearest match. A fuzzy answer makes the agent
        // follow instructions for a skill it did not pick, which is the one
        // failure lazy loading introduces that eager loading cannot produce.
        if (!skill) return { status: 404, body: { error: `no skill at ${wanted}` } };
        return { status: 200, body: { skill } };
      }
      return {
        status: 200,
        body: { index: routingIndex(skills), count: skills.length, ...indexSaving(skills), broken },
      };
    }),

    /**
     * Consolidate — turn material into memory that outlives the session.
     *
     * The agent writes `notes.json` into its sandbox and this decides whether
     * any of it becomes memory. Offsets, lengths and hashes are computed from
     * the quoted text rather than read from the draft, and a note whose quote is
     * not in the file it cites is refused: `wiki.ts` records two models
     * classifying one input correctly while one reported a source range that
     * did not match the text it had hashed, and nothing complained.
     *
     * `sources` names the files the notes may cite, read from the sandbox. A
     * note citing anything else is refused rather than stored unverifiable.
     */
    route("POST", "/scopes/:scope/memory/from-sandbox", async ({ params, body }) => {
      if (!opts.readMaterial || !opts.writeAgent || !opts.readWorkspaceFile) {
        return { status: 501, body: { error: "no sandbox is wired into this server" } };
      }
      const scopeId = decodeURIComponent(params.scope ?? "");
      if (!scopeId.includes(":")) return { status: 400, body: { error: "a scope id looks like kind:ref" } };
      const b = (body ?? {}) as Record<string, unknown>;
      const notesPath = typeof b.path === "string" ? b.path.trim() : "notes.json";
      const sourceList = Array.isArray(b.sources) ? (b.sources as string[]) : [];
      if (!sourceList.length) {
        return { status: 400, body: { error: "sources is required — a note that cites nothing cannot be checked" } };
      }
      const raw = await opts.readMaterial(scopeId, notesPath);
      if (raw === null) return { status: 404, body: { error: `no ${notesPath} in the sandbox` } };

      const parsed = parseNotes(raw);
      if ("error" in parsed) return { status: 400, body: { error: parsed.error } };

      const sources: Record<string, string> = {};
      const missing: string[] = [];
      for (const f of sourceList) {
        const text = await opts.readMaterial(scopeId, f);
        if (text === null) missing.push(f);
        else sources[f] = text;
      }
      if (missing.length) {
        return { status: 400, body: { error: `not in the sandbox: ${missing.join(", ")}` } };
      }

      const wiki = loadWiki(await opts.readWorkspaceFile(scopeId, WIKI_MIRROR));
      const out = consolidate(wiki, parsed.notes, sources);
      if ("error" in out) return { status: 400, body: { error: out.error, refused: out.refused } };
      await opts.writeAgent(scopeId, WIKI_MIRROR, JSON.stringify(out.wiki, null, 2));
      return { status: 201, body: { ok: true, added: out.added, total: Object.keys(out.wiki.notes).length } };
    }),

    /**
     * Recall — what to read before starting work.
     *
     * `?about=a,b` filters deterministically before any model is asked
     * anything; with nothing it returns the root index, which names shards and
     * never notes and is therefore bounded however large the memory grows.
     */
    route("GET", "/scopes/:scope/memory", async ({ params, query }) => {
      if (!opts.readWorkspaceFile) {
        return { status: 501, body: { error: "no workspace is wired into this server" } };
      }
      const scopeId = decodeURIComponent(params.scope ?? "");
      if (!scopeId.includes(":")) return { status: 400, body: { error: "a scope id looks like kind:ref" } };
      const about = (query.get("about") ?? "").split(",").map((k) => k.trim()).filter(Boolean);
      const wiki = loadWiki(await opts.readWorkspaceFile(scopeId, WIKI_MIRROR));
      return { status: 200, body: { ...recall(wiki, about), total: Object.keys(wiki.notes).length } };
    }),

    route("GET", "/conformation", async () => {
      if (!opts.conformation) {
        // 501 rather than an empty document: a caller that cannot tell "nothing
        // is wired" from "the system is empty" will draw an empty desk and
        // believe it.
        return { status: 501, body: { error: "no conformation provider is wired into this server" } };
      }
      return { status: 200, body: await opts.conformation() };
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
