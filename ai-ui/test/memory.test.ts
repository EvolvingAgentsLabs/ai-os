/**
 * The sketch, and the one property that makes a sketch safe to ship.
 *
 * `memory.ts` draws software that does not exist. The danger is not that it is
 * wrong — it is *meant* to be provisional — but that somebody reads it as built.
 * So the tests that matter here are about the marking, not the algorithm.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MEMORY_LEVELS, nextLevel, proposeNote } from "../src/memory.ts";
import { renderDeskHtml } from "../src/desk.ts";
import { propose } from "../src/layout.ts";

describe("a note proposed from a finished flow", () => {
  it("keeps what carried forward and drops what did not", () => {
    // The cheapest thing with the right shape: consolidation as a filter over
    // the steps `contribution.ts` already judged. Not the algorithm — the
    // interface.
    const note = proposeNote({
      id: "f1",
      title: "ledger rewrite",
      goal: "every amount carries its currency",
      steps: [
        {
          agent: "SchemaAgent",
          result: "a currency column, decimal 12,2",
          ignored: false,
        },
        { agent: "Filler", result: "ok", ignored: true },
      ],
    });
    assert.match(note.body, /SchemaAgent/);
    assert.ok(!note.body.includes("Filler:"));
    assert.match(note.body, /1 step\(s\) carried nothing forward/);
  });

  it("records where it came from, so it can be revisited", () => {
    // A note nobody can trace to the work that produced it is indistinguishable
    // from one somebody typed, and cannot be revisited when that work turns out
    // to have been wrong.
    const note = proposeNote({ id: "f1", title: "t", goal: "g", steps: [] });
    assert.deepEqual(note.from, ["f1"]);
    assert.equal(note.level, "flow");
  });
});

describe("promotion", () => {
  it("goes one rung at a time and stops at the top", () => {
    assert.equal(nextLevel("flow"), "project");
    assert.equal(nextLevel("project"), "user");
    assert.equal(nextLevel("user"), "system");
    assert.equal(nextLevel("system"), null);
  });

  it("declares four levels, longest-lived first", () => {
    assert.deepEqual(
      MEMORY_LEVELS.map((l) => l.level),
      ["system", "user", "project", "flow"],
    );
  });
});

describe("the page says it is not built", () => {
  it("stamps the drawer, on the object rather than in a footnote", () => {
    // The rule this whole file lives under. A surface that draws a sketch the
    // same way it draws measured state teaches its reader to trust both
    // equally, and the trustworthy half is the one that loses.
    const html = renderDeskHtml({
      scopeId: "group:p",
      scopeLabel: "group:p",
      harness: "pi",
      at: 1,
      docs: [],
      agents: [],
      people: [],
      notes: [],
      memoryLevels: MEMORY_LEVELS,
      scopes: [],
      layout: propose({ scopeId: "group:p", flows: [], agents: [] }, null),
    });
    assert.match(html, /Not built — this is the spec/);
  });

  it("draws memory cards dashed, never like a document", () => {
    const html = renderDeskHtml({
      scopeId: "group:p",
      scopeLabel: "group:p",
      harness: "pi",
      at: 1,
      docs: [],
      agents: [],
      people: [],
      notes: [],
      memoryLevels: MEMORY_LEVELS,
      scopes: [],
      layout: propose({ scopeId: "group:p", flows: [], agents: [] }, null),
    });
    assert.match(html, /\.card\{[^}]*border:1px dashed/);
  });
});
