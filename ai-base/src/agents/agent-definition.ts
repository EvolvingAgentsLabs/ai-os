import { parseFrontmatter } from "../skills/frontmatter.ts";
import { isSafeSkillName } from "../skills/skill-name.ts";

export const AGENTS_DIR = "agents";

export const CHILD_TOOL_NAMES: ReadonlySet<string> = new Set([
  "execute",
  "read",
  "write",
  "publish",
  "memory",
  "history",
  "background",
]);

export const CHILD_POLICY =
  "Complete only the delegated task and report the result. Do not contact people, schedule work, " +
  "change standing configuration, or suppress the parent reply. You cannot delegate further.";

export interface AgentDefinition {
  name: string;
  description: string;
  tools: string[];
  instructions: string;
}

export function assertSafeAgentName(name: string): string {
  if (!isSafeSkillName(name)) {
    throw new Error(
      "agent name must be 1-128 ASCII letters, digits, dots, underscores, or hyphens; it must start with a letter or digit and cannot end with a dot",
    );
  }
  return name;
}

export function agentDefinitionPath(name: string): string {
  return `${AGENTS_DIR}/${assertSafeAgentName(name)}.md`;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return undefined;
    out.push(entry.trim());
  }
  return out.filter(Boolean);
}

export function parseAgentDefinition(name: string, raw: string): AgentDefinition {
  assertSafeAgentName(name);
  const { attrs, body } = parseFrontmatter(raw);

  const declaredName = attrs.name;
  if (declaredName !== undefined && declaredName !== name) {
    throw new Error(`agent '${name}': frontmatter name '${String(declaredName)}' does not match its file name`);
  }

  const description = typeof attrs.description === "string" ? attrs.description.trim() : "";
  if (!description) throw new Error(`agent '${name}': frontmatter must carry a non-empty description`);

  const instructions = body.trim();
  if (!instructions) throw new Error(`agent '${name}': body must carry the agent's instructions`);

  const declaredTools = attrs.tools === undefined ? [...CHILD_TOOL_NAMES] : asStringArray(attrs.tools);
  if (!declaredTools) throw new Error(`agent '${name}': tools must be a list of tool names`);

  const unknown = declaredTools.filter((t) => !CHILD_TOOL_NAMES.has(t));
  if (unknown.length) {
    throw new Error(
      `agent '${name}': tools ${unknown.join(", ")} are not available to a delegated agent ` +
        `(allowed: ${[...CHILD_TOOL_NAMES].sort().join(", ")})`,
    );
  }
  if (!declaredTools.length) throw new Error(`agent '${name}': tools must name at least one tool`);

  return { name, description, tools: [...new Set(declaredTools)], instructions };
}

export function childSystemPrompt(definition: AgentDefinition): string {
  return `${definition.instructions}\n\n${CHILD_POLICY}`;
}

export function agentNameFromPath(path: string): string | undefined {
  const m = /^agents\/([^/]+)\.md$/.exec(path);
  const name = m?.[1];
  return name !== undefined && isSafeSkillName(name) ? name : undefined;
}
