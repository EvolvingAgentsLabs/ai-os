import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIN_INPUT_TOKENS, contributionOf, contributionsOf, distinctiveTokens } from "../src/contribution.ts";

/**
 * The two runs this signal exists for, quoted from the real output on 2026-08-07
 * (doc/13-degradation.md). Same agents, same markdown, same declared tree — the
 * only difference was whether the step was shown its predecessor's work.
 *
 * If the signal does not separate these two, it does not separate anything, and
 * these fixtures are the whole reason to believe it does.
 */
const MIGRATION_OUTPUT = `MigrationAgent returned:

**Migration** — \`migrations/001_add_ledger_currency.sql\`

\`\`\`sql
-- Add a nullable currency column to the ledger table.
-- ISO 4217 code (e.g. 'USD'), nullable: ledgers without a currency remain valid.
ALTER TABLE ledger ADD COLUMN currency VARCHAR(3) NULL;
\`\`\`

**Dry-run result** — syntax valid, column added successfully against a local
SQLite database. Existing rows are unaffected and foreign-currency ledgers keep
their previous behaviour.`;

const REVIEW_IGNORED = `There are no files in the workspace to review. There is no change visible, so I
cannot point to any defect on any line.

If you intended for me to review something, please provide the change.`;

const REVIEW_ENGAGED = `ReviewAgent returned:

**Defect 1 — Line 4: \`NULL\` on the \`currency\` column violates the invariant
that every ledger must have a well-defined currency.**

In double-entry accounting, every ledger entry carries a currency. Permitting
NULL in \`ledger.currency\` means an entry can exist with no currency at all.`;

describe("the signal, against the two runs it exists for", () => {
  it("flags the step that ignored what it was handed", () => {
    const c = contributionOf(MIGRATION_OUTPUT, REVIEW_IGNORED);
    assert.equal(c.verdict, "ignored-input");
    assert.equal(c.overlap.length, 0);
  });

  it("does not flag the same step once it engaged with the same input", () => {
    const c = contributionOf(MIGRATION_OUTPUT, REVIEW_ENGAGED);
    assert.equal(c.verdict, "used-input");
    // It is carrying the actual subject matter, not incidental words.
    assert.ok(c.overlap.includes("currency"));
    assert.ok(c.overlap.includes("ledger"));
  });

  it("separates them by a wide margin rather than a hair", () => {
    // A signal that separates the two cases by a rounding error is one that will
    // stop separating them on the third case.
    const bad = contributionOf(MIGRATION_OUTPUT, REVIEW_IGNORED).carried;
    const good = contributionOf(MIGRATION_OUTPUT, REVIEW_ENGAGED).carried;
    assert.equal(bad, 0);
    assert.ok(good > 0.1, `engaged run carried only ${good}`);
  });
});

describe("what it refuses to judge", () => {
  it("says nothing when the input was too short to be evidence", () => {
    // "Carried nothing" from a two-word input means the input was two words.
    const c = contributionOf("done", "There is nothing here to look at.");
    assert.equal(c.verdict, "insufficient");
  });

  it("needs at least the declared minimum of distinctive tokens", () => {
    const long = Array.from({ length: MIN_INPUT_TOKENS }, (_, i) => `tokenword${i}`).join(" ");
    assert.equal(contributionOf(long, "unrelated sentence entirely").verdict, "ignored-input");
    const short = Array.from({ length: MIN_INPUT_TOKENS - 1 }, (_, i) => `tokenword${i}`).join(" ");
    assert.equal(contributionOf(short, "unrelated sentence entirely").verdict, "insufficient");
  });

  it("cannot tell a step that merely restated its input from one that added to it", () => {
    // Stated as a test because it is the documented limit, not an oversight:
    // doc/13 predicted it, and pretending otherwise is how a threshold gets
    // invented to cover it.
    const restated = contributionOf(MIGRATION_OUTPUT, MIGRATION_OUTPUT);
    assert.equal(restated.verdict, "used-input");
    assert.equal(restated.carried, 1);
  });
});

describe("tokens", () => {
  it("drops words too common to be evidence", () => {
    const t = distinctiveTokens("The currency column should be nullable and that is fine");
    assert.ok(t.has("currency"));
    assert.ok(t.has("column"));
    assert.ok(t.has("nullable"));
    assert.ok(!t.has("that"));
    assert.ok(!t.has("the"));
  });

  it("drops tokens too short to be distinctive", () => {
    assert.ok(!distinctiveTokens("sql db id x").has("sql"));
  });
});

describe("walking a flow", () => {
  const step = (index: number, state: string, result: string | null) => ({ index, state, result });

  it("compares each settled step against the one before it", () => {
    const out = contributionsOf([
      step(0, "done", MIGRATION_OUTPUT),
      step(1, "done", REVIEW_IGNORED),
      step(2, "done", REVIEW_ENGAGED),
    ]);
    assert.deepEqual(
      out.map((c) => [c.stepIndex, c.verdict]),
      [
        [1, "ignored-input"],
        // Step 2 reads as `used-input` because it shares vocabulary with step 1 —
        // and step 1 was the non-contribution. See the test below: the chain is
        // only as good as its links, and this is where that shows.
        [2, "used-input"],
      ],
    );
  });

  it("judges a step against its predecessor even when that predecessor contributed nothing", () => {
    /**
     * The limitation, pinned rather than hidden. Comparisons are pairwise and
     * consecutive, so once one step adds nothing the next one is measured against
     * its noise. A reviewer that engages with an empty "there is nothing to
     * review" reads as having used its input, which is true and useless.
     *
     * Fixing it means comparing against the last step that DID contribute, and
     * that is a change to make when there is evidence about how often this
     * matters — not on the strength of one constructed case.
     */
    const out = contributionsOf([step(0, "done", REVIEW_IGNORED), step(1, "done", REVIEW_ENGAGED)]);
    assert.equal(out[0]!.verdict, "used-input");
  });

  it("judges nothing about a step that has not settled", () => {
    const out = contributionsOf([step(0, "done", MIGRATION_OUTPUT), step(1, "running", null)]);
    assert.deepEqual(out, []);
  });

  it("skips a failed step rather than treating its absence as a result", () => {
    const out = contributionsOf([
      step(0, "done", MIGRATION_OUTPUT),
      step(1, "failed", null),
      step(2, "done", REVIEW_ENGAGED),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.stepIndex, 2);
    assert.equal(out[0]!.verdict, "used-input");
  });
});
