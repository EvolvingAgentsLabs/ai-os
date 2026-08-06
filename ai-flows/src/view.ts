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
 * ## What it is arranged to show
 *
 * A flow's transcript is not its state. The three things a person coming back
 * cold has to reconstruct are what the goal was, where it stopped, and **whether
 * it is still moving** — so the page leads with state, marks the current step,
 * and puts every attempt's observation digest next to it, because a repeat is
 * what tells drift from progress ([10-observability](../../doc/10-observability.md)).
 *
 * Self-contained HTML with no external requests: it has to open from a file over
 * a coffee, days later, with no server running.
 */
import type { Conformation, ScopeNode } from "./conformation.ts";
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
      const obs = a.observation ? `<code>${esc(a.observation.digest)}</code> <span class="dim">${esc(a.observation.source)}</span>` : `<span class="dim">no observation</span>`;
      const run = a.runId ? `<code class="dim">${esc(a.runId.slice(0, 8))}</code>` : `<span class="dim">no run</span>`;
      return `<li><span class="pill ${esc(a.state)}">${esc(a.state)}</span> attempt ${a.n} · ${run} · ${obs}${
        a.error ? ` · <span class="err">${esc(a.error.slice(0, 200))}</span>` : ""
      }</li>`;
    })
    .join("");
  return `<div class="step${isCurrent ? " current" : ""}">
    <div class="step-head">
      <span class="pill ${esc(step.state)}">${esc(step.state)}</span>
      <span class="idx">${step.index}</span>
      <span class="intent">${esc(step.intent)}</span>
      <span class="dim when">${esc(ago(step.updatedAt, now))}</span>
    </div>
    ${step.result ? `<div class="result">${esc(step.result.slice(0, 600))}</div>` : ""}
    ${attempts ? `<ul class="attempts">${attempts}</ul>` : `<div class="dim none">never attempted</div>`}
  </div>`;
}

function flowCard(flow: FlowWithSteps, now: number): string {
  const move = movement(flow);
  // The step a person coming back needs to look at first: the one that is
  // running, else the first that has not settled.
  const current =
    flow.steps.find((s) => s.state === "running") ?? flow.steps.find((s) => s.state === "pending");
  const done = flow.steps.filter((s) => s.state === "done").length;
  return `<article class="flow">
    <header>
      <span class="pill flow-${esc(flow.state)}">${esc(flow.state)}</span>
      <h2>${esc(flow.title)}</h2>
      <span class="dim">${esc(flow.scopeId)} · ${esc(flow.shape)} · updated ${esc(ago(flow.updatedAt, now))}</span>
    </header>
    <p class="goal">${esc(flow.goal)}</p>
    <div class="meta">
      <span class="${esc(move.tone)}">${esc(move.label)}</span>
      <span class="dim">${esc(move.detail)}</span>
      <span class="dim">${done}/${flow.steps.length} steps done</span>
      ${flow.forkedFrom ? `<span class="dim">forked from ${esc(flow.forkedFrom.flowId.slice(0, 8))} at step ${flow.forkedFrom.atStep}</span>` : ""}
    </div>
    ${current ? `<div class="next">Next: <strong>${esc(current.intent)}</strong></div>` : `<div class="next dim">Nothing left to do</div>`}
    <div class="steps">${flow.steps.map((s) => stepRow(s, s.id === current?.id, now)).join("")}</div>
  </article>`;
}

function scopeRow(s: ScopeNode): string {
  const agents = s.agents
    .map((a) => `<li><code>${esc(a.name)}</code> <span class="dim">[${esc(a.tools.join(" "))}]</span> ${esc(a.description)}${a.inert ? ` <span class="warn">inert on this harness</span>` : ""}${a.ok ? "" : ` <span class="err">${esc(a.error)}</span>`}</li>`)
    .join("");
  return `<div class="scope">
    <div><span class="pill role">${esc(s.role)}</span> <code>${esc(s.scopeId)}</code>
      ${s.roster ? `<span class="dim">roster ${s.roster.members.length} @ v${esc(s.roster.version)}</span>` : ""}
      ${s.hasMemory ? `<span class="dim">memory</span>` : ""}
      ${s.skills.length ? `<span class="dim">skills: ${esc(s.skills.join(", "))}</span>` : ""}
    </div>
    ${agents ? `<ul>${agents}</ul>` : ""}
    ${s.membershipInFolders.length ? `<div class="err">membership-shaped path: ${esc(s.membershipInFolders.join(", "))}</div>` : ""}
  </div>`;
}

