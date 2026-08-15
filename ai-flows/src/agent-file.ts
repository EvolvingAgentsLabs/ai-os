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

/** What a caller may ask for. Rejected rather than repaired — see `validateAgent`. */
export interface AgentDraft {
  name: string;
  description: string;
  tools: string[];
  subagents?: string[];
  instructions: string;
}

/**
 * Tool names upstream understands.
 *
 * Enumerated rather than passed through. A file declaring `tools: [excecute]`
 * loads without complaint and the agent simply cannot run anything — a typo
 * becomes a capability the agent silently lacks, and the failure surfaces
 * minutes later as "the step did nothing".
 */
export const KNOWN_TOOLS = ["read", "write", "execute", "search"] as const;

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
  const unknown = tools.filter((t) => !(KNOWN_TOOLS as readonly string[]).includes(t));
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
