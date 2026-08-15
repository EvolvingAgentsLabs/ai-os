/**
 * Memory that survives a session — what llmunix kept in `memory/long_term/` and
 * what skillos's dream pass produced.
 *
 * The mechanics are [`wiki.ts`](wiki.ts): notes with ideas, keywords and
 * provenance, a sharded index bounded by a token budget, `candidates()` for
 * throwing away nine tenths of the index before a model is asked anything, and
 * `lint()` for checking a note *before* it is written. None of that is redone
 * here. What this file adds is the same crossing `agent-file.ts` adds for
 * rosters: **an agent writes JSON into its sandbox and code decides whether it
 * becomes memory.**
 *
 * ## Why the model does not supply the mechanics
 *
 * `wiki.ts` records the failure this design creates: the model gets the
 * judgement right and the mechanics wrong, without erroring. Two models were run
 * over one input; both classified the material correctly and one reported a
 * source range that did not match the text it had hashed.
 *
 * So `id`, `hash` and `chars` are **computed here from the quoted text**, never
 * read from the draft. The model supplies title, summary, ideas, keywords, unit,
 * state and the quote; everything a checker could get wrong by arithmetic is
 * arithmetic.
 *
 * ## Why `ai-memory/` is not what this is
 *
 * `ai-memory/` runs the same idea as a tree of six eve subagents, and it is the
 * better shape — a keeper that routes to an archivist, an indexer, a reconciler.
 * It does not execute in this workspace: the local eve world accepts a session,
 * dispatches a turn, and the turn's run never starts. Thirty-nine runs from an
 * earlier attempt were still sitting `running` three days later. This is the
 * same job on the substrate that does run, and it is deliberately smaller.
 */
import {
  type Note,
  NOTE_STATES,
  type Unit,
  UNITS,
  type Wiki,
  addNote,
  approxTokens,
  candidates,
  emptyWiki,
  lint,
  rootMarkdown,
  shardMarkdown,
  shortHash,
} from "./wiki.ts";

/** The default index budget, in approximate tokens. Passed through to `addNote`. */
export const DEFAULT_BUDGET = 8_000;

/**
 * What a model may supply.
 *
 * `quote` rather than offsets. A model asked for `from`/`to` reports numbers
 * that look right and are not — the failure `wiki.ts` documents — whereas a
 * quote can be **found in the source**, which is a check rather than a promise.
 */
export interface NoteDraft {
  title: string;
  summary: string;
  ideas: string[];
  keywords: string[];
  unit: string;
  state: string;
  /** The file this came from, relative to the project. */
  file: string;
  /** Text copied out of that file, verbatim. Located, not trusted. */
  quote: string;
  links?: string[];
}

const isUnit = (u: string): u is Unit => (UNITS as readonly string[]).includes(u);
const isState = (s: string): s is Note["state"] =>
  (NOTE_STATES as readonly string[]).includes(s);

/** Parse what a model wrote. Same contract as `parseRoster` — JSON, or a reason. */
export function parseNotes(raw: string): { notes: NoteDraft[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: `the notes are not JSON: ${(e as Error).message}` };
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { notes?: unknown })?.notes)
      ? (parsed as { notes: unknown[] }).notes
      : null;
  if (!list) return { error: "expected a JSON array of notes, or {notes: [...]}" };
  // An empty set is a failure, not "nothing to remember". A consolidation pass
  // that produced no notes did not succeed, and storing none quietly reports
  // that it did.
  if (!list.length) return { error: "no notes — a consolidation that found nothing did not run" };
  return {
    notes: list.map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
      const arr = (k: string) =>
        Array.isArray(o[k]) ? (o[k] as unknown[]).filter((x): x is string => typeof x === "string") : [];
      return {
        title: str("title").trim(),
        summary: str("summary").trim(),
        ideas: arr("ideas"),
        keywords: arr("keywords"),
        unit: str("unit").trim() || "note",
        state: str("state").trim() || "complete",
        file: str("file").trim(),
        quote: str("quote"),
        links: arr("links"),
      };
    }),
  };
}

/**
 * Turn a draft into a note, or say why it cannot be one.
 *
 * `sources` is the material the draft claims to come from, keyed by file. The
 * quote is **located in it**: a note whose quote is not in the file it names
 * cannot be walked back to anything, and that is the difference between a
 * knowledge base and a set of assertions about one.
 */
