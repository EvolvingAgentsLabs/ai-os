/**
 * Cubi — the desk's cube, with eyes.
 *
 * The desk is legible once somebody explains it and opaque before that. The
 * tour ([tour.ts](tour.ts)) solves the *watching* half: it performs the gestures
 * a visitor would not think to try. It cannot solve the other half, which is
 * that a person who touches something is owed an answer about what they just
 * touched, at the moment they touch it, and a caption bar playing a fixed script
 * cannot know what that was.
 *
 * So: a companion that reacts. It is deliberately the 1991 assistant — the
 * paperclip — with the two properties that made the paperclip hated removed.
 *
 * ## It is the cube, not a character bolted on
 *
 * On this desk a cube already means *an agent*, and dropping one on a document
 * already means *give that agent a step*. Cubi is that cube at twice the size
 * with eyes and four legs, in the same amber (`AGENT_COLOR`) and the same 1px
 * black outline as every other cube on the surface. It walks in whole pixels
 * (`steps()` timing, never a smooth ease) because a sprite that glides is from a
 * different decade than the rest of the page.
 *
 * ## Every line it says names its evidence
 *
 * The menu in the panel states *why* each entry is there. Cubi obeys the same
 * rule: a remark carries the fact it came from — "0 attempts in the trace",
 * "carried 0% of 21 distinctive tokens" — and the remark is *selected* by those
 * facts rather than by a timer. This is the whole difference from the paperclip,
 * which interrupted on a rule about what you were typing and knew nothing about
 * your document.
 *
 * The facts are read off the same client state the desk renders from
 * (`window.__DESK__`, kept current by the five-second poll). **Nothing here
 * measures anything.** `trace.ignoredCount`, `digest.attemptsRepresented`,
 * `trace.movement` are computed by ai-flows and restated here in a sentence. A
 * mascot that computed its own numbers would be the second implementation this
 * repository keeps warning about, and it would drift by next week.
 *
 * ## The brain is optional, opt-in, and never the source of a fact
 *
 * Tier 0 — the remarks below — is deterministic, weighs nothing, and works on a
 * phone. It is the default and the fallback.
 *
 * Tier 1 is a 0.4–0.9 GB language model **in the visitor's browser** (WebLLM +
 * WebGPU), downloaded only when somebody presses the button that states the
 * size. Its job is *phrasing and free-form questions*, over a fact sheet built
 * by `cubiFacts` — never retrieval, never arithmetic. A 360M model invents
 * numbers, and the sentence this page exists to make is "answered from the
 * trace, not the goal".
 *
 * Which is why `cubiUngrounded` ships next to it: every answer is checked for
 * digits and agent-shaped names that do not appear in the fact sheet, and the
 * ones that do not are shown as ungrounded, in red, under the answer. It is a
 * five-line instrument and it makes the demo argue its own thesis: you can watch
 * a small model stay grounded, or watch it fail to, on the page.
 *
 * ## Demo only
 *
 * Injected under the same `simulate` gate as the tour, so the product cannot
 * ship a thing that walks around a user's documents or fetches a model from a
 * CDN. A test asserts the unsimulated page contains none of it.
 */

/**
 * The brain, as source text.
 *
 * A string because it runs in the page — but a string that is *executed* by
 * [test/mascot.test.ts](../test/mascot.test.ts) rather than paraphrased by it,
 * so the rules below are covered by tests without existing twice.
 *
 * Three pure functions, no DOM:
 *
 * - `cubiRemarks(state, ctx)` — every remark the current state supports, with
 *   its evidence and a priority. Selection is the caller's.
 * - `cubiFacts(state, docId)` — the fact sheet a model may speak from.
 * - `cubiUngrounded(answer, facts)` — what the model said that the facts do not.
 */
