#!/usr/bin/env python3
"""E8 -- synaptopathy end to end. Spec §13 / PATHOLOGIES §5.1.

    PYTHONPATH=src .venv/bin/python experiments/e8_synaptopathy.py

[PATHOLOGIES.md §7](../PATHOLOGIES.md) lists this second among the things that
could kill §13 cheaply, and states the gap exactly:

> **Run the synaptopathy prediction end to end.** §5.1's claim is currently a
> closed form (`sigma_opt = theta/2`) asserted about the detector. The full
> pipeline — line, active layer, detector, SNR against noise — has never been run
> with `theta` raised. It is one sweep, it reuses GATE-B2's machinery entirely,
> and **it can fail**.

## The claim

Synaptopathy raises the detector's threshold and touches nothing mechanical. So:

    sigma_opt scales in proportion to theta, and nothing else moves

with no free parameter in the ratio. A detector 1.8x harder to trip wants 1.8x
the noise. That is the one prediction in §13 that only a stochastic-resonance
model can make, and it is what a *therapy* would be dosed against.

## The confound that would have made this meaningless

`sr_curve` calibrates the drive to `subthreshold_fraction * theta`. Raise `theta`
and the **tone grows with it** — so both arms would sit at the same fraction of
their own threshold, the problem would be identical in both, and the optimum
would scale for a reason that has nothing to do with the lesion.

That is not synaptopathy. In synaptopathy the mechanics are untouched: the same
sound arrives at a detector that has become harder to trip. So the lesioned arm's
fraction is scaled by `theta_healthy / theta_lesioned`, which holds the **tone
amplitude fixed** across arms — and the run asserts that it did, rather than
trusting the arithmetic.

Found by reading `calibrate.py` before running, which is the only reason it is
not in the results.

## What would falsify it

* the optimum does not move when the threshold does;
* it moves by a factor other than `theta'/theta`;
* something mechanical moves — the tone amplitude, or the curve's shape at fixed
  noise — which would mean the manipulation was not confined to the detector.

## Headroom, checked first this time

E7 died of a baseline already at the ceiling, and the rule it broke is in
`CLAUDE.md`. So the **grid is chosen to contain both optima with room on either
side** and the run refuses if either arm's optimum lands on an end of it: an
argmax at the edge of a window is a measurement of the window.
"""

from __future__ import annotations

import json
import sys as _sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
_sys.path.insert(0, str(ROOT))
_sys.path.insert(0, str(ROOT / "src"))

from coclea import assembly, attest, modal, pathology, profiles, sr  # noqa: E402

RUN_ID = "e8-synaptopathy"
N_GRID = 800
N_MODES = 40
N_SIGMA = 14
N_SEEDS = 20
N_PERIODS = 200
MASTER_SEED = 20260817

#: Three probes rather than E3's eight. The claim is about the **ratio** between
#: two arms at one place, so the other five are guards and cost twice what they
#: inform. Bounding this is fine; bounding it silently would not be.
PROBES = (0.35, 0.55, 0.75)

#: The healthy threshold. Everything below is a ratio against it, so its value
#: sets the window and not the answer.
THETA_HEALTHY = 1.0

#: `SYNAPTOPATHY.theta_factor` — the catalogue's lesion, not a number chosen here.
THETA_FACTOR = pathology.SYNAPTOPATHY.theta_factor

#: Wide enough to hold both `theta/2 = 0.50` and `1.8 theta/2 = 0.90` with room
#: on both sides. Checked rather than assumed: the run fails if either optimum
#: lands on an end.
SIGMA_GRID = np.geomspace(0.22, 2.20, N_SIGMA)

#: The drive as a fraction of the **healthy** threshold, held fixed across arms.
BASE_FRACTION = 0.5


def run_arm(modes, probe_x: float, omega: float, theta: float) -> dict:
    """One curve. The fraction is scaled so the tone is the same in both arms."""
    fraction = BASE_FRACTION * (THETA_HEALTHY / theta)
    curve = sr.sr_curve(
        modes,
        probe_x,
        omega,
        sigma_grid=SIGMA_GRID,
        theta=theta,
        subthreshold_fraction=fraction,
        n_seeds=N_SEEDS,
        n_periods=N_PERIODS,
        n_modes=N_MODES,
        noise_stream_modes=N_MODES,
        n_boot=2000,
        master_seed=MASTER_SEED,
    )
    v = curve.verdict()
    return {
        "theta": curve.theta,
        "fraction": fraction,
        "tone_amplitude": curve.points[0].tone_amplitude,
        "sigma": [p.sigma for p in curve.points],
        "snr_db": [p.snr.value for p in curve.points],
        "snr_ci": [[p.snr.ci_lo, p.snr.ci_hi] for p in curve.points],
        "sigma_opt_measured": v["argmax_value"],
        "sigma_opt_predicted": curve.theta / 2.0,
        **v,
    }


