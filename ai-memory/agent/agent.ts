/**
 * MemoryKeeper — the root of the memory tree.
 *
 * ## Why this tree runs here and not on the harness the rest of ai-os uses
 *
 * The memory agents are a *tree*: a keeper that routes, and five specialists
 * that each need a different prompt and a different tool surface. The harness in
 * `ai-base` cannot run that shape, and the reason is structural rather than a
 * missing feature — a delegated child is built without `runChild`, so an agent
 * cannot delegate to its own subagent. `compose.ts` therefore flattens a declared
 * tree into a flat sequence, and a system agent reached from a project scope is
 * marked `inline`: its instructions are pasted into the parent's context, with no
 * isolated window and no tool narrowing. `ai-base` is a subtree that stays
 * byte-identical to upstream, so this is not ours to fix.
 *
 * eve runs exactly this shape: declared subagents nest to whatever depth the
 * directory tree has, each one is discovered as its own agent root inheriting
 * nothing, and each starts with fresh history and fresh state. That is not a
 * preference between two frameworks — it is the capability the tree needs and
 * one of them does not have.
 *
 * **What did not change is the part that matters most.** Every instruction in
 * this tree is still `instructions.md`, still markdown, still the file a person
 * edits. The mechanics are still `ai-flows/src/wiki.ts`, still tested there. eve
 * supplies the one thing neither of those could: real delegation.
 *
 * ## The model
 *
 * Gemini Flash, through the AI SDK provider directly rather than through a
 * gateway, so this needs a `GOOGLE_GENERATIVE_AI_API_KEY` and nothing else — no
 * account, no deploy, no hosted dependency. The model is a variable here because
 * it is a variable in fact: the tree's shape is not an argument for any
 * particular one, and doc/11 is where a model choice has to be argued.
 */
import { defineAgent } from "eve";
import { model } from "./lib/model.ts";

export default defineAgent({
  model: model(),
});
