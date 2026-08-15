/**
 * The desk, running with nothing behind it.
 *
 * The website should let someone *use* the OS rather than read about it, and a
 * static page cannot reach a core, a flow API or a database. The obvious way to
 * get one is to build a mock-up of the desk. That is the wrong way, and the
 * reason is the failure mode this repository keeps finding: **a demo that is a
 * separate implementation stops being true within a week**, quietly, while
 * continuing to look right.
 *
 * So the demo is the real thing. `renderDeskHtml` ships one client, and that
 * client touches the network in exactly three places — `GET /state`,
 * `PUT /layout`, `POST /assign|/unassign|/advance`. This module replaces
 * `window.fetch` with an in-page implementation of those three, and changes
 * nothing else. Every drag, every stack, the panel, the trace face, the memory
 * drawer and the five-second poll are the code that runs against Postgres.
 *
 * **If the desk breaks, the demo breaks.** That is the property worth having,
 * and it is why this is a fetch shim rather than a mock-up.
 *
 * ## What is simulated, and what that costs
 *
 * The fake core answers a step with a canned reply after a short delay, so
 * "advance" produces movement without a model. That is the one place the demo
 * lies, and the page says so on its own chrome rather than in a caption.
 *
 * The traces it produces are real in shape and fabricated in content: digests
 * are stable strings rather than hashes of real output. A visitor watching
 * `drift — repeating itself` appear is seeing the true instrument reading
 * invented data.
 */

/** Scenario the demo starts from. Chosen to contain the findings worth seeing. */
export interface SimulatedWorld {
  scopeId: string;
  docs: unknown[];
  agents: unknown[];
  notes: unknown[];
}

/**
 * The shim, as source text.
 *
 * A string rather than a module because it must run inside the page ahead of the
 * desk client, in a file with no build step and no external requests — the same
 * constraint the desk itself lives under.
 */
