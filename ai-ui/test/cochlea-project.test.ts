import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { lint, verifyNote } from "../../ai-flows/src/wiki.ts";
import {
  DECISION_COUNT,
  buildDecisionWiki,
  cochleaProjectFlows,
  supersededWithoutSuccessor,
} from "../src/cochlea-project.ts";

/**
 * The scope's second claim, and the one that needed a new check.
 *
 * `cochlea-demo.test.ts` guards the first claim — the demo's eigenvalues must
 * not drift from the Python suite's. This file guards the claim that the demo
 * makes about **memory**: that an index can pass every mechanical check the
 * product has and still be wrong about the project, because a corpus of
 * decisions has a time axis and the notes do not.
 *
 * A demo that asserted that without being able to demonstrate it would be
 * telling a story. So the load-bearing test here is the falsifiability one:
 * link the note to its successor and the check goes green. If it did not, the
 * red result would be a decoration rather than a measurement.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const DECISIONS_DIR = join(HERE, "..", "..", "projects", "coclea-sr", "decisions");

describe("the decision index passes everything the product can check", () => {
  it("every note verifies against the window it was written from", () => {
    const { notes } = buildDecisionWiki(false);
    for (const n of notes) {
      const complaints = verifyNote(n, { text: "x".repeat(n.chars), from: n.source.from });
      assert.deepEqual(complaints, [], `${n.id} failed verifyNote: ${complaints.join("; ")}`);
    }
  });

  it("lint is clean", () => {
    const { wiki } = buildDecisionWiki(false);
    assert.deepEqual(lint(wiki), []);
  });

  it("the index fits the window it was budgeted for", () => {
    const { wiki, notes } = buildDecisionWiki(false);
    assert.equal(notes.length, DECISION_COUNT);
    assert.ok(wiki.shards.length >= 1, "no shard was created");
    const indexed = wiki.shards.flatMap((s) => s.noteIds);
    assert.equal(indexed.length, notes.length, "a note was written and never indexed");
  });
});

describe("and is still wrong about the project", () => {
  it("names the note that records a reversed decision", () => {
    const { notes } = buildDecisionWiki(false);
    const complaints = supersededWithoutSuccessor(notes);
    assert.equal(complaints.length, 1, `expected exactly one, got ${complaints.length}`);
    assert.match(complaints[0]!, /n-adr-0001/);
    assert.match(complaints[0]!, /0002-the-place-code-needs-fluid-coupling/);
  });

  it("goes green once the note links to what replaced it — which is what makes the red one a measurement", () => {
    const { notes } = buildDecisionWiki(true);
    assert.deepEqual(supersededWithoutSuccessor(notes), []);
  });

  it("the defect is invisible to verifyNote in both directions", () => {
    // If `verifyNote` could see it, the argument collapses: the product would
    // already catch it and the new check would be redundant.
    for (const linked of [false, true]) {
      const { notes } = buildDecisionWiki(linked);
      const trap = notes.find((n) => n.id === "n-adr-0001")!;
      assert.deepEqual(
        verifyNote(trap, { text: "x".repeat(trap.chars), from: trap.source.from }),
        [],
        "verifyNote sees the supersession defect, so the scope's argument is wrong",
      );
    }
  });
});

describe("the corpus it indexes is the repository's, not invented", () => {
  it("every source file exists on disk", () => {
    // The point of indexing this corpus rather than a fictional one is that its
    // supersession is real. A note pointing at a decision that does not exist
    // would make the whole scope a drawing of an argument.
    if (!existsSync(DECISIONS_DIR)) return; // the project is optional in a bare checkout
    const onDisk = new Set(readdirSync(DECISIONS_DIR).filter((f) => f.endsWith(".md")));
    const { notes } = buildDecisionWiki(false);
    for (const n of notes) {
      const base = n.source.file.split("/").pop()!;
      assert.ok(onDisk.has(base), `${n.id} cites ${base}, which is not in decisions/`);
    }
  });
});

describe("the project in mid-development", () => {
  const flows = cochleaProjectFlows(1_800_000_000_000);

  it("carries a flow whose output was a decision and which stays blocked", () => {
    const f = flows.find((x) => x["id"] === "flow-place-code-falsified")!;
    assert.equal(f["state"], "blocked");
    const steps = f["steps"] as Array<Record<string, unknown>>;
    assert.ok(
      steps.some((s) => s["state"] === "failed"),
      "the falsification flow has no failed step, so nothing falsified anything",
    );
    // The last step must have succeeded: the flow is blocked because the result
    // cannot ship, not because the project stopped working.
    assert.equal(steps[steps.length - 1]!["state"], "done");
  });

  it("carries work actually in flight, not a finished thing pretending", () => {
    const f = flows.find((x) => x["id"] === "flow-pathology-signatures")!;
    const steps = f["steps"] as Array<Record<string, unknown>>;
    assert.equal(steps.filter((s) => s["state"] === "running").length, 1);
    assert.ok(steps.some((s) => s["state"] === "pending"), "nothing is pending");
    for (const s of steps) {
      if (s["state"] === "running" || s["state"] === "pending") {
        assert.equal(s["result"], null, "a step that has not finished is carrying a result");
      }
    }
  });

  it("every step of every flow declares a state the desk knows", () => {
    const known = new Set(["done", "failed", "pending", "running", "skipped"]);
    for (const f of flows) {
      for (const s of f["steps"] as Array<Record<string, unknown>>) {
        assert.ok(known.has(s["state"] as string), `unknown step state ${s["state"]}`);
      }
      assert.equal(
        f["done"],
        (f["steps"] as Array<Record<string, unknown>>).filter((s) => s["state"] === "done").length,
        `${f["id"]} publishes a done count that disagrees with its own steps`,
      );
    }
  });
});
