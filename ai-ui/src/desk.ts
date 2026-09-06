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
import { channelsFor, workChannel } from "../../ai-flows/src/channels.ts";
import { SIMULATION_JS } from "./simulate.ts";
import { TOUR_CSS, TOUR_JS } from "./tour.ts";
import { MASCOT_CSS, MASCOT_JS } from "./mascot.ts";
import { CREATURES_JS, CREATURE_CSS } from "./creatures.ts";
import { BUS_JS } from "./bus.ts";
import { INSPECTOR_JS } from "./inspector.ts";

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
    /** The step's output as numbers, when it produced any. Drawn, not printed. */
    series?: number[];
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
  /**
   * When this page was generated, as a short stamp shown in the chrome.
   *
   * Not decoration and not telemetry. A published page is served through a CDN
   * and a browser cache, and "I am looking at the same thing as before" is
   * otherwise unanswerable without opening the network tab — which is a thing
   * nobody does and a thing nobody should have to do. It is the smallest fact
   * that settles it.
   *
   * `undefined` on a live server, where the question does not arise: what you
   * are looking at is what the server just rendered.
   */
  builtAt?: number;
  docs: DeskDoc[];
  agents: DeskAgent[];
  people: string[];
  /** Serialised layout, handed to the client as the starting arrangement. */
  layout: unknown;
  /** Scopes this desk can switch to. */
  scopes: Array<{ scopeId: string; label: string }>;
  /**
   * What the conformation asked and could not answer.
   *
   * `conformation.ts` states the rule this field exists to keep: **holes are
   * output** — "the failure mode of any projection is silence: a view that
   * renders cleanly because it did not ask is worse than no view". The desk was
   * that view. It received the holes on every poll and dropped them at the type
   * boundary, so the one surface a person actually looks at rendered clean over
   * every question the projection could not answer.
   */
  holes: Array<{ question: string; why: string; scopeId?: string }>;
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

const NEWFORM_CSS = `
.newform { position:absolute; top:34px; left:12px; width:420px; z-index:60; }
.newform .win-body { padding:10px 12px 12px; }
.newform label { display:block; margin:0 0 8px; font-size:12px; }
.newform input { display:block; width:100%; margin-top:3px; box-sizing:border-box;
  font:inherit; font-size:12px; padding:3px 5px; border:1px solid #808080;
  border-top-color:#404040; border-left-color:#404040; background:#fff; }
.newform .row { display:flex; gap:8px; margin-top:10px; }
`;

