/**
 * The activity canvas, as a page you can point at.
 *
 *   cd ai-ui && node scripts/build-grid.ts --out grid.html
 *
 * Every rule about what a square may claim lives in [grid.ts](../src/grid.ts)
 * and [threads.ts](../src/threads.ts), both pure and both tested. This file is
 * the renderer and the chrome.
 *
 * ## Why this replaced the bundle
 *
 * The bundle was a 3D object in a 2D scene and it was beautiful and it was hard
 * to use. To read a step you had to turn the thing until the step came forward,
 * and to click it you had to catch a curve two pixels wide whose position was a
 * function of four other strands. That is a surface you *steer*. A canvas of
 * squares is a surface you *point at*: a step is at a row and a column, both of
 * which a person already has in their head, and the hit area is a rectangle.
 *
 * ## What moves, and what each motion means
 *
 * The rule has not changed: **everything that moves is a measurement.**
 *
 * - **The canvas drifts left, always.** Now is the right edge and the clock is
 *   really running, so a square recorded twenty minutes ago is twenty-one
 *   minutes ago a minute later, and it moves one square-width closer to the
 *   left when the bucket ticks over. That means time is passing, which is
 *   always true.
 * - **A square breathes only where a step is open right now.** That means work
 *   is happening, which is usually false — and when it is false, nothing on the
 *   canvas moves except the drift.
 *
 * Nothing else animates. No transitions on hover, no easing on select: a
 * movement that means nothing is a lie about a surface whose whole argument is
 * that its marks are measurements.
 */
import { writeFileSync } from "node:fs";
import { GRID_JS } from "../src/grid.ts";
import { attentionOf } from "../src/helix.ts";
import { threadsOf } from "../src/threads.ts";
import { traceOf } from "../src/trace.ts";
import { agentOfIntent } from "../src/server.ts";
import { DEMO_AT } from "../src/simulate.ts";
import { cochleaFlows } from "../src/cochlea-demo.ts";
import { cochleaProjectFlows } from "../src/cochlea-project.ts";
import { hemoFlows } from "../src/hemo-demo.ts";
import { memoryFlows } from "../src/memory-demo.ts";
import { dspFlows } from "../src/dsp-demo.ts";

const outIdx = process.argv.indexOf("--out");
const out = outIdx >= 0 ? process.argv[outIdx + 1]! : "grid.html";

const docsOf = (raw: Array<Record<string, unknown>>) =>
  raw.map((d) => ({
    id: d["id"] as string,
    title: d["title"] as string,
    state: d["state"] as string,
    trace: traceOf(d["steps"] as never, agentOfIntent),
  }));

const SCENES = [
  {
    id: "coclea-sr",
    label: "coclea-sr — truth is derivable",
    note:
      "Two chains, the same six agents, the same six steps — and thirty hours apart. One came " +
      "home. The other stops at AUDITOR, because a gate declared before the run measured " +
      "2.592e-4 against a tolerance of 1.0e-4. One step here is open right now.",
    world: threadsOf(docsOf([...cochleaFlows(DEMO_AT), ...cochleaProjectFlows(DEMO_AT)] as never)),
  },
  {
    id: "hemo-verified",
    label: "hemo-verified — truth is not derivable",
    note:
      "No closed form exists here, so the judge itself is measured: 0.9056 composite against a " +
      "kill threshold written down first, while six of its seven oracles are near a coin flip " +
      "alone. One row stops with a square that is hollow — A4, read on two machines, never " +
      "compared under conditions where disagreeing is defined.",
    world: threadsOf(docsOf(hemoFlows(DEMO_AT) as never)),
  },
  {
    id: "memory-lab",
    label: "memory lab — green and wrong",
    note:
      "Two rows index the same notes with the same agents, and both are green. One is wrong: a " +
      "step used nothing it was given, because its note claims 663 characters of a passage that " +
      "is 1,105. The canvas points at it on its own, and says why.",
    world: threadsOf(docsOf(memoryFlows(DEMO_AT) as never)),
  },
  {
    id: "signal-lab",
    label: "signal lab — ran and carried nothing",
    note:
      "The same claim one level down, about a step rather than a result: a stage ran, settled, " +
      "reported, and carried nothing forward. Its output is a flatline and the prose about it " +
      "reads exactly like the prose about a clean band.",
    world: threadsOf(docsOf(dspFlows(DEMO_AT) as never)),
  },
];

const payload = SCENES.map((s) => ({
  id: s.id,
  label: s.label,
  note: s.note,
  world: s.world,
  attention: attentionOf(s.world),
}));

