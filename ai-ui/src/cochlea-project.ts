/**
 * The cochlea project in mid-development — memory, a falsification, and work in flight.
 *
 * ## What this adds to the scope that was already there
 *
 * [`cochlea-demo.ts`](cochlea-demo.ts) shows two chains, both green, one wrong,
 * separated by a gate. That is an argument about a **result**.
 *
 * This file is the argument about a **project**: what the desk looks like while
 * one is being built rather than at the moment one is judged. Three flows, and
 * each is a different thing a research project actually does.
 *
 * 1. **The falsification.** The flow whose output was not a result but a
 *    *decision*. It is `blocked`, it will never be unblocked, and the artefact
 *    it produced — ADR-0002 — is the reason the project has a therapeutic
 *    surface at all. A desk that only shows work succeeding cannot show this.
 * 2. **Work in flight.** GATE-D1, mid-run. Steps done, one running, two pending.
 *    A project is mostly this and almost never the moment it freezes.
 * 3. **Memory over the project's own history.** The memory agents indexing the
 *    decision record, using the product's real `addNote`, `verifyNote` and
 *    `lint` — the same mechanics `group:memory-lab` runs, pointed at a corpus
 *    that has something `memory-lab`'s does not: **a time axis**.
 *
 * ## The finding, and why it is one level up from `memory-lab`
 *
 * `memory-lab`'s defect is mechanical. A note claims 663 characters of a passage
 * that is 1,105, so following its range lands on different words, and
 * `verifyNote` catches it because a range either matches or does not.
 *
 * The defect here passes **every** mechanical check. `n-adr-0001` records
 * ADR-0001 accurately: the range matches the text, the hash is of what was read,
 * it sits inside the window, it has keywords and ideas, its summary does not
 * repeat its title. `verifyNote` returns clean. `lint` returns clean. A reader
 * asking the index *"how does the place code work"* gets a correct summary of a
 * decision **that was reversed three days later**.
 *
 * Nothing about the note is wrong. What is wrong is that a corpus of decisions
 * is not a pile of facts — the later ones overrule the earlier ones, and an
 * index that flattens that is confidently out of date.
 *
 * So the check is not a stricter `verifyNote`. It is a different question:
 *
 *     a note whose source declares itself superseded must link to a note
 *     covering the document that superseded it
 *
 * The superseding fact lives in the **source** — ADR-0001's own status line says
 * so — never in the note, because a note that had to declare its own staleness
 * would be a note that already knew. That is the whole point of the failure:
 * the writer got everything it could see right.
 *
 * ## It is the product's rule now, not this file's
 *
 * The first version of this scope carried its own implementation, because
 * `ai-flows` had no check for it. That is the wrong place for a finding: a demo
 * with a private instrument is a demo measuring itself.
 *
 * So `lint` in [`wiki.ts`](../../ai-flows/src/wiki.ts) gained the rule, the fact
 * travels on `Provenance.supersededBy`, and this file now **filters the
 * product's output** rather than computing anything. The scope's argument is
 * unchanged and its history is the interesting part: the index passed every
 * check the product had, and the product acquired one.
 *
 * `test/cochlea-project.test.ts` asserts it in both directions. Give the note
 * its link and the check goes green; that is what makes the red one a
 * measurement rather than a decoration.
 */
import {
  type Note,
  type Wiki,
  addNote,
  emptyWiki,
  lint,
  shortHash,
  verifyNote,
} from "../../ai-flows/src/wiki.ts";

/** The same window `memory-lab` runs under. A local model's context. */
const BUDGET = 8000;

const SOURCE_DIR = "projects/coclea-sr/decisions/";

/**
 * The project's real decision record.
 *
 * Titles, order and supersession are the repository's, not invented — the point
 * of indexing this corpus rather than a fictional one is that its time axis is
 * real. `chars` are approximate document sizes; they set the windows and the
 * shard splits, and nothing downstream reads them as a claim about a file.
 */
