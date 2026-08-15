/**
 * Skills, and the reason a routing index is not a nicety.
 *
 * This is skillos's `Domain → Family → Skill` with its four-step lazy load,
 * rebuilt on ai-os's own skill shape (`SKILL.md`, frontmatter `name` +
 * `description`, body is the instructions). skillos claimed the arrangement cut
 * routing-phase tokens by about 61%. That number is **not carried over**: it was
 * measured against a different tree, and a claim inherited across two codebases
 * is a claim nobody checked. `indexSaving` recomputes it here, over whatever
 * tree is actually present, and `test/skills.test.ts` prints it.
 *
 * The mechanism is one sentence: to *choose* a skill an agent needs every
 * skill's name and one line about it; to *use* one it needs that skill's body
 * and no other. Loading every body to make one choice is the cost, and it grows
 * with the catalogue while the choice does not.
 *
 * **What this deliberately does not do.** It does not rank, score or pick. A
 * router that guessed would be a second, worse answer to a question the model is
 * already good at, and it would fail silently — returning a plausible skill for
 * a task it does not cover, with nothing downstream able to tell.
 */
import { parseFrontmatter } from "../../ai-base/src/skills/frontmatter.ts";

/** One skill on disk. `path` is relative to the tree root and is its identity. */
export interface Skill {
  /** `domain/family/name`, taken from the path, not from the frontmatter. */
  path: string;
  domain: string;
  family: string | null;
  name: string;
  description: string;
  /** The instructions. This is the part lazy loading exists to defer. */
  body: string;
}

export interface SkillFile {
  /** Path relative to the tree root, e.g. `memory/consolidation/dream/SKILL.md`. */
  path: string;
  raw: string;
}

/**
 * Read a tree of `SKILL.md` files.
 *
 * A file whose frontmatter is unusable is **reported, not skipped**. A catalogue
 * that silently drops the one skill an agent needed is indistinguishable from a
 * catalogue that never had it, and the agent then reports that no skill covers
 * the task.
 */
export function readSkills(files: SkillFile[]): {
  skills: Skill[];
  broken: Array<{ path: string; why: string }>;
} {
  const skills: Skill[] = [];
  const broken: Array<{ path: string; why: string }> = [];
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    if (parts[parts.length - 1] !== "SKILL.md" || parts.length < 2) {
      broken.push({ path: f.path, why: "a skill is <domain>/[family/]<name>/SKILL.md" });
      continue;
    }
    const dirs = parts.slice(0, -1);
    let attrs: Record<string, unknown>;
    let body: string;
    try {
      const parsed = parseFrontmatter(f.raw);
      attrs = parsed.attrs;
      body = parsed.body;
    } catch (e) {
      broken.push({ path: f.path, why: `frontmatter: ${(e as Error).message}` });
      continue;
    }
    const description = typeof attrs.description === "string" ? attrs.description.trim() : "";
    if (!description) {
      // The description IS the index. A skill without one cannot be chosen, so
      // shipping it as choosable would be shipping a skill nobody can reach.
      broken.push({ path: f.path, why: "no description — it is what the index is made of" });
      continue;
    }
    skills.push({
      path: dirs.join("/"),
      domain: dirs[0]!,
      family: dirs.length > 2 ? dirs.slice(1, -1).join("/") : null,
      name: dirs[dirs.length - 1]!,
      description,
      body: body.trim(),
    });
  }
  skills.sort((a, b) => a.path.localeCompare(b.path));
  return { skills, broken };
}

/**
 * The routing index — everything needed to *choose*, and nothing needed to *use*.
 *
 * Grouped by domain because that is the axis a person and a model both narrow
 * on first, and because an ungrouped list of forty descriptions reads as forty
 * unrelated options.
 */
export function routingIndex(skills: Skill[]): string {
  const byDomain = new Map<string, Skill[]>();
  for (const s of skills) {
    const list = byDomain.get(s.domain) ?? [];
    list.push(s);
    byDomain.set(s.domain, list);
  }
  const lines: string[] = [];
  for (const [domain, list] of [...byDomain].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${domain}`);
    for (const s of list) lines.push(`- ${s.path} — ${s.description}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

/** Everything, bodies included — what an agent loads when there is no index. */
export function fullCatalogue(skills: Skill[]): string {
  return skills.map((s) => `## ${s.path}\n${s.description}\n\n${s.body}`).join("\n\n").trim();
}

/**
 * What the index saves, measured rather than quoted.
 *
 * Characters, not tokens, and that is a real limitation stated rather than
 * hidden: a tokeniser would tie this number to one model's vocabulary, and the
 * ratio is what the argument turns on. Both texts are prose in the same
 * language, so the two scale together.
 *
 * `savedFraction` is the honest headline: how much of the choosing-phase text
 * the index removes. It is a property of **this** tree — a catalogue of two
 * skills with long descriptions saves nothing, and it should say so.
 */
export function indexSaving(skills: Skill[]): {
  indexChars: number;
  fullChars: number;
  savedFraction: number;
} {
  const indexChars = routingIndex(skills).length;
  const fullChars = fullCatalogue(skills).length;
  return {
    indexChars,
    fullChars,
    savedFraction: fullChars === 0 ? 0 : 1 - indexChars / fullChars,
  };
}

/**
 * Resolve a path the model chose from the index.
 *
 * Exact match only. A fuzzy resolver returns a plausible neighbour for a name
 * that does not exist, and the agent then follows instructions for a skill it
 * did not pick — the one failure mode lazy loading introduces that eager
 * loading does not have.
 */
export function resolveSkill(skills: Skill[], path: string): Skill | null {
  return skills.find((s) => s.path === path.trim()) ?? null;
}
