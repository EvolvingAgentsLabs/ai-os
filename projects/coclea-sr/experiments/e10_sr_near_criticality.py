#!/usr/bin/env python3
"""E10 -- does criticality move D_opt? Spec §7.5(i). Phase 2's first question.

    PYTHONPATH=src .venv/bin/python experiments/e10_sr_near_criticality.py

Spec §7.5 lists three phase-2 questions. (iii) — does the 1/3 compression
exponent emerge — is answered by GATE-H1, and the two regression gates it asks
for are H2 and H3. **(i) has never been run**, and it is the one the project's
public write-up promised as the next experiment:

> *"The next experiment will add the active cochlear amplifier and ask how
> stochastic resonance behaves near criticality."*

## The question, and the reason it is not obvious

Rice's optimum is `sigma_opt = theta/2` and **every free parameter cancels out of
it** — including the signal amplitude. So for a linear membrane feeding a
threshold, moving the amplifier does nothing to the optimum *at the detector*.

The active layer is not linear. It compresses: `r ~ F^(1/3)` at criticality. So
the noise reaching the detector is a **sublinear** function of the noise injected
into the membrane, and the injected optimum has to move even though the
detector's own does not.

## The control is an arm, not algebra — and version 1 got that wrong

The first version wrote the null hypothesis as `D_opt ~ |mu|^2` (pure linear
gain) and compared a fitted exponent against it. Two things went wrong and both
are recorded because the fix is the interesting part:

* **Five arms produced two distinct optima.** The grid resolves 1.359x per step
  and the whole measured effect was 1.8 steps, so the "exponent" was a line
  fitted through a two-level step function. Its interval excluded 2.0 for the
  same reason it would have excluded anything: the residuals of a nearly constant
  series are nearly zero.
* **The regression the specification asks for failed** — `mu = -1.0` scored 1.07
  dB against the passive arm's 5.82, so the only arm that differed from the rest
  was also the one with no valid anchor.

So the null is now **run rather than derived**, and the two arms differ by
exactly one term:

    active:  dz/dt = (mu + i w) z - |z|^2 z + c_f u
    linear:  dz/dt = (mu + i w) z           + c_f u

Same pole, same gain `1/|mu|`, same filtering, same seeds, same everything —
minus the cubic. Whatever separates them **is** the compression, with nothing
left to attribute it to.

    ratio(mu) = sigma_opt(active) / sigma_opt(linear)

> **Registered before running:** if `ratio` stays within the peak-location
> resolution of 1.0 across the whole `mu` range, compression adds nothing to
> plain amplification and §7.5(i)'s answer is **no**. That publishes.

## Sub-grid peak location, because version 1 measured its own grid

`argmax` on a geometric grid quantises the optimum to 1.359x. The peak is refined
by fitting a parabola in `log sigma` through the maximum and its two neighbours,
which is standard and costs nothing — and the refined value is **clamped to the
bracketing interval**, because a vertex outside its own bracket means the three
points are not a peak and reporting it would be inventing precision.

## Headroom, checked before the sweep is bought

E7 died of a baseline already at the ceiling and the rule is in `CLAUDE.md`. The
two ends of the `mu` range are probed first and the sweep is refused unless both
optima are interior. An argmax on the edge of a window measures the window.

## The regression the specification itself asks for

§7.5: *"el limite mu_H -> -infinito debe recuperar la Fase 1"*. Version 1 checked
it at `mu = -1.0` and it failed. It is now checked at a far more negative `mu`
**and the run stops if it still fails**, because every number here is a
difference against it.
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

from coclea import (  # noqa: E402
    analysis, assembly, attest, calibrate, detector, hopf, modal, profiles,
    stochastic, sr,
)

RUN_ID = "e10-sr-near-criticality"
N_GRID = 800
N_MODES = 40
N_SEEDS = 20
N_PERIODS = 200
SAMPLES_PER_PERIOD = 200
MASTER_SEED = 20260817

PROBE = 0.55
THETA = 1.0
SUBTHRESHOLD_FRACTION = 0.5

#: Feedback strength. Fixed across arms so `mu_H` is the only thing that moves —
#: a sweep in two parameters answers neither.
C_F = 1.0

#: Distance to the bifurcation, from far to near. `-1.0` is the regression point
#: the specification asks for; `-0.02` is `pathology.HEALTHY_MU_H`.
MU_GRID = (-0.3, -0.1, -0.03, -0.02)

#: The regression anchor. Far enough that the oscillator is a heavily damped
#: follower and the cubic cannot matter — version 1 used `-1.0`, which lost 4.75
#: dB against the passive arm and was therefore no anchor at all.
MU_REGRESSION = -30.0

#: Wide on purpose: three decades, so the optimum has room to move by the two
#: orders `H_linear` predicts across the `mu` range above.
SIGMA_GRID = np.geomspace(0.06, 6.0, 16)


def linear_integrate(ch, drive: np.ndarray, dt: float) -> np.ndarray:
    """`hopf.integrate` with the cubic deleted, and nothing else changed.

    This is the control arm, and it is a copy on purpose. The two integrators
    differ by the single term `-(|z|^2) z`, so a difference between the arms
    cannot be a difference of scheme, step, seed, pole or gain. Written here
    rather than as a flag on the product's integrator because a flag would be a
    branch inside the thing under test.
    """
    prop = np.exp((ch.mu + 1j * ch.omega) * dt)
    z = np.zeros(ch.n_sites, dtype=complex)
    out = np.empty(drive.shape, dtype=complex)
    for k in range(drive.shape[0]):
        out[k] = z
        z = prop * z + dt * drive[k]      # the cubic is the only thing missing
    return out


def refined_optimum(sigma: np.ndarray, values: np.ndarray, k: int) -> float:
    """Sub-grid peak location: a parabola in `log sigma` through k-1, k, k+1.

    Version 1 reported the raw `argmax`, which on this geometric grid quantises
    the optimum to 1.359x — coarser than the entire effect being measured, so
    five arms returned two distinct numbers and a fit through them was a fit
    through a staircase.

    The vertex is **clamped to its own bracket**. A vertex outside the three
    points that produced it means they are not a peak, and reporting it would be
    manufacturing precision the data does not carry.
    """
    if k <= 0 or k >= len(sigma) - 1:
        return float(sigma[k])
    x = np.log(sigma[k - 1 : k + 2])
    y = np.asarray(values[k - 1 : k + 2], dtype=float)
    denom = (y[0] - 2.0 * y[1] + y[2])
    if denom == 0.0 or not np.isfinite(denom):
        return float(sigma[k])
    # The textbook three-point vertex on a uniform log grid.
    h = x[1] - x[0]
    vertex = x[1] + 0.5 * h * (y[0] - y[2]) / denom
    return float(np.exp(np.clip(vertex, x[0], x[2])))


def hopf_series(v: np.ndarray, t: np.ndarray, omega: float, mu: float,
                linear: bool = False) -> np.ndarray:
    """Push the membrane's series through one Hopf oscillator per path.

    `hopf.integrate` treats sites as independent — no lateral coupling, one
    `omega` and one `mu` each — so the `n_paths` stochastic realisations map onto
    `n_paths` sites exactly. That reuses the product's own integrator instead of
    writing a second one, which is the difference between measuring the model and
    measuring a copy of it.

    Returns `Re(z)`, which is what spec §7.5 feeds back as the active force.
    """
    dt = float(t[1] - t[0])
    # `channel` returns `(n_paths, n_steps, n_probes)` and `integrate` wants
    # `(n_steps, n_sites)`. Getting this wrong is not a crash you can rely on —
    # a 3-D `.T` reverses every axis and produced a chain of 40,000 "sites",
    # which only failed because `integrate` checks. Written out rather than
    # transposed in one move, so the axes are readable.
    series = v[:, :, 0]                       # (n_paths, n_steps)
    n_paths = series.shape[0]
    ch = hopf.chain(np.full(n_paths, omega), np.full(n_paths, mu), c_f=C_F)
    drive = (C_F * series).T.astype(complex)  # (n_steps, n_paths)
    z = linear_integrate(ch, drive, dt) if linear else hopf.integrate(ch, drive, dt)
    return np.real(z).T[:, :, None]           # (n_paths, n_steps, 1)


def curve(modes, mu: float | None, sigma_grid: np.ndarray, drive_omega: float,
          linear: bool = False) -> dict:
    """One SR curve, with the active layer engaged unless `mu` is None.

    `mu=None` is the passive arm and shares every other line with the active
    ones, so the comparison is the layer and not two pipelines.
    """
    ms0 = stochastic.modal_system(modes, np.array([PROBE]), 1.0, "mass")
    cal = calibrate.calibrate_subthreshold(
        ms0, drive_omega, THETA, probe=0, fraction=SUBTHRESHOLD_FRACTION
    )
    if not cal.subthreshold:
        raise ValueError("the calibrated tone is not subthreshold")

    period = 2.0 * np.pi / drive_omega
    dt = period / SAMPLES_PER_PERIOD
    T = N_PERIODS * period
    seeds = np.random.SeedSequence(MASTER_SEED).spawn(len(sigma_grid))

    sigmas, snrs, rates = [], [], []
    for s_target, seed in zip(sigma_grid, seeds):
        D = sr.noise_for_sigma(ms0, 0, float(s_target), "disp")
        ms = stochastic.modal_system(modes, np.array([PROBE]), D, "mass")
        ps = stochastic.simulate_ou_modal(
            ms, stochastic.Drive(omega=drive_omega, amplitude=cal.drive_amplitude),
            T, dt, np.random.default_rng(seed), n_paths=N_SEEDS,
            noise_stream_modes=N_MODES,
        )
        v = ps.channel("disp")
        if mu is not None:
            v = hopf_series(v, ps.t, drive_omega, mu, linear=linear)
        ev = detector.threshold_events(v, ps.t, THETA, 0.0)
        boot = np.random.default_rng(seed.spawn(1)[0])
        est = analysis.snr_db(ev, ps.t, drive_omega, 0, n_boot=800, rng=boot)
        sigmas.append(float(s_target))
        snrs.append(est)
        rates.append(float(ev.rates().mean()))

    verdict = analysis.interior_maximum(np.array(sigmas), snrs)
    values = np.array([e.value for e in snrs])
    verdict["sigma_opt_refined"] = refined_optimum(
        np.array(sigmas), values, int(verdict["argmax_index"])
    )
    return {
        "mu": mu,
        "linear": linear,
        "sigma": sigmas,
        "snr_db": [e.value for e in snrs],
        "snr_ci": [[e.ci_lo, e.ci_hi] for e in snrs],
        "event_rate": rates,
        "tone_amplitude": float(ps.tone_amplitude[0]),
        **verdict,
    }


def main() -> int:
    prof = profiles.BMProfile(alpha_mu=1.0, alpha_K=2.0, coupling=0.0, zeta0=0.06)
    modes = modal.eigenmodes(assembly.assemble(prof, N_GRID), N_MODES)
    drive_omega = float(modes.omega[2] * 0.35)

    print(f"E10 v2 — SR near criticality, probe {PROBE}, Omega={drive_omega:.4f}")
    print(f"grid {SIGMA_GRID[0]:.3f} .. {SIGMA_GRID[-1]:.3f} "
          f"({len(SIGMA_GRID)} points, {SIGMA_GRID[1]/SIGMA_GRID[0]:.3f}x per step)\n")

    # ---- headroom, before the sweep is bought ------------------------------
    print("headroom probe — the two ends of the mu range")
    probe = {}
    for mu in (MU_GRID[0], MU_GRID[-1]):
        r = curve(modes, mu, SIGMA_GRID, drive_omega)
        probe[mu] = r
        print(f"  mu={mu:>7}  peak {r['peak']:6.2f} dB at sigma={r['sigma_opt_refined']:.4f}  "
              f"interior={'Y' if r['maximum_is_interior'] else 'N'}", flush=True)
    if not all(r["maximum_is_interior"] for r in probe.values()):
        print("\n  STOP — an optimum sits on an edge, so the grid is what would be "
              "measured. Widen it and re-probe.")
        return 1
    print("  both interior — the sweep can say something\n")

    # ---- the regression the spec asks for, and it may stop the run ---------
    passive = curve(modes, None, SIGMA_GRID, drive_omega)
    anchor = curve(modes, MU_REGRESSION, SIGMA_GRID, drive_omega)
    step = float(np.log(SIGMA_GRID[1] / SIGMA_GRID[0]))
    gap = abs(np.log(anchor["sigma_opt_refined"] / passive["sigma_opt_refined"]))
    db_gap = abs(anchor["peak"] - passive["peak"])
    holds = gap <= step and db_gap <= 1.0
    print(f"regression at mu={MU_REGRESSION}: sigma_opt {anchor['sigma_opt_refined']:.4f} "
          f"vs passive {passive['sigma_opt_refined']:.4f}  |  peak {anchor['peak']:.2f} "
          f"vs {passive['peak']:.2f} dB")
    print(f"  {'holds' if holds else 'FAILS'} "
          f"(sigma within {'one' if gap <= step else 'MORE THAN one'} grid step, "
          f"peak within {db_gap:.2f} dB)\n")
    if not holds:
        print("  STOP — mu -> -inf does not recover phase 1, so no arm below has an\n"
              "  anchor and every difference would be against nothing. Spec §7.5's own\n"
              "  regression test, enforced rather than reported.")
        return 1

    # ---- the paired sweep: one term apart ---------------------------------
    print(f"{'mu':>8}{'gain':>8}{'active':>11}{'linear':>11}{'ratio':>9}{'peak A':>9}{'peak L':>9}")
    rows = []
    for mu in MU_GRID:
        a = probe.get(mu) or curve(modes, mu, SIGMA_GRID, drive_omega)
        l = curve(modes, mu, SIGMA_GRID, drive_omega, linear=True)
        ratio = a["sigma_opt_refined"] / l["sigma_opt_refined"]
        rows.append({"mu": mu, "gain": 1.0 / abs(mu), "active": a, "linear": l,
                     "sigma_opt_ratio": ratio})
        print(f"{mu:>8}{1/abs(mu):>8.1f}{a['sigma_opt_refined']:>11.4f}"
              f"{l['sigma_opt_refined']:>11.4f}{ratio:>9.3f}"
              f"{a['peak']:>9.2f}{l['peak']:>9.2f}", flush=True)

    # ---- the verdict -------------------------------------------------------
    # The resolution of a refined peak is conservatively half a grid step; a
    # ratio inside that band is a ratio this instrument cannot call different
    # from one, and saying so is the whole reason the band is stated.
    band = float(np.exp(0.5 * step))
    ratios = [r["sigma_opt_ratio"] for r in rows]
    separated = [r for r in ratios if r < 1.0 / band or r > band]
    answer = ("yes — compression moves it beyond gain" if separated
              else "no — within resolution, compression adds nothing to amplification")

    print("\n" + "=" * 74)
    print(f"  resolution band on a ratio : [{1/band:.3f}, {band:.3f}]  (half a grid step)")
    print(f"  ratios                     : {[f'{r:.3f}' for r in ratios]}")
    print(f"  outside the band           : {len(separated)} of {len(ratios)}")
    print(f"\n  §7.5(i) — does criticality move D_opt beyond gain? {answer}")
    print("=" * 74)

    result = {
        "run_id": RUN_ID, "version": 2, "probe": PROBE, "drive_omega": drive_omega,
        "theta": THETA, "c_f": C_F, "mu_grid": list(MU_GRID),
        "mu_regression": MU_REGRESSION,
        "sigma_grid": SIGMA_GRID.tolist(), "master_seed": MASTER_SEED,
        "passive": passive, "regression_arm": anchor,
        "regression_holds": bool(holds), "regression_gap_log": float(gap),
        "grid_step_log": step, "resolution_band": band,
        "rows": rows, "sigma_opt_ratios": ratios,
        "ratios_outside_band": len(separated),
        "answer": answer,
    }
    payload = attest.canonical(attest.json_safe(result))
    digest = attest.sha256_bytes(payload)
    d = ROOT / "runs" / f"{RUN_ID}-{digest[:12]}"
    d.mkdir(parents=True, exist_ok=True)
    (d / "result.json").write_bytes(payload)
    (d / "manifest.json").write_text(json.dumps(
        {"run_id": RUN_ID, "at": time.time(), "git_commit": attest.git_commit(),
         "environment": attest.environment(), "result_sha256": digest,
         "master_seed": MASTER_SEED}, indent=2, sort_keys=True))
    print(f"  written to {d.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
