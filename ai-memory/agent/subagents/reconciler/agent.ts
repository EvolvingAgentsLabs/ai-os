import { defineAgent } from "eve";
import { model } from "../../lib/model.ts";

export default defineAgent({
  description:
    "Given several notes that may be the same idea, decide whether they are, which is canonical, and what each variant adds. Run only after the index exists.",
  model: model(),
});