export const BRAIN_JS = String.raw`
/**
 * Everything true about the desk right now that is worth saying out loud.
 *
 * Returns remarks sorted by priority, highest first. Each is
 * { id, pri, tone, en:{say,why}, es:{say,why} }. The caller drops the ones it
 * has said recently and takes the first survivor -- repetition is what made the
 * paperclip a joke.
 *
 * ctx: { event, docId, agentName, seen } where event is one of
 * 'greet' | 'select-doc' | 'select-agent' | 'assign' | 'advance' | 'trace' | 'idle'.
 */
function cubiRemarks(state, ctx) {
  var out = [];
  var c = ctx || {};
  var docs = (state && state.docs) || [];
  var agents = (state && state.agents) || [];
  var doc = null;
  for (var i = 0; i < docs.length; i++) if (docs[i].id === c.docId) doc = docs[i];

  var add = function (id, pri, tone, en, enWhy, es, esWhy) {
    out.push({ id: id, pri: pri, tone: tone, en: { say: en, why: enWhy }, es: { say: es, why: esWhy } });
  };

  if (c.event === 'greet') {
    add('greet', 100, 'idle',
      'I am Cubi — the same cube that means "an agent", with eyes. Click anything and I will tell you what it is.',
      'Everything I say comes off the trace, and the line under it is the fact it came from.',
      'Soy Cubi — el mismo cubo que significa "un agente", con ojos. Tocá cualquier cosa y te digo qué es.',
      'Todo lo que digo sale del trace, y la línea de abajo es el hecho del que salió.');
  }

  if (c.event === 'select-agent' && c.agentName) {
    var a = null;
    for (var j = 0; j < agents.length; j++) if (agents[j].name === c.agentName) a = agents[j];
    if (a && a.missing) {
      add('missing-agent', 96, 'alert',
        a.name + ' is declared in a subagents list with no file behind it. A name is a claim; a file is a fact.',
        'Red cube: declared, no file. It cannot take a step.',
        a.name + ' está declarado en una lista de subagents y no hay archivo detrás. Un nombre es una afirmación; un archivo es un hecho.',
        'Cubo rojo: declarado, sin archivo. No puede tomar un paso.');
    } else if (a) {
      add('agent', 40, 'idle',
        a.name + ' holds ' + ((a.tools || []).length || 'no') + ' tool(s). Drop it on a document to give it a step there.',
        'Tools: ' + ((a.tools || []).join(', ') || 'none declared') + '.',
        a.name + ' tiene ' + ((a.tools || []).length || 'ninguna') + ' herramienta(s). Soltalo sobre un documento para darle un paso ahí.',
        'Herramientas: ' + ((a.tools || []).join(', ') || 'ninguna declarada') + '.');
    }
  }

  if (doc) {
    var trace = doc.trace || { steps: [], ignoredCount: 0, movement: '' };
    var digest = doc.digest || null;
    var steps = doc.steps || [];
    var attempts = 0;
    for (var k = 0; k < steps.length; k++) attempts += ((steps[k].attempts || []).length);

    // The finding the whole trace face exists for: a step that ran, settled, and
    // carried nothing out of the step before it.
    if (trace.ignoredCount > 0) {
      var culprit = null;
      for (var m = 0; m < (trace.steps || []).length; m++)
        if (trace.steps[m].ignoredInput) culprit = trace.steps[m];
      var tok = culprit && culprit.ignoredInput ? culprit.ignoredInput.inputTokens : 0;
      add('ignored', 92, 'alert',
        (culprit ? culprit.agent : 'A step') + ' ran, settled and reported — and carried nothing forward. It is green and it is empty.',
        'Carried 0% of ' + tok + ' distinctive tokens it was handed.',
        (culprit ? culprit.agent : 'Un paso') + ' corrió, cerró y reportó — y no llevó nada adelante. Está en verde y está vacío.',
        'Arrastró 0% de los ' + tok + ' tokens distintivos que recibió.');
    }

    if (String(trace.movement || '').indexOf('drift') === 0) {
      add('drift', 88, 'alert',
        'The same observation twice. That is repetition, not progress — and only the trace can tell them apart.',
        trace.detail || trace.movement,
        'La misma observación dos veces. Eso es repetición, no progreso — y solo el trace los distingue.',
        trace.detail || trace.movement);
    }

    if (attempts === 0) {
      add('never-ran', 84, 'alert',
        'Nothing has run here. What you are reading is the goal — what somebody meant to happen. It reads like an answer and it is not one.',
        '0 attempts across ' + steps.length + ' step(s).',
        'Acá no corrió nada. Lo que estás leyendo es el goal — lo que alguien quiso que pasara. Parece una respuesta y no lo es.',
        '0 intentos en ' + steps.length + ' paso(s).');
    } else {
      var pending = null;
      for (var n = 0; n < steps.length; n++)
        if (!pending && (steps[n].state === 'pending' || steps[n].state === 'running')) pending = steps[n];
      if (pending) {
        add('not-verified', 80, 'warn',
          doc.done + ' of ' + doc.total + ' done, and ' + (pending.agent || 'step ' + pending.index) +
            ' has not run. Nothing has checked this yet.',
          'Step ' + pending.index + ': ' + pending.state + ', ' + ((pending.attempts || []).length) + ' attempt(s).',
          doc.done + ' de ' + doc.total + ' hechos, y ' + (pending.agent || 'el paso ' + pending.index) +
            ' no corrió. Todavía nada verificó esto.',
          'Paso ' + pending.index + ': ' + pending.state + ', ' + ((pending.attempts || []).length) + ' intento(s).');
      } else if (doc.state !== 'done' && doc.state !== 'abandoned') {
        add('unclosed', 76, 'warn',
          'Every step is settled and the flow still says ' + doc.state + '. Nothing has closed it — that costs nothing to fix.',
          doc.done + '/' + doc.total + ' settled, state ' + doc.state + '.',
          'Todos los pasos están cerrados y el flow sigue diciendo ' + doc.state + '. Nada lo cerró — arreglarlo no cuesta nada.',
          doc.done + '/' + doc.total + ' cerrados, estado ' + doc.state + '.');
      }
    }

    if (digest) {
      add('digest', 44, 'idle',
        'That headline is not the last message. It stands for ' + digest.attemptsRepresented + ' attempt(s), and it says so.',
        digest.covering,
        'Ese titular no es el último mensaje. Representa ' + digest.attemptsRepresented + ' intento(s), y lo declara.',
        digest.covering);
    }

    var spends = 0;
    for (var p = 0; p < (doc.actions || []).length; p++) if (doc.actions[p].spends) spends += 1;
    if (spends) {
      add('spends', 36, 'idle',
        spends + ' of the ' + doc.actions.length + ' things offered here spend a model call. The menu says which, before you press.',
        'A surface that spends quietly teaches you to stop counting.',
        spends + ' de las ' + doc.actions.length + ' cosas ofrecidas acá gastan una llamada al modelo. El menú dice cuáles, antes de apretar.',
        'Una superficie que gasta en silencio te enseña a dejar de contar.');
    }
  }

  if (c.event === 'assign') {
    add('assigned', 94, 'ok',
      'Step added — and not run. The strip stayed grey, which is the honest colour for work nobody has done.',
      'A drop writes a step. Running it is a separate press, with a separate cost.',
      'Paso agregado — y no ejecutado. La tira quedó gris, que es el color honesto para trabajo que nadie hizo.',
      'Soltar escribe un paso. Ejecutarlo es otra pulsación, con otro costo.');
  }

  // Below 'ignored' and 'drift' on purpose. Advancing is the press most likely
  // to produce a finding, and "that was a real step" is the least interesting
  // true thing Cubi can say at the exact moment the interesting one appears.
  if (c.event === 'advance') {
    add('advanced', 86, 'ok',
      'That was a real step against the fake core. Watch the strip, not the headline — the headline is a projection.',
      'The demo has no model; the shapes are the product\'s.',
      'Ese fue un paso real contra el core falso. Mirá la tira, no el titular — el titular es una proyección.',
      'La demo no tiene modelo; las formas sí son las del producto.');
  }

  if (c.event === 'trace') {
    add('trace-face', 90, 'idle',
      'Two faces, two questions. State answers where this is. Trace answers what happened — including the step that did nothing.',
      'A panel that answers both at once answers neither.',
      'Dos caras, dos preguntas. State responde dónde está esto. Trace responde qué pasó — incluido el paso que no hizo nada.',
      'Un panel que responde las dos a la vez no responde ninguna.');
  }

  if (c.event === 'idle') {
    add('idle-drag', 24, 'idle',
      'Drag a cube onto a document. That gesture writes a real step — it is the same instruction an agent tree would have written.',
      'Nothing here is a picture of the product.',
      'Arrastrá un cubo sobre un documento. Ese gesto escribe un paso real — la misma instrucción que habría escrito un árbol de agentes.',
      'Nada acá es un dibujo del producto.');
    add('idle-trace', 22, 'idle',
      'Open the Trace face on the ledger flow. There is a step in there that is green and carried nothing.',
      'Green means it settled, not that it helped.',
      'Abrí la cara Trace en el flow del ledger. Hay un paso ahí que está verde y no llevó nada.',
      'Verde significa que cerró, no que sirvió.');
  }

  out.sort(function (x, y) { return y.pri - x.pri; });
  var seen = (c.seen || []);
  var fresh = [];
  for (var q = 0; q < out.length; q++) if (seen.indexOf(out[q].id) < 0) fresh.push(out[q]);
  return { all: out, fresh: fresh };
}

/**
 * What an agent answers when it is asked about itself.
 *
 * Cubi is the desk's own agent, not a narrator standing outside the system: when
 * you click an agent, Cubi walks over and asks, and **the agent answers in its
 * own balloon, in the first person**. That is not a flourish — delegation is the
 * mechanic this whole product is about, and a companion that summarised the
 * others would have been one more surface reading their trace for them.
 *
 * Every line is that agent's own record. The best one it can say is the
 * confession: an agent that ran, settled, and carried nothing forward says so
 * itself, which is a very different thing from a panel saying it about them.
 */
function agentSays(state, name) {
  var docs = (state && state.docs) || [], agents = (state && state.agents) || [];
  var a = null;
  for (var i = 0; i < agents.length; i++) if (agents[i].name === name) a = agents[i];
  if (!a) return null;
  var clip = function (s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  var pack = function (tone, en, enWhy, es, esWhy) {
    return { id: 'agent:' + name, tone: tone, who: name,
      en: { say: en, why: enWhy }, es: { say: es, why: esWhy } };
  };

  if (a.missing) {
    return pack('alert',
      'There is no file behind me. Somebody wrote my name in a subagents list and stopped there.',
      'declared, no file — I cannot take a step',
      'No hay ningún archivo detrás mío. Alguien escribió mi nombre en una lista de subagents y ahí quedó.',
      'declarado, sin archivo — no puedo tomar un paso');
  }

  var running = null, ignored = null, last = null, attempts = 0, pending = 0, flows = 0;
  for (var d = 0; d < docs.length; d++) {
    var doc = docs[d], mine = 0;
    for (var s = 0; s < (doc.steps || []).length; s++) {
      var st = doc.steps[s];
      if (st.agent !== name) continue;
      mine += 1;
      attempts += (st.attempts || []).length;
      if (st.state === 'running') running = { doc: doc, step: st };
      if (st.state === 'pending') pending += 1;
      if (st.result) last = { doc: doc, step: st };
    }
    if (mine) flows += 1;
    var tsteps = (doc.trace && doc.trace.steps) || [];
    for (var t = 0; t < tsteps.length; t++)
      if (tsteps[t].agent === name && tsteps[t].ignoredInput)
        ignored = { doc: doc, step: tsteps[t] };
  }

  if (running) {
    return pack('ok',
      'I am on step ' + running.step.index + ' of "' + running.doc.title + '" right now.',
      'running · ' + attempts + ' attempt(s) on my record',
      'Estoy en el paso ' + running.step.index + ' de "' + running.doc.title + '" ahora mismo.',
      'corriendo · ' + attempts + ' intento(s) en mi historial');
  }
  if (ignored) {
    var tok = ignored.step.ignoredInput ? ignored.step.ignoredInput.inputTokens : 0;
    return pack('alert',
      'I ran in "' + ignored.doc.title + '" and I answered "' +
        clip(ignored.step.result, 60) + '". The trace says I carried nothing out of the step before mine.',
      'carried 0% of ' + tok + ' distinctive tokens I was handed',
      'Corrí en "' + ignored.doc.title + '" y respondí "' +
        clip(ignored.step.result, 60) + '". El trace dice que no llevé nada del paso anterior al mío.',
      'arrastré 0% de los ' + tok + ' tokens distintivos que recibí');
  }
  if (last) {
    return pack('idle',
      'In "' + last.doc.title + '" I answered: ' + clip(last.step.result, 110),
      attempts + ' attempt(s) across ' + flows + ' document(s)',
      'En "' + last.doc.title + '" respondí: ' + clip(last.step.result, 110),
      attempts + ' intento(s) en ' + flows + ' documento(s)');
  }
  if (pending) {
    return pack('warn',
      'I have work waiting and I have not run. What you can read about me is the goal, not anything I did.',
      pending + ' step(s) pending, 0 attempts',
      'Tengo trabajo esperando y no corrí. Lo que se puede leer de mí es el goal, no algo que haya hecho.',
      pending + ' paso(s) pendientes, 0 intentos');
  }
  return pack('idle',
    'Nothing has asked me for anything. Drop me on a document and I will have a step.',
    'no steps anywhere — that is why I was asleep',
    'Nadie me pidió nada. Soltame sobre un documento y voy a tener un paso.',
    'sin pasos en ningún lado — por eso estaba dormido');
}

/**
 * The fact sheet for one agent, when a model is answering for it.
 *
 * Same contract as the flow's: everything it may say, and the string its answer
 * is checked against. Its own steps only — an agent speaking for the whole desk
 * would be the summariser this design refuses to build.
 */
function cubiAgentFacts(state, name) {
  var docs = (state && state.docs) || [], agents = (state && state.agents) || [];
  var a = null;
  for (var i = 0; i < agents.length; i++) if (agents[i].name === name) a = agents[i];
  if (!a) return 'There is no agent called ' + name + ' on this desk.';
  var clip = function (s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  var L = ['AGENT: ' + a.name];
  L.push('TOOLS: ' + ((a.tools || []).join(', ') || 'none declared'));
  if (a.missing) L.push('FLAG: declared in a subagents list with no file behind it.');
  var any = false;
  for (var d = 0; d < docs.length; d++) {
    var doc = docs[d];
    for (var s = 0; s < (doc.steps || []).length; s++) {
      var st = doc.steps[s];
      if (st.agent !== name) continue;
      any = true;
      L.push('STEP ' + st.index + ' in "' + doc.title + '": ' + st.state + ', ' +
        ((st.attempts || []).length ? (st.attempts || []).length + ' attempt(s)' : 'never attempted') +
        '. ' + (st.result ? 'I answered: ' + clip(st.result, 160) : 'No result recorded.'));
    }
    var tsteps = (doc.trace && doc.trace.steps) || [];
    for (var t = 0; t < tsteps.length; t++)
      if (tsteps[t].agent === name && tsteps[t].ignoredInput)
        L.push('FLAG: step ' + tsteps[t].index + ' carried 0% of the ' +
          tsteps[t].ignoredInput.inputTokens + ' distinctive tokens it was handed.');
  }
  if (!any) L.push('NO STEPS: nothing has asked this agent for anything.');
  return L.join('\n');
}

/**
 * The fact sheet.
 *
 * Everything a model is allowed to speak from, and the string cubiUngrounded
 * checks its answer against. Results are clipped: a 360M model with a small
 * window that is handed three paragraphs answers from the last one.
 */
function cubiFacts(state, docId) {
  var docs = (state && state.docs) || [];
  var doc = null;
  for (var i = 0; i < docs.length; i++) if (docs[i].id === docId) doc = docs[i];
  if (!doc) {
    var names = [];
    for (var n = 0; n < docs.length; n++) names.push(docs[n].title);
    return 'No flow is selected. The desk holds: ' + (names.join('; ') || 'nothing') + '.';
  }
  var clip = function (s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  var L = [];
  L.push('FLOW: ' + doc.title);
  L.push('STATE: ' + doc.state + ', ' + doc.done + ' of ' + doc.total + ' steps done');
  if (doc.digest)
    L.push('DIGEST: ' + doc.digest.headline + ' (' + doc.digest.covering +
      '; stands for ' + doc.digest.attemptsRepresented + ' attempt(s))');
  var steps = doc.steps || [];
  for (var s = 0; s < steps.length; s++) {
    var st = steps[s];
    var att = (st.attempts || []).length;
    L.push('STEP ' + st.index + ' ' + (st.agent || 'unnamed') + ': ' + st.state + ', ' +
      (att ? att + ' attempt(s)' : 'never attempted') + '. ' +
      (st.result ? 'Result: ' + clip(st.result, 180) : 'No result recorded.'));
  }
  var tr = doc.trace || {};
  if (tr.movement) L.push('TRACE: ' + tr.movement + ' — ' + (tr.detail || ''));
  if (tr.ignoredCount)
    L.push('FLAG: ' + tr.ignoredCount + ' step(s) used nothing they were given.');
  return L.join('\n');
}

/**
 * What the answer says that the facts do not.
 *
 * Two token classes, chosen because they are the two a small model invents while
 * sounding certain: **digit runs** (counts, percentages, step numbers) and
 * **agent-shaped names** (an internal capital -- ReviewAgent, DataQualityAgent).
 * A capitalised word at the start of a sentence is not one, which is why the
 * pattern demands the second capital.
 *
 * Absence is judged case-insensitively against the whole fact sheet. This is a
 * grounding check, not a fact checker: it cannot catch a wrong claim built out
 * of words that are all present. It catches the invented ones, which is the
 * failure that matters at 360M parameters.
 */
function cubiUngrounded(answer, facts) {
  var hay = String(facts || '').toLowerCase();
  var seen = {};
  var out = [];
  var take = function (tok) {
    var key = tok.toLowerCase();
    if (seen[key]) return;
    seen[key] = 1;
    if (hay.indexOf(key) < 0) out.push(tok);
  };
  var text = String(answer || '');
  var nums = text.match(/\d+(?:[.,]\d+)?/g) || [];
  for (var i = 0; i < nums.length; i++) take(nums[i]);
  var ids = text.match(/[A-Z][a-z]+[A-Z][A-Za-z]*/g) || [];
  for (var j = 0; j < ids.length; j++) take(ids[j]);
  return out;
}
`;

