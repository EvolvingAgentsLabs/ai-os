/**
 * The project knowledge base, as a wiki a small window can navigate.
 *
 * ## The problem this is for
 *
 * A project's material outgrows the window long before it outgrows the disk. A
 * three-hundred-kilobyte body of notes is roughly eighty thousand tokens; a
 * local model worth running on a laptop has eight. So the work cannot be done by
 * reading the material — not by summarising it either, because a summary is
 * lossy in exactly the direction the question cares about. The question that
 * motivates this is *what is in the material that is missing from the work*, and
 * a summary is a list of what somebody already noticed.
 *
 * The answer is to stop treating retrieval as a search over text and start
 * treating it as **navigation over an index the model can hold**. The index is
 * not a summary of the material. It is a directory of it: one entry per unit,
 * each entry naming a note file that holds the unit itself. The model reads the
 * directory — which fits — and opens the two notes it needs — which also fit.
 *
 * ## What is code here and what is an agent
 *
 * The rule this module is built on: **every decision is an agent; every
 * mechanic is code.**
 *
 * Hashing, splitting, counting, budgeting, linking and rendering are code. They
 * are cheap, reproducible and auditable, and a model call in the assembly path
 * is a model call that can truncate the thing being assembled. What is left for
 * the agents in [agents/system/memory](../agents/system/memory) is the part that
 * is actually judgement: *what kind of material is this*, *what is one unit of
 * it*, *are these two notes the same idea*, *which notes does this task need*.
 *
 * So this file has no prompts in it, and the agents have no arithmetic.
 *
 * ## The benchmark, named before the axis was built
 *
 * doc/05 makes this a standing rule: *no new memory axis ships without a
 * benchmark the baseline could lose, named before the axis is built.* The
 * baseline is what `ai-base` has today — one flat `MEMORY.md` of bullets per
 * scope, FIFO when it overflows. The axis is this index.
 *
 * The benchmark is **not** retrieval accuracy, because the previous flagship
 * already showed an extra axis buying 80% → 80% → 80% there. It is the one
 * property the flat file cannot have at any size:
 *
 * > At what corpus size does the thing the model must read stop fitting the
 * > window?
 *
 * The flat file grows with the corpus and crosses the window at a corpus size
 * that is easy to compute and impossible to argue with. This index has to stay
 * **bounded** — the root names shards, a shard names notes, and a shard that
 * outgrows its share of the budget splits. If it does not stay bounded, the axis
 * has failed and should not ship, and [the test](../test/wiki.test.ts) is
 * written to say so at five hundred notes rather than to say so in production at
 * note four hundred.
 *
 * This is a *capacity* claim and it is deliberately the cheap one. It is
 * deterministic, it needs no model, and it is the risk that actually kills the
 * design. Whether a small model **uses** a well-formed index well is a separate,
 * more expensive question, and one that cannot even be asked until the index is
 * known to fit.
 */

import { createHash } from "node:crypto";

/**
 * Characters per token, for budgeting only.
 *
 * An estimate, and named as one wherever it is used. Real tokenisers disagree
 * with each other and with this by a wide margin on accented prose, so the
 * budget is treated as advisory in one direction only: `fits` is allowed to say
 * no when the truth is yes, and must never say yes when the truth is no. Every
 * comparison below therefore rounds **against** the caller.
 */
export const CHARS_PER_TOKEN = 3.6;

/** Deliberately pessimistic: a token estimate that is never an undercount. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN) + 1;
}

export function shortHash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}

/**
 * What one note *is* — chosen by an agent, per material, not fixed here.
 *
 * A draft of notes indexes by idea. A finished work indexes by scene or chapter.
 * A case file indexes by fact or clause. The unit is the single most consequential
 * decision in the whole pipeline and it is the one thing here that code must not
 * make: a structural splitter applied to a draft of repeated ideas produces
 * beautifully uniform shards of nonsense.
 */
export const UNITS = [
  "idea",
  "scene",
  "chapter",
  "clause",
  "fact",
  "note",
] as const;
export type Unit = (typeof UNITS)[number];

/**
 * What the indexer found this unit to be.
 *
 * Three of the four are the states a real draft exhibits, and they are fields
 * rather than free-text observations because they are what somebody has to act
 * on. An idea that was *incomplete* in the draft and is missing from the work is
 * a different failure from one that was complete and got dropped, and a reader
 * who cannot tell them apart will treat both as the same complaint.
 */
