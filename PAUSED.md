# ai-os is paused — 2026-08-16

Not abandoned and not finished. The focus moved to
[`physics-verifiers`](../physics-verifiers), a separate repo attacking the RL
environments market directly. ai-os is the **substrate v2** if that traction
appears; this file is what makes coming back cheap.

## Where it actually is

Everything below ran. `AI-OS-PLAN.md` v2.0 describes ai-flows, ai-ui and
ai-storage as "specified, not implemented" — that was true when it was written
and is now false for the first two.

| | state |
|---|---|
| `ai-base` | vendored QM, runs. Divergences in `ai-base/AI-OS-PATCHES.md` |
| `ai-flows` | 403 tests. Flows with lineage, HTTP API, the `Gated` shape |
| `ai-ui` | 199 tests. The desk runs; the static demo builds |
| `ai-storage` | not started, as the plan says |
| `ai-memory` | built on eve, **does not execute here** — see below |
| `projects/coclea-sr` | 113 gate checks, 23 gates, ledger `ok`, Evidence Viewer |

Start it with `make up` → <http://localhost:8098>.

## What was finished last, and what was in flight

**Finished.** The gated flow shape; a project that can be born from the desk
(project → agents → material → document → run); a project that writes and
repairs its own roster; lazy skills measured at 95.8% index saving; memory that
survives a session; the Evidence Viewer; GATE-B2 as a real gate with a control;
the Hopf layer and the calibration engine.

**In flight, and complete enough to leave.**
`projects/coclea-sr/environments/coclea_sr/` — the RL environment adapter, 13
tests green. It is the direct ancestor of `physics-verifiers`: four graded
tasks, a two-process split that makes the verifier unhackable, and a cheating
solution that earns zero on all four. **Read its README before rebuilding
anything there** — it already found three real defects, two of them in itself.

## Known, unfixed, and worth knowing before you touch it

- **`ai-memory/` does not run.** The local eve world accepts a session,
  dispatches a turn, and the turn's run never starts. Thirty-nine runs from an
  earlier attempt sat `running` for three days. `ai-flows/src/memory.ts` routes
  around it rather than fixing it.
- **Two-level delegation is bounded upstream.** A delegated child is built
  without `runChild`, so it has no `delegate` tool. One level works and was
  verified.
- **The full gate suite takes minutes** — `A09` alone is over 100 seconds. For a
  live demonstration use the subset named in `projects/coclea-sr/CLAUDE.md`:
  28 checks in about 1.7 seconds.
- **`gates/reports/` is never cleaned.** Run `gates/check_reports.py` after
  renaming or moving a test; an orphan report is a permanent red on every gated
  flow. Two of them were blocking the freeze on 2026-08-16.

## The corrections the plan needs when it is picked up again

Recorded here rather than argued again later:

1. **Do not rebuild "flow as a directory with a CLI."** It would be a second
   flow model beside the one with 403 tests.
2. **Extracting `ai-verify` standalone before a second domain exists is
   speculative.** The plan itself puts the generalisation test after it. Let the
   second domain force the shape — which is exactly what `physics-verifiers`
   now is.
3. **"ai-ui v1 = Evidence Viewer, canvas → v2" would discard working software.**
   They are different audiences: the desk is for the operator, the viewer for
   the auditor. The viewer is a static export, not a replacement.

## Branch

`coclea-sr-phase2`, on top of `main` at PR #51. Nothing is uncommitted.
