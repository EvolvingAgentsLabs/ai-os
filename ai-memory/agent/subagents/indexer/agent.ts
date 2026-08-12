import { defineAgent } from "eve";
import { CONTEXT_WINDOW_TOKENS, model } from "../../lib/model.ts";

export default defineAgent({
  description:
    "Write one note for one unit of source text, given the index so far. Call repeatedly until the source is exhausted.",
  model: model(),
  modelContextWindowTokens: CONTEXT_WINDOW_TOKENS,
});
