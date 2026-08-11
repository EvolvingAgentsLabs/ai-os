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
export const CREATURES_JS = String.raw`
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
