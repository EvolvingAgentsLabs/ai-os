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
import { KNOWN_TOOLS, agentMarkdown, agentPath, validateAgent } from "../src/agent-file.ts";
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
    assert.match(String(why), new RegExp(KNOWN_TOOLS[0]));
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
