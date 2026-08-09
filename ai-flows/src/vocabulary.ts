/**
 * The visual vocabulary, in one place because two surfaces draw with it.
 *
 * The read-only explorer ([view.ts](view.ts)) and the canvas
 * (`ai-ui`) show the same system, and a person who learns what a purple cube
 * means on one must not find it means something else on the other. Two copies of
 * this table would diverge on the first change and nothing would fail.
 *
 * It lives in `ai-flows` rather than in `ai-ui` because the explorer is the
 * older surface and the canvas is the one being argued for — the dependency
 * points from the thing being justified to the thing already justified, never
 * the other way.
 *
 * ## Why colour at all
 *
 * The first explorer was a flat dark document and the one complaint it drew was
 * that it was unclear: everything the same weight, nothing telling you what kind
 * of thing you were looking at. System 7 and Windows 3.1 solved that before they
 * solved anything else — **kind and state visible before you read a word** — and
 * that is the whole reason the vocabulary is shaped this way.
 *
 * The rule that keeps it honest: **every colour drawn must appear in a legend
 * generated from these tables**, never from a hand-kept list. A legend that
 * drifts from the page it explains is worse than no colour at all.
 */
import type { ScopeRole } from "./conformation.ts";

export const SCOPE_COLORS: Record<ScopeRole, string> = {
  system: "#6b4fa8",
  project: "#2f6fb5",
  collective: "#1f8a70",
  team: "#c8781b",
  individual: "#3f8f3f",
  unknown: "#b03a2e",
};

/**
 * Step states and flow states share this table on purpose: `done` means the same
 * thing at both levels, and giving them separate palettes would invent a
 * distinction the system does not have.
 *
 * Several names share a colour (`pending`, `waiting` and `draft` are all "not
 * started"), which is why the legend groups by colour rather than by name — it
 * must not claim a distinction the page cannot draw.
 */
export const STATE_COLORS: Record<string, string> = {
  done: "#3f8f3f",
  running: "#e0a020",
  pending: "#b9b4a8",
  failed: "#b03a2e",
  blocked: "#b03a2e",
  waiting: "#b9b4a8",
  abandoned: "#7a7469",
  draft: "#b9b4a8",
};

export const AGENT_COLOR = "#e0a020";
export const SUBAGENT_COLOR = "#c98f2e";
/** A name declared in an agent's `subagents:` with no file behind it. */
export const MISSING_COLOR = "#b03a2e";
export const PERSON_COLOR = "#5a5f66";

/** Group the state palette by colour, so a legend cannot claim a distinction the page cannot draw. */
export function statesByColor(): Array<[string, string[]]> {
  const byColor = new Map<string, string[]>();
  for (const [name, color] of Object.entries(STATE_COLORS)) {
    byColor.set(color, [...(byColor.get(color) ?? []), name]);
  }
  return [...byColor];
}

/**
 * The chrome primitives: the desk surface, a window, a bevel, a cube, a document.
 *
 * Shared as a string rather than a stylesheet file because both surfaces must
 * stay **self-contained** — no external requests, so they open from a file days
 * later with no server running. That rules out a `<link>`, which is exactly the
 * kind of convenience that breaks a page when nobody is watching.
 */