const CSS = `
:root{--bg:#0B0D0F;--fg:#F2EFE9;--amber:#E8A33D;--teal:#4A7C7E;--dim:#8b9095;}
*{box-sizing:border-box}
body{margin:0;background:#0B0D0F;color:#F2EFE9;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1000px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:16px;margin:0;display:inline}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.dim,.muted{color:#8b9095}
.warn{color:#E8A33D}
.err{color:#e06c5a}
.ok{color:#7fb069}
.pill{display:inline-block;padding:1px 7px;border-radius:99px;font-size:11px;border:1px solid #2a2f34;color:#8b9095;vertical-align:middle}
.pill.running,.pill.flow-running{border-color:#E8A33D;color:#E8A33D}
.pill.done,.pill.flow-done{border-color:#4A7C7E;color:#7fb69f}
.pill.failed,.pill.flow-blocked{border-color:#e06c5a;color:#e06c5a}
.pill.flow-waiting,.pill.pending{border-color:#3a4046}
.pill.role{border-color:#4A7C7E;color:#4A7C7E}
section{margin:28px 0}
.flow{border:1px solid #1e2226;border-radius:10px;padding:16px;margin:14px 0;background:#0e1114}
.flow header{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.goal{margin:8px 0;color:#c9c4bb}
.meta{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-bottom:10px}
.next{margin:10px 0;padding:8px 10px;border-left:2px solid #E8A33D;background:#141719}
.step{border-top:1px solid #1e2226;padding:10px 0}
.step.current{background:#12161a;margin:0 -8px;padding:10px 8px;border-radius:6px}
.step-head{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap}
.idx{color:#8b9095;font-size:12px}
.intent{flex:1;min-width:200px}
.when{font-size:12px}
.result{margin:6px 0 0 34px;padding:6px 9px;background:#141719;border-radius:5px;white-space:pre-wrap;color:#c9c4bb}
.attempts{margin:6px 0 0 34px;padding:0;list-style:none;font-size:12px}
.attempts li{padding:2px 0}
.none{margin-left:34px;font-size:12px}
.scope{border-top:1px solid #1e2226;padding:9px 0}
.scope ul{margin:5px 0 0 18px;padding:0;font-size:13px}
.holes li{margin:6px 0}
.holes q{display:block;color:#8b9095;font-size:13px}
`;

export function renderViewHtml(input: ViewInput): string {
  const now = input.at ?? Date.now();
  const c = input.conformation;
  const flows = [...input.flows].sort((a, b) => b.updatedAt - a.updatedAt);
  const live = flows.filter((f) => f.state !== "done" && f.state !== "abandoned");
  const rest = flows.filter((f) => f.state === "done" || f.state === "abandoned");

  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ai-os — flows and conformation</title>
<style>${CSS}</style>
<main>
<h1>ai-os</h1>
<div class="dim">rendered ${esc(new Date(now).toISOString())}${input.source ? ` · ${esc(input.source)}` : ""}${
    c ? ` · conformation digest <code>${esc(c.digest)}</code> · harness ${esc(c.harness)}` : ""
  }</div>

<section>
  <h1>Flows in progress <span class="dim">(${live.length})</span></h1>
  ${live.length ? live.map((f) => flowCard(f, now)).join("") : `<p class="dim">Nothing in progress.</p>`}
</section>

${rest.length ? `<section><h1 class="dim">Settled <span class="dim">(${rest.length})</span></h1>${rest.map((f) => flowCard(f, now)).join("")}</section>` : ""}

${
  c
    ? `<section>
  <h1>Conformation <span class="dim">(${c.scopes.length} scopes)</span></h1>
  ${c.scopes.map(scopeRow).join("")}
</section>

<section>
  <h1>Holes <span class="dim">(${c.holes.length})</span></h1>
  <p class="dim">Questions asked of this system that no store could answer. They are shown, not omitted: a view that renders cleanly because it did not ask is worse than no view.</p>
  <ul class="holes">${c.holes
    .map((h) => `<li>${esc(h.question)}${h.scopeId ? ` <code class="dim">${esc(h.scopeId)}</code>` : ""}<q>${esc(h.why)}</q></li>`)
    .join("")}</ul>
</section>`
    : `<section><p class="dim">No conformation was projected for this render.</p></section>`
}

${
  c && c.edges.length
    ? `<section><h1>Who talked to whom <span class="dim">(${c.edges.length})</span></h1>
  <ul class="holes">${c.edges
    .map((e) => `<li><code>${esc(e.from)}</code> → <code>${esc(e.to)}</code> <span class="dim">${e.messages} msg · via ${esc(e.via)} · ${esc(e.scopeId)}</span></li>`)
    .join("")}</ul></section>`
    : ""
}
</main></html>`;
}
