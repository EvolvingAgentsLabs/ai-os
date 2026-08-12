/**
 * Off for this specialist.
 *
 * The narrowing is the reason this tree runs here rather than on the harness the
 * rest of ai-os uses: a subagent's tool surface is whatever is authored under its
 * own directory, so "this one cannot do that" is enforced by the filesystem
 * instead of asked for in a prompt.
 *
 * It is not hygiene. Left available, the general-purpose tools are what the model
 * reaches for -- one run spent thirteen turns in `bash` inspecting a file it had
 * a purpose-built tool for, and never got to writing the note. A specialist with
 * a general-purpose escape hatch is a generalist.
 */
import { disableTool } from "eve/tools";

export default disableTool();
