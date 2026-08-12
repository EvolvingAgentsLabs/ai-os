/**
 * A knowledge base being built, on the desk — the third scope in the demo.
 *
 * ## What this scope is for
 *
 * The other two scopes show a flow *running*. This one shows a flow **reading**:
 * the memory agents turning a heap of material into something a small window can
 * navigate. It is the same desk, the same digest, the same trace and the same
 * "carried nothing forward" flag — pointed at the one job where the material is
 * the problem rather than the work.
 *
 * The project is invented and says so. Nothing here is a customer, and the flows
 * are the shape a real ingest has rather than a recording of one.
 *
 * ## Why the numbers are computed rather than written
 *
 * Every note below goes through `ai-flows`' real `addNote`, so the sharding, the
 * index cards and the budget are the product's, not a drawing of them. The two
 * flows differ in exactly one way and it is the way that matters:
 *
 * - **The index that was built** — every step verified, every note inside the
 *   window, `lint` clean.
 * - **The index that drifted** — one note whose source range does not match the
 *   text it hashed. It looks exactly like the others in the list, because that
 *   is the point: it was written by a model that got the judgement right and the
 *   mechanics wrong, and nothing complained.
 *
 * A person reading the desk should be able to find the second one, and the only
 * thing that makes it findable is that code checked something a reader cannot
 * see. That is the argument this scope exists to make.
 */
import {
  type Note,
  type Wiki,
  addNote,
  emptyWiki,
  lint,
  noteCard,
  progressOf,
  rootMarkdown,
  shortHash,
  verifyNote,
} from "../../ai-flows/src/wiki.ts";

/** A local model's window. The constraint the whole design answers to. */
const BUDGET = 8000;
const SOURCE = "notes/field-notes.md";

/**
 * The invented material: a heap of research notes with the three properties a
 * real draft has — the same idea twice, a fragment that stops, and a claim that
 * contradicts an earlier one.
 */
const UNITS: Array<{
  title: string;
  summary: string;
  ideas: string[];
  keywords: string[];
  chars: number;
  state: Note["state"];
  duplicateOf?: string;
}> = [
  {
    title: "Readings drift after the third hour",
    summary:
      "Sensor output slides by roughly two percent per hour once the enclosure warms, and the slide does not reset overnight.",
    ideas: ["Drift begins around hour three", "It does not reset overnight"],
    keywords: ["drift", "enclosure", "temperature", "overnight"],
    chars: 1240,
    state: "complete",
  },
  {
    title: "The enclosure is the cause, not the sensor",
    summary:
      "Swapping the sensor changed nothing; swapping the enclosure removed the drift entirely.",
    ideas: ["The sensor is not the cause", "The enclosure is"],
    keywords: ["enclosure", "sensor", "swap", "cause"],
    chars: 980,
    state: "complete",
  },
  {
    title: "Drift after three hours (said again, better)",
    summary:
      "Same observation as the earlier note, with the hour and the percentage measured rather than estimated.",
    ideas: ["Drift begins at hour three", "Two percent per hour, measured"],
    keywords: ["drift", "temperature", "measured", "enclosure"],
    chars: 1105,
    state: "repeated",
    duplicateOf: "n0000",
  },
  {
    title: "Calibration procedure — incomplete",
    summary:
      "Steps one through four of the recalibration, and then the note stops mid-sentence.",
    ideas: ["Recalibrate against the reference cell", "Procedure is unfinished"],
    keywords: ["calibration", "reference", "procedure"],
    chars: 640,
    state: "incomplete",
  },
  {
    title: "Overnight reset does happen, sometimes",
    summary:
      "Two runs where the drift was gone by morning, which the first note says never happens.",
    ideas: ["Drift sometimes resets overnight", "Contradicts the first note"],
    keywords: ["drift", "overnight", "reset", "contradiction"],
    chars: 870,
    state: "inconsistent",
  },
];

/** Build the wiki with the product's own mechanics, at real offsets. */
function buildWiki(drift: boolean): { wiki: Wiki; notes: Note[] } {
  let wiki = emptyWiki();
  const notes: Note[] = [];
  let at = 0;
  UNITS.forEach((u, i) => {
    const note: Note = {
      id: `n${String(i).padStart(4, "0")}`,
      title: u.title,
      summary: u.summary,
      ideas: u.ideas,
      keywords: u.keywords,
      chars: u.chars,
      hash: shortHash(`${u.title}${u.chars}`),
      unit: "idea",
      state: u.state,
      // The defect, and it is one number. The note claims to have read less than
      // it hashed, so following the range lands on different words.
      source: {
        file: SOURCE,
        from: at,
        to: drift && i === 2 ? at + Math.round(u.chars * 0.6) : at + u.chars,
      },
      links: [],
      ...(u.duplicateOf ? { duplicateOf: u.duplicateOf } : {}),
    };
    at += u.chars;
    wiki = addNote(wiki, note, BUDGET);
    notes.push(note);
  });
  return { wiki, notes };
}

