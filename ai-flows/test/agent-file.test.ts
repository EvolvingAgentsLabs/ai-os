/**
 * An agent, as the markdown file it actually is.
 *
 * These tests exist because the failure this module prevents is silent: a file
 * with a misspelled tool name, or with frontmatter and no body, **parses**. The
 * agent loads, declares nothing, and the failure surfaces minutes later as a
 * step that did nothing — attributed to the model rather than to the file.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KNOWN_TOOLS, agentMarkdown, agentPath, parseRoster, validateAgent } from "../src/agent-file.ts";
import { parseFrontmatter } from "../../ai-base/src/skills/frontmatter.ts";
import { parseAgentDefinition } from "../../ai-base/src/agents/agent-definition.ts";

const draft = {
  name: "DERIVADOR",
  description: "Derives the closed forms every gate is checked against.",
  tools: ["read", "write", "execute"],
  subagents: ["VERIFICADOR-MATH"],
  instructions: "You derive the analytic truth for the passive membrane.",
};

describe("writing an agent file", () => {
  /**
   * The load-bearing test. The renderer is ours and the parser is upstream's,
   * so a shape that only our own reader accepts is a file the core cannot run —
   * and nothing else in this repository would notice.
   */
  it("produces a file the vendored core parses, with the tools it declared", () => {
    const md = agentMarkdown(draft);
    const parsed = parseAgentDefinition(draft.name, md);
    assert.equal(parsed.description, draft.description);
    assert.deepEqual(parsed.tools, draft.tools);
  });

  it("carries subagents, which upstream ignores and ai-flows composes from", () => {
    const { attrs } = parseFrontmatter(agentMarkdown(draft));
    assert.deepEqual(attrs.subagents, ["VERIFICADOR-MATH"]);
    // And omits the key entirely when there are none, rather than writing an
    // empty list: `subagents: []` and no key mean the same thing to the reader,
    // and only one of them is what the author said.
    assert.doesNotMatch(agentMarkdown({ ...draft, subagents: [] }), /subagents/);
  });

  it("puts it where the roster looks", () => {
    assert.equal(agentPath("DERIVADOR"), "agents/DERIVADOR.md");
  });
});

describe("refusing an agent", () => {
  it("refuses a tool name it does not know, rather than passing it through", () => {
    // The whole point. `excecute` loads fine and the agent silently cannot run
    // anything.
    const why = validateAgent({ ...draft, tools: ["read", "excecute"] });
    assert.match(String(why), /excecute/);
    assert.match(String(why), new RegExp(String(KNOWN_TOOLS[0])));
  });

  it("refuses an agent with no tools", () => {
    assert.match(String(validateAgent({ ...draft, tools: [] })), /at least one tool/);
  });

  it("refuses frontmatter with no body", () => {
    assert.match(String(validateAgent({ ...draft, instructions: "  " })), /instructions/);
  });

  it("refuses a description that was never written", () => {
    assert.match(String(validateAgent({ ...draft, description: "" })), /description/);
  });

  it("refuses a name that would not be a filename", () => {
    for (const name of ["", "9LIVES", "a/../b", "with space"]) {
      assert.ok(validateAgent({ ...draft, name }), `"${name}" must be refused`);
    }
  });

  /**
   * A tree containing itself flattens into an infinite step list, and
   * `compose.ts` would produce it without complaint.
   */
  it("refuses an agent that is its own subagent", () => {
    const why = validateAgent({ ...draft, subagents: ["DERIVADOR"] });
    assert.match(String(why), /its own subagent/);
  });

  it("accepts the one that is fine", () => {
    assert.equal(validateAgent(draft), null);
  });
});

/**
 * Reading a roster a model wrote — the llmunix-marketplace gesture, which is
 * "give the kernel a goal and it writes the agents that goal needs".
 *
 * What ai-os adds is everything below: llmunix had nothing between the model
 * and the roster, so a model that emitted a misspelled tool produced an agent
 * that loaded fine and could run nothing.
 */
describe("reading a roster a model wrote", () => {
  const one = {
    name: "CONSTRUCTOR",
    description: "Writes the solver.",
    tools: ["read", "write"],
    instructions: "You implement what DERIVADOR derived.",
  };

  it("accepts a bare array and an {agents: [...]} envelope alike", () => {
    for (const raw of [JSON.stringify([one]), JSON.stringify({ agents: [one] })]) {
      const r = parseRoster(raw);
      assert.ok("agents" in r);
      assert.equal(r.agents[0]!.name, "CONSTRUCTOR");
    }
  });

  /**
   * An empty roster is a **failure**, not "nothing to do". A step asked for a
   * roster that produced none did not succeed, and installing nothing quietly
   * reports that it did.
   */
  it("refuses an empty roster rather than installing nothing and reporting success", () => {
    const r = parseRoster("[]");
    assert.ok("error" in r);
    assert.match(r.error, /empty/);
  });

  it("refuses two agents with one name, which would silently overwrite", () => {
    const r = parseRoster(JSON.stringify([one, { ...one, description: "Different." }]));
    assert.ok("error" in r);
    assert.match(r.error, /CONSTRUCTOR/);
  });

  it("names the failure when the model emitted something that is not JSON", () => {
    const r = parseRoster("here is your roster: [{");
    assert.ok("error" in r);
    assert.match(r.error, /not JSON/);
  });

  /**
   * The parser fills missing fields with empties rather than guessing, so
   * `validateAgent` is what refuses them — one place where "is this a valid
   * agent" is answered, whoever wrote the draft.
   */
  it("leaves a half-written draft for the validator to refuse, rather than repairing it", () => {
    const r = parseRoster(JSON.stringify([{ name: "HALF" }]));
    assert.ok("agents" in r);
    assert.equal(r.agents[0]!.description, "");
    assert.ok(validateAgent(r.agents[0]!), "the validator refuses it");
  });
});

/**
 * The tool list is upstream's, not a copy of it.
 *
 * This test exists because the copy was wrong. `agent-file.ts` first restated
 * the allowed tools by hand and included `search`, which does not exist — so a
 * draft declaring it passed validation and produced an agent upstream loaded
 * with no tools at all. A test comparing two hand-written lists would have
 * agreed with itself; this one asserts the validator accepts exactly what
 * upstream's parser accepts, by running both.
 */
describe("the allowed tools come from upstream", () => {
  it("accepts every name upstream accepts, and no others", () => {
    for (const tool of KNOWN_TOOLS) {
      const md = agentMarkdown({ ...draft, tools: [tool], subagents: [] });
      assert.deepEqual(parseAgentDefinition("X", md).tools, [tool], `${tool} must survive both`);
      assert.equal(validateAgent({ ...draft, tools: [tool] }), null, `${tool} must validate`);
    }
    // The one that started it. `search` is plausible, absent, and was accepted.
    assert.ok(validateAgent({ ...draft, tools: ["search"] }), "search does not exist");
    assert.throws(() => parseAgentDefinition("X", agentMarkdown({ ...draft, tools: ["search"] })));
  });
});