export const NOTE_STATES = [
  "complete",
  "incomplete",
  "inconsistent",
  "repeated",
] as const;
export type NoteState = (typeof NOTE_STATES)[number];

/** Where a note came from, so every claim can be walked back to the source. */
export interface Provenance {
  /** The source document, relative to the project. */
  file: string;
  /** Character offsets into that document. Not line numbers: lines move. */
  from: number;
  to: number;
}

export interface Note {
  id: string;
  title: string;
  /** One sentence. This is what the index costs its budget on. */
  summary: string;
  /** The claims the unit makes. What a coverage question is actually asked of. */
  ideas: string[];
  /**
   * Machine-actionable, and that is the point.
   *
   * Keywords, length and hash exist so a deterministic filter can throw away
   * nine tenths of the index before any model is asked anything. A knowledge
   * base whose every query costs a model call has moved the cost rather than
   * removed it.
   */
  keywords: string[];
  chars: number;
  hash: string;
  unit: Unit;
  state: NoteState;
  source: Provenance;
  /** Other notes this one relates to. Ids, resolved by the mirror, not prose. */
  links: string[];
  /**
   * Set when this note restates one that came first.
   *
   * The canonical note is not deleted or merged — a draft's repetitions are
   * evidence about the draft, and a wiki that silently deduplicates them has
   * destroyed the record of how many times the author reached for the same idea.
   */
  duplicateOf?: string;
}

export interface Shard {
  id: string;
  title: string;
  noteIds: string[];
}

export interface Wiki {
  /** Root index: names the shards, never the notes. Bounded by construction. */
  shards: Shard[];
  notes: Record<string, Note>;
}

export const emptyWiki = (): Wiki => ({ shards: [], notes: {} });

/**
 * The line a note occupies in its shard.
 *
 * This is the unit of budget. Everything the model reads while deciding *where
 * to look* is a pile of these, so a field added here is a field multiplied by
 * the size of the corpus — which is why the ideas are not in it and the summary
 * is one sentence. The note file has the rest.
 */
