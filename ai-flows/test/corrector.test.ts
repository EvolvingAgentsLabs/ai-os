/**
 * The corrector's guards, which are the whole experiment.
 *
 * The rules themselves are not interesting to test — they are three checkers
 * over three fixtures. What is worth testing is the two ways the experiment
 * could produce a clean number that means nothing:
 *
 * - a correction that names the file or the value, so the second instance is
 *   answered by copying rather than by remembering;
 * - two "instances" that are the same work, so scoring the second is scoring a
 *   retry.
 *
 * Both are asserted for every rule, and both would otherwise be invisible: a
 * leaking correction makes the experiment *succeed*, which is exactly when
 * nobody looks.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOUSE_RULES,
  THE_CONTROL_ARM_STAYS_INERT,
  correctionLeaks,
  instancesAreDistinct,
  naiveAttempt,
  scoreSecond,
} from "../src/corrector.ts";

describe("the corrector cannot hand over the answer", () => {
  for (const rule of HOUSE_RULES) {
    it(`${rule.id}: the correction names no file and no value`, () => {
      assert.deepEqual(correctionLeaks(rule), [], "the correction gives away part of the answer");
    });

    it(`${rule.id}: the two instances are different work`, () => {
      assert.ok(instancesAreDistinct(rule), "the second instance is a retry of the first");
    });
  }
});

describe("each rule is failed by doing only the derivable half", () => {
  for (const rule of HOUSE_RULES) {
    for (const [i, instance] of rule.instances.entries()) {
      it(`${rule.id}[${i}]: the obvious attempt does not pass`, () => {
        const verdict = instance.check(naiveAttempt(instance));
        assert.equal(verdict.ok, false, "an agent with no knowledge of the rule would have passed");
        assert.ok(verdict.because, "a failure must say why, or it cannot be acted on");
      });
    }
  }
});

describe("each rule is passed by knowing it", () => {
  it("vendored: the change plus the ledger entry", () => {
    const [, second] = HOUSE_RULES[0]!.instances;
    const after = { ...naiveAttempt(second), "PATCHES.md": "# Patches\n\n- cache.ts: raised the limit\n" };
    assert.deepEqual(HOUSE_RULES[0]!.instances[1].check(after), { ok: true });
  });

  it("control arm: the passing answer is doing nothing at all", () => {
    const [, second] = THE_CONTROL_ARM_STAYS_INERT.instances;
    // Not "a smaller change" — no change. The rule has no partial credit,
    // which is what makes it impossible to satisfy by being generally careful.
    assert.deepEqual(second.check(second.before), { ok: true });
    assert.equal(second.check(naiveAttempt(second)).ok, false);
  });

  it("count: the test plus the number that nobody mentioned", () => {
    const [, second] = HOUSE_RULES[2]!.instances;
    const after = { ...naiveAttempt(second), "README.md": "# Package\n\n6 tests in this package.\n" };
    assert.deepEqual(scoreSecond(HOUSE_RULES[2]!, after), { rule: "the-published-count-follows-the-suite", ok: true });
  });
});

describe("the checkers do not need the corrector", () => {
  it("a verdict is a pure function of the workspace", () => {
    // Called twice on the same input with nothing else in scope. If a check
    // ever needed the corrector, the evaluation would be asking the thing
    // under test whether it was obeyed.
    for (const rule of HOUSE_RULES)
      for (const instance of rule.instances)
        assert.deepEqual(instance.check(instance.before), instance.check(instance.before));
  });
});
