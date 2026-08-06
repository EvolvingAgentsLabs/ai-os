import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ConformationSources,
  type ParsedAgent,
  type TapeMessage,
  UNATTRIBUTED,
  AGENT as AGENT_NODE,
  type Participation,
  attributeMessage,
  projectConformation,
  roleOf,
  parseScope,
} from "../src/conformation.ts";

/** Upstream's parser contract, standing in for the injected real one. */
function fakeParse(name: string, raw: string): ParsedAgent {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`agent '${name}': no frontmatter`);
  const attrs = m[1] ?? "";
  const description = /description:\s*(.+)/.exec(attrs)?.[1]?.trim() ?? "";
  if (!description) throw new Error(`agent '${name}': frontmatter must carry a non-empty description`);
  const toolsRaw = /tools:\s*\[(.*?)\]/.exec(attrs)?.[1] ?? "";
  const tools = toolsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return { description, tools };
}

const AGENT = `---
description: Computes an exact numeric answer.
tools: [execute, read]
---
You compute one numeric answer.`;

interface Fixture {
  scopes: string[];
  files?: Record<string, string[]>;
  contents?: Record<string, string>;
  rosters?: Record<string, { members: string[]; version: string }>;
  messages?: TapeMessage[];
}

function sourcesOf(f: Fixture): ConformationSources {
  return {
    scopes: async () => f.scopes,
    roster: async (s) => f.rosters?.[s] ?? null,
    workspaceFiles: async (s) => f.files?.[s] ?? [],
    readFile: async (s, p) => f.contents?.[`${s}/${p}`] ?? null,
    parseAgent: fakeParse,
    messages: async (s) => (f.messages ?? []).filter((m) => m.scopeId === s),
  };
}

const run = (f: Fixture, harness = "pi") =>
  projectConformation(sourcesOf(f), { harness, now: () => 1_000 });

describe("reading a scope id", () => {
  it("names a project by upstream's reserved group prefix, not by a kind of its own", () => {
    assert.deepEqual(roleOf("group:web-project-42"), { role: "project", projectId: "42" });
    assert.equal(roleOf("group:random").role, "collective");
    assert.equal(roleOf("team:eng").role, "team");
    assert.equal(roleOf("org:acme").role, "system");
    assert.equal(roleOf("personal:U1").role, "individual");
  });

  it("refuses to guess at a kind it does not recognise", () => {
    assert.equal(parseScope("PERSONAL:U1").kind, null);
    assert.equal(roleOf("PERSONAL:U1").role, "unknown");
    assert.equal(roleOf("nonsense").role, "unknown");
  });
});

describe("what the projector reads", () => {
  it("finds the agents a scope defines and shows what they declare", async () => {
    const c = await run({
      scopes: ["group:web-project-7"],
      files: { "group:web-project-7": ["agents/calc.md", "skills/pdf/SKILL.md", "memory/MEMORY.md"] },
      contents: { "group:web-project-7/agents/calc.md": AGENT },
      rosters: { "group:web-project-7": { members: ["U1", "U2"], version: "3" } },
    });
    const scope = c.scopes[0]!;
    assert.equal(scope.role, "project");
    assert.equal(scope.projectId, "7");
    assert.deepEqual(scope.roster, { members: ["U1", "U2"], version: "3" });
    assert.deepEqual(scope.skills, ["pdf"]);
    assert.equal(scope.hasMemory, true);
    assert.deepEqual(scope.agents[0]?.tools, ["execute", "read"]);
    assert.equal(scope.agents[0]?.ok, true);
  });

  it("reports a definition that does not parse instead of dropping it", async () => {
    // `delegate` parses at call time, so a broken file fails during a turn rather
    // than at startup. Surfacing it here is most of the point of parsing at all.
    const c = await run({
      scopes: ["personal:U1"],
      files: { "personal:U1": ["agents/broken.md"] },
      contents: { "personal:U1/agents/broken.md": "no frontmatter here" },
    });
    const agent = c.scopes[0]!.agents[0]!;
    assert.equal(agent.ok, false);
    assert.match(agent.error!, /frontmatter/);
  });

  it("ignores nested paths that are not agent definitions", async () => {
    const c = await run({
      scopes: ["personal:U1"],
      files: { "personal:U1": ["agents/sub/nested.md", "agents/notes.txt", "agents/.keep"] },
    });
    assert.deepEqual(c.scopes[0]!.agents, []);
  });
});

