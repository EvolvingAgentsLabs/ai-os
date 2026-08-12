import { defineAgent } from "eve";
import { model } from "../../lib/model.ts";

export default defineAgent({
  description:
    "Decide what kind of material a source document is, what one unit of it is, and which metadata this case needs. Run once per source, before any indexing.",
  model: model(),
});
