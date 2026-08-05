import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  explorerInstruction,
  finisherInstruction,
  gradeHandoff,
  HANDOFF_FILE,
  handoffLossRate,
  handoffSuite,
  type HandoffGrade,
  type HandoffTask,
} from "../src/tasks/handoff.ts";

const suite = handoffSuite({ seed: 4 });

describe("the split is arithmetically sound", () => {
  /**
   * The load-bearing test. If the finisher's stated formula applied to the explorer's
   * oracle does not reproduce `answer`, then a finisher that does everything right
   * still fails, every handoffLoss is spurious, and the family measures nothing.
   * Each case recomputes the composition independently of the generator.
   */
  it("composing the intermediate through the finisher's formula reproduces the answer", () => {
    for (const t of suite) {
      const p = t.params;
      let composed: number;
      if (t.system === "pendulum-handoff") {
        composed = 4 * Math.sqrt(p.lengthM! / p.g!) * t.intermediate;
      } else if (t.system === "relativistic-handoff") {
        composed = ((p.beta! * p.beta!) / (t.intermediate * (1 + t.intermediate))) * p.c! * p.c!;
      } else if (t.system === "logistic-handoff") {
        composed = p.kCap! / (1 + ((p.kCap! - p.n0!) / p.n0!) * t.intermediate);
      } else {
        composed = ((p.vT! * p.vT!) / p.g!) * t.intermediate;
      }
      assert.ok(Number.isFinite(composed), `${t.id}: composition is not finite`);
      const relativeError = Math.abs(composed - t.answer) / Math.abs(t.answer);
      assert.ok(
        relativeError < t.tolerance / 100,
        `${t.id}: composing gives ${composed}, answer is ${t.answer}, relative error ${relativeError}`,
      );
    }
  });

  it("states its parameters as data, so no consumer has to parse them out of prose", () => {
    for (const t of suite) {
      assert.ok(Object.keys(t.params).length >= 2, `${t.id} carries no parameters`);
      for (const [k, v] of Object.entries(t.params)) {
        assert.ok(Number.isFinite(v), `${t.id}.params.${k} is not finite`);
        assert.match(t.finisherPrompt, new RegExp(String(v).replace(".", "\\.")), `${t.id}: ${k}=${v} not in prompt`);
      }
    }
  });

  it("every task is sequential and carries both oracles", () => {
    assert.ok(suite.length > 0);
    for (const t of suite) {
      assert.equal(t.structure, "sequential");
      assert.ok(Number.isFinite(t.intermediate));
      assert.ok(Number.isFinite(t.answer));
      assert.ok(t.tolerance > 0);
      assert.ok(t.units.length > 0);
    }
  });

  it("covers all four systems and produces more than one level", () => {
    const systems = new Set(suite.map((t) => t.system));
    assert.equal(systems.size, 4);
    assert.ok(new Set(suite.map((t) => t.level)).size > 1);
  });

  it("gives ids that are unique, which the runner keys threads on", () => {
    assert.equal(new Set(suite.map((t) => t.id)).size, suite.length);
  });
});

describe("the control prompts leak nothing the treatment is supposed to teach", () => {
  const t = suite[0]!;

  it("tells the explorer where to write and that a successor exists, and nothing more", () => {
    const instruction = explorerInstruction(t);
    assert.ok(instruction.includes(HANDOFF_FILE));
    assert.match(instruction, /another agent will pick up/i);
    // The whole content of the treatment arm. If any of it appears here the
    // comparison is over before it starts.
    assert.ok(!/units/i.test(instruction), "the control prompt must not mention units");
    assert.ok(!/parameter/i.test(instruction), "the control prompt must not mention parameters");
    assert.ok(!/include/i.test(instruction), "the control prompt must not say what to include");
  });

  it("gives the finisher the formula, the file, and an abstention it can use", () => {
    const instruction = finisherInstruction(t);
    assert.ok(instruction.includes(HANDOFF_FILE));
    assert.match(instruction, /UNSURE/);
    assert.match(instruction, /significant figures/);
    assert.ok(instruction.includes(t.units));
  });
});

describe("grading tells a broken chain apart from a lost handoff", () => {
  const t: HandoffTask = {
    id: "x-0",
    system: "test",
    structure: "sequential",
    explorerPrompt: "compute the thing",
    finisherPrompt: "finish the thing",
    params: { a: 1, b: 2 },
    intermediate: 2,
    intermediateUnits: "dimensionless",
    answer: 10,
    units: "m",
    tolerance: 1e-2,
    level: "L2",
  };

  it("calls it a handoff loss only when the explorer was right and the finisher was not", () => {
    const lost = gradeHandoff(t, "2", "UNSURE");
    assert.equal(lost.explorer, "pass");
    assert.equal(lost.finisher, "detected");
    assert.equal(lost.handoffLoss, true);
  });

  it("does not blame the handoff when the explorer got its own part wrong", () => {
    const broken = gradeHandoff(t, "7", "UNSURE");
    assert.equal(broken.explorer, "undetected");
    assert.equal(broken.handoffLoss, false, "a chain broken before the handoff says nothing about handoffs");
  });

  it("does not blame the handoff when the finisher succeeded", () => {
    const fine = gradeHandoff(t, "2", "10.001");
    assert.equal(fine.finisher, "pass");
    assert.equal(fine.handoffLoss, false);
  });

  it("grades the explorer looser than the finisher, so its rounding is not a loss", () => {
    // Off by 5e-3 relative: inside the finisher's 1e-2 bar, outside the explorer's
    // 1e-3 one. Anything tighter would count usable handoffs as broken chains.
    const rounded = gradeHandoff(t, "2.01", "10.001");
    assert.equal(rounded.explorer, "undetected");
    assert.equal(rounded.handoffLoss, false);
    const exact = gradeHandoff(t, "2.0001", "10.001");
    assert.equal(exact.explorer, "pass");
  });

  it("reads an abstention and unparseable prose as detected, not as a wrong number", () => {
    assert.equal(gradeHandoff(t, "unsure", "10").explorer, "detected");
    assert.equal(gradeHandoff(t, "2", "the note does not say which quantity this is").finisher, "detected");
  });
});

describe("the loss rate is conditioned on reaching the handoff", () => {
  const g = (explorer: HandoffGrade["explorer"], handoffLoss: boolean): HandoffGrade => ({
    explorer,
    finisher: handoffLoss ? "detected" : "pass",
    explorerRelativeError: 0,
    finisherRelativeError: 0,
    handoffLoss,
  });

  it("divides by the chains that arrived intact, not by every attempt", () => {
    // Two reached the handoff and one was lost: 50%, not 25%. Dividing by all four
    // would let a bad explorer hide a bad handoff.
    const rate = handoffLossRate([g("pass", true), g("pass", false), g("undetected", false), g("detected", false)]);
    assert.equal(rate, 0.5);
  });

  it("is zero rather than NaN when nothing reached the handoff", () => {
    assert.equal(handoffLossRate([g("undetected", false)]), 0);
    assert.equal(handoffLossRate([]), 0);
  });
});
