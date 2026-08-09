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
    const words = (t) => new Set(String(t || '').toLowerCase().match(/[a-z]{4,}/g) || []);
    const out = steps.map((s) => ({ ...s, agent: agentOf(s.intent), attempts: s.attempts || [] }));
    let ignoredCount = 0;
    const settled = out.filter((s) => s.state === 'done' && s.result);
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
    }
    world.notes = world.docs.filter((d) => d.state === 'done').map(noteFor);
  };

  const stateBody = () => {
    recompute();
    const busy = {};
    for (const d of world.docs) {
      for (const s of d.steps) if (s.state === 'running' && agentOf(s.intent)) busy[agentOf(s.intent)] = true;
    }
    return { at: Date.now(), docs: world.docs, agents: world.agents, layout: world.layout, notes: world.notes, busy };
  };

  const findDoc = (id) => world.docs.find((d) => d.id === id);

  const json = (body, status) =>
    new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { 'content-type': 'application/json' },
    });

  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    // Anything not one of the desk's own three endpoints goes to the network,
    // so this shim cannot silently swallow a call somebody adds later.
    if (!/^\/(state|layout|assign|unassign|advance)/.test(url)) return real(input, init);
    const body = init && init.body ? JSON.parse(init.body) : {};

    if (url.indexOf('/state') === 0) return json(stateBody());

    if (url.indexOf('/layout') === 0) {
      world.layout = body.layout;
      return json({ ok: true });
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

  return {
    docs: [
      {
        id: "flow-ledger",
        title: "Ledger currency rewrite",
        goal: "rewrite the ledger so every amount carries its currency",
        state: "waiting",
        updatedAt: 0,
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
        id: "flow-duplicates",
        title: "Duplicate ledger rows",
        goal: "find and report duplicate rows in the ledger",
        state: "draft",
        updatedAt: 0,
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