export const SIMULATION_JS = String.raw`
(() => {
  // The whole backend, in memory. Shapes match the real API exactly; where they
  // drift, the demo lies about the product, which is the one thing it may not do.
  const S = window.__DESK__;

  /**
   * Which scope this page is showing.
   *
   * The demo is one static file and the scope selector navigates rather than
   * fetches, so every scope's starting world is embedded and the shim picks one
   * by query string. Anything else would mean the second scope is a second page,
   * which is a second copy of the desk, which is the thing this file exists to
   * refuse.
   */
  const worlds = window.__WORLDS__ || {};
  const wanted = new URLSearchParams(location.search).get('scope');
  if (wanted && worlds[wanted]) {
    const w = worlds[wanted];
    S.scopeId = wanted;
    S.docs = w.docs; S.agents = w.agents; S.layout = w.layout; S.notes = w.notes || [];
    // The living documents belong to the scope too. Without this every scope
    // listed the first one's -- a panel about a project you are not looking at,
    // asserting "read-only" about it with total confidence. Found by switching
    // scope and reading the panel.
    if (w.channels) S.channels = w.channels;
    const sel = document.getElementById('scope');
    if (sel) sel.value = wanted;
    // By id. Counting spans found the banner instead and wrote the new counts
    // beside the old ones, so the chrome stated two different sizes for one desk.
    const count = document.getElementById('counts');
    if (count) count.textContent =
      S.docs.length + ' document(s) · ' + S.agents.length + ' agent(s) · ' +
      (count.textContent.match(/(\d+) person/) || [0, '0'])[1] + ' person(s)';
  }

  const world = {
    docs: JSON.parse(JSON.stringify(S.docs)),
    agents: JSON.parse(JSON.stringify(S.agents)),
    notes: JSON.parse(JSON.stringify(S.notes || [])),
    layout: JSON.parse(JSON.stringify(S.layout)),
  };

  const agentOf = (intent) => {
    const m = /agent="([^"]+)"/.exec(intent);
    return m ? m[1] : null;
  };

  // Canned replies, so advancing produces movement without a model. Keyed by
  // agent because a reply that ignores which agent produced it cannot show the
  // one finding worth showing -- a step that carried nothing forward.
  const REPLIES = {
    SchemaAgent:
      'The ledger table needs a currency column, decimal precision twelve scale two, ' +
      'backfilled from settlement records and indexed alongside merchant identifier.',
    MigrationAgent:
      'Rewrote /root/workspace/ledger.txt to ledger_with_currency.txt. Every amount ' +
      'now carries its USD prefix; column spacing preserved exactly.',
    ReviewAgent:
      "Looks fine to me.",
    DataQualityAgent:
      'Scanned 4,182 rows. Found 3 duplicate pairs sharing a settlement id, all on 2025-01-05.',
    LedgerLead:
      'Split the goal and routed each piece. Schema first, then migration, then review.',
    // The signal lab. PeakAgent is left pending on the broken chain so the
    // answer arrives while somebody is watching: confident, precise, and about
    // a spectrum that is entirely zeros.
    PeakAgent: 'Strongest component: bin 0 (0.0 Hz), magnitude 0.00.',
    QuantiseAgent: 'Converted 64 samples to fixed point at 0.5 counts per unit. Range respected, nothing clipped.',
    ChainLead: 'Split the measurement chain and routed each stage in order.',
  };

  const digestFor = (agent, n) => (agent || 'step').toLowerCase().slice(0, 8) + '00' + n;

  // The real instruments live in ai-flows and cannot be imported into a static
  // page. These are the same RULES, restated: below two observations say so, a
  // repeat is drift, otherwise progressing. Kept tiny on purpose -- the demo
  // must not become a second implementation of the measurement.
  const traceOf = (steps) => {
    const digests = [];
    for (const s of steps) for (const a of (s.attempts || [])) if (a.digest) digests.push(a.digest);
    let movement = 'not enough to say', tone = 'muted';
    let detail = digests.length + ' observation(s)';
    if (digests.length >= 2) {
      detail = digests.length + ' observations · δ ≤ 14.6%';
      const repeats = digests.some((d, i) => i > 0 && d === digests[i - 1]);
      movement = repeats ? 'drift — repeating itself' : 'progressing';
      tone = repeats ? 'warn' : 'ok';
    }
    // "Used nothing it was given": the distinctive words of the previous result
    // that appear in this one. Same shape as contribution.ts, same threshold.
    //
    // And the same precedence as trace.ts: a step whose runner measured its own
    // handoff is not handed to the word counter at all. Without this clause the
    // shim silently un-flagged every measured step on the first poll -- the
    // signal lab's broken stage was flagged in the page the server rendered and
    // unflagged five seconds later, which is exactly the drift this file exists
    // to make impossible. Found by reading the client's state, not the code.
    const words = (t) => new Set(String(t || '').toLowerCase().match(/[a-z]{4,}/g) || []);
    const out = steps.map((s) => ({ ...s, agent: agentOf(s.intent), attempts: s.attempts || [] }));
    let ignoredCount = 0;
    for (const s of out) {
      if (!s.contribution) continue;
      if (s.contribution.carried === 0) {
        s.ignoredInput = {
          carried: 0,
          inputTokens: s.contribution.inputTokens,
          note: s.contribution.note,
        };
        ignoredCount += 1;
      }
    }
    const settled = out.filter((s) => s.state === 'done' && s.result && !s.contribution);
    for (let i = 1; i < settled.length; i += 1) {
      const prior = words(settled[i - 1].result);
      if (prior.size < 12) continue;
      const mine = words(settled[i].result);
      const carried = [...prior].filter((w) => mine.has(w)).length / prior.size;
      if (carried === 0) {
        settled[i].ignoredInput = { carried: 0, inputTokens: prior.size };
        ignoredCount += 1;
      }
    }
    return { movement, movementTone: tone, detail, steps: out, ignoredCount };
  };

  const noteFor = (doc) => {
    const carried = doc.trace.steps.filter((s) => !s.ignoredInput && s.result);
    return {
      id: 'note-' + doc.id,
      level: 'flow',
      title: doc.title,
      body:
        'Goal: ' + doc.goal + '\n\n' +
        carried.map((s) => (s.agent || 'step') + ': ' + String(s.result).slice(0, 160)).join('\n') +
        (carried.length < doc.trace.steps.length
          ? '\n\n(' + (doc.trace.steps.length - carried.length) + ' step(s) carried nothing forward and were dropped.)'
          : ''),
      from: [doc.id],
    };
  };

  const recompute = () => {
    for (const d of world.docs) {
      d.trace = traceOf(d.steps);
      d.done = d.steps.filter((s) => s.state === 'done').length;
      d.total = d.steps.length;
      if (d.total && d.done === d.total && d.state !== 'done') d.state = 'waiting';

      // The digest and the menu were built by the real modules at build time
      // (scripts/build-demo.ts). They are NOT recomputed here, and a second
      // in-page implementation of them is exactly what this file exists to
      // avoid -- the demo is the real client, not a second product.
      //
      // So when the state they describe moves, they are dropped rather than
      // shown stale. That is projection.ts's rule applied literally: a
      // projection is shown against the state it describes, or it is not shown.
      // The panel renders without them, which is the degradation the desk is
      // designed to survive anyway.
      const sig = d.state + ':' + d.steps.map((s) => s.index + s.state).join(',');
      if (d._sig === undefined) d._sig = sig;
      else if (d._sig !== sig) { d._sig = sig; d.digest = null; d.actions = []; }
    }
    world.notes = world.docs.filter((d) => d.state === 'done').map(noteFor);
  };

  const stateBody = () => {
    recompute();
    const busy = {};
    for (const d of world.docs) {
      for (const s of d.steps) if (s.state === 'running' && agentOf(s.intent)) busy[agentOf(s.intent)] = true;
    }
    // Every step carries the agent its intent names, because that is what the
    // server sends (server.ts: agent: agentOfIntent(s.intent)). The shim only
    // did it inside the trace, so a step added by dropping a cube arrived with
    // no agent on it -- and the desk, which now draws one creature per document
    // an agent has work in, drew nothing for a step that plainly had an owner.
    // A shim whose shapes drift from the API is the demo lying about the
    // product, which is the one thing this file may not do.
    const docs = world.docs.map((d) => ({
      ...d,
      steps: d.steps.map((s) => ({ ...s, agent: s.agent || agentOf(s.intent) })),
    }));
    return { at: Date.now(), docs: docs, agents: world.agents, layout: world.layout, notes: world.notes, busy };
  };

  const findDoc = (id) => world.docs.find((d) => d.id === id);

  const json = (body, status) =>
    new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { 'content-type': 'application/json' },
    });

  /**
   * The checks this fabricated world has a green report for.
   *
   * Inside the shim rather than in the module, because the shim ships as a
   * string and runs in a page with no build step -- a module-scope constant is
   * simply not in scope there. The seeded gated flow names one gate that is
   * **not** in this set, and desk.test.ts executes this shim and asserts that
   * the halt names exactly that one, so the two cannot drift apart unnoticed.
   */
  const GREEN_GATES = new Set(['A01', 'A08', 'A12']);

  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    // Anything not one of the desk's own three endpoints goes to the network,
    // so this shim cannot silently swallow a call somebody adds later.
    if (!/^\/(state|layout|project|flow|assign|unassign|advance|fork|ask)/.test(url)) return real(input, init);
    const body = init && init.body ? JSON.parse(init.body) : {};

    if (url.indexOf('/state') === 0) return json(stateBody());

    if (url.indexOf('/layout') === 0) {
      world.layout = body.layout;
      return json({ ok: true });
    }

    if (url.indexOf('/project') === 0) {
      // Starting a project, in the page.
      //
      // The new scope is added to the selector and to the embedded worlds, and
      // it is **empty** -- no documents, no agents. That is what the real route
      // returns, and a mock that handed back a furnished project would teach
      // that starting one gives you something to look at.
      var pname = (body.name || '').trim();
      if (!pname) return json({ error: 'a project needs a name' }, 400);
      if (!body.actorId && !body.ownerId) return json({ error: 'ownerId is required — a project records who it belongs to' }, 400);
      var slug = pname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
      var pid = 'p' + (Object.keys(worlds).length + 1);
      var newScope = 'group:' + slug + '-' + pid;
      worlds[newScope] = { docs: [], agents: [], layout: { scopeId: newScope, docs: {}, cubes: {} }, notes: [] };
      const sel = document.getElementById('scope');
      if (sel) {
        const opt = document.createElement('option');
        opt.value = newScope; opt.textContent = newScope;
        sel.appendChild(opt);
      }
      return json({ ok: true, id: pid, name: pname, scopeId: newScope });
    }

    if (url.indexOf('/flow') === 0) {
      // Creating a document, in the page.
      //
      // Implemented here and not only against a server for the reason the
      // whole demo exists: if the desk grows a gesture the simulated backend
      // does not have, the demo ships a button that works in production and
      // throws in the browser -- and it looks right until somebody presses it.
      // The FlowsClient interface declares createFlow so the compiler asks for
      // this implementation too, rather than leaving it to be remembered.
      if (!body.scopeId || !body.title || !body.goal) {
        return json({ error: 'scopeId, title and goal are required' }, 400);
      }
      if (!body.actorId) {
        return json({ error: 'actorId is required — a flow records the principal it acts for' }, 400);
      }
      // A counter, not a hash of the title: two documents may legitimately
      // share a name, and an id derived from the name would silently collide.
      var id = 'flow-new-' + (world.docs.length + 1);
      if (body.shape === 'gated' && !(body.requiredGates && body.requiredGates.length)) {
        return json({ error: 'a gated flow requires a non-empty requiredGates array of names' }, 400);
      }
      world.docs.push({
        id: id,
        title: body.title,
        goal: body.goal,
        shape: body.shape === 'gated' ? 'gated' : 'open',
        requiredGates: body.shape === 'gated' ? body.requiredGates.slice() : null,
        // draft, not waiting: nothing is queued yet, and a document that claims
        // to be waiting for work nobody assigned is the kind of picture that
        // renders cleanly and is wrong.
        state: 'draft',
        updatedAt: DEMO_AT,
        done: 0,
        total: 0,
        steps: [],
      });
      return json({ ok: true, flowId: id, title: body.title });
    }

    if (url.indexOf('/assign') === 0) {
      const doc = findDoc(body.flowId);
      const agent = world.agents.find((a) => a.name === body.agent);
      if (!doc) return json({ error: 'no such flow in this scope' }, 404);
      if (!agent || agent.missing) return json({ error: 'no agent file for "' + body.agent + '"' }, 400);
      const index = doc.steps.reduce((m, s) => Math.max(m, s.index + 1), 0);
      doc.steps.push({
        index,
        state: 'pending',
        intent: 'Call your delegate tool with agent="' + body.agent + '". The task: ' + doc.goal,
        result: null,
        attempts: [],
      });
      if (doc.state === 'done') doc.state = 'waiting';
      return json({ ok: true, stepIndex: index, flowTitle: doc.title });
    }

    if (url.indexOf('/unassign') === 0) {
      const doc = findDoc(body.flowId);
      if (!doc) return json({ error: 'no such flow in this scope' }, 404);
      const mine = doc.steps.filter((s) => agentOf(s.intent) === body.agent);
      if (!mine.length) return json({ ok: true, removed: 0, kept: [], note: 'no step was queued for this agent' });
      const kept = [];
      let removed = 0;
      for (const s of mine) {
        // The rule the product enforces: an attempt is history.
        if (s.state !== 'pending' || (s.attempts || []).length) {
          kept.push('step ' + s.index + ' (' + s.state + ')');
          continue;
        }
        doc.steps.splice(doc.steps.indexOf(s), 1);
        removed += 1;
      }
      return json({
        ok: true,
        removed,
        kept,
        ...(kept.length
          ? { note: kept.join(', ') + ' already started and cannot be removed — an attempt is history' }
          : {}),
      });
    }

    if (url.indexOf('/advance') === 0) {
      const doc = findDoc(body.flowId);
      if (!doc) return json({ error: 'no such flow' }, 404);
      const next = doc.steps.find((s) => s.state === 'pending');
      if (!next) {
        // The gate decides at the completion path and nowhere else -- the same
        // place the real engine checks it. A gated flow whose checks are not all
        // green **refuses to finish**, naming them. The mock carries this
        // because a demo that can only ever succeed teaches the wrong gesture:
        // the desk's own affordance for a held freeze is what is being tested.
        if (doc.shape === 'gated') {
          const missing = (doc.requiredGates || []).filter((g) => !GREEN_GATES.has(g));
          if (missing.length) {
            doc.state = 'blocked';
            return json({
              ok: true,
              outcome: 'halted',
              reason: 'the flow may not freeze — never ran: ' + missing.join(', '),
            });
          }
        }
        doc.state = 'done';
        return json({ ok: true, outcome: 'complete' });
      }
      const agent = agentOf(next.intent);
      next.state = 'running';
      next.attempts = [{ n: 1, state: 'running', runId: 'run-' + next.index + 'a7f3c210', error: null, digest: null, source: null }];
      // A delay, so "running" is a state a person can see rather than a frame.
      setTimeout(() => {
        next.state = 'done';
        next.result = REPLIES[agent] || ('Step ' + next.index + ' completed.');
        next.attempts = [{
          n: 1, state: 'done', runId: 'run-' + next.index + 'a7f3c210', error: null,
          digest: digestFor(agent, next.index), source: 'run.reply',
        }];
        if (doc.steps.every((s) => s.state === 'done')) doc.state = 'waiting';
      }, 1600);
      return json({ ok: true, outcome: 'advanced' });
    }

    if (url.indexOf('/fork') === 0) {
      const doc = findDoc(body.flowId);
      if (!doc) return json({ error: 'no such flow' }, 404);
      const at = Math.max(0, Number(body.atStep) || 0);
      // Copies records, spends nothing, and does not run -- the same contract
      // the real route has. The copy keeps steps 0..at and drops their results,
      // because the fork's history is its own, not its ancestor's.
      const copy = {
        id: doc.id + '-fork-' + (world.docs.length + 1),
        title: doc.title + ' (fork at ' + at + ')',
        goal: doc.goal,
        state: 'draft',
        updatedAt: Date.now(),
        steps: doc.steps.slice(0, at + 1).map((s) => ({
          index: s.index, state: 'pending', intent: s.intent, result: null, attempts: [],
        })),
      };
      world.docs.push(copy);
      world.layout.docs[copy.id] = {
        x: (world.layout.docs[doc.id] || { x: 200 }).x + 40,
        y: (world.layout.docs[doc.id] || { y: 40 }).y + 300,
        pinned: false,
      };
      return json({ ok: true, id: copy.id, title: copy.title });
    }

    if (url.indexOf('/ask') === 0) {
      const doc = findDoc(body.flowId);
      if (!doc) return json({ error: 'no such flow' }, 404);
      // The demo has no model. Rather than fake an answer -- which would teach
      // the reader that this surface can do something it cannot prove here --
      // it says what it would have done and what it would have read.
      const evidence = doc.steps.reduce(
        (n, s) => n + (s.attempts || []).length + (s.result ? 1 : 0), 0);
      return json({
        ok: true,
        spent: false,
        evidence: evidence,
        answer: evidence === 0
          ? 'Nothing has run in this flow, so there is nothing in the trace to answer from.'
          : 'The demo has no model behind it. Against a real core this question would be answered from '
            + evidence + ' piece(s) of recorded evidence -- attempts, errors and observations -- and never '
            + 'from the goal text.',
      });
    }

    return json({ error: 'not found' }, 404);
  };

  recompute();
})();
`;

