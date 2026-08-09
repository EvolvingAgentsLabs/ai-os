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

export interface DeskDoc {
  id: string;
  title: string;
  goal: string;
  state: string;
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
select{font:inherit;font-size:11px}
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:300;
  background:var(--paper);border:1px solid #000;box-shadow:3px 3px 0 rgba(0,0,0,.4);
  padding:7px 14px;font-size:12px;display:none}
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

  const renderPanel = () => {
    const p = document.getElementById('panel');
    if (!selected) { p.style.display = 'none'; return; }
    p.style.display = 'block';
    if (selected.kind === 'doc') {
      const doc = S.docs.find((d) => d.id === selected.id);
      if (!doc) { selected = null; p.style.display = 'none'; return; }
      const next = doc.steps.find((s) => s.state === 'pending' || s.state === 'running');
      p.querySelector('.win-body').innerHTML =
        '<h4>' + escape_(doc.title) + '</h4>' +
        '<div class="dim">' + escape_(doc.state) + ' · ' + doc.done + '/' + doc.total + ' steps done</div>' +
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
            : '<div class="note">Nothing left to do.</div>');
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

  const escape_ = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- render -------------------------------------------------------------
  function render() {
    surface.querySelectorAll('.docnode,.acube').forEach((n) => n.remove());

    for (const doc of S.docs) {
      const p = layout.docs[doc.id] || { x: 200, y: 40 };
      const el = document.createElement('div');
      el.className = 'docnode'; el.dataset.id = doc.id;
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
    renderPanel();
  }

  async function refresh() {
    const r = await fetch('/state?scope=' + encodeURIComponent(S.scopeId));
    if (!r.ok) return;
    const next = await r.json();
    S.docs = next.docs; S.agents = next.agents; S.busy = next.busy;
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
  const wanted = new URLSearchParams(location.search).get('select');
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
    busy,
    stateColors: STATE_COLORS,
    agentColor: AGENT_COLOR,
    subagentColor: SUBAGENT_COLOR,
    missingColor: MISSING_COLOR,
  };

  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ai-os — the desk</title>
<style>${CHROME_CSS}${DESK_CSS}</style>
<div class="menubar">
  <span class="apple">ai-os</span>
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
<div class="desk deskbg">
  <div class="surface" id="surface">
    <div class="shelf"><h3>Agents</h3></div>
  </div>
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
<script>${DESK_JS}</script>
</html>`;
}