describe("membership never comes from a folder", () => {
  it("reports a membership-shaped path as a finding and does not read it as a roster", async () => {
    const c = await run({
      scopes: ["group:web-project-7"],
      files: { "group:web-project-7": ["users/alice.md", "members.json"] },
      rosters: { "group:web-project-7": { members: ["U1"], version: "1" } },
    });
    const scope = c.scopes[0]!;
    assert.deepEqual(scope.membershipInFolders, ["users/alice.md", "members.json"]);
    // The roster still comes from the roster port, uncontaminated by the folder.
    assert.deepEqual(scope.roster!.members, ["U1"]);
    assert.ok(c.holes.some((h) => /membership-shaped/.test(h.question + h.why)));
  });

  it("says so when a project has the prefix but no roster behind it", async () => {
    const c = await run({ scopes: ["group:web-project-9"] });
    assert.equal(c.scopes[0]!.roster, undefined);
    assert.ok(c.holes.some((h) => /roster/.test(h.question)));
  });
});

describe("holes are output, not omissions", () => {
  it("turns every unwired source into a stated hole rather than an empty render", async () => {
    // The failure mode of a projection is silence: a clean view that did not ask.
    const c = await projectConformation({ scopes: async () => ["personal:U1"] }, { harness: "pi", now: () => 1 });
    assert.ok(c.holes.some((h) => /agents, skills and memory/.test(h.question)));
    assert.ok(c.holes.some((h) => /talking to whom/.test(h.question)));
    assert.ok(c.holes.some((h) => /system scope/.test(h.question)));
  });

  it("flags an unparseable scope kind rather than letting it fall through", async () => {
    const c = await run({ scopes: ["PERSONAL:U1"] });
    assert.equal(c.scopes[0]!.role, "unknown");
    assert.ok(c.holes.some((h) => /kind of scope/.test(h.question)));
  });

  it("reports that the system agent repository cannot be delegated to", async () => {
    const c = await run({
      scopes: ["org:acme"],
      files: { "org:acme": ["agents/reviewer.md"] },
      contents: { "org:acme/agents/reviewer.md": AGENT },
    });
    assert.ok(c.holes.some((h) => /system agents be delegated/.test(h.question)));
  });

  it("marks workspace agents inert on a harness that never loads them", async () => {
    const f: Fixture = {
      scopes: ["personal:U1"],
      files: { "personal:U1": ["agents/calc.md"] },
      contents: { "personal:U1/agents/calc.md": AGENT },
    };
    const onPi = await run(f, "pi");
    assert.equal(onPi.scopes[0]!.agents[0]!.inert, false);
    assert.ok(!onPi.holes.some((h) => /run on harness/.test(h.question)));

    const onClaude = await run(f, "claude");
    assert.equal(onClaude.scopes[0]!.agents[0]!.inert, true);
    assert.ok(onClaude.holes.some((h) => /run on harness 'claude'/.test(h.question)));
  });
});

