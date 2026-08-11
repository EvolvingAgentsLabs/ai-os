/**
 * How many of an agent there are, and what each one is doing.
 *
 * The desk used to draw one cube per agent, placed by the layout. That could
 * only ever say an agent was in *one* place, so an agent holding steps in two
 * flows was drawn standing on whichever one the layout named — the picture said
 * "it is here", the trace said "it is in both", and people believe the picture.
 *
 * These three rules replace that: an agent is **one creature per document it has
 * work in**, derived from the steps rather than from where somebody once dropped
 * a cube. Several steps in one document stay one creature with a multiplier,
 * because five queued steps is one agent with a queue, not five agents.
 *
 * ## Why this is a string
 *
 * It runs in the page, which has no build step and no imports — the same
 * constraint [simulate.ts](simulate.ts) and [mascot.ts](mascot.ts) live under.
 * It is kept out of `desk.ts` so that [test/creatures.test.ts](../test/creatures.test.ts)
 * can **execute the shipped source** and call these functions directly, rather
 * than assert that some substring appears in the HTML. Rules the render depends
 * on should be checked by running them.
 */
/**
 * The body every agent has, in one place.
 *
 * There used to be two of these. The mascot was a 26px body with 4×6 eyes and
 * four legs; an agent on the desk was a 15px body with 2×4 eyes and three legs
 * carved out of its bottom edge as notches. Both were "the cube with eyes" in
 * the source and neither was in the picture: a reader saw a character and a row
 * of chips, which is precisely the mascot-bolted-on failure the whole design was
 * supposed to avoid. Two sprites means two species however the comment reads.
 *
 * So: one sprite, drawn on a 16-pixel grid and scaled by `--u`. The system agent
 * is `--u:2` — the same animal at twice the size, which is what "the cube at
 * twice the size" was always meant to mean. Every coefficient below is a whole
 * number of grid units, so both sizes land on whole pixels and nothing blurs.
 *
 * `--ex` / `--ey` are where the eyes are pointing. One implementation aims every
 * creature on the desk, mascot included ([desk.ts](desk.ts)) — the alternative
 * was a mascot that watches you and agents that stare through you.
 */
export const CREATURE_CSS = `
/* display:block matters: inside a chip it is a flex item and blockified for
   free, but the system agent stands on its own and an inline span cannot take a
   width -- which collapsed it to a bar with legs. */
.crt{position:relative;display:block;flex:0 0 auto;
  width:calc(16px * var(--u,1));height:calc(16px * var(--u,1));
  background:var(--c,#e0a020);border:1px solid rgba(0,0,0,.6);
  box-shadow:inset calc(2px * var(--u,1)) calc(2px * var(--u,1)) 0 rgba(255,255,255,.45),
             inset calc(-2px * var(--u,1)) calc(-2px * var(--u,1)) 0 rgba(0,0,0,.28)}
.crt .eye{position:absolute;top:calc(5px * var(--u,1));
  width:calc(2px * var(--u,1));height:calc(4px * var(--u,1));background:#16181a;
  transform:translate(var(--ex,0px),var(--ey,0px));
  animation:blink 5.4s steps(1,end) infinite;animation-delay:var(--bd,0s)}
.crt .eye.l{left:calc(4px * var(--u,1))}
.crt .eye.r{right:calc(4px * var(--u,1))}
.crt .leg{position:absolute;top:calc(16px * var(--u,1));
  width:calc(2px * var(--u,1));height:calc(3px * var(--u,1));
  background:var(--c,#e0a020);border:1px solid rgba(0,0,0,.6);border-top:0}
.crt .leg:nth-of-type(1){left:calc(1px * var(--u,1))}
.crt .leg:nth-of-type(2){left:calc(5px * var(--u,1))}
.crt .leg:nth-of-type(3){left:calc(9px * var(--u,1))}
.crt .leg:nth-of-type(4){left:calc(13px * var(--u,1))}
@keyframes blink{0%,97%{height:calc(4px * var(--u,1))}98%,100%{height:1px}}
@keyframes think{from{height:calc(4px * var(--u,1))}to{height:calc(2px * var(--u,1))}}
@keyframes stepleg{from{height:calc(3px * var(--u,1))}to{height:calc(1px * var(--u,1))}}
/* Working: the eyes narrow, out of step with each other, and it rocks. */
.crt.busy .eye{animation:think .5s steps(2,end) infinite}
.crt.busy .eye.r{animation-delay:.25s}
/* Walking: the legs alternate. Whole pixels, two frames -- a sprite that eases
   is from a different decade than everything else on this desk. */
.crt.walking .leg{animation:stepleg .3s steps(2,end) infinite}
.crt.walking .leg:nth-of-type(2n){animation-delay:.15s}
/* Declared with no file behind it: eyes shut. It is not idle, it is not there. */
.crt.blind .eye{height:1px;top:calc(7px * var(--u,1));animation:none}
/* Asleep on the shelf: shut eyes and one snoring pixel-letter. Nothing has asked
   it for anything, and a picture that draws that as alert is padding. */
.crt.asleep .eye{height:1px;top:calc(7px * var(--u,1));animation:none}
.crt .zzz{position:absolute;right:calc(-4px * var(--u,1));top:calc(-6px * var(--u,1));
  font:700 calc(6px * var(--u,1))/1 var(--mono);color:#3b3f44;opacity:0;
  animation:snore 3.2s steps(4,end) infinite}
@keyframes snore{0%{opacity:0;transform:translateY(2px)}
  30%{opacity:.85}70%{opacity:.5}100%{opacity:0;transform:translateY(-6px)}}
/* Landing after a drag: it takes the impact rather than arriving weightless. */
@keyframes land{0%{transform:scale(1.18,.78)}60%{transform:scale(.94,1.08)}100%{transform:scale(1)}}
.crt.landed{animation:land .26s steps(4,end)}
/* The result travelling from one step to the next: the packet the whole trace
   face argues about, drawn. When it arrives, the next agent caught something.
   When it falls, it did not. */
.pkt{position:fixed;z-index:395;width:5px;height:5px;background:#3f8f3f;
  border:1px solid rgba(0,0,0,.6);pointer-events:none;
  transition:transform .62s steps(16),opacity .2s}
.pkt.dropped{background:#b03a2e;transition:transform .5s cubic-bezier(.4,0,1,1),opacity .5s}
@media (prefers-reduced-motion: reduce){
  .crt .eye,.crt.walking .leg,.crt.busy .eye,.crt .zzz,.crt.landed{animation:none}
  .pkt{transition:none}
}
`;

