/**
 * Lazy skill loading, measured on the tree that is actually on disk.
 *
 * skillos claimed this arrangement cut routing-phase tokens by ~61%. That
 * number is not asserted here and is not carried over: it was measured against
 * a different catalogue, and an inherited number is one nobody checked. What is
 * asserted is the **mechanism** — the index carries every name and no body — and
 * the saving is recomputed and printed, so a tree where it does not pay says so.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import {
  fullCatalogue,
  indexSaving,
  readSkills,
  resolveSkill,
  routingIndex,
  type SkillFile,
} from "../src/skills.ts";

const SEED = join(import.meta.dirname, "..", "..", "ai-base", "skills-seed");

/** The real tree, read from disk. A fixture would measure a catalogue we invented. */
function onDisk(): SkillFile[] {
  const out: SkillFile[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry === "SKILL.md") out.push({ path: relative(SEED, p), raw: readFileSync(p, "utf8") });
    }
  };
  walk(SEED);
  return out;
}

describe("reading a skill tree", () => {
  it("reads the seed tree on disk, and takes identity from the path", () => {
    const { skills, broken } = readSkills(onDisk());
    assert.ok(skills.length > 5, `expected a real catalogue, got ${skills.length}`);
    assert.deepEqual(broken, [], "every seed skill must be readable");
    for (const s of skills) {
      assert.ok(s.description.length > 0);
      assert.equal(s.path.split("/")[0], s.domain);
    }
  });

  /**
   * Reported, never skipped. A catalogue that silently drops the one skill an
   * agent needed is indistinguishable from one that never had it, and the agent
   * then correctly reports that nothing covers the task.
   */
  it("reports a skill with no description rather than dropping it", () => {
    const { skills, broken } = readSkills([
      { path: "a/b/SKILL.md", raw: "---\nname: b\n---\nbody" },
      { path: "a/c/SKILL.md", raw: "---\nname: c\ndescription: fine\n---\nbody" },
    ]);
    assert.equal(skills.length, 1);
    assert.equal(broken.length, 1);
    assert.match(broken[0]!.why, /description/);
  });

  it("reports a file that is not where a skill lives", () => {
    const { broken } = readSkills([{ path: "loose.md", raw: "---\ndescription: x\n---\n" }]);
    assert.equal(broken.length, 1);
  });
});

describe("the routing index", () => {
  /**
   * The load-bearing property. If a body leaked into the index the saving would
   * be real and the mechanism would be a coincidence of short bodies.
   */
  it("carries every skill's name and description, and no skill's body", () => {
    const { skills } = readSkills(onDisk());
    const index = routingIndex(skills);
    for (const s of skills) {
      assert.ok(index.includes(s.path), `${s.path} must be choosable`);
      assert.ok(index.includes(s.description.slice(0, 40)));
    }
    for (const s of skills) {
      const distinctive = s.body.split("\n").find((l) => l.trim().length > 60);
      if (distinctive) {
        assert.ok(!index.includes(distinctive.trim()), `${s.path}'s body leaked into the index`);
      }
    }
  });

  it("saves most of the choosing-phase text on the tree that is on disk", () => {
    const { skills } = readSkills(onDisk());
    const { indexChars, fullChars, savedFraction } = indexSaving(skills);
    console.log(
      `    ${skills.length} skills · index ${indexChars} chars vs full ${fullChars} · ` +
        `saved ${(savedFraction * 100).toFixed(1)}%`,
    );
    // A floor, not the number. Asserting 61% would pin this to skillos's tree
    // and break the day a skill is added, which is not a defect.
    assert.ok(savedFraction > 0.5, `saving was ${(savedFraction * 100).toFixed(1)}%`);
    assert.ok(indexChars < fullChars);
  });

  /**
   * The measurement must be able to come out badly. A catalogue whose bodies are
   * as short as its descriptions saves nothing, and `indexSaving` says so rather
   * than reporting a fraction that flatters the design.
   */
  it("reports no saving on a catalogue where there is none", () => {
    const flat = readSkills([
      { path: "d/a/SKILL.md", raw: "---\ndescription: aaaa\n---\nx" },
      { path: "d/b/SKILL.md", raw: "---\ndescription: bbbb\n---\ny" },
    ]).skills;
    assert.ok(indexSaving(flat).savedFraction < 0.2);
  });
});

describe("resolving what the model chose", () => {
  it("returns the body for an exact path", () => {
    const { skills } = readSkills(onDisk());
    const first = skills[0]!;
    assert.equal(resolveSkill(skills, first.path)?.body, first.body);
    assert.equal(resolveSkill(skills, ` ${first.path} `)?.path, first.path);
  });

  /**
   * Exact only. A fuzzy resolver hands back a plausible neighbour for a name
   * that does not exist, and the agent follows instructions for a skill it did
   * not pick — the one failure lazy loading introduces that eager loading has
   * no way to produce.
   */
  it("returns nothing for a name that does not exist, rather than a near one", () => {
    const { skills } = readSkills(onDisk());
    assert.equal(resolveSkill(skills, "publis"), null);
    assert.equal(resolveSkill(skills, ""), null);
  });

  it("resolves to a body the full catalogue also contains", () => {
    const { skills } = readSkills(onDisk());
    const s = resolveSkill(skills, skills[1]!.path)!;
    assert.ok(fullCatalogue(skills).includes(s.body.slice(0, 80)));
  });
});