describe("the communication graph", () => {
  const msg = (author: string | undefined, at: number, extra: Partial<TapeMessage> = {}): TapeMessage => ({
    scopeId: "group:web-project-7",
    ...(author === undefined ? {} : { author }),
    at,
    ...extra,
  });

  it("counts an addressed message once per recipient", async () => {
    const c = await run({
      scopes: ["group:web-project-7"],
      messages: [msg("U1", 10, { to: ["U2", "U3"] }), msg("U1", 20, { to: ["U2"] })],
    });
    const u2 = c.edges.find((e) => e.to === "U2")!;
    assert.equal(u2.messages, 2);
    assert.equal(u2.lastAt, 20);
    assert.equal(c.edges.find((e) => e.to === "U3")!.messages, 1);
  });

  it("does not invent an edge out of an overheard record", async () => {
    // Overheard means present, not addressed. Counting it would manufacture a
    // conversation out of proximity.
    const c = await run({
      scopes: ["group:web-project-7"],
      messages: [msg("U1", 10, { to: ["U2"], overheard: true })],
    });
    assert.deepEqual(c.edges, []);
  });

  it("treats an unaddressed message as spoken to the scope, not to nobody", async () => {
    const c = await run({ scopes: ["group:web-project-7"], messages: [msg("U1", 10)] });
    assert.equal(c.edges[0]!.to, "*");
  });

  it("reports unattributed messages instead of merging them into one speaker", async () => {
    // Measured, not hypothetical. Two real turns on pi: an actor with no
    // displayName produced two records with no author, and the assistant's own
    // reply had none either — meta.author comes from actor.displayName alone
    // (core/orchestrator.ts:2170). Drawn silently, every distinct speaker in the
    // system collapses into a single node and the graph looks complete.
    const c = await run({
      scopes: ["group:web-project-7"],
      messages: [msg("Ada", 10, { to: ["U2"] }), msg(undefined, 20, { to: ["U2"] })],
    });
    assert.ok(c.edges.some((e) => e.from === UNATTRIBUTED && e.via === "none"));
    const hole = c.holes.find((h) => /stayed unattributed/.test(h.question));
    assert.ok(hole, "an unattributed message must raise a hole");
    assert.match(hole!.question, /1 of 2/);
  });

  it("raises no attribution hole when every message names its author", async () => {
    const c = await run({ scopes: ["group:web-project-7"], messages: [msg("Ada", 10, { to: ["U2"] })] });
    assert.ok(!c.holes.some((h) => /stayed unattributed/.test(h.question)));
  });

  it("attributes the agent's own turns with no ambiguity at all", async () => {
    // The half that was entirely anonymous before. An assistant entry needs no
    // window and no display name: the role IS the attribution.
    const { author, via } = attributeMessage(
      { scopeId: "s", at: 10, role: "assistant", sessionId: "S1" },
      [],
    );
    assert.equal(author, AGENT_NODE);
    assert.equal(via, "role");
  });

  it("recovers a speaker from the one membership window that covers the record", async () => {
    const w: Participation[] = [{ sessionId: "S1", principalId: "U7", validFrom: 0, validTo: null }];
    const r = attributeMessage({ scopeId: "s", at: 10, role: "user", sessionId: "S1" }, w);
    assert.deepEqual(r, { author: "U7", via: "window" });
  });

  it("refuses to pick when several windows cover the record", async () => {
    // Upstream's attributedTurns join counts the turn under BOTH principals — fine
    // for a usage metric, wrong here: an edge from somebody who did not speak is
    // worse than no edge.
    const w: Participation[] = [
      { sessionId: "S1", principalId: "U7", validFrom: 0, validTo: null },
      { sessionId: "S1", principalId: "U8", validFrom: 0, validTo: null },
    ];
    const r = attributeMessage({ scopeId: "s", at: 10, role: "user", sessionId: "S1" }, w);
    assert.deepEqual(r, { author: UNATTRIBUTED, via: "ambiguous" });
  });

  it("does not apply a window that has already closed", async () => {
    const w: Participation[] = [{ sessionId: "S1", principalId: "U7", validFrom: 0, validTo: 5 }];
    const r = attributeMessage({ scopeId: "s", at: 10, role: "user", sessionId: "S1" }, w);
    assert.equal(r.via, "none");
  });

  it("prefers a declared author over anything it could recover", async () => {
    const w: Participation[] = [{ sessionId: "S1", principalId: "U7", validFrom: 0, validTo: null }];
    const r = attributeMessage({ scopeId: "s", at: 10, author: "Ada", role: "user", sessionId: "S1" }, w);
    assert.deepEqual(r, { author: "Ada", via: "declared" });
  });

  it("carries how each edge was attributed, and raises a hole for the ambiguous ones", async () => {
    const c = await projectConformation(
      {
        scopes: async () => ["group:web-project-7"],
        messages: async () => [
          { scopeId: "group:web-project-7", at: 10, role: "assistant", sessionId: "S1" },
          { scopeId: "group:web-project-7", at: 11, role: "user", sessionId: "S1" },
        ],
        participants: async () => [
          { sessionId: "S1", principalId: "U7", validFrom: 0, validTo: null },
          { sessionId: "S1", principalId: "U8", validFrom: 0, validTo: null },
        ],
      },
      { harness: "pi", now: () => 1 },
    );
    assert.ok(c.edges.some((e) => e.from === AGENT_NODE && e.via === "role"));
    assert.ok(c.edges.some((e) => e.via === "ambiguous"));
    assert.ok(c.holes.some((h) => /several participants/.test(h.question)));
  });

  it("drops a self-edge", async () => {
    const c = await run({ scopes: ["group:web-project-7"], messages: [msg("U1", 10, { to: ["U1"] })] });
    assert.deepEqual(c.edges, []);
  });
});

describe("the structural digest", () => {
  const base: Fixture = {
    scopes: ["group:web-project-7"],
    files: { "group:web-project-7": ["agents/calc.md"] },
    contents: { "group:web-project-7/agents/calc.md": AGENT },
    rosters: { "group:web-project-7": { members: ["U1"], version: "1" } },
  };

  it("does not move when only conversation moves", async () => {
    // The digest answers "did the shape change", and a fingerprint that moves on
    // every turn cannot answer it. Same instrument as flow observability: a repeat
    // is proof, a difference is a rumour.
    const quiet = await run(base);
    const busy = await run({
      ...base,
      messages: [{ scopeId: "group:web-project-7", author: "U1", at: 99, to: ["U2"] }],
    });
    assert.equal(quiet.digest, busy.digest);
  });

  it("moves when the roster version moves", async () => {
    const before = await run(base);
    const after = await run({ ...base, rosters: { "group:web-project-7": { members: ["U1"], version: "2" } } });
    assert.notEqual(before.digest, after.digest);
  });

  it("moves when an agent is added", async () => {
    const before = await run(base);
    const after = await run({
      ...base,
      files: { "group:web-project-7": ["agents/calc.md", "agents/other.md"] },
      contents: { ...base.contents, "group:web-project-7/agents/other.md": AGENT },
    });
    assert.notEqual(before.digest, after.digest);
  });
});
