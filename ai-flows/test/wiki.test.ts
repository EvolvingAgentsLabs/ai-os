/**
 * The capacity claim, measured.
 *
 * doc/05's standing rule is that no memory axis ships without a benchmark the
 * baseline could lose, named before the axis is built. The benchmark named in
 * [wiki.ts](../src/wiki.ts) is **capacity**: at what corpus size does the thing
 * the model must read stop fitting the window?
 *
 * The baseline — one flat file of everything — crosses the window at a size that
 * is arithmetic. The axis has to stay under it *forever*, and the only honest
 * place to find out is a test that builds a corpus far past anything anybody has
 * tried by hand. Five hundred notes is that number here: it is well beyond the
 * point where a flat file has failed, and it is cheap enough to run on every
 * commit.
 *
 * If this file goes red, the axis does not ship. That is the whole point of
 * writing it before the pipeline that would depend on it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Note,
  type Wiki,
  activeShard,
  addNote,
  approxTokens,
  candidates,
  emptyWiki,
  lint,
  flatCeiling,
  mirror,
  noteCard,
  noteMarkdown,
  rootMarkdown,
  shardMarkdown,
  stepContext,
  TWO_LEVEL_CEILING_NOTES,
} from "../src/wiki.ts";

/** A local model worth running on a laptop. The constraint, not a preference. */
const BUDGET = 8000;

/**
 * A note of realistic weight.
 *
 * Sized from what a real unit of a draft looks like: a sentence of summary, a
 * handful of claims, a few keywords. Understating this would make the axis look
 * better than it is, so the summary here is deliberately long rather than terse.
 */
const noteAt = (i: number): Note => ({
  id: `n${String(i).padStart(3, "0")}`,
  title: `The claim about subject ${i}`,
  summary:
    `A statement of what this unit asserts, at the length one actually runs to ` +
    `once somebody writes it down properly rather than in note form (${i}).`,
  ideas: [`first claim ${i}`, `second claim ${i}`, `a qualification ${i}`],
  keywords: [`kw${i % 40}`, `kw${i % 7}`, `subject${i % 13}`],
  chars: 1800,
  hash: `hash${i}`,
  unit: "idea",
  state: i > 0 && i % 11 === 0 ? "repeated" : "complete",
  source: { file: "draft.md", from: i * 1800, to: (i + 1) * 1800 },
  links: [],
  ...(i > 0 && i % 11 === 0
    ? { duplicateOf: `n${String(i - 1).padStart(3, "0")}` }
    : {}),
});

const build = (n: number): Wiki => {
  let w = emptyWiki();
  for (let i = 0; i < n; i += 1) w = addNote(w, noteAt(i), BUDGET);
  return w;
};

describe("the capacity claim", () => {
  it("keeps every step inside the window at 500 notes", () => {
    // The claim, at the size that would have broken it. A window of source text
    // is budgeted alongside the index, because the indexer needs both and a
    // measurement of the index alone would be measuring half the prompt.
    const window = "x".repeat(4000);
    let w = emptyWiki();
    let worst = 0;

    for (let i = 0; i < 500; i += 1) {
      w = addNote(w, noteAt(i), BUDGET);
      const ctx = stepContext(w, activeShard(w), window, BUDGET);
      worst = Math.max(worst, ctx.tokens.total);
      assert.ok(
        ctx.fits,
        `step ${i} needs ${ctx.tokens.total} tokens (root ${ctx.tokens.root} + shard ${ctx.tokens.shard} + window ${ctx.tokens.window}) against a ${BUDGET} budget`,
      );
    }
    // Not just "it fit": it has to have headroom, or the next corpus breaks it.
    assert.ok(worst < BUDGET * 0.9, `worst step used ${worst} of ${BUDGET}`);
  });

  it("beats the flat file, which is what it has to beat", () => {
    // The baseline's ceiling is arithmetic and it is low: a flat file of the
    // material crosses the window long before the corpus is interesting.
    const ceiling = flatCeiling(BUDGET, 1800);
    assert.ok(
      ceiling.units < 20,
      `a flat file holds ${ceiling.units} units of 1800 chars in ${BUDGET} tokens`,
    );

    // The axis at 25x that size, still inside the window.
    const w = build(ceiling.units * 25);
    const ctx = stepContext(w, activeShard(w), "", BUDGET);
    assert.ok(ctx.fits);
  });

  it("grows the root slowly enough that sharding cannot eat the window", () => {
    // The failure mode a sharding scheme hides: every split adds a line to the
    // root, so a design that shards without bound spends the whole window on the
    // list of shards. That is a real ceiling and this is where it would show.
    const w = build(500);
    const rootTokens = approxTokens(rootMarkdown(w));
    assert.ok(
      rootTokens < BUDGET * 0.1,
      `the root alone is ${rootTokens} tokens across ${w.shards.length} shards`,
    );
  });
});