/**
 * Cubi's chrome.
 *
 * Kept out of `DESK_CSS` for the same reason the tour's is: the product's
 * stylesheet must not have to know a mascot exists.
 *
 * Two rules worth defending. **Motion is in `steps()`** — a sprite on this page
 * moves in discrete frames or it belongs to another decade. And **the walking
 * region is fenced** off the shelf, the rail and the drawer, because a companion
 * that stands on the control you are reaching for is the paperclip again.
 */
export const MASCOT_CSS = `
/* Cubi is not a character standing next to the agents: it is the same creature
   ([creatures.ts](creatures.ts)) at --u:2, in the same amber, blinking with the
   same keyframes and watching the pointer through the same code. The only thing
   this file styles is where it stands and the double outline that says which one
   of them speaks for the system. */
.cubi{position:fixed;z-index:390;pointer-events:auto;cursor:pointer;
  transition:left .55s steps(14),top .55s steps(14)}
.cubi .crt{--u:2;outline:1px solid #000;outline-offset:2px}
.cubi.sitting .crt .leg{display:none}
/* Alert: the outline goes to the colour a missing agent is drawn in, so the
   warning is in the palette the reader already learned. */
.cubi.alert .crt{animation:cubialert .28s steps(1,end) 6}
@keyframes cubialert{from{box-shadow:0 0 0 2px #b03a2e}to{box-shadow:none}}

/* The balloon. A window, because on this desk every bounded thing is one. */
.cubisay{position:fixed;z-index:391;width:288px;max-width:calc(100vw - 28px);
  background:var(--paper);border:1px solid #000;box-shadow:3px 3px 0 rgba(0,0,0,.4);
  padding:8px 10px 9px;display:none;font-size:12px;line-height:1.45}
.cubisay.on{display:block}
.cubisay .hd{display:flex;align-items:center;gap:6px;margin:-8px -10px 6px;padding:3px 7px;
  border-bottom:1px solid #000;
  background-image:repeating-linear-gradient(180deg,rgba(0,0,0,.42) 0 1px,transparent 1px 3px)}
.cubisay .hd b{font-size:11px;background:var(--face);padding:1px 8px}
.cubisay .hd .sp{margin-left:auto}
.cubisay .hd button{font:inherit;font-size:10px;padding:0 5px;line-height:15px}
.cubisay .say{margin:0}
/* The evidence line, styled like the menu's: dim, under a rule, no label. It
   carried the word "from" until the greeting read "from Every line I say…" —
   a prefix that only fits noun phrases fits none of them. */
.cubisay .why{margin:5px 0 0;font-size:11px;color:var(--dim);border-top:1px dotted #b9b4a8;padding-top:4px}
.cubisay.alert .say{color:#7d2419}
/* The tail, in two triangles: black edge, then face one pixel inside it. It
   tracks the sprite through --tail rather than sitting at a fixed offset,
   because the balloon moves to wherever it covers least and the sprite does
   not move with it. */
.cubisay::after,.cubisay::before{content:"";position:absolute;bottom:-9px;
  left:var(--tail,22px);border:9px solid transparent;border-top-color:#000;border-bottom:0}
.cubisay::after{bottom:-8px;border-top-color:var(--paper)}
.cubisay.under::after,.cubisay.under::before{bottom:auto;top:-9px;
  border:9px solid transparent;border-bottom-color:#000;border-top:0}
.cubisay.under::after{top:-8px;border-bottom-color:var(--paper)}
/* Beside the sprite there is no honest tail to draw. */
.cubisay.notail::after,.cubisay.notail::before{display:none}

/* The agent's own balloon. Narrower and plainer than Cubi's, because it is not
   the system talking: it is one agent answering for itself, and the difference
   should be visible before either of them is read. */
.crtsay{position:fixed;z-index:389;width:252px;max-width:calc(100vw - 28px);
  background:var(--paper);border:1px solid #000;box-shadow:3px 3px 0 rgba(0,0,0,.4);
  padding:7px 9px 8px;display:none;font-size:11px;line-height:1.42}
.crtsay.on{display:block}
.crtsay .who{font:700 10px/1 var(--mono);letter-spacing:.04em;color:#3b3f44;
  margin:0 0 4px;text-transform:uppercase}
.crtsay .said{margin:0}
.crtsay .why{margin:5px 0 0;font-size:10px;color:var(--dim);border-top:1px dotted #b9b4a8;padding-top:4px}
.crtsay.alert{border-left:4px solid #b03a2e}
.crtsay.alert .said{color:#7d2419}
.crtsay .ans{margin-top:6px;font-size:11px;white-space:pre-wrap;border-top:1px solid #cfcbc2;padding-top:5px}
.crtsay .ung{margin-top:5px;font-size:10px;color:#7d2419;border:1px solid #b03a2e;padding:3px 5px}
.crtsay .src{margin-top:5px;font-size:10px;color:var(--dim)}
.crtsay details pre{margin:4px 0 0;font-family:var(--mono);font-size:10px;white-space:pre-wrap;
  max-height:110px;overflow:auto;background:#fff;border:1px solid #cfcbc2;padding:4px}

/* The brain: everything about it states its price before it is pressed, which is
   the rule the action menu lives under. */
.cubisay .brain{margin:7px -10px -9px;padding:7px 10px;border-top:1px solid #000;background:#efece5}
.cubisay .brain .cost{font-size:11px;color:var(--dim)}
.cubisay .brain button{font:inherit;font-size:11px;padding:2px 9px}
.cubisay .brain .row{display:flex;gap:5px;margin-top:5px}
.cubisay .brain input{flex:1 1 auto;min-width:0;font:inherit;font-size:11px;padding:2px 5px;
  border:1px solid #000;background:#fff}
.cubisay .brain .bar{height:9px;border:1px solid #000;background:#fff;margin-top:5px}
.cubisay .brain .bar i{display:block;height:100%;background:var(--cubi,#e0a020);
  background-image:repeating-linear-gradient(90deg,rgba(0,0,0,.18) 0 2px,transparent 2px 4px)}
.cubisay .brain .ans{margin-top:6px;font-size:11px;white-space:pre-wrap}
.cubisay .brain .ung{margin-top:5px;font-size:10px;color:#7d2419;border:1px solid #b03a2e;padding:3px 5px}
.cubisay .brain .src{margin-top:5px;font-size:10px;color:var(--dim)}
.cubisay .brain details pre{margin:4px 0 0;font-family:var(--mono);font-size:10px;
  white-space:pre-wrap;max-height:120px;overflow:auto;background:#fff;border:1px solid #cfcbc2;padding:4px}

@media (prefers-reduced-motion: reduce){
  .cubi{transition:none}
  .cubi.alert .crt{animation:none}
}
/* Under 720px the rail and the drawer already own the screen. Cubi keeps its
   corner and stops walking to things it would cover. */
@media (max-width:720px){ .cubisay{width:calc(100vw - 28px)} }
`;