const SOURCE_CHARS = UNITS.reduce((n, u) => n + u.chars, 0);

/**
 * One indexing flow, with each note as a step.
 *
 * The step's result is what the indexer reported; the `contribution` is what the
 * runner measured about it, which for this job is not word overlap — it is
 * whether the note can be walked back to the source it names. A note that cannot
 * is a note whose evidence is unreachable, and that is exactly a step that
 * carried nothing forward.
 */
function flow(
  id: string,
  title: string,
  drift: boolean,
  updatedAt: number,
  pendingLast: boolean,
) {
  const { wiki, notes } = buildWiki(drift);
  const problems = lint(wiki);
  const progress = progressOf(wiki, SOURCE, SOURCE_CHARS);

  const steps = notes.map((note, index) => {
    const pending = pendingLast && index === notes.length - 1;
    const bad = verifyNote(note, { text: "x".repeat(2000), from: note.source.from });
    const carried = bad.length ? 0 : 1;
    return {
      index,
      state: pending ? "pending" : "done",
      agent: index === 0 ? "Archivist" : "Indexer",
      intent: `Call your \`delegate\` tool with agent="${index === 0 ? "Archivist" : "Indexer"}". The task: index the field notes so a small window can navigate them`,
      result: pending
        ? null
        : `${note.title} — ${note.ideas.length} idea(s), ${note.keywords.length} keyword(s), ${note.chars} chars at ${note.source.from}-${note.source.to}.`,
      attempts: pending
        ? []
        : [
            {
              n: 1,
              state: "done",
              runId: `run-${id}-${index}`,
              error: null,
              digest: note.hash.slice(0, 10),
              source: "run.reply",
            },
          ],
      // The index card is the numbers this step produced, drawn as a shape: how
      // much of the source each note claims. A short bar is a note that read
      // less than it hashed.
      series: pending
        ? undefined
        : notes
            .slice(0, index + 1)
            .map((n) => n.source.to - n.source.from),
      contribution: pending
        ? undefined
        : {
            carried,
            inputTokens: note.chars,
            note: bad.length
              ? `cannot be walked back to its source — ${bad[0]}`
              : `range matches the text it hashed (${note.source.to - note.source.from} chars)`,
          },
    };
  });

  return {
    id,
    title,
    goal: "index the field notes so a small window can navigate them",
    state: "waiting",
    updatedAt,
    done: steps.filter((s) => s.state === "done").length,
    total: steps.length,
    steps,
    // Not rendered by the desk; carried so the tour can quote real figures.
    _kb: {
      shards: wiki.shards.length,
      cards: wiki.shards.flatMap((s) =>
        s.noteIds.map((i) => noteCard(wiki.notes[i]!)),
      ),
      root: rootMarkdown(wiki),
      problems,
      progress,
    },
  };
}

export function memoryAgents() {
  return [
    {
      name: "MemoryKeeper",
      description: "Owns the knowledge base. Routes each decision and writes nothing itself.",
      tools: ["read"],
      child: false,
      missing: false,
    },
    {
      name: "Archivist",
      description: "Decides what the material is and what one unit of it is.",
      tools: ["read"],
      child: true,
      missing: false,
    },
    {
      name: "Indexer",
      description: "Writes one note per unit against the index so far.",
      tools: ["read", "execute"],
      child: true,
      missing: false,
    },
    {
      name: "Reconciler",
      description: "Decides whether two notes are the same idea, and which is canonical.",
      tools: ["read"],
      child: true,
      missing: false,
    },
    {
      name: "Librarian",
      description: "Given a task, decides which notes to open.",
      tools: ["read"],
      child: true,
      missing: false,
    },
    {
      name: "CoverageAuditor",
      description: "Declared in a subagents list. No file behind it.",
      tools: [],
      child: true,
      missing: true,
    },
  ];
}

export function memoryFlows(at: number) {
  return [
    flow("flow-kb-built", "Field notes — the index that was built", false, at - 20 * 3600_000, false),
    flow("flow-kb-drifted", "Field notes — the index that drifted", true, at - 35 * 60_000, true),
  ];
}
