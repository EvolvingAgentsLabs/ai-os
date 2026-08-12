/**
 * Everything about the wiki that code can decide, decided by code.
 *
 * A link that points at nothing, a note in no shard, a note no filter can reach.
 * The keeper runs this after a phase rather than asking a model to check its own
 * work — a model auditing its own output is the cheapest possible way to get a
 * clean report and a broken artefact.
 */
import { defineTool } from "eve/tools";
import { z } from "zod";
import { lint } from "../../../ai-flows/src/wiki.ts";
import { load } from "../lib/store.ts";

export default defineTool({
  description:
    "Check the project wiki for the defects code can decide: dangling links, unreachable notes, notes with no keywords. Returns an empty list when it is sound.",
  inputSchema: z.object({ project: z.string().min(1) }),
  async execute({ project }) {
    const wiki = load(project);
    return { problems: lint(wiki), notes: Object.keys(wiki.notes).length };
  },
});
