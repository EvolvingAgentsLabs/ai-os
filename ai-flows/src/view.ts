/**
 * One page that shows the whole system: its conformation, and its flows.
 *
 * [08-roadmap § Phase 2](../../doc/08-roadmap.md) argues this before the canvas.
 * M5 is Lit plus `dockview-core` plus spatial layout plus generated components,
 * and it exists to answer one question — *can a person pick a flow up after
 * three days?* A flat read-only render answers the same question in an afternoon,
 * and if it answers it well enough then the canvas is not the next thing to
 * build. **This page is the control arm for M5**, not a placeholder for it.
 *
 * Deliberately absent, and each absence is the point rather than a shortcut:
 * no layout persistence, no drag, no generated components, no live updates, no
 * interaction of any kind. Anything this page cannot do that a person turns out
 * to need is evidence for the canvas, and it is only evidence if it was never
 * quietly added here.
 *
 * ## Why it looks like 1991
 *
 * The first version was a dark flat document, and the complaint it drew was that
 * it was **unclear** — everything the same weight, nothing telling you what kind
 * of thing you were looking at. So the vocabulary here is borrowed wholesale from
 * System 7 and Windows 3.1, for one reason: those interfaces made *kind* and
 * *state* visible before you read a single word. A window has a title bar and a
 * border, so you know where one thing ends. A beveled edge tells you what is a
 * surface and what is a hole. And an object with a colour and a shape is a thing
 * you can point at.
 *
 *   - **Cubes carry kind and state.** Every scope role, every agent, every step
 *     state has one colour, used nowhere else, with a legend on the page. A flow's
 *     progress is a strip of cubes you can count from across the room.
 *   - **Documents are documents.** A flow is drawn as a page with a folded corner,
 *     because that is what it is: a thing with a title that someone has to pick
 *     back up.
 *   - **Trays hold work.** In-tray for what is still moving, out-tray for what has
 *     settled. The desk metaphor is not decoration — "where is this and is anyone
 *     holding it" is exactly the question the page exists to answer.
 *
 * The chrome is period-accurate; the type inside it is not. Nine-point Geneva on
 * a 640×480 screen was a constraint, not a goal, and reproducing it would trade
 * the clarity this redesign is for.
 *
 * **Nothing here is clickable.** The menu bar carries facts rather than menus,
 * for that reason: a fake File menu is an affordance that lies, and this page's
 * whole value as M5's control arm depends on it not quietly growing interaction.
 *
 * Self-contained HTML with no external requests: it has to open from a file over
 * a coffee, days later, with no server running. That rules out webfonts and
 * images, so every icon below is drawn in CSS.
 */
import type { AgentRecord, Conformation, ScopeNode, ScopeRole } from "./conformation.ts";
import { contributionsOf } from "./contribution.ts";
import { observabilityOf } from "./observability.ts";
import type { FlowWithSteps, Step } from "./types.ts";

/**
 * 95% upper bound on the false-change rate, measured 2026-08-06 on
 * `pi` / `deepseek-v4-flash` over 22 turns of repeated identical work
 * ([10-observability](../../doc/10-observability.md)). The point estimate was 0%
 * on normalized digests; this is the bound, because 22 turns cannot establish
 * that an instrument never lies.
 */
export const DELTA_UPPER_BOUND = 0.146;

