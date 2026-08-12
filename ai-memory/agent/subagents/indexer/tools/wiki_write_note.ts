/**
 * Write one note, and let the mechanics decide where it lands.
 *
 * The agent supplies judgement — title, summary, ideas, keywords, state — and
 * nothing else. The id, the hash, the character count, the shard it goes into
 * and whether that shard now has to split are all computed, because they are
 * arithmetic and an agent doing arithmetic is an agent spending a model call on
 * a regex.
 */
import { defineTool } from "eve/tools";
import { z } from "zod";
import { NOTE_STATES, shortHash, verifyNote } from "../../../../../ai-flows/src/wiki.ts";
import { addNote, load, save } from "../../../lib/store.ts";

export default defineTool({
  description:
    "Write one note into the project wiki. Returns the id it was given, the shard it landed in, and where the next window should start.",
  inputSchema: z.object({
    project: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1).describe("One sentence. This is what the index costs."),
    ideas: z.array(z.string()).min(1).describe("The claims this unit makes."),
    keywords: z.array(z.string()).min(1).describe("Concrete nouns, names, numbers."),
    state: z.enum(NOTE_STATES),
    unitText: z.string().min(1).describe("The source text of the unit itself."),
    source: z.object({ file: z.string(), from: z.number().int(), to: z.number().int() }),
    duplicateOf: z.string().optional(),
    budget: z.number().int().min(1000).default(8000),
    windowFrom: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("The offset wiki_step was called with, so the range can be checked against what you were shown."),
    windowChars: z.number().int().min(1).default(4000),
  }),
  async execute(input) {
    const wiki = load(input.project);
    const id = `n${String(Object.keys(wiki.notes).length).padStart(4, "0")}`;
    const note = {
      id,
      title: input.title,
      summary: input.summary,
      ideas: input.ideas,
      keywords: input.keywords,
      chars: input.unitText.length,
      hash: shortHash(input.unitText),
      unit: "idea" as const,
      state: input.state,
      source: input.source,
      links: [],
      ...(input.duplicateOf ? { duplicateOf: input.duplicateOf } : {}),
    };
    // Checked at the door. A note that fails has to be fixed by the writer while
    // it still has the source in front of it; the same note caught by a lint a
    // thousand notes later cannot be recovered, because nobody knows any more
    // what it should have said.
    const problems = verifyNote(note, {
      text: "x".repeat(input.windowChars),
      from: input.windowFrom,
    });
    if (problems.length)
      return { written: false, problems, hint: "fix these and call wiki_write_note again" };

    const next = addNote(wiki, note, input.budget);
    save(input.project, next, note);
    return {
      written: true,
      id,
      shards: next.shards.length,
      notes: Object.keys(next.notes).length,
      nextFrom: input.source.to,
    };
  },
});
