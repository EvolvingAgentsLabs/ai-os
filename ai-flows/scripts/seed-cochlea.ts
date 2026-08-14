/**
 * Seed the cochlea lab as a real project on a running instance, and run it.
 *
 *   cd ai-flows && DATA_DIR=... DATABASE_URL=... \
 *     node --env-file=../ai-base/.env scripts/seed-cochlea.ts
 *
 * This is the arm of `projects/coclea-sr/` that the browser demo simulates: the
 * same eight agents, declared as markdown in a project scope, reasoning over the
 * **actual gate reports** the Python suite produced.
 *
 * ## What is real here and what is not — stated up front
 *
 * **Real:** the project and its scope, the agent files (written through a turn
 * and read back from the store, never trusted to the model's reply), the gate
 * report data, the flow, its steps, and the model calls that advance them.
 *
 * **Not real:** the agents do not *run* pytest. `execute` reaches the sandbox
 * workspace, which is not the checkout `projects/coclea-sr/` lives in, so the
 * numbers are carried in as data rather than produced in-loop. Mounting the
 * project into the sandbox is the next step and is not this script.
 *
 * Saying which half is which matters more than the demo looking complete. A seed
 * that implies the gates ran inside the loop would be claiming the one thing
 * that has not happened yet.
 *
 * ## Why the files are written through a turn
 *
 * `ro-layers.ts` materialises read-only layers only, so a `workspace.write()`
 * into a group scope is visible to the conformation view and **invisible to
 * `delegate`**. `seed-demo.ts` documents the measurement: six files written to
 * the store, two visible in the sandbox. Project files go through a turn; the
 * read-back is what decides whether they landed.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCoreClient } from "../src/core-client.ts";
import { loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";
import { freezeVerdict, parseReports, summarise, type GateReport } from "../src/gates.ts";

const config = loadConfig();
const { projects, workspace } = buildApp({ ...config, port: 0 });
const core = createCoreClient({
  baseUrl: process.env.CORE_API_URL ?? "http://localhost:8080",
  ...(process.env.CORE_SIGNING_SECRET ? { signingSecret: process.env.CORE_SIGNING_SECRET } : {}),
});
const FLOWS = process.env.FLOWS_API_URL ?? "http://localhost:8097";
const OWNER = process.env.SEED_OWNER ?? "matias";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, "..", "..", "projects", "coclea-sr");

type Conv = { kind: "dm" | "group"; threadRef: string; channelRef?: string };

function agentFile(desc: string, tools: string[], subagents: string[], body: string): string {
  return [
    "---",
    `description: ${desc}`,
    `tools: [${tools.join(", ")}]`,
    ...(subagents.length ? [`subagents: [${subagents.join(", ")}]`] : []),
    "---",
    body.trim(),
    "",
  ].join("\n");
}

/** Write one file into a scope through a turn, then read it back from the store. */
async function writeInScope(conv: Conv, scopeId: string, path: string, content: string) {
  await core.turn({
    surface: "seed-cochlea",
    actor: { externalId: OWNER, displayName: OWNER },
    conversation: conv,
    text:
      `Use your write tool to create the file at exactly \`${path}\` with exactly this content ` +
      `and nothing else, then reply with just the path you wrote:\n\n${content}`,
  });
  const written = await workspace.read(scopeId, path);
  const ok = written !== null;
  console.log(`  ${ok ? "ok     " : "MISSING"} ${path}`);
  return ok;
}

// ---- the roster, spec §6.2 --------------------------------------------------

