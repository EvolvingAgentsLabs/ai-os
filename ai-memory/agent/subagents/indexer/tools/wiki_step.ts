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
import { activeShard, stepContext } from "../../../../../ai-flows/src/wiki.ts";
import { load } from "../../../lib/store.ts";

export default defineTool({
  description:
    "Assemble one indexing step: the index root, the shard being written into, and the next window of source text. Reports the token cost and whether it fits the budget.",
  inputSchema: z.object({
    project: z.string().min(1),
    source: z.string().min(1).describe("Path to the source document."),
    from: z.number().int().min(0).describe("Character offset to read from."),
    windowChars: z.number().int().min(200).max(20000).default(4000),
    budget: z.number().int().min(1000).default(8000),
  }),
  async execute({ project, source, from, windowChars, budget }) {
    const text = readFileSync(source, "utf8");
    const window = text.slice(from, from + windowChars);
    const wiki = load(project);
    const ctx = stepContext(wiki, activeShard(wiki), window, budget);
    return {
      root: ctx.root,
      shard: ctx.shard,
      shardId: activeShard(wiki),
      window: ctx.window,
      windowFrom: from,
      windowTo: Math.min(from + windowChars, text.length),
      sourceChars: text.length,
      exhausted: from >= text.length,
      tokens: ctx.tokens,
      fits: ctx.fits,
      budget: ctx.budget,
    };
  },
});
