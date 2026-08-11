/**
 * The signal lab.
 *
 * The scope exists to make one claim checkable: **the desk's instruments are not
 * about text**. So these tests check the claim rather than the pixels — that the
 * chain really is computed, that the broken one really is broken, that the
 * difference is one parameter, and above all that the desk's *usual* instrument
 * would have missed it. If prose overlap could catch this, the scope proves
 * nothing and should be deleted.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dspAgents, dspFlows } from "../src/dsp-demo.ts";
import { traceOf } from "../src/trace.ts";
import { agentOfIntent } from "../src/server.ts";
import { contributionsOf } from "../../ai-flows/src/contribution.ts";

const AT = 1_760_000_000_000;
const flows = () => dspFlows(AT);
const good = () => flows()[0]!;
const bad = () => flows()[1]!;
const stepOf = (f: ReturnType<typeof good>, agent: string) =>
  f.steps.find((s) => s.agent === agent)!;

describe("the chain that worked", () => {
  it("finds the 5 Hz tone it was asked for", () => {
    // The signal is a 5 Hz tone under a 23 Hz hum, at 64 Hz over 64 samples, so
    // the tone lands in bin 5 exactly. If this ever reads a different bin the
    // scenario has drifted from the arithmetic it claims to demonstrate.
    assert.match(stepOf(good(), "PeakAgent").result!, /bin 5 \(5\.0 Hz\)/);
  });

  it("carries a signal at every stage", () => {
    for (const s of good().steps) {
      assert.ok(s.contribution, `${s.agent} reported no measurement`);
      assert.ok(
        s.contribution!.carried > 0,
        `${s.agent} carried ${s.contribution!.carried}`,
      );
      assert.ok(Math.max(...s.series!.map(Math.abs)) > 0, `${s.agent} is empty`);
    }
  });
});

describe("the chain that did not", () => {
  it("is green from end to end and answers with nothing", () => {
    const f = bad();
    // Everything that ran, ran fine. That is the whole difficulty: no state on
    // this flow is anything but done, and the answer is confident and empty.
    for (const s of f.steps)
      assert.ok(["done", "pending"].includes(s.state), `${s.agent}: ${s.state}`);
    const spectrum = stepOf(f, "Radix2Agent").series!;
    assert.equal(Math.max(...spectrum.map(Math.abs)), 0);
  });

  it("loses the signal at the fixed-point conversion, and only there", () => {
    const f = bad();
    assert.equal(stepOf(f, "QuantiseAgent").contribution!.carried, 0);
    // The stages after it are perfectly sensitive functions. They were handed
    // zeros; they did not destroy anything. Flagging them would be blaming the
    // wrong stage, which is the failure this measurement exists to avoid.
    for (const agent of ["WindowAgent", "Radix2Agent"])
      assert.ok(stepOf(f, agent).contribution!.carried > 0, agent);
    assert.ok(stepOf(f, "NotchAgent").contribution!.carried > 0);
  });

  it("differs from the working chain by one number", () => {
    // Same code, same signal, same notch. If the two chains ever diverge in
    // anything else, the comparison stops being an argument about the defect.
    const a = stepOf(good(), "QuantiseAgent").result!;
    const b = stepOf(bad(), "QuantiseAgent").result!;
    assert.equal(a.replace("32767", "X"), b.replace("0.5", "X"));
    assert.equal(
      stepOf(good(), "NotchAgent").result,
      stepOf(bad(), "NotchAgent").result,
    );
  });
});

describe("why the desk's usual instrument is not enough", () => {
  it("prose overlap does not notice the stage that deleted the signal", () => {
    // The reason the whole scope is worth having. `contribution.ts` grades a
    // handoff by how many distinctive words of the previous result survive into
    // the next one -- and these reports are ordinary English about samples and
    // ranges, so they carry plenty. A text instrument cannot see an empty array.
    const verdicts = contributionsOf(
      bad()
        .steps.filter((s) => s.state === "done")
        .map((s) => ({ index: s.index, state: s.state, result: s.result })),
    );
    assert.deepEqual(
      verdicts.filter((v) => v.verdict === "ignored-input"),
      [],
      "prose overlap flagged something; the scope's argument needs re-checking",
    );
  });

  it("and the measured verdict reaches the trace, with its instrument named", () => {
    const trace = traceOf(bad().steps as never, agentOfIntent);
    assert.equal(trace.ignoredCount, 1);
    const flagged = trace.steps.find((s) => s.ignoredInput)!;
    assert.equal(flagged.agent, "QuantiseAgent");
    assert.match(flagged.ignoredInput!.note!, /output does not move/);
    // And the numbers travel with it, or the panel has nothing to draw.
    assert.equal(flagged.series!.length, 64);
  });
});

describe("the cast", () => {
  it("puts every agent in both chains, and one with no file behind it", () => {
    const names = dspAgents().map((a) => a.name);
    assert.ok(names.includes("CalibrationAgent"));
    assert.equal(dspAgents().filter((a) => a.missing).length, 1);
    for (const f of flows())
      for (const s of f.steps) assert.ok(names.includes(s.agent), s.agent);
  });

  it("is built the same way twice, so the page does not change on its own", () => {
    // No clock and no randomness in here: the demo is regenerated on every build
    // and a diff of demo/index.html has to mean something changed.
    assert.deepEqual(dspFlows(AT), dspFlows(AT));
  });
});