const DESK_CSS = `
body{overflow:hidden}
.desk{position:relative;width:100vw;height:calc(100vh - 30px);overflow:auto}
.desk.hasdrawer .surface{padding-bottom:136px}
.surface{position:relative;width:2400px;height:1600px}

/* A flow on the desk.
   One card, one hairline, one resting shadow. It used to be a black-bordered box
   with a striped title bar and a hard offset shadow, containing a second box
   with a dashed border, containing the agents: three nested rectangles for one
   flow, two of which were drawing nothing.
   The title is the largest text on the surface, because on a desk full of cards
   the question a reader asks first is *which flow is this*. */
.docnode{position:absolute;width:288px;background:var(--paper);border:1px solid var(--line);
  border-radius:var(--r);box-shadow:var(--sh-1);user-select:none;touch-action:none}
.docnode.dragging{box-shadow:var(--sh-2);z-index:50}
.docnode.over{box-shadow:0 0 0 2px var(--accent),var(--sh-2)}
.docnode .dbar{display:flex;align-items:center;gap:7px;padding:11px 14px 0;cursor:grab;background:none}
.docnode .dbar .t{font-size:14px;font-weight:600;letter-spacing:-.01em;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:246px}
.docnode .body{padding:5px 14px 13px}
.docnode .goal{font-size:12.5px;line-height:1.45;color:var(--dim);margin:0 0 9px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
/* State reads as one word and a row of marks, at the size of a caption. It was
   competing with the title at the same weight. */
.docnode .meta{font-size:11px;color:var(--dim);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.docnode .meta .st{font-weight:600;color:var(--ink)}

/* A step's numbers, as a shape.
   Bars in whole pixels on the same grid as everything else, and never without
   the caption underneath: a chart with no scale invites the reader to see a
   trend in noise, which is the failure doc/04 spends a section on. The caption
   carries the peak, so a flatline cannot be mistaken for a small signal. */
.spark{display:flex;align-items:flex-end;gap:1.5px;background:#FAFAF8;border:1px solid var(--line);
  border-radius:var(--r-sm);padding:3px;overflow:hidden}
.spark i{display:block;background:#5B87A8;flex:0 0 auto;min-height:1px;border-radius:1px}
.spark.dead i{background:#B23A2E}
.sparkcap{font:10px/1.3 var(--mono);color:var(--dim);margin-top:2px}
.sparkcap b{color:#7d2419;font-weight:700}

/* The stack: the flow's agents, in the order the flow visits them.
   A wrapped row of chips, which is what this was, is a *set* -- it says these
   agents are involved and nothing about who hands to whom. A flow has an order,
   and drawing it as an unordered pile threw that away before the wires could
   show it.
   Zigzag rather than a straight column so every hop has horizontal travel as
   well as vertical: a wire between two cubes stacked exactly above each other is
   a vertical line a few pixels long, which is a wire nobody can see or click. */
.stack{min-height:24px;margin-top:11px;padding:2px 0;display:flex;flex-direction:column;gap:11px}
.stack .acube.instack:nth-child(odd){align-self:flex-start}
.stack .acube.instack:nth-child(even){align-self:flex-end}
/* The dashed box around the agents is gone. It framed a region that the wires
   and the cubes already describe, and a dashed rectangle inside a solid one
   inside the ground reads as three containers where there is one flow. Empty is
   still said out loud, because an empty region with no border needs words. */
.stack.empty{border:1px dashed var(--line-2);border-radius:var(--r-sm);padding:9px;min-height:38px}
.stack.empty::before{content:"drop an agent here";font-size:11px;color:var(--faint)}

/* An agent cube, at object size: big enough to grab, still a cube. */
.acube{position:absolute;display:flex;align-items:center;gap:6px;padding:4px 10px 4px 5px;
  background:var(--face);border:1px solid var(--line-2);border-radius:999px;
  box-shadow:var(--sh-1);font-size:11.5px;font-weight:500;letter-spacing:.01em;
  cursor:grab;user-select:none;touch-action:none;white-space:nowrap;z-index:20}
.acube.dragging{box-shadow:var(--sh-2);z-index:60;cursor:grabbing}
.acube.instack{position:static;box-shadow:1px 1px 0 rgba(0,0,0,.3);padding:2px 6px 2px 3px}
/* The body is CREATURE_CSS, shared with every other creature on this desk --
   there is exactly one sprite now, at one size or twice it. What is left here is
   only how a creature sits inside the chip that carries its name. */
.acube{padding-bottom:6px}
.acube .blk{--u:1}
.acube.missing{opacity:.55;cursor:not-allowed}
.acube.missing .n{text-decoration:line-through}
/* Running: the chip pulses too, because the body alone is 16 pixels wide and
   "something is happening here" has to be readable from across the desk. */
.acube.busy{animation:pulse 1.1s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:2px 2px 0 rgba(0,0,0,.3)}50%{box-shadow:2px 2px 0 rgba(224,160,32,.9)}}
/* What it is doing, on the agent rather than in a panel somebody has to open. */
.acube .doing{font-size:9px;color:#7a5200;background:#f7e9c9;border:1px solid #d8bd7a;padding:0 3px}
/* How many steps this one instance holds in the document it is standing on. */
.acube .mult{font-size:9px;color:var(--dim);font-family:var(--mono)}
/* An empty chip is still a bordered box with padding, which drew a small dash
   after every idle agent's name. Nothing to say, nothing on screen. */
.acube .doing:empty,.acube .mult:empty{display:none}
/* Two instances of one agent: the second grows out of the first, and when its
   work is gone it walks back into it. Neither is a fade -- an object that
   appears by fading in did not come from anywhere. */
@keyframes split{0%{transform:scale(.35)}55%{transform:scale(1.18)}100%{transform:scale(1)}}
.acube.splitting{animation:split .42s steps(7,end);z-index:40}
.acube.merging{z-index:40;transition:transform .42s steps(11),opacity .42s steps(4);opacity:0}
/* Walking between places: whole pixels, never a glide. */
.acube.moving{transition:transform .45s steps(12)}

/* ---- the chrome, quieted -------------------------------------------------
   Overrides on top of the shared bar, not edits to it: vocabulary.ts styles
   every surface in this repository and the desk does not get to decide how the
   explorer looks.

   The bar carried nine controls at equal weight above the thing they act on,
   and none of them is what a visitor came to do. What is left is what changes
   what you are looking at -- the scope -- and everything that *makes* something
   is behind one plus sign. */
.menubar{padding:4px 12px;gap:10px;font-size:11px}
.menubar .sim{font-size:10px}
/* When this file was generated. The one mark on the page that answers "am I
   looking at a cached copy", which is otherwise a network-tab question. */
.menubar .build{margin-left:9px;padding:1px 7px;border:1px solid var(--line);border-radius:999px;
  background:var(--face);color:var(--dim);font-size:10px;cursor:help}
.menubar #counts{color:var(--dim)}
.menubar .right{font-size:10px;opacity:.55}
.menubar button.quiet{border-color:#b8b3a8;box-shadow:none;background:transparent;color:#4a4e53}
.menubar button.quiet:hover{background:var(--face)}
.make{position:relative;display:inline-flex}
.make>button{font-weight:700;padding:1px 8px;line-height:1.35}
.makemenu{position:absolute;top:calc(100% + 5px);left:0;z-index:500;display:flex;flex-direction:column;
  min-width:150px;background:var(--face);border:1px solid var(--line);border-radius:var(--r-sm);
  box-shadow:var(--sh-2);padding:4px}
.makemenu[hidden]{display:none}
.makemenu button{border:0;box-shadow:none;background:transparent;text-align:left;padding:4px 8px}
.makemenu button:hover{background:#2f6fb5;color:#fff}

/* ---- focus --------------------------------------------------------------
   Selecting a flow should make it the thing you are looking at. Everything else
   steps back rather than disappearing: a desk where the unselected work vanished
   would be a desk that had answered a question nobody asked. */
.deskbg.focused .docnode{opacity:.42;filter:saturate(.55)}
.deskbg.focused .docnode.sel{opacity:1;filter:none;box-shadow:5px 5px 0 rgba(0,0,0,.4)}
.deskbg.focused .wires g{opacity:.28}
.deskbg.focused .wires g.inflow{opacity:1}
@media (prefers-reduced-motion: no-preference){
  .docnode{transition:opacity .18s linear,filter .18s linear}
}

/* The wire swatches in the key, drawn with the same rules as the wires. */
.key .wkey{flex:1 1 100%}
.key li.wk{align-items:center;gap:7px;padding:2px 0;line-height:1.35}
.key li.wk svg{flex:0 0 auto}
.key li.wk b{font-weight:700}

/* ---- the wires -----------------------------------------------------------
   The flows of information, drawn.

   Below the cubes and above the documents, and pointer-events:none on the
   layer with stroke on the hit paths only: a wire has to be clickable without
   the whole surface becoming a click target, or dragging a document stops
   working the moment a wire crosses it.

   Four states, four different marks, and the differences are deliberately not
   only colour. The unknown state is dashed *and* thin *and* grey, because the one thing
   this picture must never do is let "nobody recorded this" read as "this went
   fine" -- to a colourblind reader, at a glance, or in a screenshot. */
/* Below the chips, not above them.
   The wires used to paint at z-index 30 and the agent chips at 20, so every line
   crossed the names it connects — a circuit drawn on top of its own labels. A
   wire passing behind a chip is how every diagram since Interface Builder has
   done it, and it is the difference between a graph and a scribble. */
.wires{position:absolute;inset:0;pointer-events:none;z-index:10;overflow:visible}
.wires path.w{fill:none;stroke-linecap:round}
.wires path.hit{fill:none;stroke:transparent;stroke-width:12;pointer-events:stroke;cursor:pointer}
.wires path.w.carried{stroke:#2f6fb5;stroke-width:2}
.wires path.w.ignored{stroke:#b5651d;stroke-width:2.5;stroke-dasharray:1 5}
.wires path.w.blocked{stroke:#a52a2a;stroke-width:2.5}
/* Held, not failed. Its own mark: the packet arrived and is addressable, and the
   verdict is pending. Amber and dashed rather than red, because red is a result
   and this is the absence of one. */
.wires path.w.open{stroke:#c08a1e;stroke-width:2;stroke-dasharray:7 4}
.wires path.w.unknown{stroke:#8d8d8d;stroke-width:1.25;stroke-dasharray:5 5}
.wires g.sel path.w{stroke-width:4}
.wires g.sel path.w.unknown{stroke-width:2.5}
/* The packet. A real thing on a real wire -- clicking it opens what moved. */
/* The packet is the hero: the only thing on this surface that moves, and the
   brightest mark on it. Everything else holds still so that motion means one
   thing -- information travelling. */
.wires circle.pkt{r:4.5;pointer-events:none;stroke:#fff;stroke-width:1.25;
  filter:drop-shadow(0 0 3px rgba(0,0,0,.35))}
.wires circle.pkt.carried{fill:#2f6fb5}
.wires circle.pkt.ignored{fill:#b5651d}
.wires circle.pkt.blocked{fill:#a52a2a}
.wires circle.pkt.open{fill:#c08a1e}
/* No packet is drawn on an unknown wire: there is nothing to draw. */
.wirekey{font:10px var(--mono);fill:#3b3f44}

/* ---- the inspector -------------------------------------------------------
   One panel, bound to the selection, with two positions. */
.insp .sw{display:flex;gap:5px;margin:6px 0 10px}
.insp .sw button{flex:1 1 0;font-size:10px;letter-spacing:.04em}
.insp .sw button[aria-selected="true"]{background:var(--accent-soft);border-color:#B9D2EC;
  color:#1B4F86;font-weight:650}
.insp .fld{display:grid;grid-template-columns:96px 1fr;gap:3px 8px;font-size:11px;margin:0 0 2px;
  align-items:start}
.insp .fld .k{color:var(--dim);text-transform:lowercase}
.insp .fld .v{color:#26292d;word-break:break-word}
.insp .fld .v code{font-family:var(--mono);font-size:10px}
/* An address, not a label. It is a link because you are meant to open it. */
.insp .at{display:block;font-family:var(--mono);font-size:10px;color:#2f6fb5;text-decoration:underline;
  margin-top:1px;cursor:pointer;background:none;border:0;box-shadow:none;padding:0;text-align:left}
.insp .fnd{border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px;margin-top:10px;
  background:#FAFAF8}
.insp .fnd .vd{font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
.insp .fnd.ok .vd{color:#2c6e2f}
.insp .fnd.problem .vd{color:#a52a2a}
/* Unknown is drawn as its own thing rather than as a pale version of one of the
   others, because it is not a weaker verdict -- it is the refusal to give one. */
.insp .fnd.ok{background:#F4F9F5;border-color:#D6E7DA}
.insp .fnd.problem{background:#FCF3F1;border-color:#EFD8D3}
/* Unknown keeps its hatch. It is drawn as its own thing rather than as a pale
   version of a verdict, because it is not a weaker verdict — it is the refusal
   to give one, and a reader must not be able to mistake the two at a glance. */
.insp .fnd.unknown{background:repeating-linear-gradient(45deg,#F4F3F0,#F4F3F0 6px,#EAE8E3 6px,#EAE8E3 12px);
  border-color:var(--line-2)}
.insp .fnd.unknown .vd{color:#6b6b6b}
.insp .fnd .sy{margin:4px 0 0;font-size:12px;line-height:1.45}
.insp .fnd .ct{margin-top:6px;font-size:10px;color:var(--dim)}
.insp .bytes{font-family:var(--mono);font-size:10.5px;line-height:1.6;background:#14171A;color:#D7DDE3;
  border-radius:var(--r-sm);padding:10px 11px;margin-top:8px;max-height:230px;overflow:auto;
  white-space:pre-wrap;word-break:break-word}

.shelf{position:absolute;left:0;top:0;bottom:0;width:158px;padding:30px 10px 10px;
  background:rgba(255,255,255,.5);border-right:1px solid var(--line)}
.shelf h3{position:absolute;top:11px;left:12px;margin:0;font-size:10px;letter-spacing:.08em;
  font-weight:650;text-transform:uppercase;color:var(--faint)}

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
/* A control, not a 1991 bevel. The inset highlight-and-shadow pair was drawing
   a plastic button at 11px, where the two bevels together ate most of the label's
   breathing room and nothing about it said "press me" that the shape did not. */
button{font:inherit;font-size:11.5px;font-weight:500;padding:4px 11px;color:var(--ink);
  background:var(--face);border:1px solid var(--line-2);border-radius:var(--r-sm);
  box-shadow:0 1px 1px rgba(16,24,40,.04);cursor:pointer;
  transition:background .12s linear,border-color .12s linear}
button:hover{background:#F7F7F5;border-color:#BFBEB9}
button:active{background:#EFEEEB;box-shadow:inset 0 1px 2px rgba(16,24,40,.08)}
button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
button[disabled]{opacity:.45;cursor:default}
.steps{list-style:none;margin:6px 0 0;padding:0}
.steps li{display:flex;gap:5px;align-items:baseline;padding:1px 0;font-size:11px}
.note{margin-top:9px;padding:8px 10px;border:1px solid var(--line);border-radius:var(--r-sm);
  background:#FAFAF8;font-size:11.5px;line-height:1.5}
.note.warn{border-left:3px solid #D4900F;background:#FDF8EF}
.note.alert{border-left:3px solid #B23A2E;background:#FCF3F1;color:#7D2419}

/* Tabs: state and trace answer different questions about the same document. */
.tabs{display:flex;gap:5px;margin:9px 0 0}
.tabs button{font-size:11px;padding:3px 10px}
.tabs button[aria-selected="true"]{background:var(--accent-soft);border-color:#B9D2EC;
  color:#1B4F86;font-weight:600}
.tr{margin-top:8px}
.tr .st{border-top:1px solid var(--line);padding:7px 0}
.tr .hd{display:flex;gap:5px;align-items:baseline}
.tr .res{margin:5px 0 0 16px;padding:6px 8px;background:#FAFAF8;border:1px solid var(--line);
  border-radius:var(--r-sm);white-space:pre-wrap;font-size:11px;line-height:1.5;
  max-height:104px;overflow:auto}
.tr .att{margin:3px 0 0 16px;font-size:10px;color:var(--dim);font-family:var(--mono)}
.tr .flag{margin:4px 0 0 16px;font-size:10px;color:#7d2419}

/* The living documents. The dot is the whole point of the panel: something is
   writing to this one right now and nobody asked it to. */
.docs{list-style:none;margin:0;padding:0;font-size:11px}
.docs li{display:flex;align-items:center;gap:7px;padding:4px 0;border-top:1px solid var(--line)}
.docs li:first-child{border-top:0}
.docs .k{font-family:var(--mono);font-size:9px;color:var(--dim);flex:0 0 76px}
.docs .t{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.docs .dot{width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:var(--line-2)}
.docs li.live .dot{background:#D4900F;animation:pulse 1.1s ease-in-out infinite}
.docs .rw{font-family:var(--mono);font-size:9px;color:var(--dim);flex:0 0 auto}

/* The memory drawer.
   It used to be 150px of hatched basement across the whole width, carrying a red
   NOT BUILT badge — the loudest region on the screen, for the one pillar that
   does not exist yet. Honest, and the wrong amount of room: a thing that has not
   been built should not out-shout the things that have.
   Now a strip. The hatch stays, at a fraction of its old contrast, because the
   *reason* it was hatched is still true. */
.holes-chip{font:inherit;font-size:11px;padding:3px 9px;border:1px solid #E4E3DF;border-radius:999px;
  background:#FDF8EF;color:#8A5A0A;cursor:pointer}
.holes-chip:hover{border-color:#CFCEC9}
/* Amber, not red: an unanswered question is not a failure. And it is the one
   warm signal on a bar where nothing else is coloured. */
.holes{position:fixed;left:0;bottom:124px;right:318px;max-height:206px;overflow:auto;
  background:#fff;border-top:1px solid #E4E3DF;box-shadow:0 -4px 10px rgba(16,24,40,.07);
  padding:12px 15px;z-index:6}
.holes h3{margin:0 0 9px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#646B73}
.holes .hole{padding:9px 11px;border:1px solid #E4E3DF;border-radius:5px;margin-bottom:7px;background:#FDF8EF}
.holes .q{font-size:12.5px;font-weight:600;margin-bottom:3px}
.holes .w{font-size:11.5px;color:#646B73;line-height:1.5}
.holes .sc{font-size:11px;color:#949BA3;margin-top:4px}
.drawer{position:fixed;left:0;bottom:0;right:318px;height:124px;
  border-top:1px solid var(--line-2);background:#EFEEEA;
  background-image:repeating-linear-gradient(45deg,rgba(0,0,0,.022) 0 6px,transparent 6px 12px);
  padding:26px 14px 12px;overflow-x:auto;display:flex;gap:10px;align-items:flex-start}
.drawer h3{position:absolute;top:8px;left:14px;margin:0;font-size:10px;letter-spacing:.08em;
  font-weight:650;text-transform:uppercase;color:var(--faint)}
/* Beside the title, not opposite it: the right edge is where the fixed rail
   lands, and the one marking that must never be hidden was hidden there. */
/* Still says it, and no longer shouts it. The claim is unchanged — nothing here
   is built — but a red box in the loudest weight on the page was giving the one
   unbuilt pillar more presence than the four built ones. */
.drawer .stamp{position:absolute;top:8px;left:78px;font-size:10px;color:#8A5A0A;font-weight:600;
  letter-spacing:.04em;text-transform:uppercase;background:#FDF4E6;border:1px solid #EBD9B8;
  border-radius:999px;padding:1px 8px}
.card{flex:0 0 214px;background:var(--paper);border:1px dashed #D8C6A4;border-radius:var(--r-sm);
  padding:8px 10px;font-size:10.5px;line-height:1.45;box-shadow:var(--sh-1)}
.card .lv{display:flex;align-items:center;gap:5px;font-weight:600;margin-bottom:4px}
.card .bd{white-space:pre-wrap;max-height:56px;overflow:hidden;color:var(--dim)}
.card .from{margin-top:4px;color:var(--dim);font-family:var(--mono);font-size:9px}
.levels{display:flex;gap:10px;font-size:10px;margin-left:auto;align-items:flex-start;flex:0 0 auto}
.levels div{display:flex;align-items:center;gap:4px}
select{font:inherit;font-size:11.5px;padding:3px 6px;background:var(--face);
  border:1px solid var(--line-2);border-radius:var(--r-sm);color:var(--ink)}
select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
/* The page must say it is not the product, and it must not be the loudest thing
   on the page. A filled dark-red block in the top-left corner was drawing more
   attention than any evidence on the desk; a pill in the same family says the
   same sentence without winning. */
.sim{background:#FCF3F1;color:#8E332A;border:1px solid #EFD8D3;border-radius:999px;
  padding:2px 10px;font-size:10px;font-weight:600;letter-spacing:.03em;text-transform:uppercase}
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:300;
  background:var(--ink);color:#F5F5F3;border:1px solid var(--ink);border-radius:999px;
  box-shadow:var(--sh-2);padding:9px 17px;font-size:12px;display:none;max-width:min(620px,90vw)}

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
.menu .mc.spends{background:#f6e6c8;color:#7a4a00;border:1px solid #D4900F}
.menu .mc.free{background:#e6efe6;color:#2c6b2c;border:1px solid #9cc09c}
.menu .mw{font-size:10px;color:var(--dim);margin-top:3px;line-height:1.4}
/* A model's suggestion is marked as one. It sits beside proposals that are not. */
.menu .mi.model{border-left:3px solid #6b4fa8;padding-left:6px}
.menu .mi.model .ml::after{content:" · proposed by a model";font-size:9px;color:#6b4fa8}

/* Ask. The selection is the noun, so the field only needs the verb. */
.ask{margin-top:10px;border-top:1px solid #ded9d0;padding-top:8px}
.ask input{font:inherit;font-size:11.5px;width:100%;padding:5px 8px;border:1px solid var(--line-2);
  border-radius:var(--r-sm);
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
/**
 * The client.
 *
 * Concatenated rather than interpolated, and the body below stays a `String.raw`
 * template: in a plain template literal every unrecognised escape collapses, so
 * the `\s` in the markdown-stripper's regex would ship as a literal "s" and the
 * rule would quietly match the wrong thing. The rules the creatures are drawn
 * from ([creatures.ts](creatures.ts)) go inside the closure, ahead of the code
 * that calls them.
 */
const DESK_JS = "(() => {\n" + CREATURES_JS + BUS_JS + INSPECTOR_JS + String.raw`
  const S = window.__DESK__;
  // Published so the mascot builds its body from the same string rather than
  // from a copy of it. One sprite, one definition, one species -- the copy is
  // how the desk ended up with a character standing next to a row of chips.
  window.__CRT__ = CREATURE_BODY;
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
    // Which instance is in the hand, not just which agent: an agent working in
    // two flows is two creatures, and taking one off a document must remove that
    // document's step rather than whichever one the layout happened to name.
    const key = el.dataset.key || '';
    const at = key.indexOf('@');
    drag = {
      el, kind, id, sr, moved: false,
      dx: ev.clientX - r.left, dy: ev.clientY - r.top,
      x0: ev.clientX, y0: ev.clientY,
      flow: kind === 'cube' && at > 0 ? key.slice(at + 1) : null,
    };
    el.classList.add('dragging');
    el.setPointerCapture(ev.pointerId);
    if (kind === 'cube') { el.classList.remove('instack'); surface.appendChild(el); el.style.position = 'absolute'; }
    ev.preventDefault();
  };

  const moveDrag = (ev) => {
    if (!drag) return;
    // A hand that presses a mouse button moves a pixel or two doing it. Treating
    // the first of those as a drag meant clicking an agent that was already on a
    // document dropped it there again -- a real write, a real step appended, from
    // what the person performed as a click. Four pixels is the difference between
    // a gesture and a slip. Eight of them, because a finger on a trackpad slides
    // further than a mouse does and the write at the other end of this is real.
    // Found by clicking, not by reading.
    if (!drag.moved) {
      if (Math.abs(ev.clientX - drag.x0) + Math.abs(ev.clientY - drag.y0) < 8) return;
      drag.moved = true;
    }
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
    const body = d.el.querySelector && d.el.querySelector('.crt');
    if (body) {
      // It takes the impact. An object that arrives weightless was never moved.
      body.classList.add('landed');
      setTimeout(() => body.classList.remove('landed'), 300);
      wake(body);
    }
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
      const cameFrom = d.flow || was.onDoc;
      layout.cubes[d.id] = { x, y, pinned: true, onDoc: null, slot: was.slot };
      // A creature the person placed keeps that spot exactly: no drift on top of
      // a chosen position.
      drift[d.id] = { dx: 0, dy: 0 };
      // Believed before the server answers, or the instance snaps back into the
      // stack for the one frame between letting go and the step being removed.
      releasing = cameFrom ? { agent: d.id, flowId: cameFrom } : null;
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
    /**
     * Dropping the system agent on something means *inspect it*, not *run in it*.
     *
     * This is [doc/15](../../doc/15-generated-interaction.md) phase 5, which was
     * specified and never built: dragging one agent onto another thing declares a
     * relationship rather than issuing a command, and the desk writes the
     * relationship down. Here the relationship is "INSPECTOR is reading this
     * flow", and what gets written is the finding and the address it cites.
     *
     * It spends nothing and appends no step. An inspector that changed what it
     * inspects would not be an inspector, and giving it a step in the flow it is
     * auditing is exactly that.
     */
    if (d.id === 'INSPECTOR') {
      delete layout.cubes[d.id].onDoc;
      layout.cubes[d.id] = { x, y, pinned: true };
      saveLayout();
      inspectMode = 'agent';
      select('doc', flowId);
      render();
      say('INSPECTOR is reading "' + (S.docs.find((x) => x.id === flowId) || {}).title +
          '". It reads; it does not run, write or publish. Nothing was spent.', 5200);
      return;
    }
    // Picked up and put back down on the same document. That is not an
    // instruction, it is a change of mind -- and appending a second step for the
    // same agent because a hand wobbled over the document it was already on is
    // the worst kind of write: silent, real, and indistinguishable from a click.
    if (flowId === d.flow) { select('cube', d.id); render(); return; }
    const occupied = Object.values(layout.cubes).filter((c) => c.onDoc === flowId);
    const slot = occupied.length ? Math.max.apply(null, occupied.map((c) => c.slot)) + 1 : 0;
    layout.cubes[d.id] = { x, y, pinned: true, onDoc: flowId, slot };
    // Dropping an instance of an agent that already works elsewhere does not
    // move it: the step it already had is still there, so it becomes two. The
    // one in the hand lands here and the other grows back where it was.
    pending = { agent: d.id, flowId: flowId };
    releasing = null;
    saveLayout(); render();
    try {
      const res = await post('/assign', { scopeId: S.scopeId, flowId, agent: d.id });
      say('Step ' + res.stepIndex + ' added: ' + d.id + ' on "' + res.flowTitle + '". Not run yet.', 4200);
      await refresh();
    } catch (e) {
      pending = null; render();
      say('Could not add the step: ' + e.message, 5000);
    }
  };

  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);


  // ---- the wires ----------------------------------------------------------
  /**
   * The flows of information, drawn on the surface.
   *
   * ## Why this exists
   *
   * A flow used to be a list of steps in a panel. You could read that a step ran
   * and that the next one ran after it; you could not watch anything *move*, and
   * "the flow of information" was a phrase rather than a picture. This draws the
   * graph [bus.ts](bus.ts) derives: agents are the nodes, handoffs are wires, and
   * what travelled is a thing you can click.
   *
   * ## The rule it is built to keep
   *
   * > A wire carries a real artifact or it carries nothing.
   *
   * A hop with no recorded observation is drawn *unknown* -- thin, grey, dashed,
   * and with **no packet on it**, because there is nothing to draw. It is not
   * green. Every tidy diagram of a pipeline ever made says an arrow that was
   * drawn is an arrow that worked, and that is the assumption this whole surface
   * exists to refuse.
   *
   * ## Geometry
   *
   * Positions come from the live DOM rather than from the layout, because a cube
   * can be mid-walk, mid-drag, or inside a document's stack -- three different
   * layout modes -- and only the browser knows where it actually is. Recomputed
   * on every render and on scroll, which is cheap: the whole surface is a few
   * dozen wires.
   */
  let bus = { nodes: [], wires: [], load: {} };
  const wireById = (id) => bus.wires.find((w) => w.id === id);

  const recomputeBus = () => {
    bus = busOf(S.docs.map((d) => ({ id: d.id, title: d.title, trace: d.trace || { steps: [] } })));
  };

  /** Where a cube for this agent, in this flow, actually is right now. */
  const cubeBox = (agent, flowId) => {
    const el = document.querySelector(
      '.acube:not(.merging)[data-key="' + CSS.escape(agent + '@' + flowId) + '"]',
    ) || document.querySelector('.acube:not(.merging)[data-id="' + CSS.escape(agent) + '"]');
    return el ? el.getBoundingClientRect() : null;
  };

  function renderWires() {
    const svg = document.getElementById('wires');
    if (!svg) return;
    const sr = surface.getBoundingClientRect();
    const NS = 'http://www.w3.org/2000/svg';
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Several hops between the same pair inside one flow are one wire on screen.
    // Five queued handoffs between two agents is a busy wire, not five wires --
    // the same rule the creatures follow for an agent with a queue.
    const drawn = new Map();
    for (const w of bus.wires) {
      const k = w.flowId + '|' + w.from + '|' + w.to;
      const prev = drawn.get(k);
      // The worst state wins the drawing. A pair that carried once and dropped
      // once has a problem, and averaging it away is how a picture launders one.
      const rank = { carried: 0, unknown: 1, blocked: 2, ignored: 3 };
      if (!prev || rank[w.state] > rank[prev.state]) drawn.set(k, w);
    }

    const frag = document.createDocumentFragment();
    for (const w of drawn.values()) {
      const a = cubeBox(w.from, w.flowId), b = cubeBox(w.to, w.flowId);
      if (!a || !b) continue;
      const x1 = a.left + a.width / 2 - sr.left, y1 = a.top + a.height / 2 - sr.top;
      const x2 = b.left + b.width / 2 - sr.left, y2 = b.top + b.height / 2 - sr.top;

      let d;
      if (Math.abs(x1 - x2) < 1 && Math.abs(y1 - y2) < 1) {
        /**
         * An agent handing to itself. Drawn as a loop, not skipped.
         *
         * The desk draws one cube per agent per flow, so consecutive steps by
         * the same agent land on the same cube and the hop between them has zero
         * length. Skipping those, which is what this did, made the memory lab's
         * entire finding invisible: its flagged handoff is Indexer to Indexer,
         * the one the website's own video is about, and there was no mark for it
         * anywhere on the surface.
         *
         * A hop is a hop. The agent that carried nothing forward carried nothing
         * forward whether or not the next step went to somebody else.
         */
        const r = a.height / 2 + 7;
        const top = y1 - r;
        d = 'M' + (x1 - 9) + ' ' + top +
            ' C' + (x1 - 22) + ' ' + (top - 20) + ' ' + (x1 + 22) + ' ' + (top - 20) +
            ' ' + (x1 + 9) + ' ' + top;
      } else {
        // A shallow arc rather than a straight line: two wires between the same
        // pair of columns overlap exactly when both are straight, and the second
        // one then does not exist as far as a reader is concerned.
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.max(1, Math.hypot(dx, dy));
        const bow = Math.min(26, len * 0.22);
        const cx = mx - (dy / len) * bow, cy = my + (dx / len) * bow;
        d = 'M' + x1 + ' ' + y1 + ' Q' + cx + ' ' + cy + ' ' + x2 + ' ' + y2;
      }

      const g = document.createElementNS(NS, 'g');
      g.dataset.flow = w.flowId;
      if (selected && selected.kind === 'wire' && selected.id === w.id) g.setAttribute('class', 'sel');

      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'w ' + w.state);
      path.setAttribute('d', d);
      const pid = 'wp-' + w.id.replace(/[^A-Za-z0-9_-]/g, '_');
      path.setAttribute('id', pid);
      g.appendChild(path);

      const hit = document.createElementNS(NS, 'path');
      hit.setAttribute('class', 'hit');
      hit.setAttribute('d', d);
      hit.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); select('wire', w.id); });
      g.appendChild(hit);

      // The packet. Only where something was actually recorded, and only when
      // the reader has not asked for stillness.
      if (w.packet && !reduced) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('class', 'pkt ' + w.state);
        c.setAttribute('r', '4.5');
        const m = document.createElementNS(NS, 'animateMotion');
        m.setAttribute('dur', (2.4 + (w.fromIndex % 3) * 0.35) + 's');
        m.setAttribute('repeatCount', 'indefinite');
        // An ignored hop's packet stops where it landed and stays there: it did
        // arrive, and nothing downstream used it. An open one does the same --
        // it arrived, and nothing has happened to it since. A dot that keeps
        // sailing through either would be drawing a delivery that was not made.
        if (w.state === 'ignored' || w.state === 'open') {
          m.setAttribute('keyPoints', '0;0.82;0.82');
          m.setAttribute('keyTimes', '0;0.55;1');
          m.setAttribute('calcMode', 'linear');
        }
        const mp = document.createElementNS(NS, 'mpath');
        mp.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#' + pid);
        mp.setAttribute('href', '#' + pid);
        m.appendChild(mp);
        c.appendChild(m);
        g.appendChild(c);
      }
      frag.appendChild(g);
    }
    svg.replaceChildren(frag);
    // The groups were just rebuilt, so whatever was in focus has to be marked
    // again. Without this a poll silently un-focuses the flow somebody is
    // reading -- the same class of bug as the panel that lost its answer every
    // five seconds.
    if (typeof focus === 'function') focus();
  }

  // ---- selection panel ----------------------------------------------------
  /**
   * What the person is looking at.
   *
   * Announced as an event because the mascot used to work this out for itself
   * from pointer events, and it got a different answer than the desk did: an
   * agent standing inside a document was a document to one of them and an agent
   * to the other. Whoever else wants to know now hears it from the surface that
   * decided it.
   */
  /**
   * Bring the selection forward and step everything else back.
   *
   * Not hiding: a desk where unselected work vanished would have answered a
   * question nobody asked. The unselected documents dim and desaturate, their
   * wires go quiet, and the one you picked keeps its full contrast -- which is
   * the only way a six-agent chain crossing a surface with four other chains on
   * it is followable at all.
   */
  const focus = () => {
    const deck = document.querySelector('.deskbg');
    const flowId = selected && (selected.kind === 'doc' ? selected.id
      : selected.kind === 'wire' ? (wireById(selected.id) || {}).flowId : null);
    deck.classList.toggle('focused', !!flowId);
    for (const el of surface.querySelectorAll('.docnode'))
      el.classList.toggle('sel', el.dataset.id === flowId);
    for (const g of document.querySelectorAll('.wires g'))
      g.classList.toggle('inflow', g.dataset.flow === flowId);
  };

  const select = (kind, id) => {
    selected = { kind, id };
    renderPanel();
    focus();
    window.dispatchEvent(new CustomEvent('desk:select', { detail: { kind: kind, id: id } }));
  };

  // Which face of a document is showing. State answers "where is this"; trace
  // answers "what happened" -- two questions, and a panel that answers both at
  // once answers neither.
  let tab = 'state';

  const traceHtml = (doc) => {
    const t = doc.trace || { steps: [], movement: '', detail: '', ignoredCount: 0, movementTone: 'muted' };
    return '<div class="' + (t.movementTone === 'ok' ? 'ok' : t.movementTone === 'warn' ? 'warn' : 'dim') + '">' +
      escape_(t.movement) + '</div><div class="dim">' + escape_(t.detail) + '</div>' +
      // The banner names the instrument that spoke, like the per-step flag does.
      // It used to assert distinctive-word overlap whatever had been measured,
      // which reads as nonsense over a flow whose steps produced numbers or
      // source ranges -- and a summary that misdescribes its own evidence is
      // worse than no summary, because the detail below it then looks wrong.
      (t.ignoredCount
        ? '<div class="note alert"><strong>' + t.ignoredCount + ' step(s) used nothing they were given.</strong> ' +
          'Each ran, settled and reported. ' +
          escape_((t.steps.find((s) => s.ignoredInput && s.ignoredInput.note) || {}).ignoredInput?.note
            || 'None carried a distinctive word out of its predecessor.') + '</div>'
        : '') +
      '<div class="tr">' + t.steps.map((s) =>
        '<div class="st"><div class="hd">' +
        '<span class="cube sm" style="--c:' + (S.stateColors[s.state] || '#C9C7C1') + '"></span>' +
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
        (s.series ? '<div style="margin:4px 0 0 16px">' + spark(s.series, 226, 22) + '</div>' : '') +
        // The flag names the instrument that produced it. It used to claim it had
        // counted distinctive tokens whatever had actually been measured, which
        // is a lie the moment a step's output is numbers.
        (s.ignoredInput
          ? '<div class="flag">' + (s.ignoredInput.note
              ? escape_(s.ignoredInput.note)
              : 'carried ' + Math.round(s.ignoredInput.carried * 100) + '% of ' +
                s.ignoredInput.inputTokens + ' distinctive tokens it was handed') + '</div>'
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
            const r = await post('/advance', { flowId: doc.id });
            say(r.reason ? 'Halted — ' + r.reason : 'Advanced.', r.reason ? 8000 : 2500);
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

  // ---- the inspector ------------------------------------------------------
  /**
   * Which position the inspector is in.
   *
   * Position *read* is NeXT's inspector: the object's real fields, and you do the
   * looking. Position *agent* hands the same object to a system agent and shows what it
   * came back with. Sticky across selections on purpose -- somebody who has
   * asked once is usually asking about the next thing too.
   */
  let inspectMode = 'read';

  const setMode = (m) => { inspectMode = m; renderPanel(); };

  /** One field row. The from-address is an address, so it is drawn as something to open. */
  const fieldHtml = (f) =>
    '<div class="fld"><span class="k">' + escape_(f.label) + '</span>' +
    '<span class="v">' + escape_(f.value) +
    (f.from ? '<button class="at" data-open="' + escape_(f.from) + '">' + escape_(f.from) + '</button>' : '') +
    '</span></div>';

  /**
   * A finding, drawn.
   *
   * assertCited runs on the way in and throws on a verdict with no address.
   * That is deliberate: the demo whose entire argument is "a claim needs an
   * address" must not be capable of rendering a claim without one, and a loud
   * failure in the client is the only version of that rule anybody would notice.
   */
  const findingHtml = (f) => {
    assertCited(f);
    return '<div class="fnd ' + f.verdict + '">' +
      '<div class="vd">' + (f.verdict === 'unknown' ? 'unknown' : f.verdict === 'ok' ? 'no problem found' : 'problem') + '</div>' +
      '<p class="sy">' + escape_(f.says) + '</p>' +
      (f.cites.length
        ? '<div class="ct">read: ' + f.cites.map((c) =>
            '<button class="at" data-open="' + escape_(c.at) + '">' + escape_(c.at) + '</button>').join('') + '</div>'
        : '<div class="ct">nothing to read — that is why this is unknown</div>') +
      '<div class="ct">' + escape_(f.cost) + '</div>' +
      '</div>';
  };

  /**
   * The switch, and the sentence under it.
   *
   * The sentence is not decoration. A person who presses "ask an agent" without
   * knowing that the answer is a claim rather than a lookup will read it as a
   * lookup, and the whole point is the difference between the two.
   */
  const switchHtml = () =>
    '<div class="sw"><button id="m-read"' + (inspectMode === 'read' ? ' aria-selected="true"' : '') + '>Read it</button>' +
    '<button id="m-agent"' + (inspectMode === 'agent' ? ' aria-selected="true"' : '') + '>Ask an agent</button></div>';

  const wireSwitch = (p) => {
    const r = p.querySelector('#m-read'), a = p.querySelector('#m-agent');
    if (r) r.onclick = () => setMode('read');
    if (a) a.onclick = () => setMode('agent');
    for (const b of p.querySelectorAll('button.at'))
      b.onclick = () => openArtifact(b.dataset.open);
  };

  /**
   * Open the thing a citation points at.
   *
   * In the published demo there is no filesystem, so this shows the address and
   * what is known about it rather than pretending to have fetched bytes. What it
   * does **not** do is fabricate a file: an inspector that renders plausible
   * contents for a path it cannot read would be the exact lie the citation
   * exists to prevent, and it would be undetectable.
   */
  const openArtifact = (at) => {
    const p = document.getElementById('panel');
    const known = artifactNote(at);
    const box = p.querySelector('.opened');
    const html = '<div class="bytes">' + escape_(at) + '\n\n' + escape_(known) + '</div>';
    if (box) box.innerHTML = html;
    else p.querySelector('.win-body').insertAdjacentHTML('beforeend', '<div class="opened">' + html + '</div>');
  };

  /**
   * What the desk honestly knows about an address.
   *
   * Every string here names a real path in the repository. The check in
   * scripts/check-demo-provenance.py resolves each one and fails the build if
   * it has moved -- which is the difference between a citation and a decoration.
   */
  const artifactNote = (at) => {
    if (/h0\.json$/.test(at))
      return 'projects/hemo-verified/gates/reports/h0.json\n' +
        'The attested H0 run: 98 rows, composite AUC 0.9056331246990852, the content hash of\n' +
        'all seven oracles, and the stack that produced them (python 3.13.12, numpy 2.5.2,\n' +
        'scipy 1.18.1, x86_64).\n\n' +
        'No bytes are shown here because this page has no filesystem. Open the file in the\n' +
        'repository — it is the same artifact the numbers above were read out of, and\n' +
        'test/hemo-demo.test.ts fails the build if they stop agreeing.';
    if (/thresholds\.yaml$/.test(at))
      return 'projects/hemo-verified/oracles/thresholds.yaml\n' +
        'The seven oracles and their thresholds, declared before any row was scored.\n' +
        'Written by an agent that never sees the result — which is the only structural\n' +
        'defence against a threshold moving to meet an outcome.';
    if (/reproduce\.py$/.test(at))
      return 'projects/hemo-verified/eval/reproduce.py\n' +
        'Same environment: bit-identical or fail. Different environment: classified rather\n' +
        'than judged, because a number produced somewhere else has not disagreed with\n' +
        'anything yet.';
    if (/gate\.report|report_A/.test(at))
      return 'projects/coclea-sr/gates/reports/\n' +
        '135 gate checks, each a JSON record of what was measured, what was declared before\n' +
        'the run, and which one the verdict came from. They ran green on a GitHub runner in\n' +
        '23m27s — the first time outside the author’s machine.';
    if (/^flow:/.test(at)) {
      const m = /^flow:(.*)#step-(\d+)$/.exec(at);
      const doc = m ? S.docs.find((d) => d.id === m[1]) : null;
      const st = doc ? (doc.trace.steps || []).find((x) => String(x.index) === m[2]) : null;
      if (!st) return 'The flow store has no step at this address.';
      // The record itself, not a description of it. This is the line the verdict
      // above was read out of, and it is here so the reader can disagree with it.
      return 'flow ' + doc.title + ' · step ' + st.index + '\n' +
        'agent: ' + (st.agent || 'none') + '\n' +
        'state: ' + st.state + '\n' +
        (st.attempts || []).map((a) => 'attempt ' + a.n + ' · ' + (a.runId || 'no run') + ' · ' +
          (a.digest ? a.digest + ' ' + (a.source || '') : 'no observation') +
          (a.error ? ' · ' + a.error : '')).join('\n') +
        (st.result ? '\n\n' + st.result : '');
    }
    if (/^agents\//.test(at))
      return 'An agent is a markdown file. This is the declaration: what it is for, which\n' +
        'tools it may use, and which agents it may delegate to. Nothing else defines it.';
    return 'This address is recorded on the hop above. This page has no filesystem, so the\n' +
      'address is shown rather than the bytes — and no contents are invented for it.';
  };

  const renderPanel = () => {
    const p = document.getElementById('panel');
    /**
     * Nothing selected is not nothing to say.
     *
     * The panel used to disappear, which left a gap in the rail and taught a
     * visitor nothing. It now holds the key — the same one that used to be a
     * separate permanent window — so the vocabulary is read once, in the place
     * the answers will appear, and is replaced by the first thing clicked.
     */
    if (!selected) {
      p.querySelector('h2').textContent = 'Inspector';
      p.querySelector('.win-body').innerHTML = (S.key || '') +
        '<div class="note">Click any box, any line, or the dot travelling one. ' +
        'Whatever you pick, this panel becomes about it.</div>';
      return;
    }
    p.classList.add('insp');
    /**
     * A wire, which is a thing you can select now.
     *
     * Before this the desk had no noun for "the handoff between these two
     * agents". You could select an agent or a document, so the only questions
     * you could ask were about a box -- and the interesting failures in this
     * repository all live between two boxes.
     */
    if (selected.kind === 'wire') {
      const w = wireById(selected.id);
      if (!w) { selected = null; renderPanel(); return; }
      const i = inspectWire(w);
      p.querySelector('h2').textContent = 'Inspector';
      p.querySelector('.win-body').innerHTML =
        '<h4>' + escape_(i.title) + '</h4>' +
        '<div class="dim">' + escape_(i.kind) + ' · ' + escape_(w.state) + '</div>' +
        switchHtml() +
        (inspectMode === 'read'
          ? i.fields.map(fieldHtml).join('')
          : findingHtml(inspectWireWithAgent(w))) +
        (w.state === 'unknown'
          ? '<div class="note">Drawn thin, grey and dashed, and carrying no packet. Nothing was ' +
            'recorded about this hop at all, which is not the same picture as a hop that worked.</div>'
          : w.state === 'open'
            // Two different absences, and the note has to say which one. It used
            // to claim "carrying no packet" for both, which is false here: the
            // packet arrived and can be opened. It is the verdict that is missing.
            ? '<div class="note">The packet arrived and you can open it. What is missing is the ' +
              'verdict — the step has not reached one, and that is not the same as reaching a ' +
              'negative one.</div>'
            : '');
      wireSwitch(p);
      return;
    }
    if (selected.kind === 'doc') {
      const doc = S.docs.find((d) => d.id === selected.id);
      if (!doc) { selected = null; renderPanel(); return; }
      const next = doc.steps.find((s) => s.state === 'pending' || s.state === 'running');
      if (tab === 'trace' && inspectMode === 'read') {
        p.querySelector('h2').textContent = 'Inspector';
        p.querySelector('.win-body').innerHTML =
          '<h4>' + escape_(doc.title) + '</h4>' +
          switchHtml() +
          '<div class="tabs"><button id="tab-state">State</button>' +
          '<button id="tab-trace" aria-selected="true">Trace</button></div>' +
          traceHtml(doc);
        p.querySelector('#tab-state').onclick = () => { tab = 'state'; renderPanel(); };
        wireSwitch(p);
        return;
      }
      p.querySelector('h2').textContent = 'Inspector';
      /**
       * The second position, on a whole flow.
       *
       * This is the gesture the redesign is for: you do not read the trace and
       * work it out, you put an agent on it. What makes that worth having rather
       * than a chat box is directly below the sentence -- the address it read.
       */
      if (inspectMode === 'agent') {
        p.querySelector('.win-body').innerHTML =
          '<h4>' + escape_(doc.title) + '</h4>' +
          '<div class="dim">flow · ' + escape_(doc.state) + '</div>' +
          switchHtml() +
          findingHtml(inspectFlowWithAgent(doc.id, doc.title, bus.wires)) +
          '<div class="dim" style="margin-top:8px">' + escape_(busSummary({
            nodes: bus.nodes,
            wires: bus.wires.filter((w) => w.flowId === doc.id),
            load: bus.load,
          })) + '</div>';
        wireSwitch(p);
        return;
      }
      p.querySelector('.win-body').innerHTML =
        '<h4>' + escape_(doc.title) + '</h4>' +
        switchHtml() +
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
        (lastSeries(doc) ? '<div style="margin-top:8px">' +
          spark(lastSeries(doc).series, 250, 30) + '</div>' : '') +
        '<ul class="steps">' + doc.steps.map((s) =>
          '<li><span class="cube sm" style="--c:' + (S.stateColors[s.state] || '#C9C7C1') + '"></span>' +
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
      p.querySelector('#tab-trace').onclick = () => {
        tab = 'trace';
        renderPanel();
        replayHandovers(doc);
      };
      wireSwitch(p);
      wireActions(p, doc);
      wireAsk(p, doc);
      const b = p.querySelector('#adv');
      if (b) {
        const label = b.textContent;
        b.onclick = async () => {
          b.disabled = true; b.textContent = 'Working…';
          try { const r = await post('/advance', { flowId: doc.id }); say(r.reason ? 'Halted — ' + r.reason : 'Step ' + r.outcome + '.', r.reason ? 8000 : 2500); await refresh(); }
          catch (e) { say('Advance failed: ' + e.message, 5000); b.disabled = false; b.textContent = label; }
        };
      }
    } else {
      const a = S.agents.find((x) => x.name === selected.id);
      if (!a) { selected = null; renderPanel(); return; }
      // What this one is doing, and where -- read off the same steps the
      // creatures are drawn from. Before this, clicking an agent told you what
      // it was *for*, which is the description somebody wrote, and said nothing
      // about the work it is in. The picture had the answer and the panel did
      // not.
      const mine = [];
      for (const d of S.docs) {
        const steps = (d.steps || []).filter((s) => s.agent === a.name);
        if (steps.length) mine.push({ doc: d, steps: steps });
      }
      let ran = 0, running = null;
      for (const m of mine) for (const s of m.steps) {
        ran += (s.attempts || []).length;
        if (s.state === 'running') running = { doc: m.doc, step: s };
      }
      p.querySelector('h2').textContent = 'Inspector';
      if (inspectMode === 'agent') {
        p.querySelector('.win-body').innerHTML =
          '<h4>' + escape_(a.name) + '</h4>' +
          '<div class="dim">agent</div>' +
          switchHtml() +
          findingHtml(inspectAgentWithAgent(a, bus.load[a.name]));
        wireSwitch(p);
        return;
      }
      p.querySelector('.win-body').innerHTML =
        '<h4>' + escape_(a.name) + '</h4>' +
        '<div class="dim">' + a.tools.map(escape_).join(' ') + '</div>' +
        switchHtml() +
        '<p style="margin:6px 0 0">' + escape_(a.description) + '</p>' +
        (running
          ? '<div class="note warn">Running <strong>step ' + running.step.index + '</strong> of "' +
            escape_(running.doc.title) + '" right now.</div>'
          : '') +
        (mine.length
          ? '<div class="dim" style="margin-top:8px">' +
            (mine.length === 1 ? 'One document' : mine.length + ' documents') + ' · ' +
            (ran ? ran + ' attempt(s) recorded' : 'never attempted') + '</div>' +
            '<ul class="steps">' + mine.map((m) => m.steps.map((s) =>
              '<li><span class="cube sm" style="--c:' + (S.stateColors[s.state] || '#C9C7C1') + '"></span>' +
              '<span class="dim">' + s.index + '</span> ' + escape_(m.doc.title) +
              (s.result ? '' : ' <span class="dim">— nothing recorded</span>') + '</li>').join('')).join('') +
            '</ul>'
          : '<div class="dim" style="margin-top:8px">Not in any flow. It is waiting on the shelf.</div>') +
        (a.missing ? '<div class="note warn">Declared in a subagents list with no file behind it. A declared name is a claim; a file is a fact.</div>'
                   : '<div class="note">Drag this onto a document to give it a step in that flow. It keeps the steps it already has — an agent in two flows is two of it.</div>');
      wireSwitch(p);
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

  /**
   * A step's numbers, drawn.
   *
   * Deliberately dumb: bars, one per sample, scaled to the largest absolute
   * value in the series, in whole pixels. It is not a plotting library and must
   * not become one -- what it is for is the single question a sentence cannot
   * answer, which is whether the numbers are still there. A stage that says
   * "64 samples returned, nothing clipped" and a stage that returned 64 zeros
   * write the same report.
   *
   * The caption is not decoration. A bar chart normalised to its own maximum
   * looks identical at 1.3 units and at 0.0001, so the peak is printed next to
   * it, and a series that is all zeros says so in words.
   */
  const spark = (xs, w, h) => {
    if (!xs || !xs.length) return '';
    let max = 0;
    for (const v of xs) max = Math.max(max, Math.abs(v));
    const bw = Math.max(1, Math.floor((w - xs.length) / xs.length));
    const dead = max === 0;
    const bars = xs.map((v) => {
      const px = dead ? 1 : Math.max(1, Math.round((Math.abs(v) / max) * h));
      return '<i style="width:' + bw + 'px;height:' + px + 'px"></i>';
    }).join('');
    return '<div class="spark' + (dead ? ' dead' : '') + '" style="height:' + (h + 6) + 'px">' +
      bars + '</div><div class="sparkcap">' + xs.length + ' values · peak ' +
      (dead ? '<b>0.00 — nothing here</b>' : max.toFixed(2)) + '</div>';
  };

  /** The last thing this flow produced numbers for, if anything did. */
  const lastSeries = (doc) => {
    let out = null;
    for (const s of (doc.steps || [])) if (s.series && s.series.length) out = s;
    return out;
  };

  const escape_ = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- the agents, as creatures -------------------------------------------
  /**
   * How many creatures an agent is.
   *
   * One per document it has work in, derived from the steps rather than from the
   * layout. The layout could only ever hold an agent in one place, so an agent
   * with steps in two flows was drawn standing in one of them -- the picture
   * said "it is here", the trace said "it is in both", and the picture was the
   * one people believed. An agent working in two flows is two creatures, and the
   * second grows out of the first where you can watch it happen.
   *
   * The step count is how many steps one instance holds in that document, shown as
   * a multiplier rather than as more bodies: five steps in one flow is one agent
   * with a queue, not five agents.
   */
  const instancesOf = (name) => agentInstances(S.docs, name);
  const doingOf = (name, flowId) => agentDoing(S.docs, name, flowId);
  const cubeKey = (name, flowId) => creatureKey(name, flowId);
  const cubeAt = (key) => document.querySelector('.acube:not(.merging)[data-key="' + CSS.escape(key) + '"]');

  // A drop is believed before the server confirms it, so the creature does not
  // walk to the document and then snap back for one frame while /assign is in
  // flight. Cleared by the refresh that follows.
  let pending = null;
  // The mirror of it: an instance taken off a document is gone from the picture
  // before /unassign answers, and comes back if the server refuses.
  let releasing = null;
  // Where an idle agent has wandered to, kept apart from the layout because the
  // server owns that and would pull the creature back on the next poll. Drift is
  // the creature's own; a position the person chose is the layout's.
  const drift = {};

  const makeCube = (a, key) => {
    const el = document.createElement('div');
    el.className = 'acube' + (a.missing ? ' missing' : '');
    el.dataset.key = key;
    el.dataset.id = a.name;
    const color = a.missing ? S.missingColor : (a.child ? S.subagentColor : S.agentColor);
    el.innerHTML = '<span class="blk crt' + (a.missing ? ' blind' : '') + '" style="--c:' + color + '">' +
      CREATURE_BODY + '</span>' +
      '<span class="n">' + escape_(a.name) + '</span>' +
      '<span class="doing"></span><span class="mult"></span>';
    // Out of phase, or a shelf of creatures blinks in unison and reads as a row
    // of indicator lights rather than as a row of things.
    let h = 0;
    for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 997;
    el.style.setProperty('--bd', (h % 47) / 10 + 's');
    el.addEventListener('pointerdown', (ev) => startDrag(el, 'cube', a.name, ev));
    return el;
  };

  /** Walk a disappearing instance into the one that remains, then drop it. */
  const mergeInto = (el, sib) => {
    const a = el.getBoundingClientRect(), b = sib.getBoundingClientRect();
    el.classList.add('merging');
    // Out of flow first: a merging creature that keeps its slot in the stack
    // makes the whole stack reflow around a thing that is leaving.
    el.style.position = 'fixed';
    el.style.left = a.left + 'px'; el.style.top = a.top + 'px'; el.style.margin = '0';
    requestAnimationFrame(() => {
      el.style.transform = 'translate(' + (b.left - a.left) + 'px,' + (b.top - a.top) + 'px)';
    });
    setTimeout(() => el.remove(), 460);
  };

  // ---- the eyes -----------------------------------------------------------
  /**
   * Every creature looks at the pointer.
   *
   * Six lines, and it is the single largest change in how alive the desk feels:
   * a room of things that track you is a room of things, and a row of sprites
   * staring through you is a row of icons. The offset is rounded to a whole grid
   * unit, so the pupil moves in pixels like everything else here rather than
   * sliding a fraction of one.
   */
  let look = null, aiming = false, lastLook = 0;

  const aim = () => {
    aiming = false;
    if (!look) return;
    for (const b of document.querySelectorAll('.crt')) {
      const r = b.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > window.innerHeight) continue;
      const dx = look.x - (r.left + r.width / 2);
      const dy = look.y - (r.top + r.height / 2);
      const m = Math.sqrt(dx * dx + dy * dy) || 1;
      const u = parseFloat(getComputedStyle(b).getPropertyValue('--u')) || 1;
      b.style.setProperty('--ex', Math.round(dx / m) * u + 'px');
      b.style.setProperty('--ey', Math.round(dy / m) * u + 'px');
      // Something came close: whatever was dozing there is awake now.
      if (Math.abs(dx) < 110 && Math.abs(dy) < 90) wake(b);
    }
  };

  window.addEventListener('pointermove', (ev) => {
    look = { x: ev.clientX, y: ev.clientY };
    lastLook = Date.now();
    if (!aiming) { aiming = true; requestAnimationFrame(aim); }
  }, { passive: true });

  // ---- sleep --------------------------------------------------------------
  /**
   * An agent nobody has asked for anything falls asleep on the shelf.
   *
   * It is not decoration: "nothing is asking for this one" is a real state of
   * the system that the desk had no way of showing, and a shelf of alert little
   * faces implies six agents waiting on you when in fact none of them is waiting
   * for anything. They wake when the pointer comes near, when they are dragged,
   * and the moment they are given work.
   */
  const wake = (node) => {
    const b = node.classList && node.classList.contains('crt') ? node : node.querySelector('.crt');
    if (!b) return;
    b.dataset.woke = String(Date.now());
    if (!b.classList.contains('asleep')) return;
    b.classList.remove('asleep');
    const z = b.querySelector('.zzz');
    if (z) z.remove();
  };

  setInterval(() => {
    const now = Date.now();
    for (const el of surface.querySelectorAll('.acube:not(.instack):not(.merging)')) {
      const b = el.querySelector('.crt');
      if (!b || el.classList.contains('missing') || b.classList.contains('asleep')) continue;
      if (now - Number(b.dataset.woke || 0) < 40000) continue;
      b.classList.add('asleep');
      const z = document.createElement('span');
      z.className = 'zzz';
      z.textContent = 'z';
      b.appendChild(z);
    }
  }, 5000);

  // ---- the handover -------------------------------------------------------
  /**
   * Draw the result travelling from the step that produced it to the step that
   * received it — and draw it **falling** when the trace says the receiver
   * carried nothing forward.
   *
   * This is the finding the whole trace face exists for, and until now it was a
   * sentence in a panel two clicks away. A green square that arrives and a red
   * one that drops on the floor is the same fact, in the place people are
   * already looking. The verdict is read off the trace's own ignoredInput,
   * which ai-flows computed; nothing here measures anything.
   */
  const creatureBox = (agent, flowId) => {
    const el = cubeAt(cubeKey(agent, flowId)) ||
      document.querySelector('.acube:not(.merging)[data-id="' + CSS.escape(agent) + '"]');
    const b = el && el.querySelector('.crt');
    return b ? b.getBoundingClientRect() : null;
  };

  const drawHandover = (doc, stepIndex) => {
    const h = handoverOf(doc, stepIndex);
    if (!h) return;
    const a = creatureBox(h.from, doc.id), b = creatureBox(h.to, doc.id);
    if (!a || !b) return;
    const p = document.createElement('div');
    p.className = 'pkt' + (h.carried ? '' : ' dropped');
    p.style.left = a.right + 'px';
    p.style.top = (a.top + 4) + 'px';
    document.body.appendChild(p);
    requestAnimationFrame(() => {
      if (h.carried) {
        p.style.transform = 'translate(' + (b.left - a.right - 5) + 'px,' + (b.top - a.top) + 'px)';
      } else {
        // Short of the receiver, and down. It was handed over and not taken.
        p.style.transform = 'translate(' + Math.round((b.left - a.right) / 2) + 'px,64px)';
        p.style.opacity = '0';
      }
    });
    setTimeout(() => p.remove(), 1000);
  };

  /**
   * Replay every handoff in a flow, in order.
   *
   * The packet only draws on a transition, so a flow that was already finished
   * when the page opened never shows the one thing worth seeing. Opening the
   * Trace face asks for the history of this flow, and this is that history as
   * motion: each result travelling to the next agent, and the one that did not
   * arrive falling in front of you. Nothing runs, nothing is spent -- it is the
   * same recorded verdicts the list below it prints.
   */
  const replayHandovers = (doc) => {
    const settled = (doc.steps || []).filter((s) => s.state === 'done');
    settled.forEach((s, i) => setTimeout(() => drawHandover(doc, s.index), i * 420));
  };

  // What each step was last time the desk looked, so a settle can be noticed
  // rather than polled for. Only transitions draw.
  const stepWas = {};
  const noticeSettled = () => {
    for (const d of S.docs) {
      for (const s of (d.steps || [])) {
        const k = d.id + '#' + s.index;
        const was = stepWas[k];
        stepWas[k] = s.state;
        if (painted && was && was !== 'done' && s.state === 'done') drawHandover(d, s.index);
      }
    }
  };

  // ---- render -------------------------------------------------------------
  /**
   * Reconcile rather than rebuild.
   *
   * This function used to empty the surface and draw it again every five
   * seconds. Everything therefore jumped: a creature crossing the desk restarted
   * from its destination, a drag that landed mid-poll flickered, and no motion
   * could ever be continuous because no element survived long enough to move.
   * Now nodes persist and only what changed is written -- which is also what
   * makes the walk below possible at all.
   */
  let painted = false;

  function render() {
    // FLIP, first half: where everything is before the DOM is rearranged.
    const was = new Map();
    for (const el of document.querySelectorAll('.acube:not(.merging)'))
      was.set(el.dataset.key, el.getBoundingClientRect());

    renderDocs();
    renderCubes();

    for (const s of surface.querySelectorAll('.stack'))
      s.classList.toggle('empty', s.children.length === 0);

    if (painted) walkEverythingThatMoved(was);
    noticeSettled();
    painted = true;
    renderDrawer();
    renderHoles();
    renderLive();
    // After the cubes, never before: the wires are measured off the live DOM,
    // and measuring them against last frame's positions draws every hop one
    // render behind the creature it is attached to.
    recomputeBus();
    renderWires();
    renderPanel();
  }

  function renderDocs() {
    const want = new Set(S.docs.map((d) => d.id));
    for (const el of surface.querySelectorAll('.docnode'))
      if (!want.has(el.dataset.id)) el.remove();

    for (const doc of S.docs) {
      const p = layout.docs[doc.id] || { x: 200, y: 40 };
      let el = surface.querySelector('.docnode[data-id="' + CSS.escape(doc.id) + '"]');
      if (!el) {
        el = document.createElement('div');
        el.className = 'docnode';
        el.dataset.id = doc.id;
        el.innerHTML =
          '<div class="dbar"><span class="box"></span><span class="t"></span></div>' +
          '<div class="body"><p class="goal"></p><div class="meta"></div>' +
          '<div class="chart"></div><div class="stack"></div></div>';
        el.querySelector('.stack').dataset.stack = doc.id;
        el.querySelector('.dbar').addEventListener('pointerdown', (ev) => startDrag(el, 'doc', doc.id, ev));
        el.addEventListener('pointerdown', () => { if (!drag) select('doc', doc.id); });
        surface.appendChild(el);
      }
      // The pinned class is not styling -- it removes the transition. A document
      // the person placed must not animate, because an object that slides after
      // you let go of it reads as the system having moved it.
      el.classList.toggle('pinned', !!p.pinned);
      el.querySelector('.t').textContent = doc.title;
      el.querySelector('.goal').textContent = doc.goal;
      // Only the parts that carry state are rewritten. The stack is left alone:
      // it holds live creatures, and replacing their parent's innerHTML is how
      // the old version threw them away sixty times a minute.
      el.querySelector('.meta').innerHTML =
        '<span class="strip">' + doc.steps.map((s) =>
          '<span class="cube" style="--c:' + (S.stateColors[s.state] || '#C9C7C1') + '"></span>').join('') +
        '</span><span class="st">' + escape_(doc.state) + '</span><span>' + doc.done + '/' + doc.total + '</span>';
      // What this flow is carrying right now, on the document itself. Two flows
      // whose strips are both green and whose shapes are a waveform and a
      // flatline are two different outcomes, and the desk should not need to be
      // asked which is which.
      const ls = lastSeries(doc);
      const chart = el.querySelector('.chart');
      chart.innerHTML = ls ? spark(ls.series, 236, 26) : '';
      if (!drag || drag.el !== el) {
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      }
    }
  }

  function renderCubes() {
    const want = [];
    for (const a of S.agents) {
      let inst = instancesOf(a.name);
      if (releasing && releasing.agent === a.name)
        inst = inst.filter((i) => i.flowId !== releasing.flowId);
      if (pending && pending.agent === a.name && !inst.some((i) => i.flowId === pending.flowId))
        inst = inst.concat([{ flowId: pending.flowId, steps: 1 }]);
      if (inst.length) for (const i of inst) want.push({ a: a, flowId: i.flowId, steps: i.steps });
      else want.push({ a: a, flowId: null, steps: 0 });
    }
    const keys = new Set(want.map((w) => cubeKey(w.a.name, w.flowId)));

    // An instance whose work is gone walks back into a surviving instance of the
    // same agent. With nowhere to walk to, it just goes.
    for (const el of document.querySelectorAll('.acube:not(.merging)')) {
      if (keys.has(el.dataset.key) || (drag && drag.el === el)) continue;
      let sib = null;
      for (const o of document.querySelectorAll('.acube:not(.merging)'))
        if (o !== el && o.dataset.id === el.dataset.id && keys.has(o.dataset.key)) sib = o;
      if (sib && painted) mergeInto(el, sib); else el.remove();
    }

    for (const w of want) {
      const key = cubeKey(w.a.name, w.flowId);
      let el = cubeAt(key);
      if (!el) el = makeCube(w.a, key);
      if (drag && drag.el === el) continue;   // the hand owns it

      const host = w.flowId
        ? surface.querySelector('[data-stack="' + CSS.escape(w.flowId) + '"]')
        : surface;
      if (el.parentElement !== host) host.appendChild(el);
      if (w.flowId) {
        el.classList.add('instack');
        el.style.left = el.style.top = el.style.position = '';
      } else {
        const c = layout.cubes[w.a.name] || { x: 20, y: 40 };
        const d = drift[w.a.name] || { dx: 0, dy: 0 };
        el.classList.remove('instack');
        el.style.left = (c.x + d.dx) + 'px';
        el.style.top = (c.y + d.dy) + 'px';
      }
      el.classList.toggle('pinned', !!(layout.cubes[w.a.name] || {}).pinned);

      /**
       * Where this agent sits in its flow's order.
       *
       * renderCubes walks S.agents, which is declaration order, so the stack
       * used to list a flow's agents in whatever order somebody wrote the agent
       * files -- and the wires then drew the flow's real sequence as a tangle
       * across an arrangement that disagreed with it. Flex order fixes the
       * picture without reordering the DOM, so nothing a creature is doing gets
       * interrupted by a re-parent.
       */
      if (w.flowId) {
        const d = S.docs.find((x) => x.id === w.flowId);
        const first = d ? (d.steps.find((st) => st.agent === w.a.name) || {}).index : undefined;
        el.style.order = first === undefined ? '99' : String(first);
      } else {
        el.style.order = '';
      }

      const doing = doingOf(w.a.name, w.flowId);
      el.classList.toggle('busy', !!doing);
      el.querySelector('.crt').classList.toggle('busy', !!doing);
      if (doing) wake(el);
      el.querySelector('.doing').textContent = doing ? 'step ' + doing.step.index + ' · running' : '';
      el.querySelector('.mult').textContent = w.steps > 1 ? '×' + w.steps : '';
    }
  }

  /**
   * FLIP, second half: whatever ended up somewhere else walks there.
   *
   * The element is put back where it was with a transform and then released, so
   * the browser animates the difference. It is the only way to move a creature
   * between a document's stack and the open desk -- those are different layout
   * modes, and no transition on a left offset can cross that gap.
   */
  function walkEverythingThatMoved(was) {
    for (const el of document.querySelectorAll('.acube:not(.merging)')) {
      const before = was.get(el.dataset.key);
      if (!before) {
        // New: it grew out of its own kind rather than appearing.
        el.classList.add('splitting');
        setTimeout(() => el.classList.remove('splitting'), 440);
        continue;
      }
      const now = el.getBoundingClientRect();
      const dx = before.left - now.left, dy = before.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const body = el.querySelector('.crt');
      el.classList.remove('moving');
      if (body) body.classList.remove('walking');
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      requestAnimationFrame(() => {
        el.classList.add('moving');
        if (body) { body.classList.add('walking'); wake(body); }
        el.style.transform = '';
        setTimeout(() => {
          el.classList.remove('moving');
          if (body) body.classList.remove('walking');
        }, 480);
      });
    }
  }

  /**
   * Idle agents drift.
   *
   * Only the ones nobody has placed, only inside the shelf, only a few pixels,
   * and never saved: it is the difference between a rack of icons and a shelf of
   * things that are waiting. A creature the person put somewhere stays exactly
   * where they put it -- drifting off a chosen spot would be the surface moving
   * the user's objects, which is the one thing it may never do.
   */
  setInterval(() => {
    if (drag) return;
    const free = [];
    for (const el of surface.querySelectorAll('.acube:not(.instack):not(.merging)'))
      if (!(layout.cubes[el.dataset.id] || {}).pinned) free.push(el);
    if (!free.length) return;
    const el = free[Math.floor(Math.random() * free.length)];
    const name = el.dataset.id;
    const c = layout.cubes[name] || { x: 20, y: 40 };
    const d = drift[name] || { dx: 0, dy: 0 };
    const nx = Math.min(Math.max(c.x + d.dx + (Math.random() < 0.5 ? -6 : 6), 8), 120);
    const ny = Math.min(Math.max(c.y + d.dy + Math.round((Math.random() - 0.5) * 22), 30), 1400);
    // Not on top of each other. Two creatures wandering into the same spot read
    // as one creature with a rendering fault, and the shelf did exactly that
    // within a minute of being left alone.
    for (const other of free) {
      if (other === el) continue;
      const o = layout.cubes[other.dataset.id] || { x: 0, y: 0 };
      const od = drift[other.dataset.id] || { dx: 0, dy: 0 };
      if (Math.abs(o.x + od.dx - nx) < 96 && Math.abs(o.y + od.dy - ny) < 26) return;
    }
    drift[name] = { dx: nx - c.x, dy: ny - c.y };
    render();
  }, 5200);

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
            const lv = (S.memoryLevels || []).find((x) => x.level === n.level) || { color: '#C9C7C1' };
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

  /**
   * What the projection could not answer.
   *
   * Hidden when there are none — and that is a claim, not a default: an empty
   * list here says every question the conformation asked came back answered.
   */
  function renderHoles() {
    const chip = document.getElementById('holes-open');
    const box = document.getElementById('holes');
    if (!chip || !box) return;
    const holes = S.holes || [];
    if (!holes.length) {
      chip.hidden = true;
      box.hidden = true;
      return;
    }
    chip.hidden = false;
    chip.textContent = holes.length === 1
      ? '1 question unanswered'
      : holes.length + ' questions unanswered';
    box.innerHTML =
      '<h3>What this view could not answer</h3>' +
      holes.map((h) =>
        '<div class="hole"><div class="q">' + escape_(h.question) + '</div>' +
        '<div class="w">' + escape_(h.why) + '</div>' +
        (h.scopeId ? '<div class="sc">' + escape_(h.scopeId) + '</div>' : '') +
        '</div>').join('');
  }

  /**
   * The living documents.
   *
   * Four kinds, and the two marks that matter: whether something is writing to it
   * without being asked, and whether you are allowed to write back. Both come off
   * the projection rather than off the renderer -- a document that is read-only
   * because this function drew no input box is read-only until somebody adds one.
   */
  function renderLive() {
    const el = document.getElementById('live');
    if (!el) return;
    // Policy from the module, liveness from the poll.
    //
    // kind, title and writable are shipped once by ai-flows' channels.ts:
    // they are structure, and re-deriving them here would be a second answer to
    // "who may write to this". Whether something is writing *right now* is not
    // structure -- it changes every five seconds -- and the payload is built
    // before the first poll, so a panel that trusted it was a panel of living
    // documents that never came alive. Found by advancing a step and watching
    // nothing happen.
    const running = {};
    for (const d of S.docs) if ((d.steps || []).some((x) => x.state === 'running')) running[d.id] = true;
    const chs = (S.channels || []).map((c) =>
      c.kind === 'work' ? { ...c, live: !!running[c.id.replace(/\/work$/, '')] } : c);
    el.querySelector('.win-body').innerHTML =
      '<ul class="docs">' + chs.map((c) =>
        '<li class="' + (c.live ? 'live' : '') + '"><span class="dot"></span>' +
        '<span class="k">' + escape_(c.kind) + '</span>' +
        '<span class="t">' + escape_(c.title) + '</span>' +
        '<span class="rw">' + (c.writable ? 'you + agents' : 'read-only') + '</span></li>').join('') +
      '</ul>' +
      '<div class="dim" style="margin-top:6px;font-size:10px">A dot means something is ' +
      'writing to it with nobody waiting. Read-only is a property of the document, not of this panel.</div>';
  }

  async function refresh() {
    const r = await fetch('/state?scope=' + encodeURIComponent(S.scopeId));
    if (!r.ok) return;
    const next = await r.json();
    S.docs = next.docs; S.agents = next.agents; S.busy = next.busy; S.notes = next.notes;
    if (next.holes) S.holes = next.holes;
    layout = next.layout;
    // The optimistic halves are only good until the truth arrives.
    pending = null; releasing = null;
    document.getElementById('stamp').textContent = new Date(next.at).toISOString();
    render();
  }

  document.getElementById('scope').addEventListener('change', (e) => {
    location.search = '?scope=' + encodeURIComponent(e.target.value);
  });
  document.getElementById('reload').addEventListener('click', () => refresh());

  // The chip opens the list; nothing else on the page moves. Closed is the
  // resting state, but the chip itself never hides while a hole exists —
  // dismissing the list must not dismiss the fact.
  document.getElementById('holes-open').addEventListener('click', function () {
    const box = document.getElementById('holes');
    const open = box.hidden;
    box.hidden = !open;
    this.setAttribute('aria-expanded', String(open));
  });

  // Create a document. The gesture the desk was missing: every other action
  // here operates on work that already exists, so starting a project meant
  // leaving the interface.
  //
  // An inline form and not window.prompt, for two reasons. A modal dialog is
  // the wrong idiom for a surface built on direct manipulation -- it takes the
  // desk away to ask about it. And a native prompt blocks the page's event loop
  // entirely, which makes the gesture untestable by anything driving a browser,
  // including the check that it works at all.
  var newForm = document.getElementById('newform');
  var newTitle = document.getElementById('newtitle');
  var newGoal = document.getElementById('newgoal');

  function closeNew() { newForm.style.display = 'none'; newTitle.value = ''; newGoal.value = ''; }

  /**
   * The one control that makes things.
   *
   * Five buttons at equal weight on the bar above the desk, none of which is
   * what a visitor came to do. Behind a plus they are still one click away and
   * they have stopped competing with the work. Closes on the next click
   * anywhere, on Escape, and on choosing something -- a menu that stays open
   * after you use it is a menu you have to dismiss.
   */
  (() => {
    const open = document.getElementById('mkopen');
    const menu = document.getElementById('makemenu');
    if (!open || !menu) return;
    const shut = () => { menu.hidden = true; open.setAttribute('aria-expanded', 'false'); };
    open.addEventListener('click', (ev) => {
      ev.stopPropagation();
      menu.hidden = !menu.hidden;
      open.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
    menu.addEventListener('click', () => setTimeout(shut, 0));
    window.addEventListener('click', shut);
    window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') shut(); });
  })();

  document.getElementById('newdoc').addEventListener('click', function () {
    var open = newForm.style.display !== 'none';
    if (open) { closeNew(); return; }
    newForm.style.display = 'block';
    newTitle.focus();
  });
  document.getElementById('newcancel').addEventListener('click', closeNew);

  /**
   * Starting a project, from the desk.
   *
   * The page navigates into the new scope rather than re-rendering in place:
   * the scope is a query parameter here, so staying put would leave the chrome
   * naming one project and the surface showing another.
   */
  var projForm = document.getElementById('newprojform');
  var projName = document.getElementById('newprojname');
  function closeProj() { projForm.style.display = 'none'; projName.value = ''; }
  document.getElementById('newproj').addEventListener('click', function () {
    if (projForm.style.display !== 'none') { closeProj(); return; }
    projForm.style.display = 'block';
    projName.focus();
  });
  document.getElementById('newprojcancel').addEventListener('click', closeProj);

  /** Writing an agent, from the desk. The file IS the agent — nothing else happens. */
  var agForm = document.getElementById('newagentform');
  function closeAg() { agForm.style.display = 'none'; }
  document.getElementById('newagent').addEventListener('click', function () {
    if (agForm.style.display !== 'none') { closeAg(); return; }
    agForm.style.display = 'block';
    document.getElementById('agname').focus();
  });
  document.getElementById('agcancel').addEventListener('click', closeAg);
  document.getElementById('agcreate').addEventListener('click', async () => {
    var list = (v) => (v || '').split(',').map((x) => x.trim()).filter(Boolean);
    try {
      var r = await post('/agent', {
        scopeId: S.scopeId,
        name: (document.getElementById('agname').value || '').trim(),
        description: document.getElementById('agdesc').value || '',
        tools: list(document.getElementById('agtools').value),
        subagents: list(document.getElementById('agsubs').value),
        instructions: document.getElementById('aginstr').value || ''
      });
      closeAg();
      say('Wrote ' + r.path + '. Drop it on a document to give it a step.', 6000);
      await refresh();
    } catch (e) {
      // The refusal comes from ai-flows and is shown verbatim: it names the
      // field and the reason, and a desk that replaced it with "invalid" would
      // be hiding the only useful part.
      say(e.message, 8000);
    }
  });

  /** Putting material in. Goes to the sandbox, and says what the sandbox saw. */
  var flForm = document.getElementById('newfileform');
  function closeFl() { flForm.style.display = 'none'; }
  document.getElementById('newfile').addEventListener('click', function () {
    if (flForm.style.display !== 'none') { closeFl(); return; }
    flForm.style.display = 'block';
    document.getElementById('flpath').focus();
  });
  document.getElementById('flcancel').addEventListener('click', closeFl);
  document.getElementById('flcreate').addEventListener('click', async () => {
    try {
      var r = await post('/file', {
        scopeId: S.scopeId,
        path: (document.getElementById('flpath').value || '').trim(),
        content: document.getElementById('flbody').value || ''
      });
      closeFl();
      // What the sandbox reported, not what was sent. The desk must not be able
      // to say "written" about a write it did not observe.
      say(r.path + ' — ' + r.verifiedInSandbox, 7000);
    } catch (e) { say(e.message, 8000); }
  });
  document.getElementById('newprojcreate').addEventListener('click', async () => {
    var name = (projName.value || '').trim();
    if (!name) { say('A project needs a name.'); return; }
    try {
      var r = await post('/project', {
        name: name,
        ownerId: S.people && S.people[0] ? S.people[0] : 'you'
      });
      closeProj();
      say('Started "' + name + '". It is empty — nothing has happened in it yet.', 6000);
      if (r.scopeId) location.search = '?scope=' + encodeURIComponent(r.scopeId);
    } catch (e) { say('Could not start it: ' + e.message); }
  });

  document.getElementById('newcreate').addEventListener('click', async () => {
    var title = (newTitle.value || '').trim();
    var goal = (newGoal.value || '').trim();
    // The goal is required and is NOT defaulted from the title. A document whose
    // goal restates its name says nothing about what done means, which is the
    // first thing doc/03 says a flow exists to supply.
    if (!title || !goal) { say('A document needs a name and a goal.'); return; }
    try {
      var r = await post('/flow', {
        scopeId: S.scopeId, actorId: S.people && S.people[0] ? S.people[0] : 'you',
        title: title, goal: goal
      });
      closeNew();
      say('Created "' + (r.title || title) + '". Drop an agent on it to give it a step.');
      await refresh();
      if (r.flowId) select(r.flowId);
    } catch (e) { say('Could not create it: ' + e.message); }
  });

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

/**
 * The vocabulary, in the panel that will answer with it.
 *
 * The five wire marks come first, and that ordering is the argument. What a box
 * is coloured is ordinary; **what a line between two boxes means is the thing
 * this surface exists to say**, and the distinction it most needs a reader to
 * hold is that `unknown` and `open` are not weaker versions of a verdict. They
 * are the refusal to give one, and they are marked so they cannot be mistaken
 * for it at a glance, in a screenshot, or by somebody who does not see colour.
 */
function legend(): string {
  const sw = (color: string, label: string) =>
    `<li><span class="cube" style="--c:${color}"></span><span>${esc(label)}</span></li>`;
  const wire = (cls: string, label: string, gloss: string) =>
    `<li class="wk"><svg width="34" height="10" aria-hidden="true"><path class="w ${cls}" d="M1 5 H33"/></svg>` +
    `<span><b>${esc(label)}</b> — ${esc(gloss)}</span></li>`;
  return `<div class="key">
    <div class="wkey"><strong>Between two agents</strong><ul>
      ${wire("carried", "carried", "something moved and the next step used it")}
      ${wire("ignored", "carried nothing forward", "it arrived and nothing used it")}
      ${wire("blocked", "did not pass", "it ran, measured, and came out against its threshold")}
      ${wire("open", "no verdict yet", "it arrived and nothing has been decided")}
      ${wire("unknown", "unrecorded", "nothing was recorded about this hop at all")}
    </ul></div>
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
  /**
   * The living documents, projected rather than stored.
   *
   * Built here with `ai-flows`' own `channels.ts` rather than re-derived in the
   * client, because a second implementation of "who may write to this" is a
   * second answer to it, and the one on screen would be the untested one. A
   * running flow becomes a `work` document; the scope gets its chat and its log
   * whether or not anything has happened in them yet.
   */
  const channels = [
    ...view.docs.map((d) =>
      workChannel({ id: d.id, title: d.title, scopeId: view.scopeId, steps: d.steps }),
    ),
    ...channelsFor(view.scopeId, view.scopeLabel),
  ];

  const client = {
    /**
     * The vocabulary, carried in the state rather than as a second global.
     *
     * It could have been its own script tag, and that is how it was written
     * first -- which broke three tests that parse the state tag by reading to
     * the next closing tag, and would have broken a fourth that counts the tags.
     * The page having exactly one place where its state lives is worth more than
     * the tidiness of a separate constant.
     */
    key: legend(),
    scopeId: view.scopeId,
    channels,
    docs: view.docs,
    agents: view.agents,
    layout: view.layout,
    holes: view.holes,
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
<style>${CHROME_CSS}${CREATURE_CSS}${DESK_CSS}${NEWFORM_CSS}${view.simulate ? TOUR_CSS + MASCOT_CSS : ""}</style>
<div class="menubar">
  <span class="apple">ai-os</span>
  ${view.simulate ? `<span class="sim">Simulated — no core, no model, nothing stored</span>` : ""}
  <label>Scope <select id="scope">${view.scopes
    .map(
      (s) =>
        `<option value="${esc(s.scopeId)}"${s.scopeId === view.scopeId ? " selected" : ""}>${esc(s.label)}</option>`,
    )
    .join("")}</select></label>
  <span id="counts">${esc(view.docs.length)} document(s) · ${esc(view.agents.length)} agent(s)</span>
  <!--
    The holes, in the chrome rather than in the rail.

    They belong to the whole projection, not to a selection, so a panel that
    changes with what you clicked would hide them exactly when somebody is
    looking at something. And the rail is deliberately one panel. So the count
    sits on the bar, always, and the list opens under it.

    conformation.ts is the reason this exists at all: "the failure mode of any
    projection is silence: a view that renders cleanly because it did not ask is
    worse than no view". The desk was receiving these on every poll and dropping
    them at the type boundary.
  -->
  <button id="holes-open" class="holes-chip" hidden aria-expanded="false"></button>
  <!--
    Five buttons became one.

    The bar carried New project, New agent, Add material, New document and
    Refresh, all at equal weight, next to a scope selector and two badges — nine
    controls on the line above the thing they act on, competing with it. None of
    them is what a visitor came to do. Behind one `+` they are still one click
    away and they have stopped shouting.
  -->
  <span class="make"><button id="mkopen" aria-haspopup="true" aria-expanded="false" title="Make something">+</button>
    <span class="makemenu" id="makemenu" hidden>
      <button id="newdoc">New document</button>
      <button id="newagent">New agent</button>
      <button id="newfile">Add material</button>
      <button id="newproj">New project</button>
    </span></span>
  <button id="reload" class="quiet" title="Re-read the state">Refresh</button>
  <span class="right" title="harness ${esc(view.harness)}${
    view.builtAt ? ` · built ${new Date(view.builtAt).toISOString()}` : ""
  }"><span id="stamp">${esc(new Date(view.at).toISOString())}</span>${
    view.builtAt
      ? `<span class="build" title="When this file was generated. If this has not changed, you are looking at a cached copy.">build ${esc(
          new Date(view.builtAt).toISOString().slice(5, 16).replace("T", " "),
        )}</span>`
      : ""
  }</span>
</div>
<div class="win newform" id="newagentform" style="display:none">
  <div class="bar"><span class="box"></span><h2>New agent</h2><span class="box zoom"></span></div>
  <div class="win-body">
    <label>Name <input id="agname" type="text" placeholder="DERIVADOR"></label>
    <label>What it is for <input id="agdesc" type="text" placeholder="Derives the closed forms every gate is checked against"></label>
    <label>Tools <input id="agtools" type="text" value="read, execute" placeholder="read, write, execute, publish, memory, history, background"></label>
    <label>Subagents <input id="agsubs" type="text" placeholder="VERIFICADOR-MATH (optional)"></label>
    <label>Instructions <textarea id="aginstr" rows="5" placeholder="You derive the analytic truth. You never check your own derivation against the solver."></textarea></label>
    <p class="dim">An agent is a markdown file. This writes agents/&lt;name&gt;.md into this project.</p>
    <div class="row"><button id="agcreate">Write it</button><button id="agcancel">Cancel</button></div>
  </div>
</div>
<div class="win newform" id="newfileform" style="display:none">
  <div class="bar"><span class="box"></span><h2>Add material</h2><span class="box zoom"></span></div>
  <div class="win-body">
    <label>Path <input id="flpath" type="text" placeholder="COCLEA-SR-SPEC.md"></label>
    <label>Contents <textarea id="flbody" rows="8" placeholder="Paste the specification, the dataset, the note…"></textarea></label>
    <p class="dim">Goes into this project's sandbox — where its agents can read and run it — and is confirmed from inside it.</p>
    <div class="row"><button id="flcreate">Put it in</button><button id="flcancel">Cancel</button></div>
  </div>
</div>
<div class="win newform" id="newprojform" style="display:none">
  <div class="bar"><span class="box"></span><h2>New project</h2><span class="box zoom"></span></div>
  <div class="win-body">
    <label>Name <input id="newprojname" type="text" placeholder="COCLEA-SR"></label>
    <p class="dim">It starts empty — no documents, no agents. Nothing has happened in it yet.</p>
    <div class="row"><button id="newprojcreate">Create</button><button id="newprojcancel">Cancel</button></div>
  </div>
</div>
<div class="win newform" id="newform" style="display:none">
  <div class="bar"><span class="box"></span><h2>New document</h2><span class="box zoom"></span></div>
  <div class="win-body">
    <label>Name <input id="newtitle" type="text" placeholder="Passive membrane"></label>
    <label>What would make it done? <input id="newgoal" type="text" placeholder="every required gate green, and frozen only if they are"></label>
    <div class="row"><button id="newcreate">Create</button><button id="newcancel">Cancel</button></div>
  </div>
</div>
<div class="desk deskbg hasdrawer">
  <div class="surface" id="surface">
    <div class="shelf"><h3>Palette</h3></div>
    <svg class="wires" id="wires" aria-hidden="true"></svg>
  </div>
  <div class="drawer" id="drawer"></div>
  <div class="holes" id="holes" hidden></div>
</div>
<div class="rail">
  <!--
    One panel, always present.

    There used to be two: a *Selected* panel that appeared when you clicked
    something, and a permanent *Key* explaining what the marks meant. A legend is
    a manual, and shipping a manual beside an interface is the interface saying
    it did not manage to be legible. So the key became what this panel shows when
    nothing is selected — you read it exactly once, in the place you are already
    looking, and it is replaced by the thing itself the moment you click.
  -->
  <div class="win panel insp" id="panel">
    <div class="bar"><span class="box"></span><h2>Inspector</h2><span class="box zoom"></span></div>
    <div class="win-body">${legend()}</div>
  </div>
  <div class="win panel" id="live">
    <div class="bar"><span class="box"></span><h2>Documents</h2><span class="box zoom"></span></div>
    <div class="win-body"></div>
  </div>
  <div class="spacer"></div>
</div>
<div class="toast" id="toast"></div>
<script>window.__DESK__ = ${jsonForScript(client)};</script>
${view.simulate ? `<script>${SIMULATION_JS}</script>` : ""}
${view.simulate ? `<script>${TOUR_JS}</script>` : ""}
<script>${DESK_JS}</script>
${view.simulate ? `<script>${MASCOT_JS}</script>` : ""}
</html>`;
}
