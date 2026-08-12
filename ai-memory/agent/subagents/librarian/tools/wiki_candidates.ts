/**
 * The cheap half of retrieval, before the expensive half is asked anything.
 *
 * A deterministic keyword filter over the mirror. It costs nothing and throws
 * away most of the index; what survives is small enough for the librarian to
 * read and decide over. A knowledge base whose every query costs a model call
 * has moved the cost rather than removed it.
 */
import { defineTool } from "eve/tools";
import { z } from "zod";
import { candidates, noteCard } from "../../../../../ai-flows/src/wiki.ts";
import { load } from "../../../lib/store.ts";

export default defineTool({
  description:
    "Filter the wiki by keyword with no model call. Returns the index cards of the notes that match, most matches first.",
  inputSchema: z.object({
    project: z.string().min(1),
    keywords: z.array(z.string()).min(1),
    limit: z.number().int().min(1).max(60).default(12),
  }),
  async execute({ project, keywords, limit }) {
    const wiki = load(project);
    const hits = candidates(wiki, keywords, limit);
    return {
      total: Object.keys(wiki.notes).length,
      matched: hits.length,
      cards: hits.map(noteCard),
    };
  },
});
