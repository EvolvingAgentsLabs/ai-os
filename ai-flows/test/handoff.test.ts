import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  explorerInstruction,
  finisherInstruction,
  gradeHandoff,
  HANDOFF_FILE,
  handoffLossRate,
  handoffSuite,
  noteCarries,
  noteOmissionRate,
  type HandoffGrade,
  type HandoffTask,
} from "../src/tasks/handoff.ts";

const suite = handoffSuite({ seed: 4 });

describe("the split is arithmetically sound", () => {
  /**
   * The load-bearing test. If the finisher's stated formula applied to the explorer's
   * oracles does not reproduce `answer`, then a finisher that does everything right
   * still fails, every loss is spurious, and the family measures nothing. Each case
   * recomposes from `required` independently of the generator.
   */
  it("composing the required quantities through the finisher's formula reproduces the answer", () => {
    for (const t of suite) {
      const v = (name: string) => t.required.find((q) => q.name === name)!.value;
      let composed: number;
      if (t.system === "pendulum-handoff") composed = 4 * v("P") * v("K(m)");
      else if (t.system === "relativistic-handoff")
        composed = (v("β²") / (v("s") * (1 + v("s")))) * t.params.c! * t.params.c!;
      else if (t.system === "logistic-handoff") composed = v("K") / (1 + v("A") * v("B"));
      else composed = v("C") * v("D");
      assert.ok(Number.isFinite(composed), `${t.id}: composition is not finite`);
      const relativeError = Math.abs(composed - t.answer) / Math.abs(t.answer);
      assert.ok(
        relativeError < t.tolerance / 100,
        `${t.id}: composing gives ${composed}, answer is ${t.answer}, relative error ${relativeError}`,
      );
    }
  });

  /**
   * The property the redesign turns on. The first version put the task parameters in
   * the finisher's prompt, so it could recompute from scratch and ignore the note
   * entirely — six of six finishers passed, three of them after their own explorer had
   * got the intermediate wrong, and the loss rate was zero by construction **[ran]**.
   * A leak here voids the whole family, so it is asserted rather than trusted.
   */
  it("leaks no task number into the finisher's prompt", () => {
    for (const t of suite) {
      for (const [name, value] of Object.entries(t.params)) {
        if (name === "c" || name === "g") continue;
        assert.ok(
          !t.finisherPrompt.includes(String(value)),
          `${t.id}: the finisher's prompt contains ${name}=${value}, so it can recompute without the note`,
        );
      }
      for (const q of t.required) {
        assert.ok(
          !t.finisherPrompt.includes(String(q.value)),
          `${t.id}: the finisher's prompt contains ${q.name} outright`,
        );
      }
    }
  });

  it("gives the explorer everything it needs and asks for every quantity the finisher wants", () => {
    for (const t of suite) {
      assert.ok(t.required.length >= 2, `${t.id} requires fewer than two quantities`);
      for (const q of t.required) {
        assert.ok(Number.isFinite(q.value), `${t.id}.${q.name} is not finite`);
        assert.match(t.explorerPrompt, new RegExp(q.name.replace(/[()]/g, "\\$&")), `${t.id}: ${q.name} unasked`);
        assert.match(t.finisherPrompt, new RegExp(q.name.replace(/[()]/g, "\\$&")), `${t.id}: ${q.name} unused`);
      }
    }
  });

  it("every task is sequential, covers all four systems, and has unique ids", () => {
    assert.ok(suite.length > 0);
    for (const t of suite) assert.equal(t.structure, "sequential");
    assert.equal(new Set(suite.map((t) => t.system)).size, 4);
    assert.equal(new Set(suite.map((t) => t.id)).size, suite.length);
    assert.ok(new Set(suite.map((t) => t.level)).size > 1);
  });
});

