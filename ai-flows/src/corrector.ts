/**
 * The synthetic corrector: a rule the agent cannot derive from the task.
 *
 * ## Why this exists
 *
 * [doc/05 § Experiment 3](../../doc/05-ai-storage.md) recorded four memory
 * instruments that all returned nulls, and the property they shared:
 *
 * > the correct behaviour was derivable from information the task already
 * > contained. Where the answer is derivable, a learned strategy adds nothing,
 * > because the model simply derives it.
 *
 * So a memory experiment needs a task whose correct behaviour is **not**
 * derivable — which means it has to depend on something outside the model.
 * Arbitrary organisational convention is the cleanest such thing there is, and
 * this repository is full of it, already enforced by CI.
 *
 * The three rules below are miniatures of three real ones:
 *
 * | here | the real one it mirrors |
 * |---|---|
 * | a change under `vendored/` must be recorded in `PATCHES.md` | `.github/workflows/ci.yml` — `ai-base/AI-OS-PATCHES.md` |
 * | `plain-view.ts` must stay inert | `test/view.test.ts` — `src/view.ts` is M5's control arm |
 * | the published count follows the suite | `scripts/check-test-count.sh` |
 *
 * Miniatures rather than the repository itself, so that a run is seconds and
 * repeatable. The **rules** are real; the workspace is a fixture with the same
 * shape.
 *
 * ## The two ways this experiment can cheat, and where each is stopped
 *
 * **A correction that contains the answer teaches nothing — it is a hint being
 * copied.** So a rule states itself in general terms and never names the file
 * or the value. That is not left to authorial care: `correctionLeaks` checks
 * it, and a test asserts it for every rule.
 *
 * **Scoring a retry of the corrected instance measures short-term
 * instruction-following, not memory.** So a rule carries exactly two instances
 * and the scored one is always the second. There is deliberately no function
 * here that re-runs the first — the shape of the API is the guard.
 *
 * The third requirement — that the rule be checkable without the corrector —
 * is why every `check` below is pure code over the workspace and never a model
 * call. An evaluation that has to ask the corrector whether the corrector was
 * obeyed is circular.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** A workspace is its files. Paths are relative and always `/`-separated. */
export type Workspace = Readonly<Record<string, string>>;

export interface Verdict {
  ok: boolean;
  /** Why it failed, in the checker's words. Never shown to the agent. */
  because?: string;
}

export interface RuleInstance {
  /** What the agent is asked to do. Contains no hint of the rule. */
  task: string;
  before: Workspace;
  /** Deterministic, and computable by someone who has never seen the corrector. */
  check(after: Workspace): Verdict;
}

export interface HouseRule {
  id: string;
  /**
   * The rule in general terms, as the corrector would state it.
   *
   * It says what class of thing must happen. It never says which file, which
   * line, or which value — see `correctionLeaks`.
   */
  correction: string;
  /**
   * Two instances. The first is attempted and corrected; **the second is the
   * one that is scored**, and it is a different file with a different value so
   * that answering it is not repeating an answer.
   */
  instances: readonly [RuleInstance, RuleInstance];
}

// ---- rule 1: a change under vendored/ must be recorded --------------------

const ledger = (lines: readonly string[]) =>
  ["# Patches to vendored code", "", "Every change we make under `vendored/` is listed here.", "", ...lines].join("\n");

function vendoredInstance(file: string, from: string, to: string): RuleInstance {
  const path = `vendored/${file}`;
  return {
    task: `In ${path}, change the value ${from} to ${to}.`,
    before: {
      [path]: `export const setting = ${from};\n`,
      "PATCHES.md": ledger([]),
    },
    check(after) {
      const src = after[path] ?? "";
      if (!src.includes(to)) return { ok: false, because: "the asked-for change was not made" };
      const recorded = (after["PATCHES.md"] ?? "").includes(file);
      // The change alone is the obvious, derivable half. The ledger entry is
      // the half that only this organisation asks for.
      if (!recorded) return { ok: false, because: `${file} is not named in PATCHES.md` };
      return { ok: true };
    },
  };
}

export const VENDORED_CHANGES_ARE_RECORDED: HouseRule = {
  id: "vendored-changes-are-recorded",
  correction:
    "A change to code we vendor from elsewhere is only half done when the code changes. " +
    "This project keeps a ledger of every such change, and an unrecorded one is treated as a defect.",
  instances: [vendoredInstance("http.ts", "30", "60"), vendoredInstance("cache.ts", "512", "1024")],
};

// ---- rule 2: the control arm stays inert ----------------------------------

const CONTROL = "export function render(rows: string[]): string {\n  return rows.join(\"\\n\");\n}\n";

function inertInstance(path: string, ask: string): RuleInstance {
  return {
    task: ask,
    before: { [path]: CONTROL, "NOTES.md": "# Surfaces\n\nTwo of them.\n" },
    check(after) {
      // The correct behaviour is inaction, which is the hardest thing to
      // derive and the easiest thing to test.
      if ((after[path] ?? "") !== CONTROL) return { ok: false, because: `${path} was modified` };
      return { ok: true };
    },
  };
}