export const CHROME_CSS = `
:root{
  --desk:#8f8f93; --face:#d8d4cc; --paper:#fbfaf7; --ink:#16181a; --dim:#5f646b;
  --lite:rgba(255,255,255,.75); --dark:rgba(0,0,0,.38);
  --sans:"Geneva","Verdana","DejaVu Sans",system-ui,sans-serif;
  --mono:"Monaco","Menlo",ui-monospace,"Courier New",monospace;
}
*{box-sizing:border-box}
code{font-family:var(--mono);font-size:12px}
.dim,.muted{color:var(--dim)}
.warn{color:#8a5a00}
.err{color:#94271b}
.ok{color:#2c6b2c}

html,body{min-height:100%}
body{margin:0;color:var(--ink);font:14px/1.55 var(--sans)}

/* The 50% dither the desktop was in 1991, drawn as a 2px checkerboard. */
.deskbg{
  background:var(--desk);
  background-image:
    linear-gradient(45deg,rgba(0,0,0,.07) 25%,transparent 25%,transparent 75%,rgba(0,0,0,.07) 75%),
    linear-gradient(45deg,rgba(0,0,0,.07) 25%,transparent 25%,transparent 75%,rgba(0,0,0,.07) 75%);
  background-size:4px 4px; background-position:0 0,2px 2px;
}

/* A window: title bar, border, hard shadow. The unit of "one thing ends here". */
.win{background:var(--face);border:1px solid #000;box-shadow:3px 3px 0 rgba(0,0,0,.4)}
.win .bar{display:flex;align-items:center;gap:8px;padding:4px 7px;border-bottom:1px solid #000;
  background:var(--face);
  background-image:repeating-linear-gradient(180deg,rgba(0,0,0,.42) 0 1px,transparent 1px 3px);}
.win .bar h1,.win .bar h2{font-size:13px;margin:0;font-weight:700;letter-spacing:.02em;
  background:var(--face);padding:1px 12px;white-space:nowrap}
.win .bar .count{font-weight:400;color:var(--dim)}
.win .box{width:11px;height:11px;flex:0 0 11px;background:var(--face);border:1px solid #000;
  box-shadow:inset 1px 1px 0 var(--lite),inset -1px -1px 0 var(--dark)}
.win .box.zoom{margin-left:auto}
.win-body{padding:14px 16px 16px;background:var(--paper)}
/* Recessed: a container that holds things, rather than a thing. */
.win.tray .win-body{background:#cfcbc2;
  box-shadow:inset 2px 2px 0 var(--dark),inset -2px -2px 0 var(--lite);padding:12px}

/* The cube: the unit of kind and state. */
.cube{display:inline-block;width:13px;height:13px;flex:0 0 13px;background:var(--c);
  border:1px solid rgba(0,0,0,.55);
  box-shadow:inset 1.5px 1.5px 0 rgba(255,255,255,.5),inset -1.5px -1.5px 0 rgba(0,0,0,.3);
  vertical-align:-2px;margin-right:6px}
.cube.sm{width:9px;height:9px;flex-basis:9px;vertical-align:0;margin-right:5px}
.cube.lg{width:17px;height:17px;flex-basis:17px;vertical-align:-3px}
.strip{display:inline-flex;align-items:center}
.strip .cube{margin-right:3px}

/* A page with a folded corner, in two boxes and a triangle. */
.doc-icon{position:relative;width:16px;height:20px;flex:0 0 16px;background:#fff;border:1px solid #000;
  box-shadow:1px 1px 0 rgba(0,0,0,.2)}
.doc-icon::before{content:"";position:absolute;right:-1px;top:-1px;border-width:0 7px 7px 0;
  border-style:solid;border-color:transparent #b9b4a8 transparent transparent}
.doc-icon::after{content:"";position:absolute;left:3px;top:8px;width:9px;height:1px;color:#b9b4a8;
  box-shadow:0 0 0 0 currentColor,0 3px 0 currentColor,0 6px 0 currentColor;background:currentColor}

.menubar{background:var(--paper);border-bottom:1px solid #000;
  padding:5px 14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:12px;
  box-shadow:0 1px 0 rgba(255,255,255,.6) inset}
.menubar .apple{font-weight:700;letter-spacing:.04em}
.menubar .sep{color:#a9a49a}
.menubar .right{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--dim)}

.key{display:flex;gap:34px;flex-wrap:wrap;font-size:12px}
.key ul{list-style:none;margin:6px 0 0;padding:0}
.key li{display:flex;align-items:center;padding:1px 0}
.key strong{font-size:12px}
`;