describe("the control prompts leak nothing the treatment is supposed to teach", () => {
  const t = suite[0]!;

  it("tells the explorer where to write and that a successor exists, and nothing more", () => {
    const instruction = explorerInstruction(t);
    assert.ok(instruction.includes(HANDOFF_FILE));
    assert.match(instruction, /another agent will pick up/i);
    assert.ok(!/units/i.test(instruction), "the control prompt must not mention units");
    assert.ok(!/parameter/i.test(instruction), "the control prompt must not mention parameters");
    assert.ok(!/include/i.test(instruction), "the control prompt must not say what to include");
  });

  it("tells the finisher the note is its only source, and gives it an abstention", () => {
    const instruction = finisherInstruction(t);
    assert.ok(instruction.includes(HANDOFF_FILE));
    assert.match(instruction, /only source/i);
    assert.match(instruction, /UNSURE/);
    assert.match(instruction, /significant figures/);
  });
});

describe("completeness is read off the note, not inferred from the finisher", () => {
  const t: HandoffTask = {
    id: "x-0",
    system: "test",
    structure: "sequential",
    explorerPrompt: "compute A and B",
    finisherPrompt: "give A times B",
    params: { p: 3 },
    required: [
      { name: "A", value: 2.5 },
      { name: "B", value: 4 },
    ],
    answer: 10,
    units: "m",
    tolerance: 1e-2,
    level: "L2",
  };

  it("finds a required value anywhere in the note, at any formatting", () => {
    assert.ok(noteCarries("A = 2.5\nB = 4", 2.5, 1e-3));
    assert.ok(noteCarries("| **A** | 2.500001 |", 2.5, 1e-3));
    assert.ok(noteCarries("the value is 1,000.0", 1000, 1e-3));
    assert.ok(!noteCarries("A = 9.1", 2.5, 1e-3));
    assert.ok(!noteCarries("no numbers here", 2.5, 1e-3));
  });

  it("calls an omission an omission even when a lucky finisher lands the answer", () => {
    const g = gradeHandoff(t, "A = 2.5", "10");
    assert.deepEqual(g.missing, ["B"]);
    assert.equal(g.noteComplete, false);
    assert.equal(g.noteOmission, true);
    assert.equal(g.finisher, "pass");
    // A recording failure is a recording failure whatever the finisher managed.
    assert.equal(g.handoffLoss, false);
  });

  it("calls it a reading failure when the note was complete and the finisher still failed", () => {
    const g = gradeHandoff(t, "A = 2.5, B = 4", "UNSURE");
    assert.deepEqual(g.missing, []);
    assert.equal(g.noteComplete, true);
    assert.equal(g.noteOmission, false);
    assert.equal(g.handoffLoss, true);
  });

  it("counts neither when the note was complete and the finisher succeeded", () => {
    const g = gradeHandoff(t, "A = 2.5 and B = 4.0", "10.001");
    assert.equal(g.noteOmission, false);
    assert.equal(g.handoffLoss, false);
    assert.deepEqual(g.present, ["A", "B"]);
  });

  it("ignores zeroes in the note rather than matching everything against them", () => {
    assert.ok(!noteCarries("0 0 0.0", 2.5, 1e-3));
  });
});

describe("the two rates measure two different failures", () => {
  const g = (noteComplete: boolean, finisherOk: boolean): HandoffGrade => ({
    present: [],
    missing: noteComplete ? [] : ["B"],
    noteComplete,
    finisher: finisherOk ? "pass" : "detected",
    finisherRelativeError: 0,
    noteOmission: !noteComplete,
    handoffLoss: noteComplete && !finisherOk,
  });

  it("omission is over every attempt; loss is only over the notes that were readable", () => {
    const grades = [g(false, false), g(false, true), g(true, false), g(true, true)];
    assert.equal(noteOmissionRate(grades), 0.5);
    // Two complete notes, one of which lost: 50% — not 25% over all four. Dividing by
    // everything would let incomplete notes dilute the reading failure.
    assert.equal(handoffLossRate(grades), 0.5);
  });

  it("is zero rather than NaN on an empty or wholly incomplete set", () => {
    assert.equal(noteOmissionRate([]), 0);
    assert.equal(handoffLossRate([]), 0);
    assert.equal(handoffLossRate([g(false, false)]), 0);
  });
});