const DECISIONS: Array<{
  id: string;
  file: string;
  title: string;
  summary: string;
  ideas: string[];
  keywords: string[];
  chars: number;
  /** The file that overruled this one, from **this** document's status line. */
  supersededBy?: string;
}> = [
  {
    id: "n-adr-0001",
    file: `${SOURCE_DIR}0001-the-place-code-needs-a-term-the-spec-absorbs.md`,
    title: "The place code needs a term the specification absorbs",
    summary:
      "A spring to ground gives each position its own characteristic frequency, which the specification's string equation alone does not provide.",
    ideas: [
      "The bare string has no per-position characteristic frequency",
      "A ground term supplies one",
      "The coupling length is the parameter, not the transverse wavenumber",
    ],
    keywords: ["place code", "ground spring", "coupling", "characteristic frequency"],
    chars: 5200,
    supersededBy: `${SOURCE_DIR}0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md`,
  },
  {
    id: "n-adr-0002",
    file: `${SOURCE_DIR}0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md`,
    title: "The place code needs fluid coupling, not a ground spring",
    summary:
      "For a string the membrane impedance sits in the numerator of the local wavenumber, so the wave is blocked where the membrane is stiff — which is where it must enter.",
    ideas: [
      "The measured response fell twenty-eight orders of magnitude before the characteristic place",
      "Fluid coupling puts the impedance in the denominator",
      "The acceptance condition was registered before the replacement was built",
    ],
    keywords: ["transmission line", "traveling wave", "impedance", "falsification"],
    chars: 7400,
  },
  {
    id: "n-adr-0003",
    file: `${SOURCE_DIR}0003-the-noise-and-the-place-code-sit-on-different-operators.md`,
    title: "The noise and the place code sit on different operators",
    summary:
      "The stochastic layer runs on the string while the place map comes from the transmission line, so the spatial modulation is mode shapes rather than a place code.",
    ideas: [
      "Two operators, and the interesting question spans both",
      "Reciprocity is the route: one solve per frequency, not one per source",
      "The route is named and deliberately not built",
    ],
    keywords: ["operators", "reciprocity", "spatial modulation", "stopping condition"],
    chars: 6100,
  },
  {
    id: "n-adr-0004",
    file: `${SOURCE_DIR}0004-the-narrowed-model-three-ingredients.md`,
    title: "The narrowed model — three ingredients",
    summary:
      "Fourier decomposition, stochastic resonance and a variable-mass string with one free end, and nothing else until those hold.",
    ideas: ["Narrow before deepening", "Each ingredient has a gate before it has a feature"],
    keywords: ["scope", "narrowing", "ingredients"],
    chars: 4300,
  },
  {
    id: "n-adr-0005",
    file: `${SOURCE_DIR}0005-the-calibration-engine-and-the-frequency-prediction.md`,
    title: "The calibration engine and the frequency prediction",
    summary:
      "A compression curve is measurable in a patient and constrains the one parameter that sets where the useful noise level sits.",
    ideas: [
      "mu_H is not measurable; the drive at which response compresses is",
      "Per-region calibration is a per-site question, so mu is per-site",
    ],
    keywords: ["calibration", "compression", "per-site", "prediction"],
    chars: 6800,
  },
  {
    id: "n-adr-0006",
    file: `${SOURCE_DIR}0006-pathology-as-a-parameter-transform.md`,
    title: "Pathology is a parameter transform, and the healthy point is a posit",
    summary:
      "A pathology transforms parameters the model already has and introduces nothing, so a lesion is literally the diff against a healthy cochlea.",
    ideas: [
      "No new term, no new equation, no fitted constant",
      "The null control is free and is checked",
      "mu_H = -0.02 for a healthy cochlea has no derivation and is marked as a posit",
    ],
    keywords: ["pathology", "parameter transform", "posit", "null control"],
    chars: 7900,
  },
];

/** Where each decision starts in the concatenated corpus. Real offsets. */
function offsets(): number[] {
  const out: number[] = [];
  let at = 0;
  for (const d of DECISIONS) {
    out.push(at);
    at += d.chars;
  }
  return out;
}

