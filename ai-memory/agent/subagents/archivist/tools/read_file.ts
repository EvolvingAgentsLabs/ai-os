/**
 * Off for the archivist.
 *
 * eve's file tools run in an isolated container, not on the machine the tools
 * this tree authored run on -- so a built-in read of a project path fails, and
 * the model retries it forever. The archivist is handed its sample in the
 * message; the specialists that need real files use `wiki_step`, which runs in
 * the server process and can see them.
 */
import { disableTool } from "eve/tools";

export default disableTool();