export const THE_CONTROL_ARM_STAYS_INERT: HouseRule = {
  id: "the-control-arm-stays-inert",
  correction:
    "One of the two report surfaces is the control arm of a measurement that is still running. " +
    "It is evidence only while it stays exactly as it is, so improvements to it are refused, " +
    "however good they are.",
  instances: [
    inertInstance("ui/plain-view.ts", "Make ui/plain-view.ts easier to use: add sorting."),
    inertInstance("ui/flat-list.ts", "Add filtering to ui/flat-list.ts so long reports are usable."),
  ],
};

// ---- rule 3: the published count follows the suite ------------------------

function countInstance(dir: string, existing: number): RuleInstance {
  const files: Record<string, string> = {
    "README.md": `# Package\n\n${existing} tests in this package.\n`,
  };
  for (let i = 1; i <= existing; i += 1) files[`${dir}/case${i}.test.ts`] = `test("case ${i}", () => {});\n`;
  return {
    task: `Add a test in ${dir}/ covering the empty-input case.`,
    before: files,
    check(after) {
      const tests = Object.keys(after).filter((p) => p.startsWith(`${dir}/`) && p.endsWith(".test.ts"));
      if (tests.length <= existing) return { ok: false, because: "no test was added" };
      const claimed = Number(/(\d+) tests in this package/.exec(after["README.md"] ?? "")?.[1] ?? NaN);
      // Adding a test is unambiguously good everywhere else. Here it is a
      // defect unless a counter nobody mentioned moves with it.
      if (claimed !== tests.length)
        return { ok: false, because: `README says ${claimed}, the suite has ${tests.length}` };
      return { ok: true };
    },
  };
}

export const THE_PUBLISHED_COUNT_FOLLOWS_THE_SUITE: HouseRule = {
  id: "the-published-count-follows-the-suite",
  correction:
    "This project publishes the size of its suite in prose, and a published number that " +
    "nothing verifies is how three different truths end up on the same page. A change to the suite " +
    "is incomplete until every published count agrees with it.",
  instances: [countInstance("checks", 3), countInstance("probes", 5)],
};

export const HOUSE_RULES: readonly HouseRule[] = [
  VENDORED_CHANGES_ARE_RECORDED,
  THE_CONTROL_ARM_STAYS_INERT,
  THE_PUBLISHED_COUNT_FOLLOWS_THE_SUITE,
];

// ---- the guards -----------------------------------------------------------

/**
 * Does the correction give away the answer?
 *
 * A correction may describe the *class* of thing required. It may not name a
 * path, a filename or a literal that appears in the instance — because then the
 * later instance is answered by copying, and what is measured is reading
 * comprehension.
 *
 * Compared against the instance's own vocabulary rather than a hand-written
 * denylist: a denylist is a promise to remember, and this is the failure it
 * would be remembering to prevent.
 */
export function correctionLeaks(rule: HouseRule): string[] {
  const said = rule.correction.toLowerCase();
  const leaked = new Set<string>();
  for (const instance of rule.instances) {
    for (const path of Object.keys(instance.before)) {
      for (const part of [path, ...path.split("/")]) {
        const bare = part.replace(/\.[a-z.]+$/, "");
        if (bare.length >= 4 && said.includes(bare.toLowerCase())) leaked.add(part);
      }
    }
    for (const literal of instance.task.match(/\b\d{2,}\b/g) ?? []) if (said.includes(literal)) leaked.add(literal);
  }
  return [...leaked].sort();
}

/**
 * Are a rule's two instances actually different work?
 *
 * If they share their files, the second is a retry wearing another name and the
 * experiment measures instruction-following. This is the structural half of the
 * guard; the API shape — always score `instances[1]` — is the other half.
 */
export function instancesAreDistinct(rule: HouseRule): boolean {
  const [a, b] = rule.instances;
  const pathsA = Object.keys(a.before).filter((p) => !["README.md", "PATCHES.md", "NOTES.md"].includes(p));
  const pathsB = Object.keys(b.before).filter((p) => !["README.md", "PATCHES.md", "NOTES.md"].includes(p));
  return pathsA.length > 0 && pathsB.length > 0 && !pathsA.some((p) => pathsB.includes(p));
}

/** The workspace an agent that did only the obvious half would leave behind. */
export function naiveAttempt(instance: RuleInstance): Workspace {
  const after: Record<string, string> = { ...instance.before };
  const target = /\b([\w/.-]+\.ts)\b/.exec(instance.task)?.[1];
  const change = /change the value (\d+) to (\d+)/.exec(instance.task);
  if (change && target) after[target] = (after[target] ?? "").replace(change[1]!, change[2]!);
  else if (target && after[target] !== undefined) after[target] = (after[target] ?? "") + "// improved\n";
  else {
    const dir = /in (\w+)\//.exec(instance.task)?.[1];
    if (dir) after[`${dir}/empty-input.test.ts`] = 'test("empty input", () => {});\n';
  }
  return after;
}

export interface Scored {
  rule: string;
  /** The verdict on `instances[1]`. `instances[0]` is never scored. */
  ok: boolean;
  because?: string;
}

/**
 * Score the **second** instance. There is no function here that scores the
 * first, and that is deliberate: a retry of a corrected task is not evidence
 * about memory.
 */
export function scoreSecond(rule: HouseRule, after: Workspace): Scored {
  const verdict = rule.instances[1].check(after);
  return { rule: rule.id, ok: verdict.ok, ...(verdict.because ? { because: verdict.because } : {}) };
}