/**
 * Build the index with the product's own mechanics.
 *
 * `linkSupersession` is the switch the test turns. `false` is what a competent
 * writer produces from one window: every note correct about what it read. `true`
 * is what it produces once it is told the corpus has an order.
 */
export function buildDecisionWiki(linkSupersession: boolean): { wiki: Wiki; notes: Note[] } {
  let wiki = emptyWiki();
  const notes: Note[] = [];
  const starts = offsets();

  DECISIONS.forEach((d, i) => {
    const successor = d.supersededBy
      ? DECISIONS.find((x) => x.file === d.supersededBy)
      : undefined;
    const note: Note = {
      id: d.id,
      title: d.title,
      summary: d.summary,
      ideas: d.ideas,
      keywords: d.keywords,
      chars: d.chars,
      hash: shortHash(`${d.title}${d.chars}`),
      // `clause`, not a new `decision` unit. An ADR is a normative document and
      // `clause` is what `wiki.ts` already offers for one. Widening the
      // product's union so a demo could use a nicer word would be the demo
      // changing the product to describe itself.
      unit: "clause",
      state: "complete",
      source: {
        file: d.file,
        from: starts[i]!,
        to: starts[i]! + d.chars,
        // Read from the document's own status line, never asserted by the
        // writer. `wiki.ts` explains why that distinction is the whole thing.
        ...(d.supersededBy ? { supersededBy: d.supersededBy } : {}),
      },
      // Empty by default, and that is the finding rather than an oversight: a
      // writer shown one document has nothing to link to.
      links: linkSupersession && successor ? [successor.id] : [],
    };
    wiki = addNote(wiki, note, BUDGET);
    notes.push(note);
  });

  return { wiki, notes };
}

/**
 * The complaints `lint` makes about this index — now including supersession.
 *
 * This used to be a local implementation, because the product had no check for
 * it. It does now: `wiki.ts`'s `lint` gained the rule and its two tests, and the
 * fact travels on `Provenance.supersededBy`, read from the source document.
 *
 * So this is a filter over the product's own output rather than a second
 * instrument. Keeping a private copy would have been the demo measuring itself.
 */
export function supersededWithoutSuccessor(wiki: Wiki): string[] {
  return lint(wiki).filter((p) => p.includes("superseded by"));
}

interface Step {
  index: number;
  state: string;
  agent: string;
  intent: string;
  result: string | null;
  attempts: Array<Record<string, unknown>>;
  contribution?: { carried: number; inputTokens: number; note?: string };
}

/**
 * One attempt, in the shape the desk actually reads.
 *
 * `{ n, state, runId, error, digest, source }` — not an invented `{ id,
 * startedAt, finishedAt }`. The first version of this helper used the latter and
 * the trace rendered **"attempt undefined · no run"** under every step, because
 * `desk.ts` reads `a.n` and `a.runId` and neither existed.
 *
 * Nothing failed. The build passed, the typecheck passed, the tests passed, and
 * the page showed a field with the word `undefined` in it. A demo whose data
 * does not match the product's shape is the demo lying about the product, which
 * is the one thing it may not do — and the only instrument that caught it was
 * looking at the screen.
 */
function attempt(state: string, digest: string | null, runId: string, error: string | null) {
  return [
    {
      n: 1,
      state,
      runId,
      error,
      ...(digest ? { digest, source: "gate.report" } : {}),
    },
  ];
}

function flowOf(
  id: string,
  title: string,
  goal: string,
  state: string,
  updatedAt: number,
  steps: Step[],
): Record<string, unknown> {
  return {
    id,
    title,
    goal,
    state,
    updatedAt,
    done: steps.filter((s) => s.state === "done").length,
    total: steps.length,
    steps,
  };
}

/**
 * The flow whose output was a decision.
 *
 * It is `blocked` and it stays blocked. The project did not fix this flow; it
 * wrote down why it could not be fixed and specified a different operator. A
 * desk that renders that as an unfinished task has misread the most valuable
 * thing in the project's history.
 */
