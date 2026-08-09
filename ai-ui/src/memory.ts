/**
 * Memory on the desk — **a drawing of software that does not exist.**
 *
 * `ai-storage` is [05](../../doc/05-ai-storage.md) and nothing else: four levels
 * with different lifetimes, and promotion between them that is explicit,
 * recorded and reversible. None of it is built. There is no store, no promotion,
 * no consolidation.
 *
 * So why draw it at all? Because a picture is a cheaper specification than a
 * document, and a *interactive* picture is cheaper still — you find out that
 * "promote a flow into project memory" needs a reason field by trying to press
 * the button, not by reviewing a schema. This module exists to be argued with
 * and then thrown away, and the thing that replaces it should be able to reuse
 * the shape rather than the code.
 *
 * ## The rule this module lives under
 *
 * **Everything here is marked, in the UI, as not built.** Not in a footnote — on
 * the object. A surface that mixes measured state with a sketch of state teaches
 * whoever reads it to trust both equally, and the trustworthy half is the one
 * that loses. `trace.ts` is the opposite of this file: every field there comes
 * from the flow store.
 *
 * ## Where the shape comes from
 *
 * The four levels are doc/05's. The consolidation step — many traces in, fewer
 * reusable notes out — is the job the two seeded system agents already name
 * (`MemoryAnalysisAgent`, `MemoryConsolidationAgent`, inherited from llmunix)
 * and the one `evolving-memory` implements as a dream cycle. Its `TraceCurator`
 * decides which steps of a trace mattered, which is the question
 * `contribution.ts` already answers here — so the cheap version of consolidation
 * is not a port, it is: **keep the steps that carried something forward, drop
 * the ones that did not.**
 */

/** doc/05's four levels, longest-lived first. */
export type MemoryLevel = "system" | "user" | "project" | "flow";

export const MEMORY_LEVELS: ReadonlyArray<{
  level: MemoryLevel;
  color: string;
  note: string;
}> = [
  {
    level: "system",
    color: "#6b4fa8",
    note: "the org's own; read-only everywhere below",
  },
  {
    level: "user",
    color: "#3f8f3f",
    note: "one person's, across every project they are in",
  },
  {
    level: "project",
    color: "#2f6fb5",
    note: "the scope's; what a team knows",
  },
  {
    level: "flow",
    color: "#c8781b",
    note: "one flow's working notes — expected to die with it",
  },
];

export interface MemoryNote {
  id: string;
  level: MemoryLevel;
  title: string;
  body: string;
  /**
   * The flows this note was consolidated from.
   *
   * Provenance is the whole argument for promotion being recorded rather than
   * implicit: a note nobody can trace back to the work that produced it is
   * indistinguishable from a note somebody typed, and the system has no way to
   * revisit it when the work turns out to have been wrong.
   */
  from: string[];
  /** Set when this note was promoted up a level, so it can be reversed. */
  promotedFrom?: MemoryLevel;
}

/**
 * What consolidation would do, if it existed.
 *
 * Deliberately the dumbest version that is still the right shape: take the steps
 * of a finished flow that carried something forward, and write one note. The
 * point of having it here is to make the *interface* concrete — what a note is,
 * where it comes from, what it costs to promote — not to be the algorithm.
 *
 * The real one has a decision this does not: **when two notes say the same thing,
 * which survives?** That is the question `evolving-memory`'s connector and
 * compactor exist to answer, and it is the reason consolidation cannot just be a
 * loop over finished flows.
 */
export function proposeNote(flow: {
  id: string;
  title: string;
  goal: string;
  steps: Array<{
    agent: string | null;
    result: string | null;
    ignored: boolean;
  }>;
}): MemoryNote {
  const carried = flow.steps.filter((s) => !s.ignored && s.result);
  return {
    id: `note-${flow.id}`,
    level: "flow",
    title: flow.title,
    body:
      `Goal: ${flow.goal}\n\n` +
      carried
        .map((s) => `${s.agent ?? "step"}: ${(s.result ?? "").slice(0, 160)}`)
        .join("\n") +
      (carried.length < flow.steps.length
        ? `\n\n(${flow.steps.length - carried.length} step(s) carried nothing forward and were dropped.)`
        : ""),
    from: [flow.id],
  };
}

/** The next level up, or null at the top. Promotion is one rung at a time, on purpose. */
export function nextLevel(level: MemoryLevel): MemoryLevel | null {
  if (level === "flow") return "project";
  if (level === "project") return "user";
  if (level === "user") return "system";
  return null;
}