def main() -> int:
    prof = profiles.BMProfile(alpha_mu=1.0, alpha_K=2.0, coupling=0.0, zeta0=0.06)
    modes = modal.eigenmodes(assembly.assemble(prof, N_GRID), N_MODES)
    omega = float(modes.omega[2] * 0.35)

    print(f"E8 — synaptopathy, theta {THETA_HEALTHY} against {THETA_HEALTHY * THETA_FACTOR}")
    print(f"grid {SIGMA_GRID[0]:.3f} .. {SIGMA_GRID[-1]:.3f}, {N_SIGMA} points, Omega={omega:.4f}")
    print(f"{'probe':>7}{'arm':>12}{'theta':>8}{'tone':>10}{'sig_opt':>10}{'theory':>9}{'ratio':>8}{'interior':>10}")

    rows: list[dict] = []
    for xp in PROBES:
        healthy = run_arm(modes, xp, omega, THETA_HEALTHY)
        lesioned = run_arm(modes, xp, omega, THETA_HEALTHY * THETA_FACTOR)
        ratio = lesioned["sigma_opt_measured"] / healthy["sigma_opt_measured"]
        tone_ratio = lesioned["tone_amplitude"] / healthy["tone_amplitude"]

        for label, arm in (("healthy", healthy), ("synaptopathy", lesioned)):
            print(
                f"{xp:>7.2f}{label:>12}{arm['theta']:>8.2f}{arm['tone_amplitude']:>10.4f}"
                f"{arm['sigma_opt_measured']:>10.3f}{arm['sigma_opt_predicted']:>9.3f}"
                f"{'':>8}{'Y' if arm['maximum_is_interior'] else 'N':>10}",
                flush=True,
            )
        print(f"{'':>7}{'ratio':>12}{THETA_FACTOR:>8.2f}{tone_ratio:>10.4f}{ratio:>10.3f}", flush=True)

        rows.append(
            {
                "probe_x": xp,
                "omega": omega,
                "healthy": healthy,
                "synaptopathy": lesioned,
                "sigma_opt_ratio": ratio,
                "tone_amplitude_ratio": tone_ratio,
                "theta_factor": THETA_FACTOR,
            }
        )

    # ---- verdict -----------------------------------------------------------
    # Stated as three separate conditions rather than one, because they fail for
    # different reasons and a single boolean would hide which.
    on_edge = [
        f"{r['probe_x']:.2f}/{k}"
        for r in rows
        for k in ("healthy", "synaptopathy")
        if not r[k]["maximum_is_interior"]
    ]
    tone_held = all(abs(r["tone_amplitude_ratio"] - 1.0) < 1e-9 for r in rows)
    ratios = [r["sigma_opt_ratio"] for r in rows]
    # The grid is geometric with 14 points over a decade, so one spacing is
    # ~1.19x. The optimum can only land on a grid point, so the ratio of two
    # optima cannot be more precise than that — the tolerance is the instrument's
    # resolution and is stated here rather than tuned later.
    spacing = float(SIGMA_GRID[1] / SIGMA_GRID[0])
    scales = all(abs(np.log(r / THETA_FACTOR)) < np.log(spacing) for r in ratios)

    verdict = {
        "every_optimum_interior": not on_edge,
        "optima_on_an_edge": on_edge,
        "tone_amplitude_held_fixed": tone_held,
        "grid_spacing": spacing,
        "sigma_opt_ratios": ratios,
        "predicted_ratio": THETA_FACTOR,
        "ratio_matches_within_one_grid_step": scales,
        "supports_5_1": bool(not on_edge and tone_held and scales),
    }

    print("\n" + "=" * 68)
    print(f"tone held fixed across arms : {tone_held}")
    print(f"every optimum interior      : {not on_edge}" + (f"  ({on_edge})" if on_edge else ""))
    print(f"ratios {[f'{r:.3f}' for r in ratios]} against predicted {THETA_FACTOR}")
    print(f"within one grid step ({spacing:.3f}x): {scales}")
    print(f"\n§5.1 supported by this run  : {verdict['supports_5_1']}")
    print("=" * 68)

    result = {
        "run_id": RUN_ID,
        "theta_healthy": THETA_HEALTHY,
        "theta_factor": THETA_FACTOR,
        "sigma_grid": SIGMA_GRID.tolist(),
        "probes": list(PROBES),
        "rows": rows,
        "verdict": verdict,
    }
    payload = attest.canonical(attest.json_safe(result))
    digest = attest.sha256_bytes(payload)
    d = ROOT / "runs" / f"{RUN_ID}-{digest[:12]}"
    d.mkdir(parents=True, exist_ok=True)
    (d / "result.json").write_bytes(payload)
    (d / "manifest.json").write_text(
        json.dumps(
            {
                "run_id": RUN_ID,
                "at": time.time(),
                "git_commit": attest.git_commit(),
                "environment": attest.environment(),
                "result_sha256": digest,
                "master_seed": MASTER_SEED,
            },
            indent=2,
            sort_keys=True,
        )
    )
    print(f"written to {d.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