function falsificationFlow(at: number): Record<string, unknown> {
  const said = [
    {
      agent: "CONSTRUCTOR",
      intent: 'agent="CONSTRUCTOR" assemble the graded string with the ground term',
      result:
        "Assembled the graded string with the ADR-0001 ground term at coupling 0.02. " +
        "Symmetric, mass positive definite, spectrum ordered — every structural gate green.",
      state: "done",
      digest: "constru001",
      note: "the structural gates cannot see an operator that is the wrong shape",
    },
    {
      agent: "EXPLORADOR",
      intent: 'agent="EXPLORADOR" drive at 5 kHz and report the envelope at the characteristic place',
      result:
        "Driven at 5 kHz, |U| falls monotonically from 0.99 at the base. At the place the " +
        "same model tunes to 5 kHz it is 1e-28 of the drive. The wave never arrives.",
      state: "done",
      digest: "explora028",
      note: "twenty-eight orders of magnitude — the number that ended the operator",
    },
    {
      agent: "VERIFICADOR-MATH",
      intent: 'agent="VERIFICADOR-MATH" run the traveling-wave orientation gate',
      result:
        "GATE-C02 RED at every frequency. Propagating apical to the characteristic place and " +
        "evanescent basal to it — the cochlear orientation, inverted. For a string the membrane " +
        "impedance is in the numerator of k^2, so the wave is blocked where the membrane is stiff.",
      state: "failed",
      digest: "verific002",
      note: "gate C02 discriminates, and FAILED — this is the falsification, not a bug",
    },
    {
      agent: "SINTETIZADOR",
      intent: 'agent="SINTETIZADOR" record the falsification and specify the replacement',
      result:
        "Wrote ADR-0002. Counted the redesigns: three in one session, each moving the instrument " +
        "closer to the answer it wanted. Stopped at the third. Registered the acceptance condition " +
        "for the replacement — correct orientation and the right frequency-to-place relation — " +
        "BEFORE anything was built.",
      state: "done",
      digest: "sintet0002",
      note: "the flow's artefact is a decision; there is no result to freeze and that is correct",
    },
  ];

  const steps: Step[] = said.map((s, i) => ({
    index: i,
    state: s.state,
    agent: s.agent,
    intent: s.intent,
    result: s.result,
    attempts: attempt(
      s.state === "failed" ? "failed" : "done",
      s.digest,
      `run-falsified-${i}`,
      s.state === "failed" ? "GATE-C02: the traveling wave runs the wrong way" : null,
    ),
    contribution: { carried: 1, inputTokens: 2000, note: s.note },
  }));

  return flowOf(
    "flow-place-code-falsified",
    "Place code — graded string with a ground term",
    "give every position its own characteristic frequency, and check the wave reaches it",
    "blocked",
    at - 72 * 3600_000,
    steps,
  );
}

