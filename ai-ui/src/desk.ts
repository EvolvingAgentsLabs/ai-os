/**
 * The desk: documents you can move, agent cubes you can stack on them.
 *
 * The read-only explorer in `ai-flows` answers *what is the state*. It answers
 * it as a page you read top to bottom, which means "which agent is working on
 * which flow" is a fact you assemble from three places. On a desk it is a fact
 * you see: the cube is sitting on the document.
 *
 * That is the whole argument for this surface, and it is the one the stopwatch
 * test in [04-ai-ui § How this gets falsified](../../doc/04-ai-ui.md) is pointed
 * at. **The explorer stays inert precisely so this comparison stays honest** —
 * if the flat page turns out to be just as fast on a three-day-old flow, this
 * pillar is decoration and should be argued down rather than polished.
 *
 * ## What is interactive here, and what that costs
 *
 * Drag a document — it stays where you put it, forever, for that scope.
 * Drag a cube onto a document — that agent gets a step in that flow. **That is a
 * real write**, not a view change: it appends a delegation step through the
 * flows API, exactly the one `compose.ts` would have written.
 *
 * So the desk can spend model calls, which the explorer cannot. Every action
 * that does says so before it does it, and advancing a flow is always an
 * explicit click rather than something the canvas does because a document
 * became visible.
 *
 * ## Self-contained, still
 *
 * One HTML document, inline CSS, inline JS, no external requests — same
 * constraint as the explorer, for a different reason: the canvas talks to its
 * own server for state, and everything else has to be in the file so that a
 * broken network shows an empty desk rather than an unstyled one.
 */
import {
  CHROME_CSS,
  MISSING_COLOR,
  PERSON_COLOR,
  STATE_COLORS,
  statesByColor,
} from "../../ai-flows/src/vocabulary.ts";
import { AGENT_COLOR, SUBAGENT_COLOR } from "../../ai-flows/src/vocabulary.ts";
import { SIMULATION_JS } from "./simulate.ts";
import { TOUR_CSS, TOUR_JS } from "./tour.ts";

export interface DeskDoc {
  id: string;
  title: string;
  goal: string;
  state: string;
  /** What actually happened. Real: every field comes from the flow store. */
  trace: import("./trace.ts").FlowTrace;
  /**
   * The flow at a glance, aggregated so nothing is silently dropped
   * ([zoom.ts](zoom.ts)). This is what a person standing back reads.
   */
  digest: import("./zoom.ts").Digest;
  /**
   * What it makes sense to do with *this* flow right now
   * ([actions.ts](actions.ts)). Computed from state; every entry states its cost.
   */
  actions: import("./actions.ts").Action[];
  steps: Array<{
    index: number;
    state: string;
    agent: string | null;
    intent: string;
  }>;
  done: number;
  total: number;
  updatedAt: number;
}

export interface DeskAgent {
  name: string;
  description: string;
  tools: string[];
  /** Declared as somebody's subagent — drawn a shade darker, as in the explorer. */
  child: boolean;
  /** Declared in a `subagents:` list with no file behind it. Cannot be dropped. */
  missing: boolean;
}

