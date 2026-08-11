/**
 * Semantic zoom, tested on the property that makes it worth having.
 *
 * The interesting assertions are not "it renders a summary". They are that the
 * summary **cannot quietly drop an attempt** and that it **never reports the
 * last thing as the outcome** — the two ways an aggregation lies while looking
 * clean.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  conserves,
  digestOf,
  type DigestInput,
  spanWords,
} from "../src/zoom.ts";
import type { FlowTrace, TraceStep } from "../src/trace.ts";

const NOW = 1_760_000_000_000;

function step(over: Partial<TraceStep> = {}): TraceStep {
  return {
    index: 0,
    state: "done",
    agent: "MigrationAgent",
    result: "ok",
    attempts: [],
    ...over,
  };
}

function attempts(n: number, state = "done") {
  return Array.from({ length: n }, (_, i) => ({
    n: i + 1,
    state,
    runId: `run-${i}`,
    digest: `d${i}`,
    source: "captured",
    error: null,
  }));
}

function input(over: Partial<DigestInput> = {}): DigestInput {
  const trace: FlowTrace = {
    movement: "progressing",
    movementTone: "ok",
    detail: "4 observations",
    ignoredCount: 0,
    steps: [step()],
    ...(over.trace ?? {}),
  };
  return {
    flowId: "f1",
    title: "Ledger currency rewrite",
    state: "running",
    updatedAt: NOW - 3 * 24 * 3600_000,
    ...over,
    trace,
  };
}

describe("fifteen attempts become one object, and the fifteen survive", () => {
  it("says how many attempts it stands for, not what the last one did", () => {
    const d = digestOf(
      input({
        trace: {
          movement: "progressing",
          movementTone: "ok",
          detail: "",
          ignoredCount: 0,
          steps: [step({ attempts: attempts(15) })],
        },
      }),
      "flow",
      NOW,
    );
    assert.equal(d.attemptsRepresented, 15);
    assert.match(d.headline, /15 attempt/);
  });

  it("counts attempts at the flow level even though it builds no children", () => {
    // The bug this guards: computing the total from `children`, which are not
    // built at `flow`, reports zero — a silent drop that reads as "nothing ran".
    const d = digestOf(
      input({
        trace: {
          movement: "",
          movementTone: "muted",
          detail: "",
          ignoredCount: 0,
          steps: [
            step({ index: 0, attempts: attempts(4) }),
            step({ index: 1, attempts: attempts(3) }),
          ],
        },
      }),
      "flow",
      NOW,
    );
    assert.equal(d.attemptsRepresented, 7);
    assert.equal(d.children.length, 0);
  });

  it("conserves the count across every level", () => {
    const trace: FlowTrace = {
      movement: "",
      movementTone: "muted",
      detail: "",
      ignoredCount: 0,
      steps: [
        step({ index: 0, attempts: attempts(5) }),
        step({ index: 1, attempts: attempts(2) }),
        step({ index: 2, attempts: [] }),
      ],
    };
    for (const level of ["flow", "step", "attempt"] as const) {
      const d = digestOf(input({ trace }), level, NOW);
      assert.equal(d.attemptsRepresented, 7, `total wrong at ${level}`);
      assert.ok(conserves(d), `dropped an attempt at ${level}`);
    }
  });

  it("catches a digest that dropped one, so the check is not vacuous", () => {
    const d = digestOf(
      input({
        trace: {
          movement: "",
          movementTone: "muted",
          detail: "",
          ignoredCount: 0,
          steps: [step({ attempts: attempts(3) })],
        },
      }),
      "step",
      NOW,
    );
    assert.ok(conserves(d));
    d.children[0]!.attemptsRepresented = 1;
    assert.equal(conserves(d), false);
  });
});

describe("where it landed, not what happened last", () => {
  it("reports done for a step that failed four times and then succeeded", () => {
    const d = digestOf(
      input({
        trace: {
          movement: "",
          movementTone: "muted",
          detail: "",
          ignoredCount: 0,
          steps: [
            step({
              state: "done",
              attempts: [...attempts(4, "failed"), ...attempts(1)],
            }),
          ],
        },
      }),
      "step",
      NOW,
    );
    assert.equal(d.children[0]!.landedOn, "done");
    assert.match(d.children[0]!.flags.join(" "), /failed attempt/);
  });

  it("refuses to call a running step an outcome", () => {
    const d = digestOf(
      input({
        trace: {
          movement: "",
          movementTone: "muted",
          detail: "",
          ignoredCount: 0,
          steps: [step({ state: "running", attempts: attempts(2) })],
        },
      }),
      "step",
      NOW,
    );
    assert.equal(d.children[0]!.landedOn, "still running");
  });

  it("names the blocked step at the flow level, because that is the question", () => {
    const d = digestOf(
      input({
        trace: {
          movement: "",
          movementTone: "muted",
          detail: "",
          ignoredCount: 0,
          steps: [
            step({ index: 0, state: "done", attempts: attempts(1) }),
            step({
              index: 1,
              state: "failed",
              agent: "SchemaAgent",
              attempts: attempts(2, "failed"),
            }),
          ],
        },
      }),
      "flow",
      NOW,
    );
    assert.match(d.landedOn, /failed at step 1 \(SchemaAgent\)/);
  });

  it("says nothing has run rather than inventing a state", () => {
    const d = digestOf(
      input({
        state: "draft",
        trace: {
          movement: "",
          movementTone: "muted",
          detail: "",
          ignoredCount: 0,
          steps: [step({ state: "pending", attempts: [] })],
        },
      }),
      "flow",
      NOW,
    );
    assert.match(d.headline, /nothing has run/);
    assert.equal(d.attemptsRepresented, 0);
  });
});

describe("a projection declares the window it represents", () => {
  it("carries `covering` at every level", () => {
    const d = digestOf(input(), "attempt", NOW);
    assert.match(d.covering, /3 days ago/);
    for (const c of d.children) assert.equal(c.covering, d.covering);
  });

  it("puts a warning verdict on the flow rather than leaving it in the trace", () => {
    const d = digestOf(
      input({
        trace: {
          movement: "drift — repeating itself",
          movementTone: "warn",
          detail: "",
          ignoredCount: 2,
          steps: [step({ attempts: attempts(6) })],
        },
      }),
      "flow",
      NOW,
    );
    assert.match(d.flags.join(" | "), /drift/);
    assert.match(d.flags.join(" | "), /2 step\(s\) used nothing/);
  });

  it("words a span the way somebody asking 'is this stale' would", () => {
    assert.equal(spanWords(30_000), "under a minute");
    assert.equal(spanWords(60_000), "1 minute");
    assert.equal(spanWords(3600_000), "1 hour");
    assert.equal(spanWords(72 * 3600_000), "3 days");
    assert.match(spanWords(-1), /future/);
  });
});
