/**
 * Memory that survives a session.
 *
 * The tests that matter here are the refusals. A knowledge base whose notes
 * cannot be walked back to a source is a set of assertions about the material
 * rather than an index of it, and the difference is invisible from the outside:
 * a fabricated note reads exactly like a good one.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNote, consolidate, loadWiki, parseNotes, recall } from "../src/memory.ts";
import { emptyWiki, shortHash } from "../src/wiki.ts";

const SOURCE = `ADR-0002 — the place code needs fluid coupling, not a ground spring

A ground spring cannot produce a traveling wave: it makes every point on the
membrane an independent oscillator, so the peak does not move with frequency.
Falsified 2026-08-14 by its own control arm.`;

const sources = { "decisions/0002.md": SOURCE };

const draft = {
  title: "A ground spring cannot produce a traveling wave",
  summary: "The ground-spring coupling was falsified because it makes every point independent.",
  ideas: ["a ground spring makes each point an independent oscillator", "the peak then does not move with frequency"],
  keywords: ["ground-spring", "traveling-wave", "falsified", "place-code"],
  unit: "fact",
  state: "complete",
  file: "decisions/0002.md",
  quote: "A ground spring cannot produce a traveling wave",
};

describe("building a note", () => {
  it("computes the offsets, the length and the hash rather than taking them", () => {
    const r = buildNote(draft, sources, 1);
    assert.ok("note" in r);
    const n = r.note;
    assert.equal(n.source.from, SOURCE.indexOf(draft.quote));
    assert.equal(n.source.to - n.source.from, draft.quote.length);
    assert.equal(n.chars, draft.quote.length);
    assert.equal(n.hash, shortHash(draft.quote));
  });

  /**
   * The load-bearing refusal, and the reason the draft carries a quote instead
   * of offsets. `wiki.ts` records two models classifying one input correctly
   * while one reported a source range that did not match the text it hashed —
   * nothing complained. A quote can be **found in the file**; offsets can only
   * be believed.
   */
  it("refuses a note whose quote is not in the file it cites", () => {
    const r = buildNote({ ...draft, quote: "the membrane is tuned by a Hopf bifurcation" }, sources, 1);
    assert.ok("error" in r);
    assert.match(r.error, /quote is not in/);
  });

  it("refuses a note citing a file that was not among the sources", () => {
    const r = buildNote({ ...draft, file: "decisions/0009.md" }, sources, 1);
    assert.ok("error" in r);
    assert.match(r.error, /not among the sources/);
  });

  it("refuses a note with no keywords, which no filter could ever reach", () => {
    const r = buildNote({ ...draft, keywords: [] }, sources, 1);
    assert.ok("error" in r);
    assert.match(r.error, /keywords/);
  });

  it("refuses a unit or a state it does not know", () => {
    assert.ok("error" in buildNote({ ...draft, unit: "paragraph" }, sources, 1));
    assert.ok("error" in buildNote({ ...draft, state: "probably-fine" }, sources, 1));
  });
});

describe("consolidating", () => {
  it("stores a batch and reports the ids it added", () => {
    const r = consolidate(emptyWiki(), [draft], sources);
    assert.ok("wiki" in r);
    assert.deepEqual(r.added, ["n0001"]);
    assert.equal(Object.keys(r.wiki.notes).length, 1);
  });

  /**
   * All of them or none. Half a consolidation is worse than none: the index
   * claims coverage it does not have, and the pass that would have written the
   * rest has already reported success.
   */
  it("stores nothing when one note in the batch is refused", () => {
    const bad = { ...draft, title: "Invented", quote: "nowhere in the file" };
    const r = consolidate(emptyWiki(), [draft, bad], sources);
    assert.ok("refused" in r);
    assert.equal(r.refused.length, 1);
    assert.equal(r.refused[0]!.title, "Invented");
  });

  it("refuses a batch whose links point at notes that do not exist", () => {
    const r = consolidate(emptyWiki(), [{ ...draft, links: ["n9999"] }], sources);
    assert.ok("refused" in r);
    assert.match(JSON.stringify(r.refused), /n9999/);
  });

  it("refuses an empty set rather than storing none and reporting success", () => {
    const p = parseNotes("[]");
    assert.ok("error" in p);
    assert.match(p.error, /did not run/);
  });

  it("names the failure when the model emitted something that is not JSON", () => {
    const p = parseNotes("here are your notes:");
    assert.ok("error" in p);
    assert.match(p.error, /not JSON/);
  });
});

describe("recall", () => {
  /**
   * The question this whole file exists to answer: a fresh session proposes
   * something that was already tried and killed, and memory is what says so.
   */
  it("returns the falsification when asked about the thing that was falsified", () => {
    const r = consolidate(emptyWiki(), [draft], sources);
    assert.ok("wiki" in r);
    const hit = recall(r.wiki, ["ground-spring"]);
    assert.equal(hit.notes.length, 1);
    assert.match(hit.notes[0]!.summary, /falsified/i);
    // And it can be walked back: the quote is at the offsets the note recorded.
    const n = hit.notes[0]!;
    assert.equal(SOURCE.slice(n.source.from, n.source.to), draft.quote);
  });

  /**
   * A recall that matched everything would be a recall that decided nothing,
   * and the deterministic filter is the property that keeps a query off the
   * model.
   */
  it("returns nothing for a question the memory does not cover", () => {
    const r = consolidate(emptyWiki(), [draft], sources);
    assert.ok("wiki" in r);
    assert.equal(recall(r.wiki, ["hopf", "cochlear-amplifier"]).notes.length, 0);
  });

  it("returns the bounded root index when asked nothing in particular", () => {
    const r = consolidate(emptyWiki(), [draft], sources);
    assert.ok("wiki" in r);
    const all = recall(r.wiki, []);
    assert.equal(all.notes.length, 0);
    assert.ok(all.tokens > 0);
    // The root names shards, never notes — that is what bounds it.
    assert.ok(!all.index.includes(draft.title));
  });
});

describe("loading a wiki back", () => {
  it("round-trips through the mirror", () => {
    const r = consolidate(emptyWiki(), [draft], sources);
    assert.ok("wiki" in r);
    const back = loadWiki(JSON.stringify(r.wiki));
    assert.deepEqual(Object.keys(back.notes), ["n0001"]);
  });

  it("treats an unreadable mirror as empty rather than throwing at startup", () => {
    assert.deepEqual(loadWiki("{ not json"), emptyWiki());
    assert.deepEqual(loadWiki(null), emptyWiki());
  });
});