export function buildNote(
  draft: NoteDraft,
  sources: Record<string, string>,
  n: number,
): { note: Note } | { error: string } {
  if (!draft.title) return { error: "a note needs a title" };
  if (!draft.summary) return { error: `${draft.title}: a note needs a one-sentence summary` };
  if (!draft.ideas.length) return { error: `${draft.title}: a note with no ideas records nothing` };
  if (!draft.keywords.length) {
    return { error: `${draft.title}: no keywords, so no filter can ever reach it` };
  }
  if (!isUnit(draft.unit)) return { error: `${draft.title}: unit must be one of ${UNITS.join(", ")}` };
  if (!isState(draft.state)) {
    return { error: `${draft.title}: state must be one of ${NOTE_STATES.join(", ")}` };
  }
  const source = sources[draft.file];
  if (source === undefined) {
    return { error: `${draft.title}: cites ${draft.file || "(no file)"}, which was not among the sources` };
  }
  const from = source.indexOf(draft.quote);
  if (!draft.quote.trim() || from < 0) {
    // The whole point of taking a quote instead of offsets. A model that
    // invented the passage is caught here; a model that invented the offsets
    // was not caught anywhere.
    return { error: `${draft.title}: its quote is not in ${draft.file}` };
  }
  return {
    note: {
      id: `n${String(n).padStart(4, "0")}`,
      title: draft.title,
      summary: draft.summary,
      ideas: draft.ideas,
      keywords: draft.keywords,
      // Computed, never read from the draft.
      chars: draft.quote.length,
      hash: shortHash(draft.quote),
      unit: draft.unit,
      state: draft.state,
      source: { file: draft.file, from, to: from + draft.quote.length },
      links: draft.links ?? [],
    },
  };
}

/**
 * Add a set of drafts to a wiki — **all of them, or none.**
 *
 * Half a consolidation is worse than none: the index then claims coverage it
 * does not have, and the pass that would have written the rest has already
 * reported success.
 */
export function consolidate(
  wiki: Wiki,
  drafts: NoteDraft[],
  sources: Record<string, string>,
  budget = DEFAULT_BUDGET,
): { wiki: Wiki; added: string[] } | { error: string; refused: Array<{ title: string; why: string }> } {
  const refused: Array<{ title: string; why: string }> = [];
  const built: Note[] = [];
  let n = Object.keys(wiki.notes).length;
  for (const d of drafts) {
    const r = buildNote(d, sources, ++n);
    if ("error" in r) refused.push({ title: d.title || "(untitled)", why: r.error });
    else built.push(r.note);
  }
  if (refused.length) return { error: "nothing was stored", refused };

  let next = wiki;
  for (const note of built) next = addNote(next, note, budget);
  const problems = lint(next);
  if (problems.length) {
    // `lint` sees the whole wiki, so a link into a note that does not exist is
    // only visible once every note in the batch is in. Refused as a batch for
    // the same reason.
    return { error: "the notes do not lint", refused: problems.map((why) => ({ title: "", why })) };
  }
  return { wiki: next, added: built.map((b) => b.id) };
}

/**
 * What to read before starting work — the recall half.
 *
 * `keywords` filters deterministically first (`candidates`), which is the
 * property that keeps a query off the model. With no keywords it returns the
 * root index: the shard list, which is bounded by construction, rather than
 * every note, which is not.
 */
export function recall(
  wiki: Wiki,
  keywords: string[],
  limit = 12,
): { index: string; notes: Note[]; tokens: number } {
  const notes = keywords.length ? candidates(wiki, keywords, limit) : [];
  const index = keywords.length
    ? wiki.shards.map((s) => shardMarkdown(wiki, s.id)).join("\n\n")
    : rootMarkdown(wiki);
  return { index, notes, tokens: approxTokens(index) };
}

/** Read a wiki back from its JSON mirror. An unreadable mirror is an empty wiki. */
export function loadWiki(raw: string | null): Wiki {
  if (!raw) return emptyWiki();
  try {
    const parsed = JSON.parse(raw) as { shards?: Wiki["shards"]; notes?: Wiki["notes"] };
    return { shards: parsed.shards ?? [], notes: parsed.notes ?? {} };
  } catch {
    return emptyWiki();
  }
}

/** Where a scope's memory lives. One rule, so nothing has to guess. */
export const WIKI_MIRROR = "knowledge/wiki_index.json";