export interface DeskView {
  /**
   * Render with an in-page fake backend instead of a real one.
   *
   * The demo is the real client with `window.fetch` replaced, never a second
   * implementation ([simulate.ts](simulate.ts)). It also puts a banner on the
   * chrome, because a page that behaves like the product and is not the product
   * has to say so somewhere a reader cannot miss.
   */
  simulate?: boolean;
  scopeId: string;
  scopeLabel: string;
  harness: string;
  at: number;
  docs: DeskDoc[];
  agents: DeskAgent[];
  people: string[];
  /** Serialised layout, handed to the client as the starting arrangement. */
  layout: unknown;
  /** Scopes this desk can switch to. */
  scopes: Array<{ scopeId: string; label: string }>;
  /** SKETCH. ai-storage does not exist; these are recomputed on every read. */
  notes: import("./memory.ts").MemoryNote[];
  memoryLevels: ReadonlyArray<{ level: string; color: string; note: string }>;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

/**
 * JSON destined for a `<script>` block.
 *
 * `</script>` inside a string literal ends the block wherever it appears, so a
 * flow titled `</script><img onerror=…>` would execute. Escaping the slash is
 * the fix that survives minification and reformatting.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/-->/g, "--\\u003e");
}

const DESK_CSS = `
body{overflow:hidden}
.desk{position:relative;width:100vw;height:calc(100vh - 30px);overflow:auto}
.desk.hasdrawer .surface{padding-bottom:160px}
.surface{position:relative;width:2400px;height:1600px}

/* A document on the desk. Same folded-corner idea as the explorer, at object size. */
.docnode{position:absolute;width:260px;background:var(--paper);border:1px solid #000;
  box-shadow:3px 3px 0 rgba(0,0,0,.35);user-select:none;touch-action:none}
.docnode.dragging{box-shadow:6px 6px 0 rgba(0,0,0,.35);z-index:50}
.docnode.over{outline:2px dashed #2f6fb5;outline-offset:2px}
.docnode .dbar{display:flex;align-items:center;gap:6px;padding:3px 6px;border-bottom:1px solid #000;
  background:var(--face);cursor:grab;
  background-image:repeating-linear-gradient(180deg,rgba(0,0,0,.42) 0 1px,transparent 1px 3px)}
.docnode .dbar .t{font-size:12px;font-weight:700;background:var(--face);padding:1px 8px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px}
.docnode .body{padding:8px 9px 10px}
.docnode .goal{font-size:12px;color:#3b3f44;margin:0 0 6px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.docnode .meta{font-size:11px;color:var(--dim);display:flex;align-items:center;gap:6px;flex-wrap:wrap}

/* The stack: cubes resting on the document, offset so the pile reads as a pile. */
.stack{min-height:26px;margin-top:8px;padding:4px;border:1px dashed #c6c1b7;
  display:flex;flex-wrap:wrap;gap:3px;align-items:center}
.stack.empty::before{content:"drop an agent here";font-size:10px;color:#a9a49a}

/* An agent cube, at object size: big enough to grab, still a cube. */
.acube{position:absolute;display:flex;align-items:center;gap:5px;padding:3px 7px 3px 4px;
  background:var(--face);border:1px solid #000;box-shadow:2px 2px 0 rgba(0,0,0,.3);
  font-size:11px;cursor:grab;user-select:none;touch-action:none;white-space:nowrap;z-index:20}
.acube.dragging{box-shadow:5px 5px 0 rgba(0,0,0,.3);z-index:60;cursor:grabbing}
.acube.instack{position:static;box-shadow:1px 1px 0 rgba(0,0,0,.3);padding:2px 6px 2px 3px}
.acube .blk{width:12px;height:12px;background:var(--c);border:1px solid rgba(0,0,0,.55);
  box-shadow:inset 1.5px 1.5px 0 rgba(255,255,255,.5),inset -1.5px -1.5px 0 rgba(0,0,0,.3)}
.acube.missing{opacity:.55;cursor:not-allowed}
.acube.missing .n{text-decoration:line-through}
/* Running: the one animation on the desk, because "is it moving" is the question. */
.acube.busy{animation:pulse 1.1s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:2px 2px 0 rgba(0,0,0,.3)}50%{box-shadow:2px 2px 0 rgba(224,160,32,.9)}}

.shelf{position:absolute;left:0;top:0;bottom:0;width:150px;padding:26px 8px 8px;
  background:rgba(0,0,0,.06);border-right:1px solid rgba(0,0,0,.25)}
.shelf h3{position:absolute;top:6px;left:8px;margin:0;font-size:10px;letter-spacing:.1em;
  text-transform:uppercase;color:#3b3f44}

/* One column on the right, so the panel and the key stack instead of landing on
   top of each other. They were separately fixed -- panel to the top, key to the
   bottom -- which is fine on a tall window and overlaps on a short one. */
.rail{position:fixed;right:14px;top:44px;bottom:14px;width:290px;z-index:200;
  display:flex;flex-direction:column;gap:12px;overflow:auto;pointer-events:none}
.rail>*{pointer-events:auto;flex:0 0 auto}
.rail .spacer{flex:1 1 auto;min-height:0}
.panel{width:100%}
.panel .win-body{padding:10px 12px;font-size:12px}
.panel h4{margin:0 0 4px;font-size:12px}
.panel .act{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
button{font:inherit;font-size:11px;padding:2px 9px;background:var(--face);border:1px solid #000;
  box-shadow:inset 1px 1px 0 var(--lite),inset -1px -1px 0 var(--dark);cursor:pointer}
button:active{box-shadow:inset -1px -1px 0 var(--lite),inset 1px 1px 0 var(--dark)}
button[disabled]{opacity:.5;cursor:default}
.steps{list-style:none;margin:6px 0 0;padding:0}
.steps li{display:flex;gap:5px;align-items:baseline;padding:1px 0;font-size:11px}
.note{margin-top:8px;padding:6px 8px;border:1px solid #c6c1b7;background:#f0ece4;font-size:11px}
.note.warn{border-left:4px solid #e0a020}
.note.alert{border-left:4px solid #b03a2e;background:#f7ebe8;color:#7d2419}

/* Tabs: state and trace answer different questions about the same document. */
.tabs{display:flex;gap:4px;margin:8px 0 0}
.tabs button{font-size:10px;padding:1px 8px}
.tabs button[aria-selected="true"]{box-shadow:inset -1px -1px 0 var(--lite),inset 1px 1px 0 var(--dark);font-weight:700}
.tr{margin-top:8px}
.tr .st{border-top:1px solid #e4dfd6;padding:5px 0}
.tr .hd{display:flex;gap:5px;align-items:baseline}
.tr .res{margin:4px 0 0 16px;padding:4px 6px;background:#f0ece4;border:1px solid #ded9d0;
  white-space:pre-wrap;font-size:10px;max-height:96px;overflow:auto}
.tr .att{margin:3px 0 0 16px;font-size:10px;color:var(--dim);font-family:var(--mono)}
.tr .flag{margin:4px 0 0 16px;font-size:10px;color:#7d2419}

/* The memory drawer. Hatched, because none of it is built. */
.drawer{position:fixed;left:0;bottom:0;right:318px;height:150px;
  border-top:2px solid #000;background:#cfcbc2;
  background-image:repeating-linear-gradient(45deg,rgba(0,0,0,.05) 0 6px,transparent 6px 12px);
  padding:22px 12px 12px;overflow-x:auto;display:flex;gap:10px;align-items:flex-start}
.drawer h3{position:absolute;top:4px;left:12px;margin:0;font-size:10px;letter-spacing:.1em;
  text-transform:uppercase;color:#3b3f44}
/* Beside the title, not opposite it: the right edge is where the fixed rail
   lands, and the one marking that must never be hidden was hidden there. */
.drawer .stamp{position:absolute;top:4px;left:74px;font-size:10px;color:#7d2419;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase;border:1px solid #7d2419;padding:0 5px}
.card{flex:0 0 210px;background:var(--paper);border:1px dashed #7d2419;padding:6px 8px;font-size:10px;
  box-shadow:2px 2px 0 rgba(0,0,0,.15)}
.card .lv{display:flex;align-items:center;gap:5px;font-weight:700;margin-bottom:3px}
.card .bd{white-space:pre-wrap;max-height:64px;overflow:hidden;color:#3b3f44}
.card .from{margin-top:4px;color:var(--dim);font-family:var(--mono);font-size:9px}
.levels{display:flex;gap:10px;font-size:10px;margin-left:auto;align-items:flex-start;flex:0 0 auto}
.levels div{display:flex;align-items:center;gap:4px}
select{font:inherit;font-size:11px}
.sim{background:#7d2419;color:#fbfaf7;padding:1px 8px;font-size:10px;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase}
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:300;
  background:var(--paper);border:1px solid #000;box-shadow:3px 3px 0 rgba(0,0,0,.4);
  padding:7px 14px;font-size:12px;display:none}

/* The digest: what this flow is, from across the room. Recessed, because it is
   a container for the whole rather than one more thing on the list. */
.digest{margin-top:8px;padding:6px 8px;background:#cfcbc2;
  box-shadow:inset 2px 2px 0 var(--dark),inset -2px -2px 0 var(--lite)}
.digest .dh{font-size:12px;font-weight:700;line-height:1.35}
.digest .dc{font-size:10px;color:#3b3f44;margin-top:2px}
.digest .flag{font-size:10px;color:#7d2419;margin-top:3px}

/* The menu. A raised button per proposal, the cost beside it, the evidence
   under it -- never a bare verb. */
.menu{margin-top:10px;border-top:1px solid #ded9d0;padding-top:8px}
.menu .mh{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#3b3f44;margin-bottom:5px}
.menu .mi{margin-bottom:7px}
.menu .ml{font-size:11px;padding:2px 8px;max-width:100%;text-align:left;white-space:normal}
.menu .mc{font-size:9px;margin-left:6px;padding:1px 5px;letter-spacing:.04em;text-transform:uppercase}
.menu .mc.spends{background:#f6e6c8;color:#7a4a00;border:1px solid #e0a020}
.menu .mc.free{background:#e6efe6;color:#2c6b2c;border:1px solid #9cc09c}
.menu .mw{font-size:10px;color:var(--dim);margin-top:3px;line-height:1.4}
/* A model's suggestion is marked as one. It sits beside proposals that are not. */
.menu .mi.model{border-left:3px solid #6b4fa8;padding-left:6px}
.menu .mi.model .ml::after{content:" · proposed by a model";font-size:9px;color:#6b4fa8}

/* Ask. The selection is the noun, so the field only needs the verb. */
.ask{margin-top:10px;border-top:1px solid #ded9d0;padding-top:8px}
.ask input{font:inherit;font-size:11px;width:100%;padding:3px 6px;border:1px solid #000;
  background:var(--paper);box-shadow:inset 1px 1px 0 var(--dark)}
.ask button{font-size:11px;padding:2px 10px;margin-top:5px}
.ask .answer{margin-top:6px;padding:6px 8px;background:#f0ece4;border:1px solid #ded9d0;
  font-size:11px;white-space:pre-wrap;line-height:1.45}

/* ---- Motion that carries information -----------------------------------
   Every rule here answers a question. None of it is decoration, and the test
   in desk.test.ts asserts the load-bearing one.

   The load-bearing one: **what the system proposed settles into place; what you
   pinned never moves.** That is the hardest rule in layout.ts and today it is
   invisible -- you cannot see that your arrangement is safe, you can only fail
   to notice it being destroyed. Motion teaches it without a legend: a proposed
   document slides to where the system put it, a pinned one has no transition at
   all and therefore cannot be seen to move. */
.docnode{transition:left .22s cubic-bezier(.2,.7,.3,1),top .22s cubic-bezier(.2,.7,.3,1)}
.docnode.pinned,.acube.pinned{transition:none}
.docnode.dragging,.acube.dragging{transition:none}

/* A step that finished did something. The pulse travels the cube rather than
   recolouring it in place, so "what did this produce" is answerable by looking. */
@keyframes settled{0%{box-shadow:0 0 0 0 rgba(63,143,63,.55)}100%{box-shadow:0 0 0 9px rgba(63,143,63,0)}}
.cube.justdone{animation:settled .7s ease-out 1}

/* Opening the trace grows it out of the document, so you never lose track of
   what you are inside of. The Mac's zoom rectangle, for the same reason. */
@keyframes fromdoc{from{transform:scale(.94);opacity:.25}to{transform:none;opacity:1}}
.tr{animation:fromdoc .18s ease-out 1}

@media (prefers-reduced-motion: reduce){
  .docnode{transition:none}
  .cube.justdone{animation:none}
  .tr{animation:none}
}
`;

/**
 * The client.
 *
 * Written as one string of plain JS rather than a build step: the canvas is the
 * pillar most at risk of costing a quarter of infrastructure before it has
 * earned one ([08-roadmap](../../doc/08-roadmap.md) argues exactly this), and a
 * bundler is the first instalment of that bill. If the stopwatch says the canvas
 * wins, a build step is cheap to add afterwards and will be paid for.
 */
const DESK_JS = String.raw`
(() => {
  const S = window.__DESK__;
  const surface = document.getElementById('surface');
  const toast = document.getElementById('toast');
  let layout = S.layout;
  let selected = null;
  // Questions asked and answers received, per flow. Not a cache -- it is what
  // keeps the panel's own poll from destroying them. See wireAsk.
  const asked = {};

  const say = (msg, ms) => {
    toast.textContent = msg; toast.style.display = 'block';
    clearTimeout(say._t); say._t = setTimeout(() => { toast.style.display = 'none'; }, ms || 2600);
  };

  const post = async (path, body) => {
    const r = await fetch(path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  };

  const saveLayout = () => {
    // Fire and forget: a failed layout save must never block a drag, and the
    // next successful one carries the whole layout anyway.
    fetch('/layout', { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopeId: S.scopeId, layout }) }).catch(() => {});
  };

  // ---- drag ---------------------------------------------------------------
  // Pointer events rather than HTML5 drag-and-drop: DnD cannot show the object
  // moving under the finger on touch, and "the cube moves" is the whole point.
  let drag = null;

  const startDrag = (el, kind, id, ev) => {
    if (el.classList.contains('missing')) { say('This agent is declared with no file behind it.'); return; }
    const r = el.getBoundingClientRect();
    const sr = surface.getBoundingClientRect();
    drag = { el, kind, id, dx: ev.clientX - r.left, dy: ev.clientY - r.top, sr, moved: false };
    el.classList.add('dragging');
    el.setPointerCapture(ev.pointerId);
    if (kind === 'cube') { el.classList.remove('instack'); surface.appendChild(el); el.style.position = 'absolute'; }
    ev.preventDefault();
  };

  const moveDrag = (ev) => {
    if (!drag) return;
    drag.moved = true;
    const x = ev.clientX - drag.sr.left - drag.dx + surface.parentElement.scrollLeft;
    const y = ev.clientY - drag.sr.top - drag.dy + surface.parentElement.scrollTop;
    drag.el.style.left = Math.max(0, x) + 'px';
    drag.el.style.top = Math.max(0, y) + 'px';
    if (drag.kind === 'cube') {
      const over = docUnder(ev.clientX, ev.clientY);
      document.querySelectorAll('.docnode.over').forEach((d) => d.classList.remove('over'));
      if (over) over.classList.add('over');
    }
  };

  const docUnder = (cx, cy) => {
    for (const d of document.querySelectorAll('.docnode')) {
      const r = d.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return d;
    }
    return null;
  };

  const endDrag = async (ev) => {
    if (!drag) return;
    const d = drag; drag = null;
    d.el.classList.remove('dragging');
    document.querySelectorAll('.docnode.over').forEach((x) => x.classList.remove('over'));
    if (!d.moved) { select(d.kind, d.id); return; }

    const x = parseInt(d.el.style.left, 10) || 0;
    const y = parseInt(d.el.style.top, 10) || 0;

    if (d.kind === 'doc') {
      layout.docs[d.id] = { x, y, pinned: true };
      saveLayout();
      return;
    }
    const onto = docUnder(ev.clientX, ev.clientY);
    if (!onto) {
      const was = layout.cubes[d.id] || { slot: 0, onDoc: null };
      const cameFrom = was.onDoc;
      layout.cubes[d.id] = { x, y, pinned: true, onDoc: null, slot: was.slot };
      saveLayout(); render();
      if (!cameFrom) return;
      // Taking a cube off a document is the inverse of dropping one on, so it
      // has to undo the same thing. Leaving the step queued would show the agent
      // as idle while its work sat ready to run.
      try {
        const res = await post('/unassign', { scopeId: S.scopeId, flowId: cameFrom, agent: d.id });
        if (res.kept && res.kept.length) {
          // Something already started. The cube goes back, because the picture
          // must not claim an agent was taken off work it is doing.
          layout.cubes[d.id] = { x, y, pinned: true, onDoc: cameFrom, slot: was.slot };
          saveLayout();
          say(res.note, 6000);
        } else if (res.removed) {
          say('Removed ' + res.removed + ' queued step(s) for ' + d.id + '.', 4000);
        }
        await refresh();
      } catch (e) {
        layout.cubes[d.id] = { x, y, pinned: true, onDoc: cameFrom, slot: was.slot };
        saveLayout(); render();
        say('Could not remove the step: ' + e.message, 5000);
      }
      return;
    }
    const flowId = onto.dataset.id;
    const occupied = Object.values(layout.cubes).filter((c) => c.onDoc === flowId);
    const slot = occupied.length ? Math.max.apply(null, occupied.map((c) => c.slot)) + 1 : 0;
    layout.cubes[d.id] = { x, y, pinned: true, onDoc: flowId, slot };
    saveLayout(); render();
    try {
      const res = await post('/assign', { scopeId: S.scopeId, flowId, agent: d.id });
      say('Step ' + res.stepIndex + ' added: ' + d.id + ' on "' + res.flowTitle + '". Not run yet.', 4200);
      await refresh();
    } catch (e) {
      say('Could not add the step: ' + e.message, 5000);
    }
  };

  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // ---- selection panel ----------------------------------------------------
  const select = (kind, id) => { selected = { kind, id }; renderPanel(); };

  // Which face of a document is showing. State answers "where is this"; trace
  // answers "what happened" -- two questions, and a panel that answers both at
  // once answers neither.
  let tab = 'state';

  const traceHtml = (doc) => {
    const t = doc.trace || { steps: [], movement: '', detail: '', ignoredCount: 0, movementTone: 'muted' };
    return '<div class="' + (t.movementTone === 'ok' ? 'ok' : t.movementTone === 'warn' ? 'warn' : 'dim') + '">' +
      escape_(t.movement) + '</div><div class="dim">' + escape_(t.detail) + '</div>' +
      (t.ignoredCount
        ? '<div class="note alert"><strong>' + t.ignoredCount + ' step(s) used nothing they were given.</strong> ' +
          'Each ran, settled and reported. None carried a distinctive word out of its predecessor.</div>'
        : '') +
      '<div class="tr">' + t.steps.map((s) =>
        '<div class="st"><div class="hd">' +
        '<span class="cube sm" style="--c:' + (S.stateColors[s.state] || '#b9b4a8') + '"></span>' +
        '<span class="dim">' + s.index + '</span><strong>' + escape_(s.agent || 'step') + '</strong>' +
        '</div>' +
        (s.result ? '<div class="res">' + escape_(s.result) + '</div>' : '') +
        (s.attempts.length
          ? s.attempts.map((a) => '<div class="att">attempt ' + a.n + ' · ' +
              (a.runId ? escape_(a.runId.slice(0, 8)) : 'no run') + ' · ' +
              (a.digest ? escape_(a.digest) + ' ' + escape_(a.source || '') : 'no observation') +
              (a.error ? ' · <span class="err">' + escape_(a.error.slice(0, 120)) + '</span>' : '') +
              '</div>').join('')
          : '<div class="att">never attempted</div>') +
        (s.ignoredInput
          ? '<div class="flag">carried ' + Math.round(s.ignoredInput.carried * 100) + '% of ' +
            s.ignoredInput.inputTokens + ' distinctive tokens it was handed</div>'
          : '') +
        '</div>').join('') + '</div>';
  };

  /**
   * Wire the proposed menu.
   *
   * Each action names the route it takes, so this is a dispatch table rather
   * than a branch per label -- a menu whose behaviour is decided by matching
   * strings drifts from the module that produced it on the first rename.
   *
   * A model-proposed action has a null route and is rendered disabled. It is a
   * suggestion to press something, never a licence to spend.
   */
  const wireActions = (p, doc) => {
    p.querySelectorAll('.ml[data-act]').forEach((b) => {
      const a = doc.actions[Number(b.dataset.act)];
      if (!a || !a.route) return;
      b.onclick = async () => {
        const was = b.textContent;
        b.disabled = true; b.textContent = 'Working…';
        try {
          if (a.route === '/fork') {
            // Fork copies records. It spends nothing, and the copy does not run
            // until somebody advances it -- its own click, its own stated cost.
            const at = Math.max(0, (a.step == null ? doc.steps.length : a.step) - 1);
            const r = await post('/fork', { flowId: doc.id, atStep: at });
            say('Forked at step ' + at + '. The original keeps its history; the fork is yours to change.', 5000);
            void r;
          } else if (a.route === '/advance') {
            await post('/advance', { flowId: doc.id });
            say('Advanced.');
          } else if (a.route === '/ask') {
            const q = p.querySelector('#q');
            if (q) { q.value = a.label; q.focus(); }
            b.disabled = false; b.textContent = was;
            return;
          } else {
            b.disabled = false; b.textContent = was;
            return;
          }
          await refresh();
        } catch (e) {
          say('That did not work: ' + e.message, 5000);
          b.disabled = false; b.textContent = was;
        }
      };
    });
  };

  /**
   * Wire the question box.
   *
   * The answer reports whether a turn was bought. A surface that spends quietly
   * teaches the person using it to stop counting, which is the habit this whole
   * repository is trying to keep.
   */
  const wireAsk = (p, doc) => {
    const q = p.querySelector('#q');
    const go = p.querySelector('#qgo');
    const out = p.querySelector('#qa');
    if (!q || !go || !out) return;

    // Survive the poll. The desk re-reads every five seconds and re-renders this
    // panel, which rebuilds its innerHTML -- so without this, an answer you paid
    // for vanishes within five seconds of arriving, and a question typed slower
    // than that is erased mid-sentence. Found by using it, not by reading it.
    const kept = asked[doc.id];
    if (kept) { q.value = kept.q; out.innerHTML = kept.html; }

    const ask = async () => {
      const question = (q.value || '').trim();
      if (!question) return;
      const show = (html) => { out.innerHTML = html; asked[doc.id] = { q: question, html: html }; };
      go.disabled = true; show('<div class="dim">Reading the trace…</div>');
      try {
        const r = await post('/ask', { flowId: doc.id, question });
        show('<div class="answer">' + escape_(plain(r.answer)) + '</div>' +
          '<div class="dim">' + (r.spent ? 'Cost: one model call' : 'Answered without a model call') +
          ' · ' + r.evidence + ' piece(s) of evidence in the trace</div>');
      } catch (e) {
        show('<div class="err">' + escape_(e.message) + '</div>');
      }
      go.disabled = false;
    };
    go.onclick = ask;
    q.onkeydown = (ev) => { if (ev.key === 'Enter') ask(); };
    // Keep what is being typed, for the same reason.
    q.oninput = () => {
      asked[doc.id] = { q: q.value, html: (asked[doc.id] || {}).html || '' };
    };
  };

  const renderPanel = () => {
    const p = document.getElementById('panel');
    if (!selected) { p.style.display = 'none'; return; }
    p.style.display = 'block';
    if (selected.kind === 'doc') {
      const doc = S.docs.find((d) => d.id === selected.id);
      if (!doc) { selected = null; p.style.display = 'none'; return; }
      const next = doc.steps.find((s) => s.state === 'pending' || s.state === 'running');
      if (tab === 'trace') {
        p.querySelector('.win-body').innerHTML =
          '<h4>' + escape_(doc.title) + '</h4>' +
          '<div class="tabs"><button id="tab-state">State</button>' +
          '<button id="tab-trace" aria-selected="true">Trace</button></div>' +
          traceHtml(doc);
        p.querySelector('#tab-state').onclick = () => { tab = 'state'; renderPanel(); };
        return;
      }
      p.querySelector('.win-body').innerHTML =
        '<h4>' + escape_(doc.title) + '</h4>' +
        '<div class="tabs"><button id="tab-state" aria-selected="true">State</button>' +
        '<button id="tab-trace">Trace</button></div>' +
        '<div class="dim">' + escape_(doc.state) + ' · ' + doc.done + '/' + doc.total + ' steps done</div>' +
        // Semantic zoom, at the top because it is the answer to the question the
        // desk exists for. It states how many attempts it stands for and what
        // window it covers -- a projection that says neither invites the reader
        // to read a trend out of noise (doc/04, the sampling argument).
        (doc.digest
          ? '<div class="digest"><div class="dh">' + escape_(doc.digest.headline) + '</div>' +
            '<div class="dc">' + escape_(doc.digest.covering) + '</div>' +
            doc.digest.flags.map((f) => '<div class="flag">' + escape_(f) + '</div>').join('') +
            '</div>'
          : '') +
        '<p style="margin:6px 0 0">' + escape_(doc.goal) + '</p>' +
        '<ul class="steps">' + doc.steps.map((s) =>
          '<li><span class="cube sm" style="--c:' + (S.stateColors[s.state] || '#b9b4a8') + '"></span>' +
          '<span class="dim">' + s.index + '</span> ' + escape_(s.agent || s.intent.slice(0, 60)) + '</li>').join('') +
        '</ul>' +
        (next
          ? '<div class="note warn">Next: <strong>' + escape_(next.agent || 'step ' + next.index) + '</strong>. ' +
            'Advancing spends a model call.</div><div class="act"><button id="adv">Advance one step</button></div>'
          // Every step is settled but the flow has not been told. Without this
          // the desk can run a flow to its last step and never close it: it sits
          // at waiting, 3/3 done, with no control that would finish it.
          : doc.state !== 'done' && doc.state !== 'abandoned'
            ? '<div class="note">Every step is settled. The flow is still <strong>' + escape_(doc.state) +
              '</strong> because nothing has closed it. This spends nothing — there is no step left to run.</div>' +
              '<div class="act"><button id="adv">Mark the flow finished</button></div>'
            : '<div class="note">Nothing left to do.</div>') +
        // The menu that reveals itself. Every entry carries the evidence that
        // produced it and says whether pressing it spends -- an action offered
        // without a reason is a guess the reader has to audit.
        ((doc.actions || []).length
          ? '<div class="menu"><div class="mh">What people do here</div>' +
            doc.actions.map((a, i) =>
              '<div class="mi' + (a.source === 'model' ? ' model' : '') + '">' +
              '<button class="ml" data-act="' + i + '"' + (a.route ? '' : ' disabled') + '>' +
              escape_(a.label) + '</button>' +
              '<span class="mc ' + (a.spends ? 'spends' : 'free') + '">' +
              (a.spends ? 'spends a model call' : 'free') + '</span>' +
              '<div class="mw">' + escape_(a.why) + '</div></div>').join('') +
            '</div>'
          : '') +
        // Deixis: the selection is the noun, so the question can be three words.
        '<div class="ask"><input id="q" placeholder="Ask about this flow — e.g. why did it stop?" ' +
        'aria-label="Ask about this flow">' +
        '<button id="qgo">Ask</button>' +
        '<div class="dim" style="margin-top:4px">Answered from the trace, not the goal. Spends a model call.</div>' +
        '<div id="qa"></div></div>';
      p.querySelector('#tab-trace').onclick = () => { tab = 'trace'; renderPanel(); };
      wireActions(p, doc);
      wireAsk(p, doc);
      const b = p.querySelector('#adv');
      if (b) {
        const label = b.textContent;
        b.onclick = async () => {
          b.disabled = true; b.textContent = 'Working…';
          try { const r = await post('/advance', { flowId: doc.id }); say('Step ' + r.outcome + '.'); await refresh(); }
          catch (e) { say('Advance failed: ' + e.message, 5000); b.disabled = false; b.textContent = label; }
        };
      }
    } else {
      const a = S.agents.find((x) => x.name === selected.id);
      if (!a) { selected = null; p.style.display = 'none'; return; }
      p.querySelector('.win-body').innerHTML =
        '<h4>' + escape_(a.name) + '</h4>' +
        '<div class="dim">' + a.tools.map(escape_).join(' ') + '</div>' +
        '<p style="margin:6px 0 0">' + escape_(a.description) + '</p>' +
        (a.missing ? '<div class="note warn">Declared in a subagents list with no file behind it. A declared name is a claim; a file is a fact.</div>'
                   : '<div class="note">Drag this onto a document to give it a step in that flow.</div>');
    }
  };

  /**
   * Strip the markup this panel does not render.
   *
   * The prompt asks for plain prose and the model mostly complies -- but "mostly"
   * is the problem. Depending on a sampler to obey a formatting instruction means
   * the page is correct at a rate, and the failure shows up as literal asterisks
   * and backticks in front of whoever is reading. This removes the emphasis
   * markers deterministically, which is a different thing from parsing markdown:
   * no structure is interpreted, nothing is turned into HTML, and the text
   * between the markers is untouched.
   */
  // NOTE: this block lives inside String.raw, so a backslash here is one
  // backslash in the shipped page. Writing \\* would ship an escaped backslash
  // and the rule would silently match nothing -- which is exactly what the first
  // version of it did.
  const plain = (s) => String(s == null ? '' : s)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\`([^\`]+)\`/g, '$1')
    .replace(/(^|\s)__(.+?)__(?=\s|$)/g, '$1$2');

  const escape_ = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- render -------------------------------------------------------------
  function render() {
    surface.querySelectorAll('.docnode,.acube').forEach((n) => n.remove());

    for (const doc of S.docs) {
      const p = layout.docs[doc.id] || { x: 200, y: 40 };
      const el = document.createElement('div');
      // The pinned class is not styling -- it removes the transition. A document the
      // person placed must not animate, because an object that slides after you
      // let go of it reads as the system having moved it.
      el.className = 'docnode' + (p.pinned ? ' pinned' : '');
      el.dataset.id = doc.id;
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      const strip = doc.steps.map((s) =>
        '<span class="cube" style="--c:' + (S.stateColors[s.state] || '#b9b4a8') + '"></span>').join('');
      el.innerHTML =
        '<div class="dbar"><span class="box"></span><span class="t">' + escape_(doc.title) + '</span></div>' +
        '<div class="body"><p class="goal">' + escape_(doc.goal) + '</p>' +
        '<div class="meta"><span class="strip">' + strip + '</span>' +
        '<span>' + doc.done + '/' + doc.total + '</span><span>' + escape_(doc.state) + '</span></div>' +
        '<div class="stack" data-stack="' + escape_(doc.id) + '"></div></div>';
      el.querySelector('.dbar').addEventListener('pointerdown', (ev) => startDrag(el, 'doc', doc.id, ev));
      el.addEventListener('pointerdown', (ev) => { if (!drag) select('doc', doc.id); });
      surface.appendChild(el);
    }

    for (const a of S.agents) {
      const c = layout.cubes[a.name] || { x: 20, y: 40, onDoc: null, slot: 0 };
      const el = document.createElement('div');
      el.className = 'acube' + (a.missing ? ' missing' : '') + (S.busy[a.name] ? ' busy' : '');
      el.dataset.id = a.name;
      const color = a.missing ? S.missingColor : (a.child ? S.subagentColor : S.agentColor);
      el.innerHTML = '<span class="blk" style="--c:' + color + '"></span><span class="n">' + escape_(a.name) + '</span>';
      el.addEventListener('pointerdown', (ev) => startDrag(el, 'cube', a.name, ev));
      const host = c.onDoc ? surface.querySelector('[data-stack="' + CSS.escape(c.onDoc) + '"]') : null;
      if (host) { el.classList.add('instack'); host.appendChild(el); }
      else { el.style.left = c.x + 'px'; el.style.top = c.y + 'px'; surface.appendChild(el); }
    }

    for (const s of surface.querySelectorAll('.stack')) {
      s.classList.toggle('empty', s.children.length === 0);
    }
    renderDrawer();
    renderPanel();
  }

  // The memory drawer. Every card is dashed and the drawer is hatched, because
  // ai-storage does not exist and none of this is stored -- the notes are
  // recomputed from the traces on every read. A surface that draws a sketch the
  // same way it draws measured state teaches its reader to trust both equally.
  function renderDrawer() {
    const d = document.getElementById('drawer');
    if (!d) return;
    const notes = S.notes || [];
    d.innerHTML =
      '<h3>Memory</h3><span class="stamp">Not built — this is the spec</span>' +
      (notes.length
        ? notes.map((n) => {
            const lv = (S.memoryLevels || []).find((x) => x.level === n.level) || { color: '#b9b4a8' };
            return '<div class="card"><div class="lv"><span class="cube sm" style="--c:' + lv.color + '"></span>' +
              escape_(n.level) + '</div><div class="bd"><strong>' + escape_(n.title) + '</strong>\n' +
              escape_(n.body) + '</div><div class="from">from ' +
              n.from.map((f) => escape_(f.slice(0, 8))).join(', ') + '</div></div>';
          }).join('')
        : '<div class="card" style="border-style:dashed"><div class="bd">' +
          'Nothing consolidated yet. A note is proposed from a flow once it finishes — ' +
          'keeping the steps that carried something forward and dropping the ones that did not.' +
          '</div></div>') +
      '<div class="levels">' + (S.memoryLevels || []).map((l) =>
        '<div><span class="cube sm" style="--c:' + l.color + '"></span>' + escape_(l.level) + '</div>').join('') +
      '</div>';
  }

  async function refresh() {
    const r = await fetch('/state?scope=' + encodeURIComponent(S.scopeId));
    if (!r.ok) return;
    const next = await r.json();
    S.docs = next.docs; S.agents = next.agents; S.busy = next.busy; S.notes = next.notes;
    layout = next.layout;
    document.getElementById('stamp').textContent = new Date(next.at).toISOString();
    render();
  }

  document.getElementById('scope').addEventListener('change', (e) => {
    location.search = '?scope=' + encodeURIComponent(e.target.value);
  });
  document.getElementById('reload').addEventListener('click', () => refresh());

  render();
  // A document can be addressed directly: ?select=<flowId>. Sharing "look at
  // this one" should be a link rather than an instruction to find it, and it is
  // the only way a screenshot can show the panel.
  const q = new URLSearchParams(location.search);
  const wanted = q.get('select');
  if (q.get('tab') === 'trace') tab = 'trace';
  if (wanted && S.docs.some((d) => d.id === wanted)) select('doc', wanted);
  // Live, but on a leash: a desk that re-fetches every second spends nothing on
  // the model and everything on the reader's attention. Five seconds is slower
  // than a step and faster than a person wondering.
  setInterval(() => { if (!drag) refresh(); }, 5000);
})();
`;

function legend(): string {
  const sw = (color: string, label: string) =>
    `<li><span class="cube" style="--c:${color}"></span><span>${esc(label)}</span></li>`;
  return `<div class="key">
    <div><strong>Agents</strong><ul>${sw(AGENT_COLOR, "agent")}${sw(SUBAGENT_COLOR, "subagent")}${sw(MISSING_COLOR, "declared, no file")}${sw(PERSON_COLOR, "person")}</ul></div>
    <div><strong>Steps</strong><ul>${statesByColor()
      .map(([color, names]) => sw(color, names.join(" / ")))
      .join("")}</ul></div>
  </div>`;
}

export function renderDeskHtml(view: DeskView): string {
  const busy: Record<string, boolean> = {};
  for (const d of view.docs) {
    for (const s of d.steps)
      if (s.state === "running" && s.agent) busy[s.agent] = true;
  }
  const client = {
    scopeId: view.scopeId,
    docs: view.docs,
    agents: view.agents,
    layout: view.layout,
    notes: view.notes,
    memoryLevels: view.memoryLevels,
    busy,
    stateColors: STATE_COLORS,
    agentColor: AGENT_COLOR,
    subagentColor: SUBAGENT_COLOR,
    missingColor: MISSING_COLOR,
  };

  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ai-os — the desk</title>
<style>${CHROME_CSS}${DESK_CSS}${view.simulate ? TOUR_CSS : ""}</style>
<div class="menubar">
  <span class="apple">ai-os</span>
  ${view.simulate ? `<span class="sim">Simulated — no core, no model, nothing stored</span><span class="dim">reloading starts over</span>` : ""}
  <span class="sep">|</span>
  <label>Scope <select id="scope">${view.scopes
    .map(
      (s) =>
        `<option value="${esc(s.scopeId)}"${s.scopeId === view.scopeId ? " selected" : ""}>${esc(s.label)}</option>`,
    )
    .join("")}</select></label>
  <span class="sep">|</span>
  <span>${esc(view.docs.length)} document(s) · ${esc(view.agents.length)} agent(s) · ${esc(view.people.length)} person(s)</span>
  <button id="reload">Refresh</button>
  <span class="right">harness ${esc(view.harness)} · <span id="stamp">${esc(new Date(view.at).toISOString())}</span></span>
</div>
<div class="desk deskbg hasdrawer">
  <div class="surface" id="surface">
    <div class="shelf"><h3>Agents</h3></div>
  </div>
  <div class="drawer" id="drawer"></div>
</div>
<div class="rail">
  <div class="win panel" id="panel" style="display:none">
    <div class="bar"><span class="box"></span><h2>Selected</h2><span class="box zoom"></span></div>
    <div class="win-body"></div>
  </div>
  <div class="spacer"></div>
  <div class="win panel" id="key">
    <div class="bar"><span class="box"></span><h2>Key</h2><span class="box zoom"></span></div>
    <div class="win-body">${legend()}</div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>window.__DESK__ = ${jsonForScript(client)};</script>
${view.simulate ? `<script>${SIMULATION_JS}</script>` : ""}
${view.simulate ? `<script>${TOUR_JS}</script>` : ""}
<script>${DESK_JS}</script>
</html>`;
}
