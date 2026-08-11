/**
 * The trace, which is the half of this pair that is real.
 *
 * `memory.test.ts` covers the sketch. These assert that what the desk shows
 * about what happened is computed from the flow store, with `ai-flows`' own
 * instruments, and does not quietly invent a verdict where those instruments
 * declined to give one.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type RawStep, traceOf } from "../src/trace.ts";

const agentOf = (intent: string) => /agent="([^"]+)"/.exec(intent)?.[1] ?? null;

const step = (index: number, over: Partial<RawStep> = {}): RawStep => ({
  index,
  state: "done",
  intent: `Call your \`delegate\` tool with agent="A${index}".`,
  result: `result ${index}`,
  attempts: [
    {
      n: 1,
      state: "done",
      runId: `run-${index}0000000`,
      error: null,
      observation: { digest: `digest${index}`, source: "run.reply" },
    },
  ],
  ...over,
});

describe("what happened, from the store", () => {
  it("carries every attempt and its observation digest", () => {
    // The digest is the whole basis of the drift verdict. A trace that shows
    // steps without them is a prettier skeleton, not a trace.
    const t = traceOf([step(0), step(1)], agentOf);
    assert.equal(t.steps[0]!.attempts.length, 1);
    assert.equal(t.steps[0]!.attempts[0]!.digest, "digest0");
    assert.equal(t.steps[0]!.attempts[0]!.source, "run.reply");
  });

  it("names the agent of each step", () => {
    const t = traceOf([step(0)], agentOf);
    assert.equal(t.steps[0]!.agent, "A0");
  });

  it("says 'not enough to say' below two observations rather than 'fine'", () => {
    // doc/10's asymmetry: a repeat is proof, a difference is a rumour, and too
    // few observations is neither. Rounding that to "progressing" is the lie.
    const t = traceOf([step(0)], agentOf);
    assert.equal(t.movement, "not enough to say");
    assert.equal(t.movementTone, "muted");
  });

  it("reports drift when the fingerprints repeat", () => {
    const same = (i: number) =>
      step(i, {
        attempts: [
          {
            n: 1,
            state: "done",
            runId: "r",
            error: null,
            observation: { digest: "same", source: "run.reply" },
          },
        ],
      });
    const t = traceOf([same(0), same(1), same(2)], agentOf);
    assert.match(t.movement, /drift/);
    assert.equal(t.movementTone, "warn");
  });

  it("quotes the measured bound alongside the verdict, never a bare word", () => {
    const t = traceOf([step(0), step(1)], agentOf);
    assert.match(t.detail, /δ ≤ 14\.6%/);
  });
});

describe("the step that used nothing it was given", () => {
  it("flags it, with the numbers behind the flag", () => {
    // doc/13's headline. Every other signal on the card says the flow is fine.
    const rich = step(0, {
      result:
        "the ledger table needs a currency column typed decimal precision twelve scale two, " +
        "backfilled from settlement records, indexed alongside merchant identifier and posting timestamp",
    });
    const barren = step(1, { result: "ok" });
    const t = traceOf([rich, barren], agentOf);
    assert.equal(t.ignoredCount, 1);
    const flagged = t.steps.find((s) => s.ignoredInput);
    assert.equal(flagged!.index, 1);
    assert.ok(flagged!.ignoredInput!.inputTokens > 0);
  });

  it("does not flag a step that carried the words forward", () => {
    const rich = step(0, {
      result:
        "the ledger table needs a currency column typed decimal precision twelve scale two, backfilled",
    });
    const carried = step(1, {
      result:
        "added the currency column to the ledger table, decimal twelve two",
    });
    const t = traceOf([rich, carried], agentOf);
    assert.equal(t.ignoredCount, 0);
  });

  it("flags nothing when there was too little input to judge", () => {
    // `contribution.ts` refuses below MIN_INPUT_TOKENS. Rendering that refusal
    // as a pass would invent the verdict it declined to give — the same failure
    // as scoring "The answer is 24." wrong, in the other direction.
    const t = traceOf(
      [step(0, { result: "24" }), step(1, { result: "ok" })],
      agentOf,
    );
    assert.equal(t.ignoredCount, 0);
    assert.equal(t.steps[1]!.ignoredInput, undefined);
  });
});

describe("a measurement from whoever ran the step", () => {
  const step = (
    index: number,
    result: string,
    contribution?: { carried: number; inputTokens: number; note?: string },
    series?: number[],
  ) => ({
    index,
    state: "done",
    intent: 'agent="StageAgent"',
    result,
    attempts: [],
    ...(contribution ? { contribution } : {}),
    ...(series ? { series } : {}),
  });

  const agentOf = () => "StageAgent";

  it("wins over prose overlap, and says which instrument spoke", () => {
    // Prose overlap is the fallback for when nothing better exists. A step whose
    // output was numbers has something better: the runner can answer "does my
    // output move when my input does", and its answer is about the thing that
    // actually broke.
    const t = traceOf(
      [
        step(0, "Read 64 samples at 64 Hz off sensor-7. Peak amplitude 1.26."),
        step(
          1,
          "Converted 64 samples to fixed point. Range respected, nothing clipped.",
          { carried: 0, inputTokens: 64, note: "its output does not move when its input does" },
          [0, 0, 0, 0],
        ),
      ],
      agentOf,
    );
    assert.equal(t.ignoredCount, 1);
    assert.equal(t.steps[1]!.ignoredInput!.carried, 0);
    assert.match(t.steps[1]!.ignoredInput!.note!, /does not move/);
    assert.deepEqual(t.steps[1]!.series, [0, 0, 0, 0]);
  });

  it("clears a step the word counter would have flagged", () => {
    // Two reports with no distinctive word in common, and a runner that measured
    // the handoff and found it fine. Running both instruments and picking would
    // be two verdicts about one handoff; the measured one is the only one that
    // looked at what the step actually passed on.
    const t = traceOf(
      [
        step(0, "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima"),
        step(1, "Converted the window into fixed point.", {
          carried: 0.83,
          inputTokens: 64,
          note: "output moved 0.830x its input",
        }),
      ],
      agentOf,
    );
    assert.equal(t.ignoredCount, 0);
    assert.equal(t.steps[1]!.ignoredInput, undefined);
  });

  it("still reads prose for steps nobody measured", () => {
    const t = traceOf(
      [
        step(0, "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima"),
        step(1, "Looks fine to me."),
      ],
      agentOf,
    );
    assert.equal(t.ignoredCount, 1);
    assert.equal(t.steps[1]!.ignoredInput!.note, undefined);
  });
});
