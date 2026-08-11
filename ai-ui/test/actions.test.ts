/**
 * Proposed actions, tested on the three claims that make them worth having:
 * they come from *this* state, they carry their cost, and a model can extend
 * them but never replace them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actionsFor,
  MAX_MODEL_ACTIONS,
  withModelActions,
  type ActionInput,
} from "../src/actions.ts";
import { digestOf } from "../src/zoom.ts";
import type { FlowTrace, TraceStep } from "../src/trace.ts";

const NOW = 1_760_000_000_000;

function step(over: Partial<TraceStep> = {}): TraceStep {
  return {
    index: 0,
    state: "pending",
    agent: "MigrationAgent",
    result: null,
    attempts: [],
    ...over,
  };
}

function input(steps: TraceStep[], over: Partial<FlowTrace> = {}): ActionInput {
  const trace: FlowTrace = {
    movement: "progressing",
    movementTone: "ok",
    detail: "4 observations",
    ignoredCount: 0,
    steps,
    ...over,
  };
  return {
    flowId: "f1",
    state: "running",
    trace,
    availableAgents: ["MigrationAgent", "ReviewAgent"],
    digest: digestOf(
      {
        flowId: "f1",
        title: "Ledger currency rewrite",
        state: "running",
        updatedAt: NOW,
        trace,
      },
      "flow",
      NOW,
    ),
  };
}

const ids = (a: ReturnType<typeof actionsFor>) => a.map((x) => x.id);

describe("the menu comes from this flow's state", () => {
  it("offers a fork before the step that failed, naming it", () => {
    const a = actionsFor(
      input([
        step({ index: 0, state: "done" }),
        step({ index: 1, state: "failed", agent: "SchemaAgent" }),
      ]),
    );
    const fork = a.find((x) => x.id === "fork-before-1");
    assert.ok(fork);
    assert.match(fork.why, /SchemaAgent/);
    assert.equal(fork.step, 1);
  });

  it("does not offer a fork when nothing failed", () => {
    const a = actionsFor(input([step({ state: "done" })]));
    assert.ok(!ids(a).some((i) => i.startsWith("fork")));
  });

  it("says to change the agent rather than retry when the flow is drifting", () => {
    const a = actionsFor(
      input([step({ state: "done" })], {
        movement: "drift — repeating itself",
        movementTone: "warn",
      }),
    );
    const drift = a.find((x) => x.id === "fork-drift");
    assert.ok(drift);
    // The point of the proposal: another attempt is predicted to be identical,
    // so offering "retry" here would be recommending the thing that failed.
    assert.match(drift.why, /third time/);
  });

  it("surfaces a broken handoff with the numbers behind it", () => {
    const a = actionsFor(
      input([
        step({
          index: 2,
          state: "done",
          ignoredInput: { carried: 3, inputTokens: 900 },
        }),
      ]),
    );
    const h = a.find((x) => x.id === "handoff-2");
    assert.ok(h);
    assert.match(h.why, /3 of 900 tokens/);
  });

  it("tells an empty flow what to do rather than showing an empty menu", () => {
    const a = actionsFor(input([]));
    assert.ok(ids(a).includes("empty"));
  });
});

describe("what is wrong comes before what is next", () => {
  it("ranks the failure above advancing", () => {
    const a = actionsFor(
      input([
        step({ index: 0, state: "failed", agent: "SchemaAgent" }),
        step({ index: 1, state: "pending", agent: "ReviewAgent" }),
      ]),
    );
    const order = ids(a);
    // Advancing first would bury the failure under the recommendation to
    // continue past it.
    assert.ok(order.indexOf("fork-before-0") < order.indexOf("advance"));
  });
});

describe("cost is on the proposal", () => {
  it("marks every action, and marks advancing as spending", () => {
    const a = actionsFor(input([step({ state: "pending" })]));
    for (const x of a) assert.equal(typeof x.spends, "boolean");
    assert.equal(a.find((x) => x.id === "advance")?.spends, true);
  });

  it("does not charge for collecting a run that was already paid for", () => {
    const a = actionsFor(input([step({ state: "running" })]));
    const c = a.find((x) => x.id === "collect");
    assert.ok(c);
    assert.equal(c.spends, false);
  });
});

describe("a model extends the menu and cannot replace it", () => {
  it("appends, keeping every computed action", () => {
    const computed = actionsFor(input([step({ state: "pending" })]));
    const merged = withModelActions(computed, [
      { label: "Split the ledger migration in two", why: "it is doing both" },
    ]);
    for (const c of computed)
      assert.ok(merged.some((m) => m.id === c.id && m.source === "state"));
    assert.equal(merged.at(-1)?.source, "model");
  });

  it("caps what a model may add, because a long menu is not a menu", () => {
    const computed = actionsFor(input([step()]));
    const merged = withModelActions(
      computed,
      Array.from({ length: 9 }, (_, i) => ({
        label: `idea ${i}`,
        why: "because",
      })),
    );
    assert.equal(
      merged.filter((m) => m.source === "model").length,
      MAX_MODEL_ACTIONS,
    );
  });

  it("degrades to the computed menu when the model returns nothing", () => {
    const computed = actionsFor(input([step()]));
    assert.deepEqual(withModelActions(computed, []), computed);
  });

  it("never lets a model proposal spend without a person choosing it", () => {
    const merged = withModelActions(actionsFor(input([step()])), [
      { label: "Run everything twice", why: "for luck" },
    ]);
    const m = merged.find((x) => x.source === "model");
    assert.equal(m?.spends, false);
    assert.equal(m?.route, null);
  });

  it("drops a model proposal that duplicates a computed one", () => {
    const computed = actionsFor(input([step({ state: "pending" })]));
    const dup = computed[0]!.label;
    const merged = withModelActions(computed, [
      { label: dup.toUpperCase(), why: "same thing" },
    ]);
    assert.equal(merged.filter((m) => m.source === "model").length, 0);
  });
});
