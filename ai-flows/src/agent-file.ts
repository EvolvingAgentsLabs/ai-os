/**
 * An agent, as the markdown file it actually is.
 *
 * This is the one renderer. `scripts/seed-cochlea.ts` had a private copy and
 * the desk's `POST /scopes/:id/agents` route needed the same thing, and two
 * renderers would be two answers to "what does an agent file look like" — with
 * the frontmatter drifting first, silently, because a file with the wrong keys
 * parses fine and simply declares no tools.
 *
 * The shape is upstream's: `description` and `tools` are what
 * `ai-base/src/agents/agent-definition.ts` validates. `subagents` is ours —
 * upstream ignores every other key, so the file stays loadable by the vendored
 * core and still carries the tree ai-flows composes from.
 */

import { CHILD_TOOL_NAMES } from "../../ai-base/src/agents/agent-definition.ts";

/** What a caller may ask for. Rejected rather than repaired — see `validateAgent`. */
export interface AgentDraft {
  name: string;
  description: string;
  tools: string[];
  subagents?: string[];
  instructions: string;
}

/**
 * Tool names upstream understands — **read from upstream, not restated here.**
 *
 * The first version of this line was a hand-written list that included
 * `search`, which does not exist. It was written from memory and never checked,
 * and it did exactly the damage this module was built to prevent: a roster an
 * agent wrote declared `search`, the validator accepted it, and upstream then
 * rejected the whole `tools:` list — installing two agents that loaded fine and
 * had **no tools at all**. Caught only because the conformation showed
 * `tools=  ok=false` beside six agents that were fine.
 *
 * A second copy of a list whose whole purpose is to match another list is not a
 * check. `CHILD_TOOL_NAMES` is the definition; this re-exports it.
 */
export const KNOWN_TOOLS: readonly string[] = [...CHILD_TOOL_NAMES].sort();

/** A filename an agent may have. Upper, digits and dashes — the roster's shape. */
const NAME = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;

/**
 * Say why it is refused, or `null`.
 *
 * Returns the first problem rather than a list: the caller is a person typing
 * into a form, and four complaints at once about one field is how a form
 * teaches people to stop reading it.
 */
export function validateAgent(draft: Partial<AgentDraft>): string | null {
  const name = (draft.name ?? "").trim();
  if (!name) return "an agent needs a name";
  if (!NAME.test(name)) {
    return "an agent's name may use letters, digits and dashes, and must start with a letter";
  }
  if (!(draft.description ?? "").trim()) {
    // Not optional and not defaulted from the name. The description is what a
    // person reads when deciding which agent to drop on a document, and one
    // that restates the name tells them nothing.
    return "an agent needs a description — it is what a person reads when choosing one";
  }
  if (!(draft.instructions ?? "").trim()) {
    return "an agent needs instructions — a file with frontmatter and no body declares a name and no behaviour";
  }
  const tools = draft.tools ?? [];
  if (!Array.isArray(tools) || !tools.length) {
    return `an agent needs at least one tool, from: ${KNOWN_TOOLS.join(", ")}`;
  }
  const unknown = tools.filter((t) => !KNOWN_TOOLS.includes(t));
  if (unknown.length) {
    return `unknown tool(s): ${unknown.join(", ")}. Known: ${KNOWN_TOOLS.join(", ")}`;
  }
  const subs = draft.subagents ?? [];
  if (!Array.isArray(subs) || subs.some((s) => typeof s !== "string" || !NAME.test(s))) {
    return "subagents must be agent names";
  }
  if (subs.includes(name)) {
    // A tree that contains itself composes into an infinite step list, and the
    // flattening in compose.ts would produce it without complaint.
    return `${name} cannot be its own subagent`;
  }
  return null;
}

/** The file, rendered. Only ever called on a draft that passed `validateAgent`. */
export function agentMarkdown(draft: AgentDraft): string {
  const subs = draft.subagents ?? [];
  return [
    "---",
    `description: ${draft.description.trim()}`,
    `tools: [${draft.tools.join(", ")}]`,
    ...(subs.length ? [`subagents: [${subs.join(", ")}]`] : []),
    "---",
    draft.instructions.trim(),
    "",
  ].join("\n");
}

/** Where the file goes. One rule, so a desk-written agent and a seeded one collide properly. */
export const agentPath = (name: string): string => `agents/${name}.md`;

/**
 * Read a roster a model wrote.
 *
 * JSON, and deliberately not markdown-with-frontmatter. A model asked to emit
 * four agent files in one document produces something that *looks* parseable
 * and disagrees with `parseFrontmatter` on the details — an unquoted colon in a
 * description, a list written as prose. The failure is then a roster that
 * installs with three of its four agents describing nothing, and nothing
 * downstream can tell that from an author who wrote it that way.
 *
 * `JSON.parse` either succeeds or names the offset it failed at, and the model
 * can be told to fix it.
 */
export function parseRoster(raw: string): { agents: AgentDraft[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: `the roster is not JSON: ${(e as Error).message}` };
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { agents?: unknown })?.agents)
      ? (parsed as { agents: unknown[] }).agents
      : null;
  if (!list) return { error: "the roster must be a JSON array of agents, or {agents: [...]}" };
  if (!list.length) {
    // Not "nothing to do". A step that was asked for a roster and produced an
    // empty one failed, and installing nothing quietly reports success.
    return { error: "the roster is empty" };
  }
  const agents: AgentDraft[] = [];
  for (const item of list) {
    const o = (item ?? {}) as Record<string, unknown>;
    agents.push({
      name: typeof o.name === "string" ? o.name.trim() : "",
      description: typeof o.description === "string" ? o.description : "",
      tools: Array.isArray(o.tools) ? (o.tools as string[]) : [],
      subagents: Array.isArray(o.subagents) ? (o.subagents as string[]) : [],
      instructions: typeof o.instructions === "string" ? o.instructions : "",
    });
  }
  const names = agents.map((a) => a.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) {
    // Two agents with one name means the second silently overwrites the first,
    // and the roster the flow reports installing is not the one on disk.
    return { error: `two agents named ${dup} — the second would overwrite the first` };
  }
  return { agents };
}
