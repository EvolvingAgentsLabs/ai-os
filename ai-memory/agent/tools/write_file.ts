/**
 * Off for the keeper.
 *
 * Its own instructions say it is an orchestrator that writes nothing, and an
 * instruction is not an enforcement: given a general-purpose tool the model
 * reaches for it, and two runs were spent inspecting files by hand instead of
 * delegating. The keeper routes to subagents and calls `wiki_lint`; nothing else
 * is its job, so nothing else is in its directory.
 */
import { disableTool } from "eve/tools";

export default disableTool();