/**
 * The model ladder.
 *
 * Sizes are `vram_required_MB` from WebLLM's own `prebuiltAppConfig`, not
 * estimates, because the number is shown to the visitor before they agree to
 * spend it [read: mlc-ai/web-llm src/config.ts].
 *
 * Spanish forces the middle rung: SmolLM2 is an English model, and a mascot that
 * answers Spanish in English is worse than one that stays quiet. Chosen at press
 * time rather than at load, so switching language before waking picks correctly.
 */
export const BRAIN_LADDER = [
  {
    id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    label: "SmolLM2 360M",
    mb: 376,
    english: true,
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 0.5B",
    mb: 945,
    english: false,
  },
] as const;

/** Where WebLLM comes from. The only external request this page can ever make. */
const WEBLLM_CDN = "https://esm.run/@mlc-ai/web-llm";

/**
 * Cubi, in the page.
 *
 * Holds no facts of its own: it observes the desk the way the tour drives it —
 * through the real DOM and the real client state — and asks `cubiRemarks` what
 * is worth saying. The brain block is inert until pressed.
 */
export const MASCOT_JS = String.raw`
(() => {
${BRAIN_JS}

  const S = window.__DESK__;
  const wrap = document.createElement('div');
  wrap.className = 'cubi';
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', "Cubi, the desk's agent cube");
  wrap.innerHTML = '<span class="crt" style="--c:#e0a020">' + (window.__CRT__ || '') + '</span>';
  document.body.appendChild(wrap);

  const bubble = document.createElement('div');
  bubble.className = 'cubisay';
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  document.body.appendChild(bubble);

  // The agent's balloon: one on the page, moved to whoever is answering.
  const theirs = document.createElement('div');
  theirs.className = 'crtsay';
  theirs.setAttribute('role', 'status');
  document.body.appendChild(theirs);

  let talkingTo = null;   // the agent Cubi is currently asking
  let lang = (navigator.language || 'en').slice(0, 2) === 'es' ? 'es' : 'en';
  let seen = [];          // remark ids already said, so Cubi does not repeat itself
  let here = { x: 0, y: 0 };
  let sitting = null;     // the id of the document being sat on, if any
  let brain = null;       // the engine, once somebody pays for it
  let brainMeta = null;
  let lastRemark = null;
  let idleTimer = null;

  // ---- where Cubi may stand -------------------------------------------------
  // The shelf owns the left 150px, the rail the right 318, the drawer the bottom
  // 150. Standing on any of them is the behaviour that made the paperclip hated.
  const fence = () => ({
    x0: 164, y0: 56,
    x1: Math.max(200, window.innerWidth - 348),
    y1: Math.max(120, window.innerHeight - 196),
  });

  const place = (x, y) => {
    const f = fence();
    here = { x: Math.min(Math.max(x, f.x0), f.x1), y: Math.min(Math.max(y, f.y0), f.y1) };
    wrap.style.left = here.x + 'px';
    wrap.style.top = here.y + 'px';
    if (bubble.classList.contains('on')) placeBubble();
  };

  /**
   * Put the balloon where it covers least.
   *
   * The first version picked above-or-below and clipped to the viewport, and it
   * spent most of its life sitting squarely on the document next to the one it
   * was talking about -- which is the paperclip's actual sin, restated. So all
   * four sides are scored against what they would hide, and the winner is the
   * one that hides the least: documents cost their overlapped area, the rail and
   * the drawer cost four times theirs, because those are controls.
   */
  const placeBubble = () => {
    const r = wrap.getBoundingClientRect();
    const bw = bubble.offsetWidth || 288;
    const bh = bubble.offsetHeight || 120;
    const W = window.innerWidth, H = window.innerHeight;
    const over = (a, b) =>
      Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const docs = [...document.querySelectorAll('.docnode')].map((d) => {
      const q = d.getBoundingClientRect();
      return { x: q.left, y: q.top, w: q.width, h: q.height };
    });
    // The two regions that are controls rather than content.
    const chrome = [
      { x: W - 322, y: 40, w: 322, h: H - 40 },        // the rail
      { x: 0, y: H - 158, w: W, h: 158 },              // the memory drawer
    ];
    // Four beside the sprite, and one in the clear band under the documents.
    // The fifth exists because a cube sitting between two documents has nowhere
    // near it that does not cover one of them, and the honest answer there is to
    // step away and drop the tail rather than to pick the least-bad overlap.
    let docsBottom = 0;
    for (const d of docs) docsBottom = Math.max(docsBottom, d.y + d.h);
    const cands = [
      { x: r.left - 18, y: r.top - bh - 10, cls: '' },
      { x: r.left - 18, y: r.bottom + 10, cls: 'under' },
      { x: r.left - bw - 12, y: r.top - 8, cls: 'notail' },
      { x: r.right + 12, y: r.top - 8, cls: 'notail' },
      { x: r.left - 18, y: docsBottom + 16, cls: 'notail' },
    ];
    // Clamped into the free band rather than into the viewport. Clamping to the
    // window put every candidate half on the rail, the scores then compared two
    // bad places, and the balloon picked the less bad one -- which is how a
    // balloon ends up on the memory drawer with a working chooser above it.
    const maxX = Math.max(8, W - 330 - bw);
    const maxY = Math.max(44, H - 166 - bh);
    let best = null;
    for (const c of cands) {
      const x = Math.min(Math.max(c.x, 8), maxX);
      const y = Math.min(Math.max(c.y, 44), maxY);
      const box = { x: x, y: y, w: bw, h: bh };
      let cost = Math.abs(x - c.x) + Math.abs(y - c.y);   // being shoved is a cost
      for (const d of docs) cost += over(box, d);
      for (const ch of chrome) cost += 4 * over(box, ch);
      if (!best || cost < best.cost) best = { x: x, y: y, cls: c.cls, cost: cost };
    }
    bubble.classList.toggle('under', best.cls === 'under');
    bubble.classList.toggle('notail', best.cls === 'notail');
    bubble.style.left = best.x + 'px';
    bubble.style.top = best.y + 'px';
    // The tail points at the sprite, wherever the balloon ended up.
    const tail = Math.min(Math.max(r.left + 4 - best.x, 8), bw - 26);
    bubble.style.setProperty('--tail', tail + 'px');
  };

  const body = () => wrap.querySelector('.crt');

  const walkTo = (x, y) => {
    body().classList.add('walking');
    place(x, y);
    clearTimeout(walkTo._t);
    walkTo._t = setTimeout(() => body().classList.remove('walking'), 580);
  };

  /**
   * Sit on a document's title bar: the cube's resting place on this desk.
   *
   * Held by id rather than by element. The desk rebuilds every document node on
   * each five-second poll, so a stored node is detached within seconds and a
   * mascot that tracked one would follow a document that is no longer there.
   */
  const sitOn = (id) => {
    const el = document.querySelector('.docnode[data-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    sitting = id;
    const r = el.getBoundingClientRect();
    wrap.classList.add('sitting');
    walkTo(r.left + r.width - 34, r.top - 27);
  };

  // ---- speaking -------------------------------------------------------------
  const brainBlock = () => {
    if (brain) {
      return '<div class="brain"><div class="cost">' +
        (lang === 'es'
          ? 'Cerebro despierto: <b>' + brainMeta.label + '</b>, en esta pestaña. Redacta; los hechos siguen saliendo del trace.'
          : 'Brain awake: <b>' + brainMeta.label + '</b>, in this tab. It phrases; the facts still come from the trace.') +
        '</div><div class="row"><input id="cubiq" placeholder="' +
        (lang === 'es' ? 'Preguntale a Cubi sobre este flow…' : 'Ask Cubi about this flow…') +
        '"><button id="cubigo">' + (lang === 'es' ? 'Preguntar' : 'Ask') + '</button></div>' +
        '<div class="ans" id="cubians"></div></div>';
    }
    if (!navigator.gpu) {
      return '<div class="brain"><div class="cost">' +
        (lang === 'es'
          ? 'Este navegador no tiene WebGPU, así que no hay cerebro que despertar. Lo de arriba no lo necesita: sale del trace.'
          : 'This browser has no WebGPU, so there is no brain to wake. What is above never needed one — it comes from the trace.') +
        '</div></div>';
    }
    const pick = pickModel();
    return '<div class="brain"><div class="cost">' +
      (lang === 'es'
        ? 'Puedo hablar libre con <b>' + pick.label + '</b> corriendo en tu navegador. Descarga <b>' + pick.mb +
          ' MB</b> — el único pedido externo que hace esta página. Redacta sobre los hechos; no los inventa, y lo que invente te lo marco.'
        : 'I can speak freely with <b>' + pick.label + '</b> running in your browser. That downloads <b>' + pick.mb +
          ' MB</b> — the only external request this page ever makes. It phrases the facts; anything it invents, I flag.') +
      '</div><div class="row"><button id="cubiwake">' +
      (lang === 'es' ? 'Despertar el cerebro' : 'Wake a brain') + '</button></div>' +
      '<div id="cubiprog"></div></div>';
  };

  const say = (remark, opts) => {
    if (!remark) return;
    lastRemark = remark;
    const t = remark[lang] || remark.en;
    bubble.classList.toggle('alert', remark.tone === 'alert');
    bubble.innerHTML =
      '<div class="hd"><b>Cubi</b><span class="sp"></span>' +
      '<button id="cubilang" title="' + (lang === 'es' ? 'Switch to English' : 'Cambiar a español') + '">' +
      (lang === 'es' ? 'EN' : 'ES') + '</button>' +
      '<button id="cubix" aria-label="close">✕</button></div>' +
      '<p class="say"></p><p class="why"></p>' + ((opts && opts.quiet) ? '' : brainBlock());
    bubble.querySelector('.say').textContent = t.say;
    bubble.querySelector('.why').textContent = t.why;
    bubble.classList.add('on');
    placeBubble();
    if (remark.tone === 'alert') {
      wrap.classList.add('alert');
      setTimeout(() => wrap.classList.remove('alert'), 1800);
    }
    // It looks at whoever it is talking to while it talks.
    body().classList.add('busy');
    setTimeout(() => body().classList.remove('busy'), 700);
    if (seen.indexOf(remark.id) < 0) seen.push(remark.id);
    // A companion that never forgets has nothing left to say by the third
    // minute. Forget the oldest half once it has said eight things.
    if (seen.length > 8) seen = seen.slice(4);
    wire();
  };

  const hush = () => {
    bubble.classList.remove('on');
    theirs.classList.remove('on');
    talkingTo = null;
  };

  /**
   * Cubi walks over and asks; the agent answers for itself.
   *
   * The two balloons are deliberately different objects. Cubi says what it did
   * — "I asked X" — and X says what X did, in the first person, out of its own
   * record. A single balloon summarising both would have made Cubi a narrator
   * of other agents, which is the thing this desk is trying not to build.
   */
  const askAgent = (name) => {
    const el = document.querySelector('.acube:not(.merging)[data-id="' + CSS.escape(name) + '"]');
    if (!el) return;
    talkingTo = name;
    const r = el.getBoundingClientRect();
    walkTo(r.left - 46, r.top - 10);
    const line = agentSays(S, name);
    setTimeout(() => {
      if (talkingTo !== name || !line) return;
      const t = line[lang] || line.en;
      theirs.className = 'crtsay on' + (line.tone === 'alert' ? ' alert' : '');
      theirs.innerHTML = '<p class="who"></p><p class="said"></p><p class="why"></p>';
      theirs.querySelector('.who').textContent = name +
        (lang === 'es' ? ' responde' : ' answers');
      theirs.querySelector('.said').textContent = t.say;
      theirs.querySelector('.why').textContent = t.why;
      placeTheirs(el);
    }, 620);
  };

  const placeTheirs = (el) => {
    const r = el.getBoundingClientRect();
    const w = theirs.offsetWidth || 252, h = theirs.offsetHeight || 80;
    const x = Math.min(Math.max(r.left + 24, 8), Math.max(8, window.innerWidth - 330 - w));
    const y = Math.min(Math.max(r.bottom + 10, 44), Math.max(44, window.innerHeight - 166 - h));
    theirs.style.left = x + 'px';
    theirs.style.top = y + 'px';
  };

  /**
   * React to something that happened.
   *
   * The remark is chosen by the state, not by the event alone: the same click on
   * two different documents says two different things, which is the property the
   * caption bar could not have.
   */
  const react = (event, extra) => {
    if (window.__TOUR__ && window.__TOUR__.running) return; // one voice at a time
    const ctx = Object.assign({ event: event, seen: seen }, extra || {});
    const r = cubiRemarks(S, ctx);
    say(r.fresh[0] || r.all[0]);
  };

  /**
   * Speak about an advance when the desk actually knows how it went.
   *
   * The first version waited 1.2 seconds, which was a guess, and the guess was
   * wrong twice over: the fake core takes 1.6s to answer and the client only
   * re-reads state on its five-second poll. So Cubi announced "that was a real
   * step" over a flow that had not finished the step, and the finding the whole
   * demo exists to show -- a green step that carried nothing -- was still one
   * poll in the future. Found by pressing the button, not by reading this.
   *
   * So it watches the state it is going to speak from, and speaks when that
   * changes. The signature is over what the desk already computed; nothing here
   * measures anything. Nine seconds is the giving-up point, and it says the
   * generic thing then rather than going silent.
   */
  const sigOf = (docId) => {
    for (const d of (S.docs || [])) {
      if (d.id !== docId) continue;
      return d.done + '/' + d.total + ':' + ((d.trace || {}).ignoredCount || 0) + ':' +
        (d.steps || []).map((s) => s.state + ((s.attempts || []).length)).join(',');
    }
    return '';
  };

  const running = (docId) => {
    for (const d of (S.docs || []))
      if (d.id === docId) return (d.steps || []).some((s) => s.state === 'running');
    return false;
  };

  const reactWhenSettled = (docId) => {
    const before = sigOf(docId);
    let waited = 0;
    const tick = () => {
      waited += 400;
      // Changed *and* nothing left running. The first change after a press is
      // the step entering the running state, which is news the strip already
      // carries; speaking there is speaking one poll before the result exists.
      if ((sigOf(docId) !== before && !running(docId)) || waited >= 9000) {
        react('advance', { docId: docId });
        return;
      }
      setTimeout(tick, 400);
    };
    setTimeout(tick, 400);
  };

  const wire = () => {
    const x = bubble.querySelector('#cubix');
    if (x) x.onclick = hush;
    const lg = bubble.querySelector('#cubilang');
    if (lg) lg.onclick = () => { lang = lang === 'es' ? 'en' : 'es'; say(lastRemark); };
    const wake = bubble.querySelector('#cubiwake');
    if (wake) wake.onclick = wakeBrain;
    const go = bubble.querySelector('#cubigo');
    const q = bubble.querySelector('#cubiq');
    if (go && q) {
      go.onclick = () => ask(q.value);
      q.onkeydown = (e) => { if (e.key === 'Enter') ask(q.value); };
    }
  };

  // ---- the optional brain ---------------------------------------------------
  const LADDER = ${JSON.stringify(BRAIN_LADDER)};

  /**
   * Which rung.
   *
   * Spanish takes the 945 MB rung because the 376 MB one is English-only. In
   * English, a coarse pointer or four gigabytes of reported memory takes the
   * small one -- a phone that starts a 945 MB download finishes it by killing
   * the tab.
   */
  const pickModel = () => {
    if (lang === 'es') return LADDER[1];
    const mem = navigator.deviceMemory || 8;
    const coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
    return (coarse || mem <= 4) ? LADDER[0] : LADDER[1];
  };

  const wakeBrain = async () => {
    const pick = pickModel();
    const prog = bubble.querySelector('#cubiprog');
    const btn = bubble.querySelector('#cubiwake');
    if (btn) btn.disabled = true;
    body().classList.add('busy');
    const show = (pct, text) => {
      if (!prog) return;
      prog.innerHTML = '<div class="bar"><i style="width:' + Math.round(pct * 100) + '%"></i></div>' +
        '<div class="cost" id="cubipl"></div>';
      const pl = prog.querySelector('#cubipl');
      if (pl) pl.textContent = text;
    };
    show(0, (lang === 'es' ? 'Trayendo ' : 'Fetching ') + pick.label + '…');
    try {
      const webllm = await import('${WEBLLM_CDN}');
      brain = await webllm.CreateMLCEngine(pick.id, {
        initProgressCallback: (r) => show(r.progress || 0, r.text || ''),
      });
      brainMeta = pick;
      body().classList.remove('busy');
      say(lastRemark);
    } catch (e) {
      brain = null;
      body().classList.remove('busy');
      if (prog) prog.innerHTML = '<div class="cost">' +
        (lang === 'es' ? 'No se pudo cargar el modelo: ' : 'The model would not load: ') +
        String(e && e.message || e) + '</div>';
      if (btn) btn.disabled = false;
    }
  };

  /**
   * Ask the brain.
   *
   * The facts are assembled here and the model is told, twice, that it may not
   * add to them. It will anyway -- so the answer is checked against the sheet it
   * was given and what is missing is printed under it, in red. That check is the
   * point of putting a 360M model on this page at all: the demo's own claim is
   * that answers come from the trace, and this is the version of that claim you
   * can watch fail.
   */
  const ask = async (question) => {
    question = String(question || '').trim();
    if (!question || !brain) return;
    const out = bubble.querySelector('#cubians');
    const docId = sitting || (S.docs[0] && S.docs[0].id);
    const facts = cubiFacts(S, docId);
    out.textContent = lang === 'es' ? 'Pensando…' : 'Thinking…';
    body().classList.add('busy');
    const sys = lang === 'es'
      ? 'Sos Cubi, un cubo que vive en un escritorio de agentes. Respondé en español, en dos oraciones como mucho. ' +
        'Usá SOLO los HECHOS de abajo. No inventes números, nombres ni resultados. Si el dato no está en los HECHOS, ' +
        'decí que no lo podés ver.\n\nHECHOS:\n' + facts
      : 'You are Cubi, a cube that lives on a desk of agents. Answer in at most two sentences. ' +
        'Use ONLY the FACTS below. Never invent numbers, names or results. If it is not in the FACTS, ' +
        'say you cannot see it.\n\nFACTS:\n' + facts;
    try {
      const r = await brain.chat.completions.create({
        messages: [{ role: 'system', content: sys }, { role: 'user', content: question }],
        temperature: 0.2, max_tokens: 140,
      });
      const text = ((r.choices && r.choices[0] && r.choices[0].message.content) || '').trim();
      const bad = cubiUngrounded(text, facts + ' ' + question);
      out.innerHTML = '';
      const p = document.createElement('div');
      p.textContent = text;
      out.appendChild(p);
      if (bad.length) {
        const w = document.createElement('div');
        w.className = 'ung';
        w.textContent = (lang === 'es'
          ? 'Sin respaldo en el trace: ' : 'Not in the trace it was given: ') + bad.join(', ');
        out.appendChild(w);
      }
      const src = document.createElement('div');
      src.className = 'src';
      src.innerHTML = '<details><summary>' +
        (lang === 'es' ? 'los hechos que recibió' : 'the facts it was handed') +
        '</summary><pre></pre></details>';
      src.querySelector('pre').textContent = facts;
      out.appendChild(src);
    } catch (e) {
      out.textContent = (lang === 'es' ? 'Se cayó: ' : 'It fell over: ') + String(e && e.message || e);
    }
    body().classList.remove('busy');
  };

  // ---- watching the desk ----------------------------------------------------
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (bubble.classList.contains('on')) return;   // it is already saying something
      react('idle');
    }, 24000);
  };

  let downAt = null;
  window.addEventListener('pointerup', (ev) => {
    if (!ev.isTrusted || !downAt) return;
    const d = downAt; downAt = null;
    if (Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) > 6) return; // a drag
    react('select-agent', { agentName: d.name });
    askAgent(d.name);
  });

  document.addEventListener('pointerdown', (ev) => {
    if (!ev.isTrusted) return;                       // the tour drives itself; let it
    armIdle();
    if (bubble.contains(ev.target) || wrap.contains(ev.target)) return;
    // The agent first, then the document under it. Every creature with work is
    // standing *inside* a document, so asking about the document first meant an
    // agent on a desk could never be clicked as an agent -- the one gesture the
    // whole conversation depends on. Found by clicking ReviewAgent and being
    // told about the ledger flow.
    //
    // A cube is answered on release, not on press: pressing one is how a drag
    // starts, and a companion that starts talking about an agent the moment you
    // pick it up is talking over the gesture it is meant to explain.
    const cube = ev.target.closest && ev.target.closest('.acube');
    if (cube) { downAt = { x: ev.clientX, y: ev.clientY, name: cube.dataset.id }; return; }
    const doc = ev.target.closest && ev.target.closest('.docnode');
    if (doc) {
      talkingTo = null; theirs.classList.remove('on');
      sitOn(doc.dataset.id);
      setTimeout(() => react('select-doc', { docId: doc.dataset.id }), 420);
      return;
    }
    if (ev.target.id === 'tab-trace' && sitting) {
      setTimeout(() => react('trace', { docId: sitting }), 60);
    }
  }, true);

  // The desk's own voice. Every write the client makes announces itself in the
  // toast, so watching it is how Cubi learns a step was added or advanced
  // without reaching inside the client's state machine.
  const toast = document.getElementById('toast');
  if (toast) new MutationObserver(() => {
    const t = toast.textContent || '';
    if (!toast.style.display || toast.style.display === 'none') return;
    const docId = sitting;
    if (/^Step \d+ added/.test(t)) react('assign', { docId: docId });
    else if (/^Step /.test(t) || /^Advanced/.test(t)) reactWhenSettled(docId);
  }).observe(toast, { childList: true, characterData: true, subtree: true });

  wrap.addEventListener('click', () => {
    if (bubble.classList.contains('on')) { hush(); return; }
    react(sitting ? 'select-doc' : 'greet', { docId: sitting });
  });

  const follow = () => { if (sitting) sitOn(sitting); else placeBubble(); };
  window.addEventListener('resize', follow);
  const scroller = document.querySelector('.desk');
  if (scroller) scroller.addEventListener('scroll', follow, { passive: true });

  const f = fence();
  place(f.x1 - 40, f.y1 - 40);
  armIdle();
  setTimeout(() => react('greet'), 1400);
})();
`;