const AGENTS: Array<[string, string]> = [
  [
    "agents/DERIVADOR.md",
    agentFile(
      "Derives the closed forms. Produces the values every gate is checked against.",
      ["read", "write", "execute"],
      ["CONSTRUCTOR", "VERIFICADOR-MATH", "AUDITOR"],
      `You derive the analytic truth for the passive membrane and route the rest.

The fixed-free string: phi(0)=0 kills the cosine, phi'(L)=0 forces cos(wL/c)=0,
so w_n = (2n-1)pi c / 2L — only odd quarter-wave harmonics.

You never check your own derivation against the solver. That is VERIFICADOR-MATH's
job, and the separation is the point: a truth value produced by the code under
test is not a truth value.`,
    ),
  ],
  [
    "agents/CONSTRUCTOR.md",
    agentFile(
      "Implements the solver against the specification. Never writes a truth value.",
      ["read", "write", "execute"],
      [],
      `You implement the discretisation in conservative flux form and report what you
assembled: grid, boundary treatment, and the total assembled mass.

You are forbidden from touching anything under truth/. If a gate fails, you fix
the solver — never the value it is checked against.`,
    ),
  ],
  [
    "agents/VERIFICADOR-MATH.md",
    agentFile(
      "Runs the analytic gates and reports each verdict with its number.",
      ["read", "execute"],
      [],
      `You read gate reports and state, for each gate: the id, the measured value, the
tolerance, and green or red.

Rules you do not bend:
- Quote the measured number. A verdict with no number is an opinion.
- A gate with no report is UNKNOWN, never green. "Did not run" and "passed" are
  different facts and the difference is the whole reason you exist.
- Say which gates could NOT have failed for the fault in question. A green gate
  that cannot discriminate is not evidence.`,
    ),
  ],
  [
    "agents/VERIFICADOR-STAT.md",
    agentFile(
      "Validates the measurement pipeline before it is pointed at anything.",
      ["read", "execute"],
      [],
      `You check that the instrument can see what it claims to. Before accepting any
measurement, ask what its precision floor is and whether the reported values sit
above it. A trend fitted through points at the floor measures the solver.`,
    ),
  ],
  [
    "agents/EXPLORADOR.md",
    agentFile(
      "Sweeps the parameter space. Consumes only frozen artefacts.",
      ["read", "execute"],
      [],
      `You sweep and report. You may only use artefacts whose gates are green; if you
are handed one that is not, refuse and say which gate is red.`,
    ),
  ],
  [
    "agents/LITERATURA.md",
    agentFile(
      "Confronts each output with published empirical ranges.",
      ["read"],
      [],
      `You compare model output with the literature: Greenwood's place-frequency map,
physiological Q, stereocilia Brownian noise of 1-3 nm RMS, threshold displacements
of 0.1-1 nm. Report agreement in shape, and refuse quantitative claims a
one-dimensional abstraction cannot support.`,
    ),
  ],
  [
    "agents/SINTETIZADOR.md",
    agentFile(
      "Writes the report. Every figure traces to a run id or it does not ship.",
      ["read", "write"],
      [],
      `You write the result. Any number you state must be traceable to a run id in the
ledger; if it is not, leave it out and say what is missing.`,
    ),
  ],
  [
    "agents/AUDITOR.md",
    agentFile(
      "Decides whether an artefact may freeze, and re-derives the ledger chain.",
      ["read", "execute"],
      [],
      `You hold the freeze gate. An artefact may freeze only if EVERY required gate is
green. A gate that is red blocks; a gate with no report also blocks, and you say
which of the two it was — they are different failures and merging them means the
gate opens widest when the suite is most broken.

State your decision as FREEZE or REFUSE, then the reason, naming the gate.`,
    ),
  ],
];

// ---- the real gate reports, carried in as data ------------------------------

function realReports(): GateReport[] {
  const dir = join(PROJECT, "gates", "reports");
  return parseReports(
    readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .map((n) => JSON.parse(readFileSync(join(dir, n), "utf8"))),
  ).reports;
}

