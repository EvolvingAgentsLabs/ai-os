import { defineAgent } from "eve";
import { model } from "../../lib/model.ts";

export default defineAgent({
  description:
    "Given a task, decide which notes to open and in what order. Run at query time, after the knowledge base is built.",
  model: model(),
});
