/**
 * What the indexer is allowed to see on one step, and whether it fits.
 *
 * The whole design is in the return value. The agent gets the root, the one
 * shard it is writing into, and a window of source — never the corpus and never
 * the whole index — and it gets told, in tokens, what that cost against the
 * budget. `fits: false` is not advice: a step sent over budget is a step whose
 * prompt gets truncated somewhere nobody chose, and the note it writes will be
 * plausible and short.
 */
import { readFileSync } from "node:fs";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { activeShard, progressOf, stepContext } from "../../../../../ai-flows/src/wiki.ts";
import { load } from "../../../lib/store.ts";

export default defineTool({
  description:
    "Assemble one indexing step: the index root, the shard being written into, and the next window of source text. Reports the token cost and whether it fits the budget.",
  inputSchema: z.object({
    project: z.string().min(1),
    source: z.string().min(1).describe("Path to the source document."),
    from: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Where to read from. Omit it: the tool resumes from what is already indexed."),
    windowChars: z.number().int().min(200).max(20000).default(4000),
    budget: z.number().int().min(1000).default(8000),
  }),
  async execute({ project, source, from, windowChars, budget }) {
    const text = readFileSync(source, "utf8");
    const wiki = load(project);
    // Resume from the wiki itself. A caller-supplied offset is a second record
    // of how far the run got, and when the two disagree the run either repeats
    // work or skips material -- and skipping is silent.
    const progress = progressOf(wiki, source, text.length);
    const start = from ?? progress.nextFrom;
    const window = text.slice(start, start + windowChars);
    const ctx = stepContext(wiki, activeShard(wiki), window, budget);
    return {
      root: ctx.root,
      shard: ctx.shard,
      shardId: activeShard(wiki),
      window: ctx.window,
      windowFrom: start,
      windowTo: Math.min(start + windowChars, text.length),
      windowChars,
      sourceChars: text.length,
      covered: progress.covered,
      gaps: progress.gaps,
      exhausted: start >= text.length,
      tokens: ctx.tokens,
      fits: ctx.fits,
      budget: ctx.budget,
    };
  },
});
