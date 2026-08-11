/**
 * The deixis prompt, tested without buying a turn.
 *
 * The claims worth holding are all about what goes *in front of* the question:
 * that the selected object is marked, that the record is there, that the goal is
 * labelled as a wish rather than smuggled in as fact, and that a trace with no
 * evidence is answered without a model at all.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answerWithoutEvidence, askPrompt, type AskInput } from "../src/ask.ts";

function input(over: Partial<AskInput> = {}): AskInput {
  return {
    title: "Ledger currency rewrite",
    goal: "rewrite the ledger so every amount carries its currency",
    state: "running",
    question: "why did this stop?",
    selection: { kind: "flow" },
    steps: [
      {
        index: 0,
        state: "done",
        intent: "Delegate to MigrationAgent: add the currency column",
        result: "added column `currency` to ledger_entries",
        attempts: [
          { n: 1, state: "done", error: null, observation: { digest: "a1", source: "captured" } },
        ],
      },
      {
        index: 1,
        state: "failed",
        intent: "Delegate to SchemaAgent: backfill",
        attempts: [
          { n: 1, state: "failed", error: "constraint violation on row 4021", observation: null },
          { n: 2, state: "failed", error: "constraint violation on row 4021", observation: { digest: "b2", source: "captured" } },
        ],
      },
    ],
    ...over,
  };
}

describe("what goes in front of the question", () => {
  it("carries the record: every attempt, its state and its error", () => {
    const p = askPrompt(input());
    assert.match(p.text, /step 1 \[failed\]/);
    assert.match(p.text, /attempt 1: failed · error: constraint violation on row 4021/);
    assert.match(p.text, /attempt 2: failed/);
  });

  it("marks the selected step, because that is the pronoun", () => {
    const p = askPrompt(input({ selection: { kind: "step", index: 1 } }));
    assert.match(p.text, /step 1 of the flow "Ledger currency rewrite", marked >>/);
    assert.match(p.text, /^>> step 1 /m);
    assert.match(p.text, /^ {3}step 0 /m);
  });

  it("labels the goal as intent and says which one wins", () => {
    const p = askPrompt(input());
    assert.match(p.text, /INTENT \(what was asked for, not what happened\)/);
    // The failure this guards: a fluent answer assembled from the goal, about
    // work that was never done.
    assert.match(p.text, /the RECORD is right and the INTENT is a wish/);
  });

  it("names refusal as an acceptable answer", () => {
    assert.match(askPrompt(input()).text, /the trace does not show that/);
  });

  it("says an attempt had no observation rather than omitting the line", () => {
    const p = askPrompt(input());
    assert.match(p.text, /no observation captured/);
  });
});

describe("how much there was to answer from", () => {
  it("counts attempts and results", () => {
    // 3 attempts + 1 result.
    assert.equal(askPrompt(input()).evidenceCount, 4);
  });

  it("is zero when nothing ran, and the answer needs no model", () => {
    const empty = input({
      steps: [{ index: 0, state: "pending", intent: "Delegate to X: do the thing" }],
    });
    assert.equal(askPrompt(empty).evidenceCount, 0);
    assert.match(askPrompt(empty).text, /nothing ran/);
    assert.match(answerWithoutEvidence(empty), /nothing in the trace to answer from/);
  });

  it("names the step when the selection was a step with no evidence", () => {
    const empty = input({
      steps: [{ index: 3, state: "pending", intent: "x" }],
      selection: { kind: "step", index: 3 },
    });
    assert.match(answerWithoutEvidence(empty), /Step 3 has no attempts/);
  });

  it("handles a flow with no steps without throwing", () => {
    const p = askPrompt(input({ steps: [] }));
    assert.equal(p.evidenceCount, 0);
    assert.match(p.text, /\(no steps\)/);
  });
});

describe("the shape of the answer, not just its source", () => {
  it("asks for plain prose, because the panel renders text and not markup", () => {
    // Found on a live instance: the model returned markdown and the desk showed
    // literal asterisks and backticks. Constraining the output is cheaper than
    // giving this panel a markdown parser it has not earned.
    const t = askPrompt(input()).text;
    assert.match(t, /No markdown, no asterisks, no backticks/);
    assert.match(t, /Answer in plain prose/);
  });
});
