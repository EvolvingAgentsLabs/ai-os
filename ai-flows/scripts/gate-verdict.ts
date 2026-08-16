/**
 * Where a deployment finds its gate reports, and how it turns them into a verdict.
 *
 * The engine holds no opinion about either: `EngineDeps.gateVerdict` is a
 * function, and this is the one `serve.ts` injects. Keeping it out here is what
 * lets `ai-flows` govern a Python project's checks without knowing that Python
 * or pytest exist — the interchange format is JSON on disk and nothing else.
 *
 * `GATE_REPORTS_DIR` selects the directory. Unset, this returns `null`, and the
 * engine then **blocks** every gated flow rather than letting it finish: a
 * missing checker is not a passing check.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { freezeVerdict, parseReports } from "../src/gates.ts";
import type { FlowWithSteps } from "../src/types.ts";

export function createGateVerdict(dir: string | undefined) {
  if (!dir) return undefined;
  return async (flow: FlowWithSteps) => {
    const required = flow.requiredGates ?? [];
    if (!required.length) return { mayFreeze: false, blockers: [], unknown: [] };

    let names: string[];
    try {
      names = readdirSync(dir).filter((n) => n.endsWith(".json"));
    } catch {
      // The directory is configured and absent. That is a broken deployment,
      // not an empty one, and reporting every gate as "never ran" is the
      // truthful answer — it blocks, and it says which.
      return { mayFreeze: false, blockers: [], unknown: [...required] };
    }

    const raw: unknown[] = [];
    const unreadable: string[] = [];
    for (const n of names) {
      try {
        raw.push(JSON.parse(readFileSync(join(dir, n), "utf8")));
      } catch {
        unreadable.push(n);
      }
    }
    const { reports } = parseReports(raw);
    const v = freezeVerdict(required, reports);
    // A report that will not parse is not a report. Folding it into `unknown`
    // keeps "the file is corrupt" from reading as "the gate passed".
    if (unreadable.length && v.mayFreeze) {
      return { mayFreeze: false, blockers: [], unknown: unreadable };
    }
    return { mayFreeze: v.mayFreeze, blockers: v.blockers, unknown: v.unknown };
  };
}