const CSS = String.raw`
:root{
  --blue:#0A84FF; --green:#30D158; --indigo:#5E5CE6; --orange:#FF9F0A;
  --pink:#FF375F; --purple:#BF5AF2; --red:#FF453A; --teal:#64D2FF; --yellow:#FFD60A;
  --bg:#000; --bg-2:#1C1C1E; --bg-3:#2C2C2E; --sep:#38383A;
  --ink:#F2F2F7; --dim:#98989F; --faint:#636366;
  --sans:ui-sans-serif,-apple-system,"SF Pro Text",system-ui,"Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Monaco,"Roboto Mono",monospace;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);
  font:13.5px/1.55 var(--sans);-webkit-font-smoothing:antialiased;overflow:hidden}
.wrap{display:grid;grid-template-columns:1fr 340px;height:100%}
.stage{position:relative;overflow:hidden}
header{position:absolute;top:0;left:0;right:0;z-index:5;display:flex;gap:12px;align-items:center;
  padding:14px 20px 24px;background:linear-gradient(180deg,#000 58%,transparent);flex-wrap:nowrap}
header b{font-weight:600;letter-spacing:-.01em;white-space:nowrap}
/* The way back. The website and this canvas are one product now — same ground,
   same two stacks, same nine colours — so the wordmark is the same wordmark and
   it is a door, not a label. Absolute, because this file is also meant to open
   from disk with no server, where a site-root path resolves to nothing. */
header .home{display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--ink)}
header .home .mark{display:block;width:15px;height:15px;flex:none}
header .home:hover{opacity:.72}
header .sk{font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;
  color:var(--orange);background:rgba(255,159,10,.12);border:1px solid rgba(255,159,10,.28);
  border-radius:999px;padding:3px 10px}
header .build{font:10px var(--mono);color:var(--faint);background:var(--bg-2);
  border:1px solid var(--sep);border-radius:6px;padding:3px 8px;
  white-space:nowrap;flex:none}
header select{appearance:none;background:var(--bg-2);color:var(--ink);border:1px solid var(--sep);
  border-radius:9px;padding:7px 30px 7px 12px;font:13px var(--sans);cursor:pointer;
  background-image:linear-gradient(45deg,transparent 50%,var(--dim) 50%),
    linear-gradient(135deg,var(--dim) 50%,transparent 50%);
  background-position:calc(100% - 15px) 15px,calc(100% - 10px) 15px;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat}
header .grow{flex:1}
header .lvl{font:11px var(--mono);color:var(--dim);white-space:nowrap}
header button{background:var(--bg-2);color:var(--ink);border:1px solid var(--sep);
  border-radius:9px;width:34px;height:32px;font:15px var(--sans);cursor:pointer}
header button.wide{width:auto;padding:0 12px;font-size:12px}
header button:hover{background:var(--bg-3)}
svg{display:block;width:100%;height:100%;touch-action:none}
svg.grabbing{cursor:grabbing}
.cell{cursor:pointer}
.rowlab{font:11.5px var(--sans);fill:var(--dim)}
.rowlab.on{fill:var(--ink)}
.rowhit{cursor:pointer}
.tick{font:10px var(--mono);fill:var(--faint)}
.slot{fill:none;stroke:#1E1E20;stroke-width:1;pointer-events:none}
.nowline{stroke:var(--sep);stroke-width:1}
.nowtext{font:10px var(--mono);fill:var(--dim)}
.xhair{stroke:#2A2A2C;stroke-width:1;pointer-events:none}
.bar{pointer-events:none}
.more{fill:none;stroke:var(--faint);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
@keyframes breathe{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:1;transform:scale(1.5)}}
.pulse{transform-box:fill-box;transform-origin:center;animation:breathe 1.8s ease-in-out infinite}
aside{border-left:1px solid var(--sep);background:#0A0A0B;padding:20px 20px 44px;overflow:auto}
aside h2{margin:0;font:600 11px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
aside h3{margin:6px 0 2px;font:600 19px/1.25 var(--sans);letter-spacing:-.02em}
aside .sub{color:var(--dim);font-size:12px;margin-bottom:14px}
aside h4{margin:16px 0 8px;font:600 10.5px var(--sans);letter-spacing:.06em;
  text-transform:uppercase;color:var(--faint)}
.note{color:var(--dim);font-size:12.5px;line-height:1.6;margin-top:14px;
  border-top:1px solid var(--sep);padding-top:12px}
.sw{display:flex;gap:8px;margin:12px 0}
.sw button{flex:1;background:var(--bg-2);border:1px solid var(--sep);color:var(--ink);
  border-radius:9px;padding:8px 10px;font:13px var(--sans);cursor:pointer}
.sw button[aria-selected="true"]{background:var(--blue);border-color:var(--blue);color:#fff}
.sw button.on{background:rgba(100,210,255,.14);border-color:rgba(100,210,255,.45);color:var(--teal)}
.fld{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #1A1A1C;font-size:12.5px}
.fld .k{color:var(--faint);min-width:82px}
.fld span{overflow-wrap:anywhere}
button.at{display:inline-block;margin-left:6px;background:var(--bg-2);border:1px solid var(--sep);
  color:var(--teal);border-radius:6px;padding:1px 7px;font:11px var(--mono);cursor:pointer}
.fnd{border:1px solid var(--sep);border-radius:12px;padding:12px;margin-top:12px;background:var(--bg-2)}
.fnd .vd{font:600 10px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
.fnd.ok .vd{color:var(--green)} .fnd.problem .vd{color:var(--red)} .fnd.unknown .vd{color:var(--yellow)}
.fnd .sy{margin:6px 0 8px;font-size:13px;line-height:1.55}
.fnd .ct{font:11px var(--mono);color:var(--faint)}
.att .row,.key .row{display:flex;gap:9px;align-items:flex-start;padding:7px 8px;border-radius:9px;
  font-size:12.5px;line-height:1.45}
.att .row{cursor:pointer}
.att .row:hover{background:var(--bg-2)}
.att .row.front{background:var(--bg-2)}
.sw2{width:11px;height:11px;border-radius:3px;flex:none;margin-top:3px}
.att .kd{font:10px var(--mono);color:var(--faint);text-transform:uppercase;margin-left:6px}
.att .why{display:block;color:var(--dim)}
.key svg{width:44px;height:14px;flex:none;margin-top:1px}
.bytes{white-space:pre-wrap;font:11px var(--mono);color:var(--dim);background:var(--bg-2);
  border:1px solid var(--sep);border-radius:10px;padding:10px;margin-top:12px}
.play{position:absolute;left:20px;bottom:18px;z-index:6;display:flex;gap:12px;align-items:center;
  background:rgba(20,20,22,.86);backdrop-filter:blur(20px);border:1px solid var(--sep);
  border-radius:999px;padding:8px 18px 8px 8px;max-width:min(680px,72%)}
.play button{background:var(--ink);color:#000;border:0;border-radius:999px;padding:7px 16px;
  font:600 13px var(--sans);cursor:pointer}
.play span{font-size:12.5px;color:var(--dim);line-height:1.4}
`;