export const CREATURES_JS = String.raw`
/** The body, identical for every creature on the desk. One string, one species. */
var CREATURE_BODY = '<i class="eye l"></i><i class="eye r"></i>' +
  '<b class="leg"></b><b class="leg"></b><b class="leg"></b><b class="leg"></b>';

/**
 * The handover to draw when a step settles: who passed to whom, and whether
 * anything survived the trip.
 *
 * Whether it carried is read off the trace's own finding (the receiving step's
 * ignoredInput), never recomputed here. This is the one number the desk exists
 * to surface, so a second implementation of it would be the worst possible
 * place to have one.
 *
 * Returns null when there is no pair to draw -- a first step has nobody to have
 * received from, and a step with no predecessor result carries nothing anybody
 * could have handed it.
 */
function handoverOf(doc, stepIndex) {
  if (!doc || !doc.steps) return null;
  var to = null, prev = null;
  for (var i = 0; i < doc.steps.length; i++) {
    var s = doc.steps[i];
    if (s.index === stepIndex) { to = s; break; }
    if (s.state === 'done' && s.result) prev = s;
  }
  if (!to || !prev || !to.agent || !prev.agent) return null;
  var carried = true;
  var tsteps = (doc.trace && doc.trace.steps) || [];
  for (var j = 0; j < tsteps.length; j++)
    if (tsteps[j].index === to.index && tsteps[j].ignoredInput) carried = false;
  return { from: prev.agent, to: to.agent, carried: carried };
}

/**
 * One entry per document this agent has work in: { flowId, steps }.
 *
 * Order follows the documents, so the creature that is drawn first is the one in
 * the document that comes first — nothing here sorts by importance, because the
 * desk has no opinion about which of an agent's flows matters more.
 */
function agentInstances(docs, name) {
  var out = [];
  for (var i = 0; i < (docs || []).length; i++) {
    var d = docs[i], n = 0;
    for (var j = 0; j < (d.steps || []).length; j++) if (d.steps[j].agent === name) n += 1;
    if (n) out.push({ flowId: d.id, steps: n });
  }
  return out;
}

/**
 * The step this instance is running right now, or null.
 *
 * Scoped to the instance's own document: an agent running in one flow and idle
 * in another is one creature working and one creature waiting, and drawing both
 * as busy would be the same lie the single cube told.
 */
function agentDoing(docs, name, flowId) {
  for (var i = 0; i < (docs || []).length; i++) {
    var d = docs[i];
    if (flowId && d.id !== flowId) continue;
    for (var j = 0; j < (d.steps || []).length; j++) {
      var s = d.steps[j];
      if (s.agent === name && s.state === 'running') return { doc: d, step: s };
    }
  }
  return null;
}

/** The identity of one creature. Stable across renders, which is what lets it move. */
function creatureKey(name, flowId) { return flowId ? name + '@' + flowId : name; }
`;