/** GATE-D1, in flight. Two done, one running, two pending. */
function pathologyFlow(at: number): Record<string, unknown> {
  const said: Array<{ agent: string; intent: string; result: string | null; state: string; digest: string | null; note?: string }> = [
    {
      agent: "CONSTRUCTOR",
      intent: 'agent="CONSTRUCTOR" express each pathology as a transform of existing parameters',
      result:
        "Seven lesions in pathology.py. Every field defaults to no change, so Lesion() IS a healthy " +
        "cochlea and a lesion is the diff. No new term, no new equation, no fitted constant.",
      state: "done",
      digest: "pathol0007",
      note: "the null control falls out of the shape rather than being added to it",
    },
    {
      agent: "VERIFICADOR-STAT",
      intent: 'agent="VERIFICADOR-STAT" check that a lesion changing nothing changes nothing',
      result:
        "Null control green: Lesion() reproduces the reference signature with delta 0.0 in every " +
        "component. Without this, any difference in the catalogue could be solver drift.",
      state: "done",
      digest: "nullctl000",
      note: "gate D1 control — this is what makes 'these signatures differ' mean anything",
    },
    {
      agent: "VERIFICADOR-MATH",
      intent: 'agent="VERIFICADOR-MATH" measure the seven signatures and count the distinct ones',
      result: null,
      state: "running",
      digest: null,
      note: "in flight — the answer is not known while this is being looked at, which is the usual case",
    },
    {
      agent: "LITERATURA",
      intent: 'agent="LITERATURA" confront the catalogue with the clinical picture',
      result: null,
      state: "pending",
      digest: null,
    },
    {
      agent: "AUDITOR",
      intent: 'agent="AUDITOR" check every §13 number traces to a gate report',
      result: null,
      state: "pending",
      digest: null,
    },
  ];

  const steps: Step[] = said.map((s, i) => ({
    index: i,
    state: s.state,
    agent: s.agent,
    intent: s.intent,
    result: s.result,
    attempts:
      s.state === "pending" ? [] : attempt(s.state, s.digest, `run-pathology-${i}`, null),
    ...(s.note ? { contribution: { carried: 1, inputTokens: 2000, note: s.note } } : {}),
  }));

  return flowOf(
    "flow-pathology-signatures",
    "GATE-D1 — does the model tell pathologies apart?",
    "seven lesions, and the claim that each enters on a different parameter",
    "waiting",
    at - 9 * 60_000,
    steps,
  );
}

/**
 * The memory agents over the project's own decisions.
 *
 * Green end to end, `lint` clean, every note verified — and the index is wrong
 * about the project. See this file's header for why that is the argument.
 */
function decisionIndexFlow(at: number): Record<string, unknown> {
  const { wiki, notes } = buildDecisionWiki(false);
  const complaints = supersededWithoutSuccessor(wiki);
  const otherIssues = lint(wiki).filter((p) => !p.includes("superseded by"));

  const steps: Step[] = notes.map((n, i) => {
    const window = { text: "x".repeat(n.chars), from: n.source.from };
    const bad = verifyNote(n, window);
    return {
      index: i,
      state: "done",
      agent: "INDEXER",
      intent: `agent="INDEXER" index ${n.source.file.split("/").pop()}`,
      result:
        `Wrote ${n.id}: "${n.title}". ${n.chars} chars at ${n.source.from}-${n.source.to}, ` +
        `hash ${n.hash}. verifyNote: ${bad.length ? bad.join("; ") : "clean"}.`,
      attempts: attempt("done", `index${String(i).padStart(5, "0")}`, `run-index-${i}`, null),
      contribution: {
        carried: 1,
        inputTokens: 2000,
        note: bad.length
          ? `mechanically wrong: ${bad[0]}`
          : "every mechanical check clean — which is exactly the problem with one of these",
      },
    };
  });

  steps.push({
    index: steps.length,
    state: "done",
    agent: "COVERAGE-AUDITOR",
    intent: 'agent="COVERAGE-AUDITOR" lint the index and ask what a reader would be told',
    result:
      `Every note verified; ${otherIssues.length ? otherIssues.join("; ") : "no mechanical fault"}. ` +
      `${wiki.shards.length} shard(s), ${notes.length} note(s), all verified. ` +
      (complaints.length
        ? `But the corpus has an order: ${complaints[0]}`
        : "Supersession check clean."),
    attempts: attempt("done", "coverage001", "run-index-coverage", null),
    contribution: {
      carried: 1,
      inputTokens: 2000,
      note:
        "verifyNote is clean on every note; the finding comes from the rule that " +
        "knows the corpus has a time axis — which the product gained because this " +
        "scope needed it",
    },
  });

  return flowOf(
    "flow-index-decisions",
    "Index the project's own decision record",
    "make six ADRs navigable from one small window, and find out what that costs",
    "done",
    at - 3 * 3600_000,
    steps,
  );
}

/** The three flows this file adds to `group:cochlea-lab`. */
export function cochleaProjectFlows(at: number) {
  return [falsificationFlow(at), pathologyFlow(at), decisionIndexFlow(at)];
}

/** Exported for the test, which is where the check is proved able to go red. */
export const DECISION_COUNT = DECISIONS.length;