const JS = String.raw`
const SCENES = __PAYLOAD__;
const G = (function(){ __GRID__
  return { cells: cellsOf, rows: rowsOf, cite: assertCitedCell, bucketFor: bucketFor };
})();

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

const fmtDur = (m) => m < 1 ? Math.round(m * 60) + 's'
  : m < 90 ? Math.round(m) + 'm'
  : m < 2880 ? (m / 60).toFixed(1) + 'h'
  : (m / 1440).toFixed(1) + 'd';

/**
 * Hue is identity and nothing else.
 *
 * A square's colour says *who was holding it*. Not how it went — state is
 * texture, which is the rule the whole surface runs on and the reason a failure
 * and a success by the same agent are the same colour and read differently.
 * The human is the one that is not a hue: white, because a person is not one of
 * the agents and the eye should not have to remember which colour they were.
 */
const PALETTE = ['#0A84FF','#FF9F0A','#30D158','#BF5AF2','#FF375F','#64D2FF','#5E5CE6','#FFD60A'];
const HUMAN = '#F2F2F7';

const el = (n, a) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', n);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
};

const stage = document.getElementById('stage');
const svg = document.getElementById('canvas');
const panel = document.getElementById('panel');
const lvl = document.getElementById('lvl');
const pick = document.getElementById('scene');

let scene = SCENES[0];
let hue = {};
let sel = null;          // the square being read
let selRow = null;       // the flow being read
let mode = 'read';
let watching = null;
let hover = null;
const opened = Date.now();

/** Lane colours, assigned in the order the lanes appear in this scope. */
function assignHues() {
  hue = {};
  let n = 0;
  for (const l of scene.world.lanes)
    hue[l.id] = l.kind === 'human' ? HUMAN : PALETTE[n++ % PALETTE.length];
}
const rowHue = (ordinal) => PALETTE[ordinal % PALETTE.length];

// ---- the window ------------------------------------------------------------

const M = { l: 250, r: 40, t: 84, b: 74 };
let W = 0, H = 0;

/**
 * Time really passes, so the canvas really drifts.
 *
 * The world's clock is minutes from its own zero; 'now' is its span plus however
 * long this page has been open. Nothing here fakes a tick.
 */
const driftedFor = () => (Date.now() - opened) / 60000;
const nowT = () => scene.world.span + driftedFor();

let win = 0;                              // minutes visible
let pan = 0;                              // minutes shifted back from now
/**
 * The right edge, and the one thing that keeps 'drag right to go back' honest.
 *
 * 'pan' is how far back from now the window has been dragged. It is clamped at
 * zero on the near side: you cannot drag past now, because there is nothing
 * there and a surface that lets you look at empty future is inviting a reader
 * to mistake it for a forecast.
 */
const t1 = () => nowT() + win * 0.03 - pan;
const t0 = () => t1() - win;

/**
 * Bucket widths, and why they are these.
 *
 * Round units a person can hold: a minute, five, a quarter of an hour, an hour,
 * a day. A bucket of '7.3 minutes' would fit the pixels better and be unusable
 * as a unit — you cannot look at a square and know what it covers.
 */
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 360, 720, 1440, 4320];
const CELL_FLOOR = 14;                     // px: below this a square stops being one
const plotW = () => Math.max(60, W - M.l - M.r);
const bucket = () => G.bucketFor(win, plotW(), CELL_FLOOR, STEPS);
const nCols = () => Math.max(1, Math.ceil(win / bucket()));
const colW = () => plotW() / nCols();

/**
 * Where the canvas opens, and why it is not the whole history.
 *
 * At the whole span the bucket has to widen until a column is wide enough to
 * point at, and at that width a flow that ran for an hour is one square. One
 * square is exactly what the desk drew and exactly what this surface exists to
 * stop drawing: the sequence of hands a flow passed through is the thing worth
 * seeing, and it only exists at a resolution where the handoffs are separate.
 *
 * So it opens on the most recent cluster of work with a margin, which is where
 * the squares are, and 'All' is one button away and says how much each square
 * covers once you press it. Dragging right goes back — older clusters are off
 * to the left, which is where they are.
 */
const resetWin = () => {
  const ends = scene.world.threads.map((t) => Math.max.apply(null, t.rests.map((r) => r.x1)));
  const latest = Math.max.apply(null, ends);
  const recentCut = latest - Math.max(20, scene.world.span * 0.1);
  const starts = scene.world.threads
    .filter((t, i) => ends[i] >= recentCut)
    .map((t) => Math.min.apply(null, t.rests.map((r) => r.x0)));
  const from = starts.length ? Math.min.apply(null, starts) : latest - 60;
  pan = 0;
  win = Math.max(12, Math.min(scene.world.span * 1.04, (nowT() - from) * 1.14));
};
const allWin = () => { pan = 0; win = Math.max(12, scene.world.span * 1.04); };

function measure() {
  const r = svg.getBoundingClientRect();
  W = r.width; H = r.height;
}

const xOf = (t) => M.l + ((t - t0()) / win) * plotW();
const colX = (c) => M.l + c * colW();
const rows = () => G.rows(scene.world);
/**
 * A grid of squares means the rows are as far apart as the columns are wide.
 *
 * The first version stretched the rows to fill the height, and five flows over
 * three days came out as five sparse lines sixty pixels apart with nothing
 * between them: a scatter plot, not a canvas. What makes a contribution grid
 * readable is that it is a *lattice* — uniform pitch in both directions, so an
 * empty slot is as visible as a full one and the eye counts rather than hunts.
 * So the row pitch follows the column width, and the block sits in the middle
 * of whatever room there is rather than being pulled to fit it.
 */
const rowPitch = () => Math.max(20, Math.min(34, colW()));
const blockH = () => rows().length * rowPitch();
// 'top' is a window global in a classic script, so this one is named for the block.
const blockTop = () => M.t + Math.max(0, ((H - M.t - M.b) - blockH()) / 2);
const rowH = rowPitch;
const rowY = (i) => blockTop() + i * rowPitch() + rowPitch() / 2;

// ---- drawing ---------------------------------------------------------------

const liveCount = () => scene.world.threads
  .reduce((n, t) => n + t.rests.filter((r) => r.state === 'running').length, 0);

let cells = [];

function draw() {
  measure();
  svg.replaceChildren();
  const rs = rows(), rh = rowH(), cw = colW(), bk = bucket();
  const a = t0(), b = t1();

  cells = G.cells(scene.world, { t0: a, t1: b, bucket: bk }).map(G.cite);

  /**
   * The empty slots, and the line this surface will not cross.
   *
   * A slot says 'this is a bucket of time on this flow, and you can point at
   * it'. It does **not** say nothing happened in it — it says nothing was
   * written down, which is the only one of those two a record can support. That
   * is why an empty slot is an outline and never a pale fill: a fill is a value
   * on the same scale as the full squares, and there is no measured zero here to
   * put on that scale. GitHub can use its palest green for a zero-commit day
   * because a repository knows what it does not contain. This does not.
   *
   * Without them the empties are invisible and the canvas is a scatter of dots;
   * with them it is a lattice you can count along.
   */
  const slot = Math.max(4, Math.min(rh - 5, cw - Math.min(3, Math.max(1, cw * 0.14))));
  for (const r of rs) {
    const y = rowY(r.row) - slot / 2;
    for (let c = 0; c < nCols(); c += 1)
      svg.appendChild(el('rect', { class: 'slot', x: colX(c) + (cw - slot) / 2, y: y,
        width: slot, height: slot, rx: Math.max(1.5, slot * 0.24) }));
  }

  // Row labels. The chip is the flow's own hue, which is the only place a flow
  // gets a colour: inside the canvas, colour belongs to whoever is holding it.
  for (const r of rs) {
    const y = rowY(r.row);
    const on = selRow === r.flowId || (sel && sel.flowId === r.flowId);
    svg.appendChild(el('rect', { class: 'rowhit', x: 0, y: y - rh / 2, width: M.l - 12,
      height: rh, fill: 'transparent', 'data-row': r.flowId }));
    svg.appendChild(el('rect', { x: 14, y: y - 5, width: 10, height: 10, rx: 3,
      fill: rowHue(r.ordinal), opacity: on ? 1 : 0.8 }));
    const lab = el('text', { class: 'rowlab' + (on ? ' on' : ''), x: 32, y: y + 4,
      'data-row': r.flowId });
    lab.textContent = r.title.length > 30 ? r.title.slice(0, 29) + '…' : r.title;
    svg.appendChild(lab);
  }

  /**
   * Where the rest of a row is.
   *
   * A row with no squares in the window looks exactly like a flow nothing was
   * ever recorded for, and those are different facts — one of them is 'you are
   * looking in the wrong place'. So a row whose work continues outside the
   * window gets a chevron on the edge it continues past, and its label dims when
   * *all* of its work is out there. It is a measurement like everything else:
   * the mark is drawn only when there really is a recorded step beyond the edge.
   */
  for (const r of rs) {
    const th = scene.world.threads.find((t) => t.flowId === r.flowId);
    const before = th.rests.some((x) => x.x0 < a) || th.crosses.some((x) => x.x0 < a);
    const after = th.rests.some((x) => x.x1 > b) || th.crosses.some((x) => x.x1 > b);
    const here = cells.some((c) => c.flowId === r.flowId);
    const y = rowY(r.row);
    if (before) {
      const g = el('path', { class: 'more', d: 'M' + (M.l - 9) + ' ' + (y - 4) + 'L' +
        (M.l - 14) + ' ' + y + 'L' + (M.l - 9) + ' ' + (y + 4) });
      svg.appendChild(g);
    }
    if (after)
      svg.appendChild(el('path', { class: 'more', d: 'M' + (W - M.r + 9) + ' ' + (y - 4) + 'L' +
        (W - M.r + 14) + ' ' + y + 'L' + (W - M.r + 9) + ' ' + (y + 4) }));
    if (!here) {
      const lab = svg.querySelector('text.rowlab[data-row="' + r.flowId + '"]');
      if (lab) lab.setAttribute('opacity', '0.42');
    }
  }

  // The squares.
  const pad = Math.min(3, Math.max(1, cw * 0.14));
  const size = Math.max(4, Math.min(rh - 5, cw - pad));
  for (const cell of cells) {
    if (sel && sel.flowId !== cell.flowId && selRow === null) { /* dim below */ }
    const x = colX(cell.col) + (cw - size) / 2;
    const y = rowY(cell.row) - size / 2;
    const h = hue[cell.holder] || rowHue(cell.ordinal);
    const dimmed = (selRow && selRow !== cell.flowId) ? 0.16
      : (sel && sel.flowId !== cell.flowId) ? 0.2 : 1;
    const rx = Math.max(1.5, size * 0.24);

    // More than one recorded thing landed in this bucket: the square is a stack.
    // Drawn as an offset card behind it, so 'this is merged' is visible without
    // a number and without pretending the number is a measurement of anything
    // but how many records fell in one bucket.
    if (cell.count > 1)
      svg.appendChild(el('rect', { x: x + 2, y: y - 2, width: size, height: size, rx: rx,
        fill: h, opacity: 0.22 * dimmed }));

    const hollow = cell.state === 'open' || cell.state === 'pending';
    const g = el('g', { class: 'cell', opacity: dimmed });
    const sq = el('rect', {
      x: x, y: y, width: size, height: size, rx: rx,
      fill: hollow ? 'none' : h,
      stroke: hollow ? h : 'none',
      'stroke-width': hollow ? 1.4 : 0,
      'stroke-dasharray': cell.state === 'pending' ? '2 2.4' : 'none',
      opacity: cell.state === 'ignored' ? 0.3 : 1,
    });
    g.appendChild(sq);

    // Ran and did not pass: the square is cut. A second hue would say 'red means
    // bad', and hue on this surface already means who — so the mark is a
    // subtraction, not a colour.
    if (cell.state === 'blocked')
      g.appendChild(el('rect', { class: 'bar', x: x - 0.5, y: y + size / 2 - Math.max(1, size * 0.11),
        width: size + 1, height: Math.max(2, size * 0.22), fill: '#000' }));

    // Open right now: the one thing on the canvas that moves on its own.
    if (cell.state === 'running')
      g.appendChild(el('circle', { class: 'pulse', cx: x + size / 2, cy: y + size / 2,
        r: Math.max(1.6, size * 0.17), fill: '#000' }));

    g.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); select(cell); });
    g.addEventListener('pointerenter', () => { hover = cell; drawHover(); });
    g.addEventListener('pointerleave', () => { hover = null; drawHover(); });
    svg.appendChild(g);
  }

  // The clock along the bottom, and now pinned to the right edge.
  const ticks = 6;
  for (let i = 0; i <= ticks; i += 1) {
    const t = a + (win * i) / ticks;
    const d = Math.max(0, nowT() - t);
    const lab = el('text', { class: 'tick', x: xOf(t), y: blockTop() + blockH() + 24,
      'text-anchor': i === ticks ? 'end' : 'middle' });
    lab.textContent = d < 1 ? 'now' : fmtDur(d) + ' ago';
    svg.appendChild(lab);
  }
  const nx = xOf(nowT());
  svg.appendChild(el('line', { class: 'nowline', x1: nx, y1: blockTop() - 18,
    x2: nx, y2: blockTop() + blockH() + 8 }));
  const live = liveCount();
  const nl = el('text', { class: 'nowtext', x: nx - 8, y: blockTop() - 24, 'text-anchor': 'end' });
  nl.textContent = live
    ? live + (live === 1 ? ' step open · now' : ' steps open · now')
    : 'now · nothing running';
  svg.appendChild(nl);

  lvl.textContent = fmtDur(win) + ' wide · a square is ' + fmtDur(bk);
  drawHover();
}

/** The crosshair. It follows the pointer and says nothing the squares do not. */
let hairG = null;
function drawHover() {
  if (hairG && hairG.parentNode) hairG.remove();
  if (!hover) return;
  const rh = rowH(), cw = colW();
  hairG = el('g', {});
  hairG.appendChild(el('line', { class: 'xhair', x1: M.l, y1: rowY(hover.row) - rh / 2,
    x2: W - M.r, y2: rowY(hover.row) - rh / 2 }));
  hairG.appendChild(el('line', { class: 'xhair', x1: M.l, y1: rowY(hover.row) + rh / 2,
    x2: W - M.r, y2: rowY(hover.row) + rh / 2 }));
  hairG.appendChild(el('line', { class: 'xhair', x1: colX(hover.col), y1: blockTop(),
    x2: colX(hover.col), y2: blockTop() + blockH() }));
  hairG.appendChild(el('line', { class: 'xhair', x1: colX(hover.col) + cw, y1: blockTop(),
    x2: colX(hover.col) + cw, y2: blockTop() + blockH() }));
  svg.appendChild(hairG);
}

// ---- the panel -------------------------------------------------------------

const nice = (n) => String(n).replace('@human', 'you');

const fld = (k, v, at) => '<div class="fld"><span class="k">' + esc(k) + '</span><span>' +
  esc(v) + (at ? '<button class="at" data-open="' + esc(at) + '">' + esc(at) + '</button>' : '') +
  '</span></div>';

const finding = (f) => {
  if (f.verdict !== 'unknown' && !f.cites.length)
    throw new Error('a verdict without an address must be reported as unknown');
  return '<div class="fnd ' + f.verdict + '"><div class="vd">' +
    (f.verdict === 'unknown' ? 'unknown' : f.verdict === 'ok' ? 'no problem found' : 'problem') +
    '</div><p class="sy">' + esc(f.says) + '</p>' +
    (f.cites.length
      ? '<div class="ct">read: ' + f.cites.map((c) =>
          '<button class="at" data-open="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>'
      : '<div class="ct">nothing to read — that is why this is unknown</div>') + '</div>';
};

const attHtml = () => '<div class="att"><h4>What to look at, and why</h4>' +
  scene.attention.map((a) =>
    '<div class="row' + (selRow === a.flowId ? ' front' : '') + '" data-row="' + esc(a.flowId) + '">' +
    '<span class="sw2" style="background:' + rowHue(a.ordinal) + '"></span>' +
    '<span><b>' + esc(a.title) + '</b><span class="kd"> ' + esc(a.kind) + '</span>' +
    '<span class="why">' + esc(a.reason) +
    (a.at ? '' : ' — nothing recorded to point at') + '</span></span></div>').join('') +
  '</div>';

const chip = (opts) => '<svg viewBox="0 0 44 14"><rect x="16" y="1" width="12" height="12" rx="3" ' +
  opts + '/></svg>';

const keyHtml = () => {
  const live = liveCount();
  const who = scene.world.lanes.map((l) =>
    '<div class="row"><span class="sw2" style="background:' + (hue[l.id] || '#666') +
    (l.kind === 'human' ? ';border:1px solid #555' : '') + '"></span><span>' +
    esc(nice(l.label || l.id)) + '</span></div>').join('');
  return '<div class="key"><h4>Colour — who was holding it</h4>' + who +
    '<h4 style="margin-top:12px">Texture — what happened</h4>' +
    '<div class="row">' + chip('fill="#0A84FF"') + '<span><b>carried</b> — it moved and the next step used it</span></div>' +
    '<div class="row">' + chip('fill="#0A84FF" opacity=".3"') + '<span><b>carried nothing forward</b> — it arrived and nothing used it</span></div>' +
    '<div class="row">' + chip('fill="none" stroke="#0A84FF" stroke-width="1.4"') + '<span><b>no verdict yet</b> — held, still open</span></div>' +
    '<div class="row">' + chip('fill="none" stroke="#0A84FF" stroke-width="1.4" stroke-dasharray="2 2.4"') + '<span><b>not begun</b> — order known, time not</span></div>' +
    '<div class="row"><svg viewBox="0 0 44 14"><rect x="16" y="1" width="12" height="12" rx="3" fill="#0A84FF"/>' +
    '<rect x="15.5" y="5.6" width="13" height="2.8" fill="#000"/></svg>' +
    '<span><b>ran and did not pass</b></span></div>' +
    '<div class="row"><svg viewBox="0 0 44 14"><rect x="16" y="1" width="12" height="12" rx="3" fill="none" stroke="#2A2A2C"/></svg>' +
    '<span><b>an empty slot</b> — nothing was written down in that bucket. Not a claim that nothing happened: no square is drawn because there is no record to draw</span></div>' +
    '<div class="row"><svg viewBox="0 0 44 14"><rect x="18" y="-1" width="12" height="12" rx="3" fill="#0A84FF" opacity=".22"/>' +
    '<rect x="16" y="1" width="12" height="12" rx="3" fill="#0A84FF"/></svg>' +
    '<span><b>more than one thing here</b> — this square is a merge; the header says of how long</span></div>' +
    '<div class="row"><svg viewBox="0 0 44 14"><path d="M26 3 L21 7 L26 11" fill="none" stroke="#636366" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<span><b>this row continues past the edge</b> — there are recorded steps out there. Drag that way, or press All</span></div>' +
    '<h4 style="margin-top:12px">Motion</h4>' +
    '<div class="row"><span><b>the canvas drifts left</b> — the clock is running, which is always true</span></div>' +
    '<div class="row"><span><b>a square breathes</b> — a step is open right now' +
    (live ? '' : '. <b>None is</b>, so nothing on the canvas is moving') + '</span></div>' +
    '</div>';
};

const noteHtml = () => '<div class="note">' + esc(scene.note) + '</div>';

function renderRest() {
  const live = liveCount();
  const steps = scene.world.threads.reduce((n, t) => n + t.rests.length, 0);
  panel.innerHTML = '<h2>This canvas</h2>' +
    '<h3>' + (live ? live + ' step' + (live === 1 ? '' : 's') + ' open right now' : 'nothing is running') + '</h3>' +
    '<div class="sub">' + scene.world.threads.length + ' flows · ' + steps + ' steps · ' +
    fmtDur(scene.world.span) + ' of history · ' + cells.length + ' squares</div>' +
    '<div class="note" style="margin-top:0">One row is one flow, left to right is time, and every ' +
    'square is one flow in one bucket of time held by somebody. Click a square. Drag left to go ' +
    'back. Scroll to change how long a square is.</div>' +
    '<div class="sw"><button id="watch"' + (watching ? ' class="on"' : '') + '>' +
    (watching ? 'INSPECTOR is watching — detach' : 'Attach INSPECTOR to a flow') + '</button></div>' +
    (watching ? watchHtml() : '') +
    attHtml() + keyHtml() + noteHtml();
  wire();
}

function watchHtml() {
  const a = scene.attention.find((x) => x.flowId === watching);
  if (!a) return '';
  const verdict = a.kind === 'ignored' || a.kind === 'blocked' ? 'problem'
    : a.kind === 'open' || a.kind === 'running' ? 'unknown' : 'ok';
  return finding({
    verdict: verdict,
    says: a.kind === 'running'
      ? 'I am on "' + a.title + '". ' + a.reason + ', so there is no observation yet — it has not finished.'
      : a.kind === 'settled'
        ? 'I am on "' + a.title + '". Nothing on it is open and nothing is flagged: ' + a.reason + '.'
        : 'I am on "' + a.title + '". ' + a.reason + '.',
    cites: a.at ? [a.at] : [],
  });
}

function select(cell) { sel = cell; selRow = cell.flowId; mode = 'read'; draw(); renderPanel(); }

function renderPanel() {
  if (!sel) { renderRest(); return; }
  const many = sel.count > 1;
  const head = '<h2>' + (many ? sel.count + ' things, one square' : 'One square') + '</h2>' +
    '<h3>' + esc(nice(sel.holder)) + '</h3>' +
    '<div class="sub">' + esc(sel.title) + ' · ' + fmtDur(sel.t1 - sel.t0) + ' of time, ending ' +
    fmtDur(Math.max(0, nowT() - sel.t1)) + ' ago</div>' +
    '<div class="sw"><button id="m-read"' + (mode === 'read' ? ' aria-selected="true"' : '') + '>Read it</button>' +
    '<button id="m-agent"' + (mode === 'agent' ? ' aria-selected="true"' : '') + '>Ask an agent</button></div>';

  let body;
  if (mode === 'read') {
    body = fld('state', sel.state) +
      fld('held by', sel.holders.map(nice).join(', ')) +
      fld('steps', sel.steps.join(', ')) +
      fld('records here', String(sel.count)) +
      (sel.digest ? fld('observation', sel.digest, sel.source || undefined)
                  : fld('observation', 'nothing recorded — this is not a claim that nothing moved'));
  } else {
    const at = 'flow:' + sel.flowId + '#step-' + sel.steps[0];
    const cites = sel.source ? [sel.source, at] : [at];
    let f;
    if (sel.state === 'blocked')
      f = { verdict: 'problem', cites: cites,
            says: nice(sel.holder) + ' had this and it did not pass. That is a result, not a gap: ' +
                  'something ran and said no.' };
    else if (sel.state === 'ignored')
      f = { verdict: 'problem', cites: cites,
            says: 'It arrived at ' + nice(sel.holder) + ' and none of it was used. The square is ' +
                  'faint for that reason and for no other.' };
    else if (sel.state === 'open')
      f = { verdict: 'unknown', cites: cites,
            says: nice(sel.holder) + ' is holding this and no verdict has been reached. That is the ' +
                  'absence of a result, which is a different thing from a negative one.' };
    else if (sel.state === 'pending')
      f = { verdict: 'unknown', cites: [],
            says: 'This has not begun. Its place in the order is known and its time is not.' };
    else if (sel.state === 'running')
      f = { verdict: 'unknown', cites: cites,
            says: nice(sel.holder) + ' has this open right now and has not closed it. There is no ' +
                  'observation yet, because it has not finished.' };
    else if (!sel.digest)
      f = { verdict: 'unknown', cites: [],
            says: 'Nothing was recorded in this square beyond the fact that ' + nice(sel.holder) +
                  ' held it, so there is nothing to read.' };
    else
      f = { verdict: 'ok', cites: cites,
            says: nice(sel.holder) + ' held this for ' + fmtDur(sel.t1 - sel.t0) + ' and recorded ' +
                  sel.digest + '.' };
    body = finding(f);
  }
  panel.innerHTML = head + body +
    '<div class="sw"><button id="back">Back to the canvas</button></div>' + attHtml() + keyHtml();
  wire();
}

const wire = () => {
  const r = panel.querySelector('#m-read'), a = panel.querySelector('#m-agent');
  if (r) r.onclick = () => { mode = 'read'; renderPanel(); };
  if (a) a.onclick = () => { mode = 'agent'; renderPanel(); };
  const back = panel.querySelector('#back');
  if (back) back.onclick = () => { sel = null; selRow = null; draw(); renderRest(); };
  const w = panel.querySelector('#watch');
  if (w) w.onclick = () => {
    if (watching) { watching = null; renderRest(); draw(); return; }
    const front = scene.attention[0];
    watching = front ? front.flowId : scene.world.threads[0].flowId;
    selRow = watching;
    renderRest(); draw();
  };
  for (const row of panel.querySelectorAll('.att .row'))
    row.onclick = () => { selRow = row.dataset.row; sel = null; draw(); renderRest(); };
  for (const b of panel.querySelectorAll('button.at'))
    b.onclick = () => {
      const at = b.dataset.open;
      const html = '<div class="bytes">' + esc(at) + '\n\n' +
        'This address is recorded on the square above. This page has no filesystem, so the ' +
        'address is shown rather than the bytes — and no contents are invented for it.</div>';
      const box = panel.querySelector('.bytes');
      if (box) box.outerHTML = html; else panel.insertAdjacentHTML('beforeend', html);
      wire();
    };
};

// ---- panning and zooming ---------------------------------------------------

let drag = null;

svg.addEventListener('pointerdown', (ev) => {
  drag = { x: ev.clientX, pan: pan };
  svg.classList.add('grabbing');
  svg.setPointerCapture(ev.pointerId);
});
svg.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  pan = Math.max(0, drag.pan + ((ev.clientX - drag.x) / plotW()) * win);
  draw();
});
const endDrag = (ev) => {
  if (drag && Math.abs(ev.clientX - drag.x) < 3) { sel = null; selRow = null; draw(); renderRest(); }
  drag = null; svg.classList.remove('grabbing');
};
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

const zoom = (f) => { win = Math.max(4, Math.min(scene.world.span * 6, win * f)); draw(); renderRest(); };
document.getElementById('zin').onclick = () => zoom(0.5);
document.getElementById('zout').onclick = () => zoom(2);
document.getElementById('znow').onclick = () => { resetWin(); draw(); renderRest(); };
document.getElementById('zall').onclick = () => { allWin(); draw(); renderRest(); };
svg.addEventListener('wheel', (ev) => { ev.preventDefault(); zoom(ev.deltaY > 0 ? 1.15 : 0.87); },
  { passive: false });
svg.addEventListener('pointerdown', (ev) => {
  const rowHit = ev.target && ev.target.dataset && ev.target.dataset.row;
  if (rowHit) { selRow = rowHit; sel = null; draw(); renderRest(); }
});

window.addEventListener('resize', () => { draw(); });

pick.addEventListener('change', () => {
  scene = SCENES.find((s) => s.id === pick.value) || SCENES[0];
  assignHues();
  sel = null; selRow = null; watching = null; pan = 0;
  resetWin(); draw(); renderRest();
});

// 'now' really moves, so the canvas really has to be redrawn.
let raf = null, lastDraw = 0;
const tick = (ts) => {
  raf = null;
  if (ts - lastDraw > 500) { lastDraw = ts; draw(); }
  raf = requestAnimationFrame(tick);
};
const animate = () => { if (!raf) raf = requestAnimationFrame(tick); };

assignHues();
measure();
resetWin();
draw();
renderRest();
animate();

// ---- Play ------------------------------------------------------------------

/**
 * The tour operates the real controls.
 *
 * Every beat is a click on something a visitor could click, and every caption
 * has to be true of what is on the screen when it is read. A beat that narrates
 * a thing the surface is not showing is the failure this repository is about,
 * one level up.
 */
const cap = (s) => { document.getElementById('cap').textContent = s; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let playing = false;

async function play() {
  if (playing) return;
  playing = true;
  const btn = document.getElementById('play');
  btn.textContent = 'Playing';

  pick.value = 'coclea-sr'; pick.dispatchEvent(new Event('change'));
  cap('One row is one flow. Left to right is time, now is the right edge. Every square is one flow in one bucket of time, held by somebody — and the colour is who.');
  await wait(3800);

  const blocked = cells.filter((c) => c.state === 'blocked')[0];
  if (blocked) {
    select(blocked);
    cap('A square with a bar through it ran and did not pass. Not a gap — a result. Something ran and said no.');
    await wait(3600);
    document.getElementById('m-agent').click();
    cap('Ask an agent and it reads the same square. The address it read is a button, because a finding with no address is not renderable on this surface.');
    await wait(4200);
  }

  const hole = firstHole();
  if (hole) {
    cap('The gaps in a row are the point. ' + hole + ' — nothing was written down there, so no square is drawn. A pale square would be a claim that nothing happened, and that is not the same thing.');
    await wait(4600);
  }

  document.getElementById('back').click();
  const before = bucket();
  for (let i = 0; i < 8 && bucket() === before; i += 1) {
    document.getElementById('zout').click();
    await wait(220);
  }
  cap('Zoom out and the squares do not shrink — they merge. A square below about nine pixels stops being something you can point at, so the bucket widens instead, and the header says a square is now ' + fmtDur(bucket()) + '.');
  await wait(4400);

  document.getElementById('znow').click();
  document.getElementById('watch').click();
  cap('Put the system agent on it. INSPECTOR is an agent like the others, with one tool: read. It says what it found and where it read it.');
  await wait(4200);

  pick.value = 'hemo-verified'; pick.dispatchEvent(new Event('change'));
  await wait(300);
  // The square this beat is about may be older than the window the canvas opens
  // on. Pressing All is a real control and it is the honest way to reach it —
  // the alternative is a caption about something that is not on the screen.
  const open = await bring((c) => c.state === 'open');
  if (open) {
    select(open);
    document.getElementById('m-agent').click();
    cap('A hollow square is held with no verdict. That is the absence of a result, and this project draws it differently from a negative one on purpose.');
    await wait(4600);
    document.getElementById('back').click();
  }

  pick.value = 'memory-lab'; pick.dispatchEvent(new Event('change'));
  await wait(300);
  const faint = await bring((c) => c.state === 'ignored');
  if (faint) {
    select(faint);
    document.getElementById('m-agent').click();
    cap('Both rows here are green. One is wrong: this square arrived and nothing in it was used. Green is a colour a surface chooses; this is a measurement.');
    await wait(5000);
    document.getElementById('back').click();
  }

  pick.value = 'coclea-sr'; pick.dispatchEvent(new Event('change'));
  cap('Everything you just watched was the real controls. Nothing here is a recording.');
  btn.textContent = 'Play';
  playing = false;
}

/**
 * Find a square matching a test, widening the window with the real button if it
 * is not on the screen. Returns null rather than pretending: a beat with no
 * square to stand on is a beat that does not run.
 */
async function bring(test) {
  let hit = cells.filter(test)[0];
  if (hit) return hit;
  document.getElementById('zall').click();
  await wait(320);
  hit = cells.filter(test)[0];
  return hit || null;
}

/** A phrase naming a real hole in the current scene, or null if there is none. */
function firstHole() {
  for (const t of scene.world.threads) {
    const g = t.crosses.find((c) => c.state === 'unknown');
    if (g) return 'On "' + t.title + '" a handoff has no record at all';
  }
  return null;
}

document.getElementById('play').onclick = play;
`;

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ai-os — the activity canvas</title>
<style>${CSS}</style>
<div class="wrap">
  <div class="stage" id="stage">
    <header>
      <a class="home" href="https://evolvingagentslabs.github.io/" title="ai-os — back to the site">
        <svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="13" height="13" rx="4" fill="currentColor"/><rect x="17" y="2" width="13" height="13" rx="4" fill="currentColor"/><rect x="2" y="17" width="13" height="13" rx="4" fill="currentColor"/><rect x="18" y="18" width="11" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2" opacity=".42"/></svg><b>ai-os</b></a>
      <span class="sk">simulated</span>
      <span class="build">build ${stamp()}</span>
      <select id="scene">
        ${payload.map((s) => `<option value="${s.id}">${s.label}</option>`).join("\n        ")}
      </select>
      <span class="grow"></span>
      <span class="lvl" id="lvl"></span>
      <button id="zin" title="A square covers less time">+</button>
      <button id="zout" title="A square covers more time">&minus;</button>
      <button id="znow" class="wide" title="Back to the most recent work">Now</button>
      <button id="zall" class="wide" title="The whole recorded history">All</button>
    </header>
    <svg id="canvas"></svg>
    <div class="play">
      <button id="play">Play</button>
      <span id="cap">Watch it use itself — every beat is a real control, not a recording.</span>
    </div>
  </div>
  <aside id="panel"></aside>
</div>
<script>
${JS.replace("__PAYLOAD__", JSON.stringify(payload)).replace("__GRID__", GRID_JS)}
</script>
`;

writeFileSync(out, html);
console.log(`wrote ${out} — ${Math.round(html.length / 1024)} kB, self-contained`);
for (const s of payload) {
  const steps = s.world.threads.reduce((n, t) => n + t.rests.length, 0);
  const live = s.world.threads.reduce(
    (n, t) => n + t.rests.filter((r) => r.state === "running").length,
    0,
  );
  console.log(
    `  ${s.id}: ${s.world.threads.length} flow(s), ${steps} steps, ${live} open now, ` +
      `first = ${s.attention[0]?.kind ?? "none"}`,
  );
}
