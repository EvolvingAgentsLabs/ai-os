import { defineAgent } from "eve";
import { CONTEXT_WINDOW_TOKENS, model } from "../../lib/model.ts";

export default defineAgent({
  description:
    "Given several notes that may be the same idea, decide whether they are, which is canonical, and what each variant adds. Run only after the index exists.",
  model: model(),
  modelContextWindowTokens: CONTEXT_WINDOW_TOKENS,
});
