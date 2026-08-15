/**
 * Put a project's source inside a scope's sandbox, so its agents can run it.
 *
 *   cd ai-flows && node --env-file=../ai-base/.env scripts/provision-project.ts \
 *     --scope group:cochlea-lab-<id> --from ../projects/coclea-sr --as coclea-sr
 *
 * ## The gap this closes
 *
 * An agent's `execute` runs inside a container whose filesystem is a Docker
 * volume owned by its scope — **not the checkout the project lives in**. So
 * `VERIFICADOR-MATH` could reason about numbers handed to it and could not
 * produce any, and `EXPLORADOR` could not launch a sweep. The project was a
 * laboratory notebook rather than a laboratory.
 *
 * This copies the source in through the kernel's own file API, so nothing in
 * `ai-base/` is patched and nothing goes round the sandbox. What the agent gets
 * is an ordinary directory it can `cd` into and run.
 *
 * It writes file by file with `writeFileBytes` rather than in one batch with
 * `extractFiles`, and that is forced rather than chosen: the routing sandbox
 * only exposes `extractFiles` when a backend supports the whole blob-staging
 * trio (`stageIn`, `stageOut`, `extractFiles`), and the local backend has only
 * the last of the three. `writeFileBytes` is a required method on the interface,
 * so it is there on every backend. The cost is one container exec per file —
 * about twenty seconds for this project, once.
 *
 * ## What is copied, and what is deliberately not
 *
 * Source only: `truth/`, `src/`, `gates/*.py`, `experiments/`, the Makefile, the
 * specification and the ADRs. **Not** `.venv` (wrong architecture, and the image
 * carries the numeric stack), `__pycache__`, `runs/`, `report/` or
 * `gates/reports/`.
 *
 * That last exclusion is the one that matters and it is not about size: results
 * belong to the host, where the ledger and the attestation chain live. An agent
 * that found `runs/` already populated could report a number it never computed,
 * and nothing downstream would be able to tell. **The sandbox gets the code and
 * produces its own results; it never inherits somebody else's.**
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const scopeId = arg("scope");
const from = arg("from");
const as = arg("as") ?? "project";
const verifyCmd = arg("verify");

if (!scopeId || !from) {
  console.error(
    "usage: provision-project.ts --scope <scopeId> --from <dir> [--as <name>] [--verify <command>]",
  );
  process.exit(2);
}

/** Directories and files that never travel. See the module docstring. */
const SKIP_DIRS = new Set([
  ".venv", "__pycache__", ".git", ".pytest_cache", "node_modules",
  "runs", "report", "reports", ".ruff_cache",
]);
const SKIP_SUFFIX = [".pyc", ".pyo", ".so", ".dylib", ".png", ".jpg", ".pdf"];

function walk(dir: string, root: string, out: Array<{ path: string; data: Uint8Array }>) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, root, out);
    } else if (st.isFile()) {
      if (SKIP_SUFFIX.some((s) => entry.endsWith(s))) continue;
      // A guard, not a limit: a source tree with a 5 MB file in it is a source
      // tree with something in it that is not source, and copying it silently
      // is how a sandbox ends up carrying a dataset nobody meant to send.
      if (st.size > 2_000_000) {
        console.warn(`  skipped ${relative(root, full)} — ${(st.size / 1e6).toFixed(1)} MB`);
        continue;
      }
      out.push({
        path: join(as, relative(root, full)),
        data: new Uint8Array(readFileSync(full)),
      });
    }
  }
}

const root = resolve(from);
const files: Array<{ path: string; data: Uint8Array }> = [];
walk(root, root, files);
console.log(`${files.length} source file(s) from ${root}`);

const config = loadConfig();
const { sandbox } = buildApp({ ...config, port: 0 });

// The same layer shape a turn provisions with: one read-write layer for the
// scope, mounted at the working root.
const handle = await sandbox.provision([{ scopeId, mode: "rw", mountPath: "" }]);
console.log(`provisioned ${scopeId}`);

let written = 0;
for (const f of files) {
  await sandbox.writeFileBytes(handle, f.path, f.data);
  written += 1;
  if (written % 10 === 0) process.stdout.write(`  ${written}/${files.length}\r`);
}
console.log(`copied ${written} file(s) into ${as}/`.padEnd(40));

// Prove it landed AND that the environment can run it, in one command.
//
// Checking only that the files exist would pass on a sandbox with no numeric
// stack, and the agent would then fail at the first import with an error that
// reads like a missing dependency in the project rather than in the image.
const check =
  verifyCmd ??
  `cd ${as} && python3 -c "import numpy, scipy, sympy, mpmath; print('numeric stack ok')" ` +
    `&& python3 -c "import sys; sys.path.insert(0,'src'); from coclea import assembly, modal, profiles; ` +
    `m = modal.eigenmodes(assembly.assemble(profiles.uniform(), 500), 3); ` +
    `print('solver ok, omega_1 =', round(float(m.omega[0]), 8))"`;

const res = await sandbox.run(handle, check, { timeoutMs: 300_000 });
console.log(`\n$ ${check}\n`);
console.log(res.stdout.trim());
if (res.stderr.trim()) console.error(res.stderr.trim());
console.log(`\nexit ${res.code}`);

if (res.code !== 0) {
  console.error(
    "the project is in the sandbox and does not run there. Check that " +
      "LOCAL_SANDBOX_IMAGE points at an image with the numeric stack.",
  );
  process.exit(1);
}
console.log(`\n${scopeId} can now run ${as}/. Agents with \`execute\` can use it.`);
process.exit(0);