export function noteCard(note: Note): string {
  const flags = [
    note.state !== "complete" ? note.state : "",
    note.duplicateOf ? `dup:${note.duplicateOf}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `- [${note.id}] ${note.title} — ${note.summary}${flags ? ` (${flags})` : ""} · ${note.keywords.join(",")} · ${note.chars}c`;
}

/** A shard, as the markdown an agent reads. */
export function shardMarkdown(wiki: Wiki, shardId: string): string {
  const shard = wiki.shards.find((s) => s.id === shardId);
  if (!shard) return "";
  const cards = shard.noteIds
    .map((id) => wiki.notes[id])
    .filter((n): n is Note => Boolean(n))
    .map(noteCard);
  return `## ${shard.title} (${shard.id})\n\n${cards.join("\n")}\n`;
}

/** The root, as the markdown an agent reads. Names shards, counts, never notes. */
export function rootMarkdown(wiki: Wiki): string {
  const lines = wiki.shards.map(
    (s) => `- [${s.id}] ${s.title} — ${s.noteIds.length} note(s)`,
  );
  return `# Index\n\n${lines.join("\n")}\n`;
}

/** One note, as the markdown file it is stored as. Frontmatter is the mirror. */
export function noteMarkdown(note: Note): string {
  const fm = [
    `id: ${note.id}`,
    `title: ${note.title}`,
    `unit: ${note.unit}`,
    `state: ${note.state}`,
    `keywords: [${note.keywords.join(", ")}]`,
    `chars: ${note.chars}`,
    `hash: ${note.hash}`,
    `source: ${note.source.file}#${note.source.from}-${note.source.to}`,
    note.duplicateOf ? `duplicate_of: ${note.duplicateOf}` : "",
    note.links.length ? `links: [${note.links.join(", ")}]` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const ideas = note.ideas.map((i) => `- ${i}`).join("\n");
  return `---\n${fm}\n---\n\n# ${note.title}\n\n${note.summary}\n\n## Ideas\n\n${ideas}\n`;
}

/**
 * The machine mirror.
 *
 * Regenerated from the notes, never edited. It exists so that a tool which is
 * not a model — a filter, a diff, a coverage count — does not have to parse
 * markdown to do its job. Two representations of one truth is a maintenance
 * cost that buys the ability to spend nothing on the common query.
 */
export function mirror(wiki: Wiki): {
  notes: Array<Omit<Note, "ideas" | "summary"> & { ideaCount: number }>;
  shards: Shard[];
} {
  return {
    shards: wiki.shards,
    notes: Object.values(wiki.notes).map(({ ideas, summary: _s, ...rest }) => ({
      ...rest,
      ideaCount: ideas.length,
    })),
  };
}

/**
 * What the indexer is handed on one step.
 *
 * This is the whole design in one shape. The agent never sees the corpus and
 * never sees the whole index: it sees the **root**, the **one shard it is
 * writing into**, and a **window of source text**, and it returns one note. The
 * root keeps it oriented, the shard keeps it from repeating itself, and the
 * window is the only part that grows with the material — and it is bounded by
 * the caller rather than by the corpus.
 */
export interface StepContext {
  root: string;
  shard: string;
  window: string;
  tokens: { root: number; shard: number; window: number; total: number };
  fits: boolean;
  budget: number;
}

/**
 * Assemble one step, and say whether it fits.
 *
 * `fits` is the load-bearing output, not the text. A pipeline that assembles a
 * prompt and sends it without asking this question discovers the answer as a
 * truncation, silently, in the middle of a four-hour ingest — and a truncated
 * index step does not fail, it produces a plausible note that omits whatever
 * fell off the end.
 */
export function stepContext(
  wiki: Wiki,
  shardId: string,
  window: string,
  budget: number,
): StepContext {
  const root = rootMarkdown(wiki);
  const shard = shardMarkdown(wiki, shardId);
  const t = {
    root: approxTokens(root),
    shard: approxTokens(shard),
    window: approxTokens(window),
    total: 0,
  };
  t.total = t.root + t.shard + t.window;
  return { root, shard, window, tokens: t, fits: t.total <= budget, budget };
}

/**
 * How much of the budget the index is allowed to take.
 *
 * The window and the answer need room too, so the index gets a fraction rather
 * than a remainder. A third is not tuned — it is chosen so that the window can
 * be as large as the index and still leave a third for what the model writes,
 * and any pipeline that needs a different split should pass its own.
 */
export const DEFAULT_INDEX_SHARE = 1 / 3;

/**
 * Add a note, sharding when the shard it lands in has outgrown its share.
 *
 * **This function is the axis.** Everything else here is bookkeeping; this is
 * the part that has to be true for a small window to navigate an arbitrarily
 * large corpus. It is deliberately dumb — append, measure, split when over —
 * because the alternative is a partition decided by meaning, and a partition
 * decided by meaning cannot be verified against anything.
 *
 * Splitting keeps source order. A shard whose notes are re-grouped by topic
 * reads better and breaks the one property the indexer depends on: that the
 * shard it is writing into is the one holding the neighbours of the window it
 * is looking at.
 */
export function addNote(
  wiki: Wiki,
  note: Note,
  budget: number,
  indexShare: number = DEFAULT_INDEX_SHARE,
): Wiki {
  const notes = { ...wiki.notes, [note.id]: note };
  const shards = wiki.shards.map((s) => ({ ...s, noteIds: [...s.noteIds] }));

  if (shards.length === 0) {
    shards.push({ id: "part-1", title: "Part 1", noteIds: [] });
  }
  shards[shards.length - 1]!.noteIds.push(note.id);

  const next: Wiki = { shards, notes };
  const perShard = Math.floor(budget * indexShare);
  const last = shards[shards.length - 1]!;

  // Over its share: split off the tail, keeping source order. The root grows by
  // one line per split, which is why the root is counted in the budget too --
  // a design that shards forever eventually spends the whole window on the list
  // of shards, and that is a real ceiling rather than an imagined one.
  if (approxTokens(shardMarkdown(next, last.id)) > perShard && last.noteIds.length > 1) {
    const half = Math.ceil(last.noteIds.length / 2);
    const tail = last.noteIds.slice(half);
    last.noteIds = last.noteIds.slice(0, half);
    shards.push({
      id: `part-${shards.length + 1}`,
      title: `Part ${shards.length + 1}`,
      noteIds: tail,
    });
  }
  return next;
}

/** The shard a new note should be written into: always the last, by construction. */
export function activeShard(wiki: Wiki): string {
  return wiki.shards.length
    ? wiki.shards[wiki.shards.length - 1]!.id
    : "part-1";
}

/**
 * Where this design runs out, measured rather than assumed.
 *
 * The index is bounded, and *bounded is not unbounded*. Two levels — a root of
 * shards over a shard of notes — buy about **15,000 notes against an 8k window**,
 * and what fails there is the root: 624 shards is 6,000 tokens of table of
 * contents before a single note is named. Past that the answer is a third level,
 * not a bigger machine.
 *
 * This is stated as a function and asserted in the test suite because the
 * alternative is finding it in production at note 14,000, and because a design
 * whose limit nobody wrote down gets described as having none.
 */
export const TWO_LEVEL_CEILING_NOTES = 15_000;

/**
 * The corpus size at which a flat file stops fitting — the baseline's ceiling.
 *
 * Reported rather than asserted, because it is the number the axis has to beat
 * and it should be visible in the same units. A flat memory file is every unit's
 * text, so it crosses the window at roughly `budget * CHARS_PER_TOKEN` characters
 * of material, whatever that is in units.
 */
export function flatCeiling(
  budget: number,
  avgCharsPerUnit: number,
): { units: number; chars: number } {
  const chars = Math.floor(budget * CHARS_PER_TOKEN);
  return { chars, units: Math.max(0, Math.floor(chars / avgCharsPerUnit)) };
}

/**
 * Every way this wiki can be internally false.
 *
 * A link that points at nothing is the same defect the desk already draws as an
 * agent declared with no file behind it: a claim with nothing under it, which
 * reads as structure until somebody follows it. The desk found that one by
 * drawing it; a wiki has no picture, so it needs a function.
 *
 * Deliberately only the things that are *decidable*. Whether a note's summary is
 * a fair summary is a judgement and belongs to an agent; whether the note it
 * says it duplicates exists is arithmetic and belongs here.
 */
export function lint(wiki: Wiki): string[] {
  const problems: string[] = [];
  const ids = new Set(Object.keys(wiki.notes));

  for (const note of Object.values(wiki.notes)) {
    if (note.duplicateOf && !ids.has(note.duplicateOf))
      problems.push(`${note.id} duplicates ${note.duplicateOf}, which does not exist`);
    if (note.duplicateOf === note.id)
      problems.push(`${note.id} duplicates itself`);
    for (const link of note.links)
      if (!ids.has(link)) problems.push(`${note.id} links ${link}, which does not exist`);
    if (!note.keywords.length)
      problems.push(`${note.id} has no keywords, so no filter can ever reach it`);
    if (note.source.to <= note.source.from)
      problems.push(`${note.id} has an empty source range`);
    // The range and the text must describe the same thing. They come from
    // different places -- `chars` is measured from the text the note was built
    // from, `source` is what the writer said it read -- and two models disagreed
    // here on the same input: one reported 0-98 for 98 characters, the other
    // 0-75 for the same 98. A note whose range does not match its text cannot be
    // walked back to its source: you land on different words, and the hash that
    // was supposed to prove otherwise is a hash of the text nobody can find.
    // Slack of one for an exclusive-vs-inclusive end, which is a real ambiguity
    // rather than an error.
    else if (Math.abs(note.source.to - note.source.from - note.chars) > 1)
      problems.push(
        `${note.id} says it read ${note.source.to - note.source.from} characters ` +
          `(${note.source.from}-${note.source.to}) but carries ${note.chars}, ` +
          `so it cannot be walked back to its source`,
      );
  }

  // A note in no shard is unreachable by navigation, which is the only way the
  // index is read. It is not lost -- it is worse, because the mirror still
  // counts it and every coverage number computed from the mirror is then wrong.
  const shardedIds = new Set(wiki.shards.flatMap((s) => s.noteIds));
  for (const id of ids)
    if (!shardedIds.has(id)) problems.push(`${id} is in no shard, so navigation cannot reach it`);
  for (const id of shardedIds)
    if (!ids.has(id)) problems.push(`a shard names ${id}, which does not exist`);

  return problems;
}

/**
 * A deterministic pre-filter over the mirror.
 *
 * The cheap half of retrieval, and the reason the metadata is machine-actionable:
 * this runs over five hundred notes in microseconds and costs nothing, and what
 * survives it is small enough to hand to a model. It ranks by keyword overlap
 * and nothing else — it is a filter, not a search engine, and the moment it
 * starts scoring semantically it has become a second retrieval system nobody
 * measured.
 */
export function candidates(
  wiki: Wiki,
  keywords: string[],
  limit = 12,
): Note[] {
  const want = new Set(keywords.map((k) => k.toLowerCase()));
  return Object.values(wiki.notes)
    .map((n) => ({
      n,
      hits: n.keywords.filter((k) => want.has(k.toLowerCase())).length,
    }))
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.n.id.localeCompare(b.n.id))
    .slice(0, limit)
    .map((r) => r.n);
}