describe("where the design runs out", () => {
  it("is bounded, and bounded is not unbounded", () => {
    // Measured, not assumed: two levels buy ~15,000 notes against an 8k window,
    // and what fails is the root -- 624 shards is 6,000 tokens of table of
    // contents before a single note is named. Writing it down is the difference
    // between a documented limit and a production surprise at note 14,000.
    let w = emptyWiki();
    let broke: number | null = null;
    for (let i = 0; i < 20_000; i += 1) {
      w = addNote(w, { ...noteAt(i), id: `n${String(i).padStart(6, "0")}` }, BUDGET);
      if (i % 1000 === 0 && !stepContext(w, activeShard(w), "", BUDGET).fits) {
        broke = i;
        break;
      }
    }
    assert.ok(broke !== null, "expected to find the ceiling inside 20,000 notes");
    // Within a factor of two of the documented figure. Tighter would be a test
    // of the fixture's note size rather than of the design.
    assert.ok(
      broke! > TWO_LEVEL_CEILING_NOTES / 2 && broke! < TWO_LEVEL_CEILING_NOTES * 2,
      `ceiling moved to ${broke}; the documented figure is ${TWO_LEVEL_CEILING_NOTES}`,
    );
  });
});

describe("the budget estimate", () => {
  it("never claims something fits when it does not", () => {
    // The estimate is allowed to be wrong in one direction only. A `fits: true`
    // that is false is a silent truncation in the middle of a long ingest, and a
    // truncated index step does not fail -- it writes a plausible note that omits
    // whatever fell off the end.
    const text = "á".repeat(10_000);
    // Worst case for any tokeniser: one token per character.
    assert.ok(
      approxTokens(text) >= text.length / 4,
      "the estimate must not undercount accented prose",
    );
    const ctx = stepContext(emptyWiki(), "part-1", text, 100);
    assert.equal(ctx.fits, false);
  });

  it("reports where the tokens went, not just the total", () => {
    const ctx = stepContext(build(40), activeShard(build(40)), "win", BUDGET);
    assert.equal(
      ctx.tokens.total,
      ctx.tokens.root + ctx.tokens.shard + ctx.tokens.window,
    );
    assert.ok(ctx.tokens.shard > 0);
  });
});

describe("what sharding must not do", () => {
  it("keeps source order across a split", () => {
    // The indexer depends on the shard it writes into holding the neighbours of
    // the window it is reading. Re-grouping by topic reads better and breaks it.
    const w = build(200);
    const seen = w.shards.flatMap((s) => s.noteIds);
    assert.deepEqual(seen, [...seen].sort());
    assert.equal(new Set(seen).size, seen.length, "a note was duplicated");
    assert.equal(seen.length, 200, "a note was lost in a split");
  });

  it("keeps a repetition instead of silently merging it", () => {
    // A draft's repetitions are evidence about the draft. A wiki that dedupes
    // them has destroyed the record of how many times the author reached for the
    // same idea -- which, for a question about what got dropped, is the record.
    const w = build(30);
    const dups = Object.values(w.notes).filter((n) => n.duplicateOf);
    assert.ok(dups.length >= 2);
    for (const d of dups) assert.ok(w.notes[d.duplicateOf!], "canon was dropped");
    assert.match(noteCard(dups[0]!), /dup:/);
  });
});

