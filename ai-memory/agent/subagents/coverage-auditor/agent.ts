import { defineAgent } from "eve";
import { CONTEXT_WINDOW_TOKENS, model } from "../../lib/model.ts";

export default defineAgent({
  description:
    "Find ideas in the index that have no realisation in a second document. Run only when a second document is in play.",
  model: model(),
  modelContextWindowTokens: CONTEXT_WINDOW_TOKENS,
});
