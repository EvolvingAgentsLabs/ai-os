/**
 * How many of an agent the desk draws.
 *
 * These rules ship as source text and are **executed** here rather than
 * paraphrased, for the same reason the mascot's brain is: a test that
 * re-implements the rule in TypeScript passes while the page ships the old one.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREATURES_JS } from "../src/creatures.ts";

type Step = { index: number; state: string; agent: string | null };
type Doc = { id: string; steps: Step[] };
type Creatures = {
  agentInstances: (
    docs: Doc[],
    name: string,
  ) => Array<{ flowId: string; steps: number }>;
  agentDoing: (
    docs: Doc[],
    name: string,
    flowId: string | null,
  ) => { doc: Doc; step: Step } | null;
  creatureKey: (name: string, flowId: string | null) => string;
};

const c: Creatures = new Function(
  `${CREATURES_JS}\nreturn { agentInstances, agentDoing, creatureKey };`,
)() as Creatures;

const step = (index: number, agent: string | null, state = "pending"): Step => ({
  index,
  state,
  agent,
});

const world = (): Doc[] => [
  {
    id: "flow-ledger",
    steps: [
      step(0, "SchemaAgent", "done"),
      step(1, "MigrationAgent", "done"),
      step(2, "ReviewAgent"),
    ],
  },
  { id: "flow-duplicates", steps: [step(0, "DataQualityAgent")] },
];

describe("one creature per document an agent has work in", () => {
  it("draws one where there is one", () => {
    assert.deepEqual(c.agentInstances(world(), "SchemaAgent"), [
      { flowId: "flow-ledger", steps: 1 },
    ]);
  });

  it("draws two when the agent holds steps in two documents", () => {
    // The case the single cube could not express: the layout named one flow, so
    // the picture put the agent there and said nothing about the other.
    const docs = world();
    docs[1]!.steps.push(step(1, "SchemaAgent"));
    assert.deepEqual(c.agentInstances(docs, "SchemaAgent"), [
      { flowId: "flow-ledger", steps: 1 },
      { flowId: "flow-duplicates", steps: 1 },
    ]);
  });

  it("counts a queue as a multiplier, not as more bodies", () => {
    const docs = world();
    docs[0]!.steps.push(step(3, "SchemaAgent"), step(4, "SchemaAgent"));
    assert.deepEqual(c.agentInstances(docs, "SchemaAgent"), [
      { flowId: "flow-ledger", steps: 3 },
    ]);
  });

  it("draws none for an agent nothing has asked for", () => {
    assert.deepEqual(c.agentInstances(world(), "AnomalyScanner"), []);
    assert.deepEqual(c.agentInstances([], "SchemaAgent"), []);
  });

  it("ignores steps with no agent behind them", () => {
    const docs: Doc[] = [{ id: "f", steps: [step(0, null), step(1, null)] }];
    assert.deepEqual(c.agentInstances(docs, "SchemaAgent"), []);
  });
});

describe("what one instance is doing", () => {
  it("is the running step in its own document, and nothing from another", () => {
    const docs = world();
    docs[0]!.steps[2]!.state = "running";
    docs[1]!.steps.push(step(1, "ReviewAgent"));

    const busy = c.agentDoing(docs, "ReviewAgent", "flow-ledger");
    assert.equal(busy?.step.index, 2);
    // The same agent, idle in the other flow. One creature works, one waits --
    // drawing both as busy is the lie the single cube used to tell.
    assert.equal(c.agentDoing(docs, "ReviewAgent", "flow-duplicates"), null);
  });

  it("is null when the agent is only pending or done", () => {
    assert.equal(c.agentDoing(world(), "SchemaAgent", "flow-ledger"), null);
    assert.equal(c.agentDoing(world(), "ReviewAgent", "flow-ledger"), null);
  });
});

describe("the identity that lets a creature move instead of blink", () => {
  it("is per agent and document, and stable", () => {
    assert.equal(c.creatureKey("SchemaAgent", "f1"), "SchemaAgent@f1");
    assert.equal(c.creatureKey("SchemaAgent", "f1"), "SchemaAgent@f1");
    assert.notEqual(
      c.creatureKey("SchemaAgent", "f1"),
      c.creatureKey("SchemaAgent", "f2"),
    );
  });

  it("is the bare name for an agent with no work", () => {
    assert.equal(c.creatureKey("SchemaAgent", null), "SchemaAgent");
  });
});