/**
 * The scenario.
 *
 * Chosen so the two things worth seeing are reachable in a few clicks: a step
 * that carries nothing forward (`ReviewAgent` answers "Looks fine to me."), and
 * an agent declared with no file behind it.
 */
/**
 * The demo's "now".
 *
 * A fixed instant rather than `Date.now()`, so the page is byte-identical on
 * every build and a diff of `demo/index.html` shows what changed rather than
 * when it was generated.
 *
 * It exists because the digest **declares the window it represents**, and the
 * demo's documents used to carry `updatedAt: 0` — which rendered, correctly and
 * uselessly, as "state as of 20370 days ago". A projection that declares a
 * nonsense window is worse than one that declares none: it is the feature
 * demonstrating its own failure.
 */
export const DEMO_AT = 1_760_000_000_000;
const hoursAgo = (h: number) => DEMO_AT - h * 3600_000;

export function demoWorld(): {
  docs: Array<Record<string, unknown>>;
  agents: Array<Record<string, unknown>>;
} {
  const step = (
    index: number,
    agent: string,
    state: string,
    result: string | null,
  ) => ({
    index,
    state,
    agent,
    intent: `Call your \`delegate\` tool with agent="${agent}". The task: rewrite the ledger so every amount carries its currency`,
    result,
    attempts: result
      ? [
          {
            n: 1,
            state: "done",
            runId: `run-${index}a7f3c210`,
            error: null,
            digest: `${agent.toLowerCase().slice(0, 8)}00${index}`,
            source: "run.reply",
          },
        ]
      : [],
  });

  /**
   * The checks this fabricated world has a green report for. `B02` is not here
   * on purpose -- see `flow-coclea-freeze`.
   */
  return {
    docs: [
      {
        id: "flow-ledger",
        title: "Ledger currency rewrite",
        goal: "rewrite the ledger so every amount carries its currency",
        state: "waiting",
        updatedAt: hoursAgo(43),
        done: 2,
        total: 3,
        steps: [
          step(
            0,
            "SchemaAgent",
            "done",
            "The ledger table needs a currency column, decimal precision twelve scale two, backfilled from settlement records and indexed alongside merchant identifier.",
          ),
          step(
            1,
            "MigrationAgent",
            "done",
            "Rewrote /root/workspace/ledger.txt to ledger_with_currency.txt. Every amount now carries its USD prefix; column spacing preserved exactly.",
          ),
          step(2, "ReviewAgent", "pending", null),
        ],
      },
      {
        /**
         * A `gated` flow, and the reason the mock has one.
         *
         * The desk's other documents can only succeed, so the demo teaches a
         * gesture the real system does not have: click advance, watch it go
         * green. A gated flow **refuses to finish** while a check it named is
         * red or has never run, and that refusal is the whole point of the
         * shape. It has to be playable or the affordance is untested.
         *
         * `B02` is deliberately absent from GREEN_GATES: the freeze is held by
         * a check nobody has run yet, which is the ordinary case.
         */
        id: "flow-coclea-freeze",
        title: "Freeze the passive membrane",
        goal: "freeze the eigensolver only once every check it names is green",
        shape: "gated",
        requiredGates: ["A01", "A08", "A12", "B02"],
        state: "waiting",
        updatedAt: hoursAgo(2),
        done: 1,
        total: 1,
        steps: [
          step(
            0,
            "MembraneAgent",
            "done",
            "Ran the gate suite in the project sandbox: 45 checks, 44 green. B02 has no report — it has never been run.",
          ),
        ],
      },
      {
        id: "flow-duplicates",
        title: "Duplicate ledger rows",
        goal: "find and report duplicate rows in the ledger",
        state: "draft",
        updatedAt: hoursAgo(4),
        done: 0,
        total: 1,
        steps: [step(0, "DataQualityAgent", "pending", null)],
      },
    ],
    agents: [
      {
        name: "LedgerLead",
        description:
          "Owns the ledger rewrite. Splits work and routes it to the specialists.",
        tools: ["read", "write", "execute"],
        child: false,
        missing: false,
      },
      {
        name: "SchemaAgent",
        description: "Designs and checks the ledger schema.",
        tools: ["read", "write"],
        child: true,
        missing: false,
      },
      {
        name: "MigrationAgent",
        description: "Writes and dry-runs migrations.",
        tools: ["read", "write", "execute"],
        child: true,
        missing: false,
      },
      {
        name: "ReviewAgent",
        description: "Reviews a change against the ledger invariants.",
        tools: ["read"],
        child: true,
        missing: false,
      },
      {
        name: "DataQualityAgent",
        description: "Checks the ledger for drift and duplicates.",
        tools: ["read", "execute"],
        child: false,
        missing: false,
      },
      {
        name: "AnomalyScanner",
        description: "Declared in a subagents list. No file behind it.",
        tools: [],
        child: true,
        missing: true,
      },
    ],
  };
}
