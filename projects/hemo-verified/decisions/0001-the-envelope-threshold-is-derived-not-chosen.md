# ADR-0001 — The temporal envelope threshold is derived, not chosen

**Date:** 2026-08-22
**Status:** accepted
**Raised by:** the precondition in SPEC.md §7.5, before H0 ran
**Spec sections in tension:** §4 (the oracle table), §4 "Every threshold records
its slack"

## The gap

A10 shipped with `A10_envelope: 0.05` in `thresholds.yaml` — "p95 phase-to-phase
change over u_ref". The number was chosen because it looked reasonable.

It **failed on the exact Womersley solution.** The true field at α = 14.9,
sampled at 32 phases, changes by 0.181 of `u_ref` between neighbouring phases.
That is physics: at that Womersley number the flow genuinely reverses within a
cycle. A gate that fires on a perfect field is not strict, it is wrong, and it
would have poisoned H0 by escalating every pulsatile case regardless of error.

Worse, the invented value was silently tied to a sampling rate nobody wrote
down. At 8 phases the true record moves 0.68 per step; at 128 it moves 0.045.
One constant cannot serve both, so the gate's meaning would have changed with a
parameter chosen for unrelated reasons.

## The decision

The bound is derivable, so it is derived. From the momentum equation

    rho du/dt = -dp/dz + mu (1/r) d/dr(r du/dr)

the change across one sampling interval is bounded by

    |du| <= dt/rho * (|dp/dz| + mu * u_ref * C / R^2)

with `C = 8`, a slack constant above the `4 u_max / R^2` a parabolic profile
gives. A10 has **no entry in `thresholds.yaml`**; it computes its own bound from
`dt` and the boundary conditions.

## What it buys

Measured on the exact solution across sampling rates:

| phases | measured | bound | slack |
|--------|----------|-------|-------|
| 8      | 0.6845   | 1.511 | 2.21  |
| 32     | 0.1808   | 0.378 | 2.09  |
| 64     | 0.0908   | 0.189 | 2.08  |
| 128    | 0.0454   | 0.094 | 2.08  |

The slack is flat at ~2.1 over a 16x range of `dt`. The gate now means the same
thing at every sampling rate, and it sits in the healthy band rather than at
either end.

## What this does not fix

The other thresholds in `thresholds.yaml` are still set from the discretisation
floors of the exact solutions rather than derived from a law. That is better
than tuning them on the CFD that defines truth, and worse than A10. Each one
that can be derived should be, and the ones that cannot should say so.
