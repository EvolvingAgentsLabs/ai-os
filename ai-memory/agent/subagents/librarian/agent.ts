import { defineAgent } from "eve";
import { CONTEXT_WINDOW_TOKENS, model } from "../../lib/model.ts";

export default defineAgent({
  description:
    "Given a task, decide which notes to open and in what order. Run at query time, after the knowledge base is built.",
  model: model(),
  modelContextWindowTokens: CONTEXT_WINDOW_TOKENS,
});