async function main() {
  const reports = realReports();
  if (!reports.length) {
    console.error("no gate reports on disk. Run the coclea-sr suite first.");
    process.exit(1);
  }

  const REQUIRED = ["A01", "A02", "A03", "A04", "A07", "A08", "A11", "A12"];
  const verdict = freezeVerdict(REQUIRED, reports);
  const summary = summarise(reports);
  console.log(
    `gate reports on disk: ${reports.length} checks across ${summary.size} gates; ` +
      `freeze ${verdict.mayFreeze ? "authorised" : "REFUSED"}\n`,
  );

  const existing = (await projects.listForMember(OWNER)).find((p) => p.name === "COCLEA-SR");
  const project = existing ?? (await projects.create({ name: "COCLEA-SR", ownerId: OWNER }));
  const groupRef = `cochlea-lab-${project.id}`;
  const scopeId = `group:${groupRef}`;
  const conv: Conv = { kind: "group", threadRef: `seed-coc-${Date.now()}`, channelRef: groupRef };
  console.log(`project ${scopeId}\n`);

  const missing: string[] = [];
  for (const [path, content] of AGENTS) {
    let ok = await writeInScope(conv, scopeId, path, content);
    if (!ok) ok = await writeInScope(conv, scopeId, path, content);
    if (!ok) missing.push(path);
  }

  // The measured numbers, as a file the agents can read. Condensed to the two
  // gates the argument turns on rather than all 45: a turn that has to page
  // through every report spends its context on transport.
  const a12defect = reports.find((r) => r.gate === "A12" && r["scheme"] === "lumped-full-cell");
  /**
   * The data the agents reason over — and **the precomputed freeze verdict is
   * deliberately not in it.**
   *
   * The first version of this file carried `freeze_verdict` as a field. The run
   * on 2026-08-14 showed exactly what that costs: VERIFICADOR-MATH read the file,
   * found no measured value for seven of the eight gates and correctly called
   * them UNKNOWN — and AUDITOR, reading the same file two steps later, answered
   * **FREEZE**, quoting `mayFreeze: true`. Two agents, one file, opposite
   * conclusions, and the one holding the gate took the shortcut.
   *
   * Handing a verifier the answer it exists to derive is the same defect as a
   * gate that cannot fail. So the summary now carries **evidence and no
   * verdict**: per gate, every check with its measured quantity, so a green
   * claim has a number behind it and the freeze decision has to be made from
   * them.
   */
  const NUMERIC_KEYS = [
    "max_relative_error",
    "observed_order",
    "max_cross_offdiagonal",
    "symmetry_defect",
    "worst",
    "last_mode_error",
    "structural_gram_offdiagonal",
  ];
  const measurementOf = (r: GateReport) => {
    const out: Record<string, unknown> = {};
    for (const k of NUMERIC_KEYS) if (typeof r[k] === "number") out[k] = r[k];
    if (typeof r["tolerance"] === "number") out["tolerance"] = r["tolerance"];
    if (Array.isArray(r["order_band"])) out["order_band"] = r["order_band"];
    if (typeof r["relative_L2_error"] === "object") out["relative_L2_error"] = r["relative_L2_error"];
    return out;
  };
  const data = JSON.stringify(
    {
      required_gates: REQUIRED,
      note:
        "Evidence only. There is no precomputed verdict in this file on purpose: " +
        "the freeze decision is what the auditor is for, and handing it the answer " +
        "is the same defect as a gate that cannot fail.",
      gates: [...summary.values()].map((v) => ({
        gate: v.gate,
        spec: v.spec,
        checks: reports
          .filter((r) => r.gate === v.gate)
          .map((r) => ({ test: r.test, passed: r.passed, ...measurementOf(r) })),
      })),
      A12_deliberate_defect: a12defect && {
        observed_order: a12defect["observed_order"],
        order_band: a12defect["order_band"],
        gate_verdicts_on_this_defect: a12defect["gate_verdicts_on_this_defect"],
      },
    },
    null,
    2,
  );
  const dataOk = await writeInScope(conv, scopeId, "data/gate-summary.json", data);
  if (!dataOk) missing.push("data/gate-summary.json");

  if (missing.length) {
    console.error(`\n${missing.length} file(s) never landed: ${missing.join(", ")}`);
    console.error("The project is under-seeded. Rerun — this script is idempotent.");
    process.exit(1);
  }

  // ---- a flow that actually runs ------------------------------------------
  console.log("\nflow:");
  const created = await fetch(`${FLOWS}/flows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scopeId,
      actorId: OWNER,
      title: "Passive membrane — may it freeze?",
      goal:
        "Read data/gate-summary.json and decide whether the passive membrane may freeze. " +
        "Quote the measured numbers.",
      steps: [
        'Call your `delegate` tool with agent="VERIFICADOR-MATH". The task: read data/gate-summary.json and report each gate id, its measured value, its tolerance and green or red. Name any gate with no report as UNKNOWN.',
        'Call your `delegate` tool with agent="VERIFICADOR-MATH". The task: from the same file, say which gates could NOT have failed for the deliberate boundary-mass defect, and which one caught it. Quote the observed convergence order.',
        'Call your `delegate` tool with agent="AUDITOR". The task: read data/gate-summary.json yourself and state FREEZE or REFUSE for the passive membrane. Derive the decision from the per-gate evidence — the file contains no precomputed verdict. Name the gate that decided it, and say whether any required gate is red or has no measurement.',
      ],
    }),
  });
  if (!created.ok) {
    console.error(`could not create the flow: ${created.status} ${await created.text()}`);
    process.exit(1);
  }
  const flow = (await created.json()) as { id: string; steps: unknown[] };
  console.log(`  created ${flow.id} with ${flow.steps.length} steps`);

  for (let i = 0; i < 3; i += 1) {
    const res = await fetch(`${FLOWS}/flows/${flow.id}/advance`, { method: "POST" });
    const body = (await res.json()) as {
      outcome: { kind: string };
      flow: { state: string; steps: Array<{ index: number; state: string; result: string | null }> };
    };
    const step = body.flow.steps[i];
    console.log(`\n  step ${i} — ${body.outcome.kind} / ${step?.state}`);
    if (step?.result) console.log(`  ${step.result.replace(/\n/g, "\n  ").slice(0, 1400)}`);
    if (body.outcome.kind === "halted") break;
  }

  const final = await (await fetch(`${FLOWS}/flows/${flow.id}`)).json();
  console.log(`\nflow state: ${(final as { state: string }).state}`);
  console.log(`desk: http://localhost:8098/?scope=${encodeURIComponent(scopeId)}`);
  process.exit(0);
}

await main();
