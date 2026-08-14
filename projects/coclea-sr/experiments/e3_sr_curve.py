"""E3 -- the stochastic-resonance curve. Spec §7.1 E3, GATE-B2. The main result.

SNR and vector strength against noise intensity, at several places along the
membrane, for three drive frequencies. **Success is a statistically significant
interior maximum**: the SNR at the optimum must clear *both* ends of the grid
with non-overlapping 95% intervals.

## Which operator this runs on, and why that is the specification and not a compromise

Spec §4.1 adds the noise to equation (2.1) — the string — and §5.3's modal
Ornstein-Uhlenbeck scheme is built on the string's eigenmodes, which GATE-A9's
Lyapunov truth is stated per-mode for. So the stochastic layer runs on the
string, as written.

[ADR-0002](../decisions/0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md)
replaced the operator that carries the *place code*, not the one that carries the
noise, and the specification says nothing about noise on a transmission line.
Extending it there is a real next step and is named in ADR-0003 rather than
improvised here — the two halves currently sit on different operators and saying
so is worth more than a result that quietly spans both.

## The prediction, so B2 is quantitative rather than "there is a bump"

The probe series is a sum of independent modes, so it is a stationary Gaussian
process and `truth/rice_sr_toy`'s derivation carries over unchanged:

    sigma_opt = theta / 2

with every free parameter cancelled. E3 measures where the optimum actually lands.

## The spatial modulation is the result, not the inverted U

Spec §R2 is explicit: a threshold detector can be made to show an inverted U by
design, so the mere existence of one proves little. What is informative is how
the curve **changes with position** along the membrane. Eight probes, per §4.4.

    cd projects/coclea-sr && PYTHONPATH=src .venv/bin/python experiments/e3_sr_curve.py
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
_sys.path.insert(0, str(ROOT / "src"))

from coclea import assembly, attest, modal, profiles, sr  # noqa: E402

RUN_ID = "e3-sr-curve"
N_GRID = 800
N_MODES = 40
#: Spec §7.1: 12 noise levels, 20 seeds each.
N_SIGMA = 12
N_SEEDS = 20
N_PERIODS = 200
#: Spec §4.4: at least eight probes along the membrane.
PROBES = (0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85)


def main() -> int:
    prof = profiles.BMProfile(alpha_mu=1.0, alpha_K=2.0, coupling=0.0, zeta0=0.06)
    modes = modal.eigenmodes(assembly.assemble(prof, N_GRID), N_MODES)

    # Low, middle and high, taken from the membrane's own spectrum so all three
    # sit inside the band the truncated basis resolves rather than being picked
    # in Hz and landing wherever they land.
    test_omegas = {
        "low": float(modes.omega[0] * 0.45),
        "mid": float(modes.omega[2] * 0.35),
        "high": float(modes.omega[5] * 0.30),
    }
    sigma_grid = np.geomspace(0.20, 2.60, N_SIGMA)

    results: dict[str, dict] = {}
    for label, omega in test_omegas.items():
        per_probe = {}
        for xp in PROBES:
            curve = sr.sr_curve(
                modes, xp, omega,
                sigma_grid=sigma_grid, n_seeds=N_SEEDS, n_periods=N_PERIODS,
                n_modes=N_MODES, noise_stream_modes=N_MODES,
                n_boot=2000, master_seed=20260814,
            )
            v = curve.verdict()
            per_probe[f"{xp:.2f}"] = {
                "probe_x": curve.probe_x,
                "theta": curve.theta,
                "sigma": [p.sigma for p in curve.points],
                "noise_intensity": [p.noise_intensity for p in curve.points],
                "snr_db": [p.snr.value for p in curve.points],
                "snr_ci": [[p.snr.ci_lo, p.snr.ci_hi] for p in curve.points],
                "vector_strength": [p.vs.value for p in curve.points],
                "vs_ci": [[p.vs.ci_lo, p.vs.ci_hi] for p in curve.points],
                "event_rate": [p.event_rate for p in curve.points],
                "tone_amplitude": curve.points[0].tone_amplitude,
                "sigma_opt_predicted": curve.theta / 2.0,
                **v,
            }
            print(
                f"  {label:4s} Omega={omega:.4f} x={xp:.2f}  "
                f"peak {v['peak']:6.2f} dB at sigma={v['argmax_value']:.3f} "
                f"(theory {curve.theta/2:.3f})  "
                f"interior={'Y' if v['maximum_is_interior'] else 'N'} "
                f"significant={'Y' if v['significant_interior_maximum'] else 'N'}",
                flush=True,
            )
        results[label] = {"omega": omega, "probes": per_probe}

    # --- GATE-B2 ------------------------------------------------------------
    all_probes = [p for r in results.values() for p in r["probes"].values()]
    significant = [p for p in all_probes if p["significant_interior_maximum"]]
    b2 = {
        "n_curves": len(all_probes),
        "n_with_significant_interior_maximum": len(significant),
        "fraction": len(significant) / len(all_probes),
        "passed": len(significant) >= 0.8 * len(all_probes),
    }

    # How well the measured optima match theta/2, across every curve that has one.
    rel = [
        abs(p["argmax_value"] - p["sigma_opt_predicted"]) / p["sigma_opt_predicted"]
        for p in significant
    ]
    prediction = {
        "median_relative_error_vs_theta_over_2": float(np.median(rel)) if rel else None,
        "max_relative_error": float(np.max(rel)) if rel else None,
        "grid_resolution": float(
            np.log(sigma_grid[1] / sigma_grid[0])
        ),
        "note": (
            "The sigma grid is logarithmic with 12 points over a 13x range, so the "
            "argmax cannot be located better than about half a grid spacing, ~11%. "
            "Errors at or below that are at the instrument's resolution."
        ),
    }

    print(f"\nGATE-B2: {b2['n_with_significant_interior_maximum']}/{b2['n_curves']} curves "
          f"have a significant interior maximum -> {'PASS' if b2['passed'] else 'FAIL'}")
    if rel:
        print(f"  optimum vs theta/2: median {np.median(rel):.1%}, worst {np.max(rel):.1%}")

    result = {
        "run_id": RUN_ID,
        "operator": "spec (2.1) passive string, modal Ornstein-Uhlenbeck (spec §4.1, §5.3)",
        "N_grid": N_GRID, "n_modes": N_MODES, "n_sigma": N_SIGMA,
        "n_seeds": N_SEEDS, "n_periods": N_PERIODS, "probes": list(PROBES),
        "test_omegas": test_omegas,
        "results": results,
        "gate_B2": b2,
        "prediction_check": prediction,
    }
    out = attest.record_run(RUN_ID, result)
    print(f"written: {out}")
    return 0 if b2["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