export interface ViewInput {
  conformation?: Conformation;
  flows: FlowWithSteps[];
  at?: number;
  /** Where the data came from, so a stale page cannot be mistaken for a live one. */
  source?: string;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function ago(from: number, to: number): string {
  const s = Math.max(0, Math.round((to - from) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * The colour vocabulary, defined once and rendered into the legend from the same
 * table that styles the page.
 *
 * A legend maintained separately from the styles is a legend that goes wrong
 * silently, and a wrong legend on a page whose entire premise is "colour tells
 * you the kind" is worse than no colour at all.
 */
const SCOPE_COLORS: Record<ScopeRole, string> = {
  system: "#6b4fa8",
  project: "#2f6fb5",
  collective: "#1f8a70",
  team: "#c8781b",
  individual: "#3f8f3f",
  unknown: "#b03a2e",
};

const STATE_COLORS: Record<string, string> = {
  done: "#3f8f3f",
  running: "#e0a020",
  pending: "#b9b4a8",
  failed: "#b03a2e",
  blocked: "#b03a2e",
  waiting: "#b9b4a8",
  abandoned: "#7a7469",
  draft: "#b9b4a8",
};

/** A beveled square. The unit this whole page is built out of. */
function cube(color: string, title: string, extra = ""): string {
  return `<span class="cube${extra ? ` ${extra}` : ""}" style="--c:${color}" title="${esc(title)}"></span>`;
}

/**
 * Is this flow still moving, and can that even be told?
 *
 * Reuses the flow observability instrument rather than inventing a second
 * judgement. `observabilityOf` returns `insufficient` when there are too few
 * digests to say anything, and that is reported as "not enough to say" instead
 * of being rounded to "stuck" — the asymmetry doc/10 is built on is that a
 * repeat is proof and a difference is a rumour.
 */
function movement(flow: FlowWithSteps): { label: string; tone: string; detail: string } {
  const digests = flow.steps
    .flatMap((s) => s.attempts)
    .map((a) => a.observation?.digest)
    .filter((d): d is string => Boolean(d));
  if (digests.length < 2) return { label: "not enough to say", tone: "muted", detail: `${digests.length} observation(s)` };
  /**
   * The floor is the **measured 95% upper bound on δ**, not a guess and not the
   * point estimate. doc/10 measured δ = 0% on normalized digests over 22 turns;
   * quoting 0 here would claim the instrument never lies, which 22 turns cannot
   * establish. The upper bound is the honest number to reason with.
   */
  const o = observabilityOf(digests, { floor: DELTA_UPPER_BOUND });
  const detail = `${digests.length} observations · δ ≤ ${(DELTA_UPPER_BOUND * 100).toFixed(1)}%`;
  if (o.verdict === "progressing") return { label: "progressing", tone: "ok", detail };
  if (o.verdict === "drift") return { label: "drift — repeating itself", tone: "warn", detail };
  if (o.verdict === "unreadable") return { label: "unreadable — fix the fingerprint", tone: "warn", detail };
  return { label: "not enough to say", tone: "muted", detail };
}

function stepRow(step: Step, isCurrent: boolean, now: number): string {
  const attempts = step.attempts
    .map((a) => {
      const obs = a.observation
        ? `<code>${esc(a.observation.digest)}</code> <span class="dim">${esc(a.observation.source)}</span>`
        : `<span class="dim">no observation</span>`;
      const run = a.runId ? `<code class="dim">${esc(a.runId.slice(0, 8))}</code>` : `<span class="dim">no run</span>`;
      return `<li>${cube(STATE_COLORS[a.state] ?? "#b9b4a8", a.state, "sm")} <span class="dim">attempt ${a.n}</span> · ${run} · ${obs}${
        a.error ? ` · <span class="err">${esc(a.error.slice(0, 200))}</span>` : ""
      }</li>`;
    })
    .join("");
  return `<div class="step${isCurrent ? " current" : ""}">
    <div class="step-head">
      ${cube(STATE_COLORS[step.state] ?? "#b9b4a8", `step ${step.index}: ${step.state}`)}
      <span class="idx">${step.index}</span>
      <span class="intent">${esc(step.intent)}</span>
      <span class="state-word ${esc(step.state)}">${esc(step.state)}</span>
      <span class="dim when">${esc(ago(step.updatedAt, now))}</span>
    </div>
    ${step.result ? `<div class="result">${esc(step.result.slice(0, 600))}</div>` : ""}
    ${attempts ? `<ul class="attempts">${attempts}</ul>` : `<div class="dim none">never attempted</div>`}
  </div>`;
}

/**
 * The progress strip: one cube per step, in order, coloured by state.
 *
 * This is the single element the redesign was for. "5/8 steps done" is a fact you
 * have to read; eight cubes with five green ones is a fact you see — and where
 * the *unfinished* ones sit, which the fraction throws away.
 */
function stepStrip(flow: FlowWithSteps): string {
  return `<span class="strip">${flow.steps
    .map((s) => cube(STATE_COLORS[s.state] ?? "#b9b4a8", `step ${s.index}: ${s.state}`))
    .join("")}</span>`;
}

function flowCard(flow: FlowWithSteps, now: number): string {
  const move = movement(flow);
  /**
   * Steps that ran and used nothing they were handed.
   *
   * Shown next to the state rather than buried, because the whole point is that
   * every other signal on this card said the flow was fine
   * (doc/13-degradation.md).
   */
  const ignored = contributionsOf(flow.steps).filter((c) => c.verdict === "ignored-input");
  // The step a person coming back needs to look at first: the one that is
  // running, else the first that has not settled.
  const current =
    flow.steps.find((s) => s.state === "running") ?? flow.steps.find((s) => s.state === "pending");
  const done = flow.steps.filter((s) => s.state === "done").length;
  return `<article class="flow doc">
    <header>
      <span class="doc-icon" aria-hidden="true"></span>
      <h2>${esc(flow.title)}</h2>
      ${cube(STATE_COLORS[flow.state] ?? "#b9b4a8", `flow: ${flow.state}`)}
      <span class="state-word ${esc(flow.state)}">${esc(flow.state)}</span>
      <span class="dim">${esc(flow.scopeId)} · ${esc(flow.shape)} · updated ${esc(ago(flow.updatedAt, now))}</span>
    </header>
    <p class="goal">${esc(flow.goal)}</p>
    <div class="meta">
      ${stepStrip(flow)}
      <span class="dim">${done}/${flow.steps.length} steps done</span>
      <span class="${esc(move.tone)}">${esc(move.label)}</span>
      <span class="dim">${esc(move.detail)}</span>
      ${flow.forkedFrom ? `<span class="dim">forked from ${esc(flow.forkedFrom.flowId.slice(0, 8))} at step ${flow.forkedFrom.atStep}</span>` : ""}
    </div>
    ${
      ignored.length
        ? `<div class="note alert"><strong>${ignored.length} step(s) used nothing they were given</strong>
             — step${ignored.length > 1 ? "s" : ""} ${ignored.map((c) => c.stepIndex).join(", ")}.
             <span class="dim">Each ran, settled and reported. None carried a single distinctive word out of its predecessor's output.</span></div>`
        : ""
    }
    ${current ? `<div class="note next">Next: <strong>${esc(current.intent)}</strong></div>` : `<div class="note dim">Nothing left to do</div>`}
    <div class="steps">${flow.steps.map((s) => stepRow(s, s.id === current?.id, now)).join("")}</div>
  </article>`;
}

/**
 * The order the levels are shown in, and it is the OS's own layering rather than
 * an alphabetical accident: the system scope is mounted read-only into every
 * other one, so it is drawn first and everything below inherits from it.
 */
const LEVELS: Array<{ role: ScopeRole; label: string; note: string }> = [
  { role: "system", label: "System", note: "the org scope — mounted read-only into every scope below as global/" },
  { role: "project", label: "Projects", note: "group scopes with a reserved prefix, each with a roster" },
  { role: "collective", label: "Groups & channels", note: "shared scopes without a roster of their own" },
  { role: "team", label: "Teams", note: "from the identity provider, not from a project roster" },
  { role: "individual", label: "Individuals", note: "one person's private scope" },
  { role: "unknown", label: "Unrecognised", note: "the scope id did not parse — never assumed benign" },
];

const AGENT_COLOR = "#e0a020";
const SUBAGENT_COLOR = "#c98f2e";

function agentTree(a: AgentRecord, all: Map<string, AgentRecord>, depth = 0, seen = new Set<string>()): string {
  const pad = depth * 20;
  const flags = [
    a.ok ? null : `<span class="err">BROKEN: ${esc(a.error)}</span>`,
    a.inert ? `<span class="warn" title="workspace agents are read only by pi-tools.ts">inert on this harness</span>` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const rows = [
    `<li style="margin-left:${pad}px">${cube(depth ? SUBAGENT_COLOR : AGENT_COLOR, depth ? "subagent" : "agent")}` +
      `<code class="agent">${esc(a.name)}</code>` +
      `<span class="dim tools">[${esc(a.tools.join(" "))}]</span> ${esc(a.description)} ${flags}</li>`,
  ];
  // Cycles are possible the moment composition is declared by hand, and an
  // unguarded render of one is a hung page rather than an error message.
  if (seen.has(a.name)) {
    rows.push(`<li style="margin-left:${pad + 20}px" class="err">cycle — ${esc(a.name)} already appears above</li>`);
    return rows.join("");
  }
  const next = new Set(seen).add(a.name);
  for (const name of a.subagents) {
    const child = all.get(name);
    if (child) rows.push(agentTree(child, all, depth + 1, next));
    else
      rows.push(
        `<li style="margin-left:${pad + 20}px">${cube("#b03a2e", "declared, no file")}<code class="agent missing">${esc(name)}</code> <span class="err">declared, no file</span></li>`,
      );
  }
  return rows.join("");
}

function scopeCard(s: ScopeNode, systemAgents: Map<string, AgentRecord>): string {
  const all = new Map(systemAgents);
  for (const a of s.agents) all.set(a.name, a);
  // Only roots are drawn at the top level; an agent that is somebody's subagent
  // appears under its parent instead of twice.
  const childNames = new Set(s.agents.flatMap((a) => a.subagents));
  const roots = s.agents.filter((a) => !childNames.has(a.name));

  const people = s.roster
    ? `<div class="people"><strong>${s.roster.members.length} member${s.roster.members.length === 1 ? "" : "s"}</strong>
        <span class="dim">roster v${esc(s.roster.version)} — from ProjectStore, never from a folder</span>
        <ul class="folks">${s.roster.members.map((m) => `<li>${cube("#5a5f66", "member")}<code>${esc(m)}</code></li>`).join("")}</ul></div>`
    : s.role === "individual"
      ? `<div class="people">${cube("#5a5f66", "member")}<span class="dim">One person: <code>${esc(s.ref)}</code></span></div>`
      : `<div class="people dim">No roster — membership for this scope kind is not a list ai-os can read.</div>`;

  return `<article class="scope-card" style="--role:${SCOPE_COLORS[s.role]}">
    <header>
      ${cube(SCOPE_COLORS[s.role], s.role, "lg")}
      <code class="scopeid">${esc(s.scopeId)}</code>
      ${s.hasMemory ? `<span class="tag">memory</span>` : ""}
      ${s.skills.length ? `<span class="tag">${s.skills.length} skill${s.skills.length === 1 ? "" : "s"}</span>` : ""}
      <span class="tag">${s.agents.length} agent${s.agents.length === 1 ? "" : "s"}</span>
    </header>
    ${people}
    ${
      roots.length
        ? `<div class="agents"><strong>Agents</strong> <span class="dim">markdown in <code>agents/</code></span>
             <ul class="tree">${roots.map((a) => agentTree(a, all)).join("")}</ul></div>`
        : `<div class="agents dim">No agents defined in this scope.</div>`
    }
    ${s.membershipInFolders.length ? `<div class="note alert">membership-shaped path found and NOT read as membership: ${esc(s.membershipInFolders.join(", "))}</div>` : ""}
  </article>`;
}

/**
 * The legend, generated from the same tables that colour the page.
 *
 * On a page whose premise is that colour carries meaning, a legend is not a nice
 * touch — it is the thing that makes the colour readable rather than decorative.
 */
function legend(): string {
  const swatch = (color: string, label: string) => `<li>${cube(color, label)}<span>${esc(label)}</span></li>`;
  return `<div class="key">
    <div><strong>Scopes</strong><ul>${LEVELS.map((l) => swatch(SCOPE_COLORS[l.role], l.role)).join("")}</ul></div>
    <div><strong>Agents</strong><ul>${swatch(AGENT_COLOR, "agent")}${swatch(SUBAGENT_COLOR, "subagent")}${swatch("#b03a2e", "declared, no file")}${swatch("#5a5f66", "person")}</ul></div>
    <div><strong>Steps &amp; flows</strong><ul>${(() => {
      // Grouped by colour, not by name: several states share one swatch, and a
      // legend that lists them separately claims a distinction the page cannot
      // draw. Built from STATE_COLORS so a new state cannot appear unexplained.
      const byColor = new Map<string, string[]>();
      for (const [name, color] of Object.entries(STATE_COLORS)) {
        byColor.set(color, [...(byColor.get(color) ?? []), name]);
      }
      return [...byColor].map(([color, names]) => swatch(color, names.join(" / "))).join("");
    })()}</ul></div>
  </div>`;
}

/** A window: title bar, border, hard shadow. The unit of "one thing ends here". */
function win(title: string, count: string, body: string, tone = ""): string {
  return `<section class="win${tone ? ` ${tone}` : ""}">
    <div class="bar"><span class="box" aria-hidden="true"></span><h1>${esc(title)}${
      count ? ` <span class="count">${esc(count)}</span>` : ""
    }</h1><span class="box zoom" aria-hidden="true"></span></div>
    <div class="win-body">${body}</div>
  </section>`;
}

const CSS = `
:root{
  --desk:#8f8f93; --face:#d8d4cc; --paper:#fbfaf7; --ink:#16181a; --dim:#5f646b;
  --lite:rgba(255,255,255,.75); --dark:rgba(0,0,0,.38);
  --sans:"Geneva","Verdana","DejaVu Sans",system-ui,sans-serif;
  --mono:"Monaco","Menlo",ui-monospace,"Courier New",monospace;
}
*{box-sizing:border-box}
body{margin:0;color:var(--ink);font:14px/1.55 var(--sans);
  background:var(--desk);
  /* The 50% dither the desktop was in 1991, drawn as a 2px checkerboard. */
  background-image:
    linear-gradient(45deg,rgba(0,0,0,.07) 25%,transparent 25%,transparent 75%,rgba(0,0,0,.07) 75%),
    linear-gradient(45deg,rgba(0,0,0,.07) 25%,transparent 25%,transparent 75%,rgba(0,0,0,.07) 75%);
  background-size:4px 4px; background-position:0 0,2px 2px;
}
code{font-family:var(--mono);font-size:12px}
.dim,.muted{color:var(--dim)}
.warn{color:#8a5a00}
.err{color:#94271b}
.ok{color:#2c6b2c}

/* ---- menu bar: facts, not menus. Nothing here is clickable, on purpose. ---- */
.menubar{position:sticky;top:0;z-index:9;background:var(--paper);border-bottom:1px solid #000;
  padding:5px 14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:12px;
  box-shadow:0 1px 0 rgba(255,255,255,.6) inset}
.menubar .apple{font-weight:700;letter-spacing:.04em}
.menubar .sep{color:#a9a49a}
.menubar .right{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--dim)}

.desk{max-width:1060px;margin:0 auto;padding:22px 18px 90px}

/* ---- windows ---- */
.win{background:var(--face);border:1px solid #000;box-shadow:3px 3px 0 rgba(0,0,0,.4);margin:0 0 26px}
.win .bar{display:flex;align-items:center;gap:8px;padding:4px 7px;border-bottom:1px solid #000;
  background:var(--face);
  /* System 7 pinstripes, behind a title that punches a hole in them. */
  background-image:repeating-linear-gradient(180deg,rgba(0,0,0,.42) 0 1px,transparent 1px 3px);}
.win .bar h1{font-size:13px;margin:0;font-weight:700;letter-spacing:.02em;background:var(--face);
  padding:1px 12px;white-space:nowrap}
.win .bar .count{font-weight:400;color:var(--dim)}
.win .box{width:11px;height:11px;flex:0 0 11px;background:var(--face);border:1px solid #000;
  box-shadow:inset 1px 1px 0 var(--lite),inset -1px -1px 0 var(--dark)}
.win .box.zoom{margin-left:auto}
.win-body{padding:14px 16px 16px;background:var(--paper)}
.win.tray .win-body{background:#cfcbc2;
  box-shadow:inset 2px 2px 0 var(--dark),inset -2px -2px 0 var(--lite);padding:12px}

/* ---- the cube: the unit of kind and state ---- */
.cube{display:inline-block;width:13px;height:13px;flex:0 0 13px;background:var(--c);
  border:1px solid rgba(0,0,0,.55);
  box-shadow:inset 1.5px 1.5px 0 rgba(255,255,255,.5),inset -1.5px -1.5px 0 rgba(0,0,0,.3);
  vertical-align:-2px;margin-right:6px}
.cube.sm{width:9px;height:9px;flex-basis:9px;vertical-align:0;margin-right:5px}
.cube.lg{width:17px;height:17px;flex-basis:17px;vertical-align:-3px}
.strip .cube{margin-right:3px}
.strip{display:inline-flex;align-items:center}

/* ---- legend ---- */
.key{display:flex;gap:34px;flex-wrap:wrap;font-size:12px}
.key ul{list-style:none;margin:6px 0 0;padding:0}
.key li{display:flex;align-items:center;padding:1px 0}
.key strong{font-size:12px}

/* ---- scopes ---- */
.level{margin:0 0 20px}
.level-h{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);font-weight:700;
  margin:0 0 8px;display:block;border-bottom:1px solid #c6c1b7;padding-bottom:4px}
.level-h .dim{text-transform:none;letter-spacing:0;font-weight:400;font-size:12px;margin-left:8px}
.scope-card{background:var(--paper);border:1px solid #000;margin:0 0 12px;padding:0 0 12px;
  box-shadow:2px 2px 0 rgba(0,0,0,.18)}
.scope-card header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 12px;
  border-bottom:1px solid #ded9d0;
  /* The scope's own colour, as a band, so the card is identifiable before reading. */
  border-left:6px solid var(--role)}
.scope-card>*:not(header){margin-left:12px;margin-right:12px}
.scopeid{font-size:13px;font-weight:700}
.tag{font-size:11px;border:1px solid #b3ada2;background:#eae6de;padding:0 6px;color:var(--dim)}
.people{margin-top:10px;font-size:13px}
.folks{list-style:none;margin:5px 0 0;padding:0}
.folks li{display:flex;align-items:center;padding:1px 0}
.agents{margin-top:12px}
.tree{list-style:none;margin:6px 0 0;padding:0;font-size:13px}
/* Hanging indent, not flex. A flex row wraps the description back to the left
   margin, which puts a child's text under its parent's cube and destroys the
   one thing the tree is drawn to show. */
.tree li{padding:2px 0;padding-left:19px;text-indent:-19px}
.tree li>*{text-indent:0}
.agent{font-weight:700}
.agent.missing{color:#94271b;text-decoration:line-through}
.tools{margin:0 6px;font-size:11px}

/* ---- flows as documents on the desk ---- */
.doc{background:var(--paper);border:1px solid #000;box-shadow:2px 2px 0 rgba(0,0,0,.22);
  padding:12px 14px 14px;margin:0 0 12px}
.doc header{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.doc h2{font-size:15px;margin:0;font-weight:700}
/* A page with a folded corner, in two boxes and a triangle. */
.doc-icon{position:relative;width:16px;height:20px;flex:0 0 16px;background:#fff;border:1px solid #000;
  box-shadow:1px 1px 0 rgba(0,0,0,.2)}
.doc-icon::before{content:"";position:absolute;right:-1px;top:-1px;border-width:0 7px 7px 0;
  border-style:solid;border-color:transparent #b9b4a8 transparent transparent}
.doc-icon::after{content:"";position:absolute;left:3px;top:8px;width:9px;height:1px;color:#b9b4a8;
  box-shadow:0 0 0 0 currentColor,0 3px 0 currentColor,0 6px 0 currentColor;background:currentColor}
.state-word{font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:var(--dim)}
.state-word.done{color:#2c6b2c}.state-word.running{color:#8a5a00}
.state-word.failed,.state-word.blocked{color:#94271b}
.goal{margin:8px 0;color:#3b3f44}
.meta{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;align-items:center;margin-bottom:8px}
.note{margin:8px 0;padding:7px 10px;font-size:13px;border:1px solid #c6c1b7;background:#f0ece4}
.note.next{border-left:5px solid #e0a020}
.note.alert{border-left:5px solid #b03a2e;background:#f7ebe8;color:#7d2419}
.step{border-top:1px solid #e4dfd6;padding:9px 0}
.step.current{background:#f4efe3;margin:0 -8px;padding:9px 8px}
.step-head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.idx{color:var(--dim);font-size:12px;font-family:var(--mono)}
.intent{flex:1;min-width:200px}
.when{font-size:12px}
.result{margin:6px 0 0 21px;padding:6px 9px;background:#f0ece4;border:1px solid #ded9d0;
  white-space:pre-wrap;color:#3b3f44}
.attempts{margin:6px 0 0 21px;padding:0;list-style:none;font-size:12px}
.attempts li{padding:2px 0}
.none{margin-left:21px;font-size:12px}

/* ---- holes and edges ---- */
.holes{list-style:none;margin:0;padding:0}
.holes li{margin:0 0 10px;padding-left:22px;position:relative}
/* A dashed outline: the shape of a thing that is not there. */
.holes li::before{content:"?";position:absolute;left:0;top:1px;width:14px;height:14px;
  border:1px dashed #94271b;color:#94271b;font-size:10px;font-weight:700;text-align:center;line-height:12px}
.holes q{display:block;color:var(--dim);font-size:13px;quotes:none}
.edges{list-style:none;margin:0;padding:0;font-size:13px}
.edges li{padding:2px 0}
.empty{color:var(--dim);margin:0}

@media(max-width:640px){
  .desk{padding:14px 10px 60px}
  .key{gap:18px}
}
`;

export function renderViewHtml(input: ViewInput): string {
  const now = input.at ?? Date.now();
  const c = input.conformation;
  const flows = [...input.flows].sort((a, b) => b.updatedAt - a.updatedAt);
  const live = flows.filter((f) => f.state !== "done" && f.state !== "abandoned");
  const rest = flows.filter((f) => f.state === "done" || f.state === "abandoned");

  const systemBody = c
    ? `<p class="dim">Every level of the OS, the people in it, and the agents each scope defines. Membership comes from <code>ProjectStore</code> and the directory; it is never read from a folder.</p>
  ${(() => {
    const systemAgents = new Map(
      (c.scopes.find((s) => s.role === "system")?.agents ?? []).map((a) => [a.name, a] as const),
    );
    return LEVELS.map((level) => {
      const inLevel = c.scopes.filter((s) => s.role === level.role);
      if (!inLevel.length) return "";
      return `<div class="level"><h2 class="level-h">${esc(level.label)} <span class="dim">${esc(level.note)}</span></h2>
        ${inLevel.map((s) => scopeCard(s, systemAgents)).join("")}</div>`;
    }).join("");
  })()}`
    : `<p class="empty">No conformation was projected for this render.</p>`;

  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ai-os — flows and conformation</title>
<style>${CSS}</style>
<div class="menubar">
  <span class="apple">ai-os</span>
  <span class="sep">|</span>
  <span>rendered ${esc(new Date(now).toISOString())}</span>
  ${input.source ? `<span class="sep">|</span><span>${esc(input.source)}</span>` : ""}
  ${c ? `<span class="right">digest ${esc(c.digest)} · harness ${esc(c.harness)}</span>` : ""}
</div>
<div class="desk">

${win("Key", "", legend())}

${win("The System", c ? `(${c.scopes.length} scopes)` : "", systemBody)}

${win(
  "In tray — still moving",
  `(${live.length})`,
  live.length ? live.map((f) => flowCard(f, now)).join("") : `<p class="empty">Nothing in progress.</p>`,
  "tray",
)}

${
  rest.length
    ? win("Out tray — settled", `(${rest.length})`, rest.map((f) => flowCard(f, now)).join(""), "tray")
    : ""
}

${win(
  "Holes",
  c ? `(${c.holes.length})` : "",
  c
    ? `<p class="dim">Questions asked of this system that no store could answer. They are shown, not omitted: a view that renders cleanly because it did not ask is worse than no view.</p>
  ${
    c.holes.length
      ? `<ul class="holes">${c.holes
          .map((h) => `<li>${esc(h.question)}${h.scopeId ? ` <code class="dim">${esc(h.scopeId)}</code>` : ""}<q>${esc(h.why)}</q></li>`)
          .join("")}</ul>`
      : `<p class="empty">Every question this render asked was answered.</p>`
  }`
    : `<p class="empty">No conformation was projected for this render.</p>`,
)}

${
  c && c.edges.length
    ? win(
        "Who talked to whom",
        `(${c.edges.length})`,
        `<ul class="edges">${c.edges
          .map(
            (e) =>
              `<li><code>${esc(e.from)}</code> → <code>${esc(e.to)}</code> <span class="dim">${e.messages} msg · via ${esc(e.via)} · ${esc(e.scopeId)}</span></li>`,
          )
          .join("")}</ul>`,
      )
    : ""
}
</div></html>`;
}