describe("what code can decide, and does", () => {
  it("passes a wiki it built itself", () => {
    assert.deepEqual(lint(build(120)), []);
  });

  it("catches a link with nothing behind it", () => {
    // The same defect the desk draws as an agent declared with no file: a claim
    // that reads as structure until somebody follows it.
    const w = build(3);
    w.notes["n001"]!.links = ["n999"];
    w.notes["n002"]!.duplicateOf = "n404";
    const problems = lint(w);
    assert.equal(problems.length, 2);
    assert.match(problems.join(" "), /n999, which does not exist/);
    assert.match(problems.join(" "), /n404, which does not exist/);
  });

  it("catches a note no navigation can reach", () => {
    // Worse than losing it: the mirror still counts it, so every coverage number
    // computed from the mirror is quietly wrong.
    const w = build(4);
    w.shards[0]!.noteIds = w.shards[0]!.noteIds.filter((id) => id !== "n002");
    assert.match(lint(w).join(" "), /n002 is in no shard/);
  });

  it("catches a note whose range does not match the text it hashed", () => {
    // Found by running two models over one input: one reported 0-98 for 98
    // characters, the other 0-75 for the same 98. The note that lies about its
    // range cannot be walked back -- you land on different words, and the hash
    // that was supposed to prove otherwise is of text nobody can find.
    const w = build(3);
    w.notes["n001"]!.source = { file: "draft.md", from: 0, to: 75 };
    assert.match(lint(w).join(" "), /cannot be walked back to its source/);

    // An exclusive-vs-inclusive end is a real ambiguity, not an error.
    w.notes["n001"]!.source = { file: "draft.md", from: 0, to: 1801 };
    assert.deepEqual(lint(w), []);
  });

  it("catches a note no filter can reach", () => {
    const w = build(3);
    w.notes["n001"]!.keywords = [];
    assert.match(lint(w).join(" "), /no keywords/);
  });
});

describe("the cheap half of retrieval", () => {
  it("filters on metadata alone, with no model and no prose", () => {
    const w = build(300);
    const hits = candidates(w, ["kw3"], 12);
    assert.ok(hits.length > 0 && hits.length <= 12);
    for (const h of hits) assert.ok(h.keywords.some((k) => k === "kw3"));
  });

  it("keeps the machine mirror free of the prose it exists to avoid parsing", () => {
    const m = mirror(build(20));
    assert.equal(m.notes.length, 20);
    for (const n of m.notes) {
      assert.ok(!("summary" in n) && !("ideas" in n));
      assert.equal(typeof n.ideaCount, "number");
      assert.ok(n.keywords.length > 0 && n.chars > 0);
    }
  });
});

describe("what a note carries back to its source", () => {
  it("can be walked back to characters in a file, not to a line number", () => {
    // Lines move when anything upstream is reflowed; offsets and a hash do not.
    const md = noteMarkdown(noteAt(7));
    assert.match(md, /^---\n/);
    assert.match(md, /source: draft\.md#12600-14400/);
    assert.match(md, /hash: hash7/);
    assert.match(md, /## Ideas/);
  });

  it("costs the index one line, and the ideas stay in the file", () => {
    // A field added to the card is a field multiplied by the corpus size.
    const card = noteCard(noteAt(7));
    assert.equal(card.split("\n").length, 1);
    assert.ok(!card.includes("first claim"), "the ideas belong in the note");
    assert.match(card, /kw7/);
  });

  it("names shards in the root and notes in the shard, never both", () => {
    const w = build(120);
    const root = rootMarkdown(w);
    assert.ok(!root.includes("n000"), "the root must not name notes");
    assert.match(shardMarkdown(w, w.shards[0]!.id), /n000/);
  });
});
