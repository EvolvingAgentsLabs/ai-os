/**
 * Turn a declared agent tree into a flow that runs.
 *
 * Until this existed, `subagents:` was something a page drew. An orchestrator
 * agent could name the specialists it composes and nothing anywhere acted on it,
 * which is a diagram rather than a system.
 *
 * ## The shape of the execution, and why it is this shape
 *
 * A delegated child is built without `runChild` (`pi-harness.ts:1313-1318`), so
 * **an agent cannot delegate to its own subagent.** Composition therefore cannot
 * be a nested call tree, and pretending otherwise would produce a flow that
 * silently does nothing on the harness it was written for.
 *
 * What does work is the pattern llmunix's SystemAgent uses: the **orchestrating
 * session** reads the tree and delegates to each named agent itself, one at a
 * time. So a tree becomes a *flat sequence of steps*, one per subagent, each of
 * which asks the session to `delegate` to that agent by name — the real upstream
 * mechanism, governed by the agent's own markdown file, not by a prompt this
 * module writes.
 *
 * Depth is therefore **flattened, not honoured**. A subagent that declares
 * subagents of its own contributes its descendants as further steps in the same
 * sequence, and that is stated in the plan rather than hidden, because a reader
 * comparing the flow to the tree should not have to guess where the nesting went.
 *
 * ## Reachability is not uniform, and the difference matters
 *
 * `delegate` resolves `agents/<name>.md` against the scope's own workspace root.
 * The system scope mounts at `global/`, and agent names cannot contain `/`
 * (`isSafeSkillName`), so **a system agent cannot be delegated to from a project
 * scope** — see doc/12-conformation § The unreachable repository. Rather than
 * drop those steps or pretend they work, the composer marks them `inline`: the
 * step carries the agent's instructions as text instead of a delegation. That is
 * strictly worse — the child gets no isolated context and no tool narrowing — and
 * it is labelled so nobody reads an inlined step as a delegated one.
 */
import type { AgentRecord, ScopeNode } from "./conformation.ts";

export interface ComposedStep {
  intent: string;
  agent: string;
  /** `delegate` — handed to the real agent file. `inline` — instructions pasted in. */
  via: "delegate" | "inline";
  /** Depth in the declared tree. Recorded because the flow itself is flat. */
  depth: number;
}

export interface ComposedPlan {
  root: string;
  scopeId: string;
  title: string;
  goal: string;
  steps: ComposedStep[];
  /** Declared names with no file anywhere the composer can see. Never turned into steps. */
  missing: string[];
  /** Names dropped because they had already appeared — a declared tree can cycle. */
  cycles: string[];
  notes: string[];
}

/**
 * Name the exact path, and say not to go looking.
 *
 * The first live run of a composed flow had one step report that `SchemaAgent`
 * did not exist, listing the three agents from `global/agents/` instead — while
 * the very next step delegated to `MigrationAgent` in the same scope without
 * trouble. The file was there. The model went looking for it, looked in the
 * mounted system layer, and concluded from an absence it had produced itself.
 *
 * So the instruction states the path rather than the name alone. This is not
 * prompt decoration: `delegate` resolves `agents/<name>.md` against the scope's
 * own root, and a step that leaves the model to discover that has a failure mode
 * with no error in it — the step *succeeds*, reporting that the agent is missing.
 */
function instructionFor(agent: AgentRecord, goal: string): string {
  return (
    `Call your \`delegate\` tool with agent="${agent.name}". Its definition is at ` +
    `\`agents/${agent.name}.md\` in this workspace — do not search for it, and do not ` +
    `look under \`global/\`, which is a different scope. Report back exactly what it returns.\n\n` +
    `The task for ${agent.name}: ${goal}\n\n` +
    `${agent.name} is described as: ${agent.description}`
  );
}

function inlineFor(agent: AgentRecord, goal: string): string {
  return (
    `Act as the agent "${agent.name}" for this step. It is described as: ${agent.description}\n\n` +
    `This agent is defined in the system scope and cannot be delegated to from here, ` +
    `so you are following its description directly rather than handing off to it.\n\n` +
    `The task: ${goal}`
  );
}

export interface ComposeOptions {
  /** The scope whose agents can be reached by `delegate`. */
  scope: ScopeNode;
  /** The system scope, whose agents are visible but unreachable. Optional. */
  systemScope?: ScopeNode;
  root: string;
  goal: string;
  /** A guard, not a policy: a hand-declared tree can be arbitrarily wide. */
  maxSteps?: number;
}

/**
 * Walk the declared tree depth-first and produce the flat step sequence.
 *
 * Depth-first because a specialist's own specialists should run adjacent to it
 * rather than after every sibling — the order a person reading the tree expects.
 */
export function composeFromAgent(opts: ComposeOptions): ComposedPlan | null {
  const local = new Map(opts.scope.agents.map((a) => [a.name, a] as const));
  const system = new Map((opts.systemScope?.agents ?? []).map((a) => [a.name, a] as const));
  const root = local.get(opts.root) ?? system.get(opts.root);
  if (!root) return null;

  const steps: ComposedStep[] = [];
  const missing: string[] = [];
  const cycles: string[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  const max = opts.maxSteps ?? 25;

  const walk = (agent: AgentRecord, depth: number) => {
    if (steps.length >= max) return;
    if (seen.has(agent.name)) {
      cycles.push(agent.name);
      return;
    }
    seen.add(agent.name);

    // The root is the orchestrator. It contributes no step of its own when it
    // has children — its work IS the sequence. With no children it is just an
    // agent, and gets one step.
    const isOrchestrator = agent.subagents.length > 0;
    if (!isOrchestrator) {
      const reachable = local.has(agent.name);
      steps.push({
        intent: reachable ? instructionFor(agent, opts.goal) : inlineFor(agent, opts.goal),
        agent: agent.name,
        via: reachable ? "delegate" : "inline",
        depth,
      });
      return;
    }

    for (const name of agent.subagents) {
      const child = local.get(name) ?? system.get(name);
      if (!child) {
        missing.push(name);
        continue;
      }
      walk(child, depth + 1);
    }
  };

  walk(root, 0);

  if (missing.length) {
    notes.push(
      `declared but has no file, so no step was created: ${[...new Set(missing)].join(", ")}. ` +
        "A declared name is a claim; only a file is a fact.",
    );
  }
  if (cycles.length) {
    notes.push(`already appeared earlier in the tree, so it was not run twice: ${[...new Set(cycles)].join(", ")}.`);
  }
  const inlined = steps.filter((s) => s.via === "inline");
  if (inlined.length) {
    notes.push(
      `${inlined.length} step(s) run INLINE rather than delegated (${inlined.map((s) => s.agent).join(", ")}): ` +
        "they live in the system scope, which mounts at global/ and cannot be addressed by an agent name. " +
        "An inlined step gets no isolated context and no tool narrowing.",
    );
  }
  if (steps.length >= max) {
    notes.push(`stopped at ${max} steps — the declared tree is wider than this composer will run in one flow.`);
  }
  if (steps.some((s) => s.depth > 1)) {
    notes.push("the tree was deeper than one level; descendants run as further steps in the same flat sequence.");
  }

  return {
    root: root.name,
    scopeId: opts.scope.scopeId,
    title: `${root.name}: ${opts.goal.slice(0, 60)}`,
    goal: opts.goal,
    steps,
    missing: [...new Set(missing)],
    cycles: [...new Set(cycles)],
    notes,
  };
}
