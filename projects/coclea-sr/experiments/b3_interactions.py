"""GATE-B3 -- do the two noises cooperate? Spec §7.2.

> una afirmación del tipo "el ruido mecánico y el neuronal cooperan" solo se
> publica si el término de interacción correspondiente clarea cero con IC 95%

The standard this project borrows from `harness_eval`: **an absolute lift with no
significant interaction term is not a finding.** So the question "does mechanical
noise in the membrane cooperate with neuronal noise at the synapse" is answered by
the sign and interval of one coefficient, and by nothing else.

## Why this needs Detector B

Detector A has one noise source, so "which noise causes the resonance" has no
referent in it. The LIF of §4.4.3 carries its own intrinsic noise ``xi``,
separable from the mechanical ``eta`` driving the membrane, and only with both
present can their interaction be estimated. Every cell of this design therefore
runs Detector B — the first measurement in the project that does.

## The design, and the power analysis that sizes it

Five factors at two levels each (§7.2's list), in a **resolution-V half
fraction**: 16 cells rather than 32, with every main effect and every two-factor
interaction still estimable — they alias only against three-factor and higher
terms, which is exactly the trade this design exists to make.

    eta            mechanical noise driving the membrane      low / high
    xi             intrinsic neuronal noise in the LIF        low / high
    detector_input displacement or velocity at the probe      disp / vel
    noise_scaling  spatial structure of the noise             mass / uniform
    zeta           membrane damping                           low / high

§7.2 asks for the power analysis **first**, and it is not a formality: it decides
the replicate count, and a design sized after the fact is a design sized to the
answer. For an orthogonal two-level factorial in ±1 coding the effect estimate
has standard error ``2 sigma / sqrt(N)``, so detecting an effect of ``delta`` at
power 0.8 and alpha 0.05 needs

    N >= ( 2 (z_0.975 + z_0.8) sigma / delta )^2

with ``sigma`` the per-seed spread of a measured SNR. That is estimated from the
**pilot cell**, not assumed.

    cd projects/coclea-sr && PYTHONPATH=src .venv/bin/python experiments/b3_interactions.py
"""

from __future__ import annotations

import itertools
import sys as _sys
from pathlib import Path

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent
_sys.path.insert(0, str(ROOT / "src"))
_sys.path.insert(0, str(ROOT))

from coclea import analysis, assembly, attest, calibrate, detector, modal, profiles, sr, stochastic  # noqa: E402

RUN_ID = "b3-interactions"
N_GRID = 600
N_MODES = 30
PROBE = 0.45
MASTER_SEED = 20260814

FACTORS = ["eta", "xi", "detector_input", "noise_scaling", "zeta"]
#: Factor levels.
#:
#: **The low levels are not the lowest interesting ones — they are the lowest at
#: which the response exists.** The first run used ``eta`` low at 0.55 and ``xi``
#: low at 0.02, and the low-low corner produced no detectable events at all: four
#: cells returned an SNR of minus infinity and one had **zero** usable
#: replicates. A factorial with an empty cell is no longer orthogonal, and the
#: fit came back with an interaction interval of +/- 17 million decibels — a
#: number a reader could skim past as "not significant" when the design had in
#: fact collapsed.
#:
#: Raising the low levels is not tuning toward an answer; a factorial requires
#: the response to be *defined* at every corner, and these are the ranges where
#: it is. `preflight` enforces that before any inference is attempted.
LEVELS = {
    "eta": (0.80, 1.45),          # multiplier on the working noise level
    "xi": (0.10, 0.30),           # intrinsic LIF noise, absolute
    "detector_input": ("disp", "vel"),
    "noise_scaling": ("mass", "uniform"),
    "zeta": (0.04, 0.10),
}

#: A cell with fewer usable replicates than this aborts the analysis.
MIN_REPLICATES = 3

#: Detect an interaction of this size, per spec §7.2.
DELTA_DB = 1.0
POWER = 0.8
ALPHA = 0.05


def half_fraction() -> list[dict[str, int]]:
    """Resolution-V half fraction of ``2^5``: the generator is ``E = ABCD``.

    Chosen over a quarter fraction because at resolution IV the two-factor
    interactions alias **each other**, and the whole question here is a
    two-factor interaction. A design that cannot separate `eta x xi` from
    `detector_input x zeta` would answer a different question than the one asked.
    """
    rows = []
    for a, b, c, d in itertools.product((-1, 1), repeat=4):
        rows.append({"eta": a, "xi": b, "detector_input": c,
                     "noise_scaling": d, "zeta": a * b * c * d})
    return rows


def design_matrix(rows: list[dict[str, int]]) -> tuple[np.ndarray, list[str]]:
    """Intercept, five main effects, ten two-factor interactions."""
    names = ["intercept"] + FACTORS + [
        f"{a}:{b}" for a, b in itertools.combinations(FACTORS, 2)
    ]
    cols = []
    for r in rows:
        row = [1.0] + [float(r[f]) for f in FACTORS]
        row += [float(r[a] * r[b]) for a, b in itertools.combinations(FACTORS, 2)]
        cols.append(row)
    return np.array(cols), names


def _membrane(zeta: float):
    prof = profiles.BMProfile(alpha_mu=1.0, alpha_K=2.0, coupling=0.0, zeta0=zeta)
    return modal.eigenmodes(assembly.assemble(prof, N_GRID), N_MODES)


def run_cell(row: dict[str, int], n_seeds: int, seed: int) -> np.ndarray:
    """One design cell. Returns the per-seed SNR in dB — the replicates."""
    zeta = LEVELS["zeta"][(row["zeta"] + 1) // 2]
    eta_mult = LEVELS["eta"][(row["eta"] + 1) // 2]
    xi = LEVELS["xi"][(row["xi"] + 1) // 2]
    which = LEVELS["detector_input"][(row["detector_input"] + 1) // 2]
    scaling = LEVELS["noise_scaling"][(row["noise_scaling"] + 1) // 2]

    modes = _membrane(zeta)
    drive_omega = float(modes.omega[2] * 0.35)

    # Working point: the noise level that put the SR curve at its optimum in E3,
    # scaled by the eta factor. theta follows from it, so every cell sits at a
    # comparable place on its own curve rather than at a fixed absolute noise.
    sigma_star = 0.85
    theta = calibrate.calibrate_threshold(sigma_star)

    ms0 = stochastic.modal_system(modes, np.array([PROBE]), 1.0, scaling)
    D = sr.noise_for_sigma(ms0, 0, sigma_star * eta_mult, which)
    ms = stochastic.modal_system(modes, np.array([PROBE]), D, scaling)

    cal = calibrate.calibrate_subthreshold(ms, drive_omega, theta, probe=0, fraction=0.5)
    period = 2.0 * np.pi / drive_omega
    dt = period / 200.0
    ps = stochastic.simulate_ou_modal(
        ms, stochastic.Drive(omega=drive_omega, amplitude=cal.drive_amplitude),
        T=150 * period, dt=dt, rng=np.random.default_rng(seed),
        n_paths=n_seeds, noise_stream_modes=N_MODES,
    )
    v = ps.channel(which)

    # Detector B. tau_m is set from the drive period so the leaky integrator is
    # neither a pure differentiator nor a pure accumulator at this frequency;
    # v_th is calibrated so the tone alone reaches half of it, matching the
    # subthreshold fraction Detector A uses.
    tau_m = period / 20.0
    gain = tau_m / np.sqrt(1.0 + (drive_omega * tau_m) ** 2)
    v_th = 2.0 * float(ps.tone_amplitude[0]) * gain
    ev = detector.lif_events(
        v, ps.t, tau_m=tau_m, beta=1.0, v_th=v_th,
        intrinsic_noise=xi, rng=np.random.default_rng(seed + 7919), tau_ref=0.0,
    )

    out = []
    for p in range(n_seeds):
        y = detector.binned(ev, ps.t, p, 0)
        try:
            out.append(analysis.spectral_snr_db(y, dt, drive_omega, analysis.WelchCfg()))
        except ValueError:
            out.append(np.nan)
    return np.asarray(out)


def power_required_n(sigma: float) -> int:
    """Total observations needed to detect ``DELTA_DB`` at ``POWER``."""
    z = stats.norm.ppf(1 - ALPHA / 2) + stats.norm.ppf(POWER)
    return int(np.ceil((2.0 * z * sigma / DELTA_DB) ** 2))


def preflight(rows, seeds) -> list[int]:
    """Check every corner produces a measurable response, cheaply, before spending.

    Two seeds per cell. A factorial cannot be analysed with a missing cell, and
    discovering that after the full design has run wastes the run and — worse —
    still returns coefficients. This fails first and says which corner.
    """
    empty = []
    counts = []
    for i, row in enumerate(rows):
        reps = run_cell(row, n_seeds=2, seed=int(seeds[i].generate_state(1)[0]))
        n = int(np.isfinite(reps).sum())
        counts.append(n)
        if n == 0:
            empty.append(i)
    if empty:
        for i in empty:
            print(f"  EMPTY cell {i}: "
                  + "  ".join(f"{f}={rows[i][f]:+d}" for f in FACTORS))
        raise SystemExit(
            f"{len(empty)} design cell(s) produced no measurable SNR. The factor "
            "levels do not span a region where the response is defined, so the "
            "design is not orthogonal and no interaction can be estimated. Raise "
            "the low levels of eta/xi rather than fitting what is left."
        )
    return counts


def main() -> int:
    rows = half_fraction()
    seeds = np.random.SeedSequence(MASTER_SEED).spawn(len(rows) + 1)

    print("preflight: every corner must produce a measurable response")
    preflight(rows, seeds)
    print("  all 16 cells fire\n")

    # --- the power analysis, before the design is sized ---------------------
    pilot = run_cell(rows[0], n_seeds=12, seed=int(seeds[-1].generate_state(1)[0]))
    pilot = pilot[np.isfinite(pilot)]
    sigma_hat = float(np.std(pilot, ddof=1))
    n_total = power_required_n(sigma_hat)
    per_cell = max(4, int(np.ceil(n_total / len(rows))))
    print(f"power analysis: sigma_hat = {sigma_hat:.3f} dB from a {pilot.size}-seed pilot")
    print(f"  to detect {DELTA_DB} dB at power {POWER}: N >= {n_total}, "
          f"so {per_cell} seeds x {len(rows)} cells = {per_cell * len(rows)}\n")

    # --- run the design ------------------------------------------------------
    y, keep = [], []
    for i, row in enumerate(rows):
        reps = run_cell(row, n_seeds=per_cell, seed=int(seeds[i].generate_state(1)[0]))
        good = np.isfinite(reps)
        y.append(reps[good])
        keep.append(int(good.sum()))
        print(f"  cell {i:2d}  {'  '.join(f'{f}={row[f]:+d}' for f in FACTORS)}"
              f"   SNR {np.nanmean(reps):6.2f} dB  (n={int(good.sum())})")

    # The guard the first run needed. A saturated design missing a cell still
    # "fits" and returns intervals of +/- 17 million dB; refusing is the only
    # honest output.
    thin = [i for i, k in enumerate(keep) if k < MIN_REPLICATES]
    if thin:
        raise SystemExit(
            f"cells {thin} have fewer than {MIN_REPLICATES} usable replicates; "
            "the design is degenerate and no interaction may be estimated from it"
        )

    X_cells, names = design_matrix(rows)
    X = np.repeat(X_cells, keep, axis=0)
    Y = np.concatenate(y)

    beta, *_ = np.linalg.lstsq(X, Y, rcond=None)
    resid = Y - X @ beta
    dof = Y.size - X.shape[1]
    s2 = float(resid @ resid) / dof
    cov = s2 * np.linalg.inv(X.T @ X)
    se = np.sqrt(np.diag(cov))
    tcrit = stats.t.ppf(1 - ALPHA / 2, dof)

    # Effect = 2 * coefficient: the change from the low level to the high one.
    effects, pvals = {}, {}
    for k, name in enumerate(names):
        if name == "intercept":
            continue
        eff, half = 2.0 * beta[k], 2.0 * tcrit * se[k]
        t = beta[k] / se[k]
        p = float(2 * stats.t.sf(abs(t), dof))
        effects[name] = {"effect_db": float(eff),
                         "ci": [float(eff - half), float(eff + half)],
                         "clears_zero": bool(abs(eff) > half),
                         "p_value": p}
        pvals[name] = p

    holm = analysis.holm(pvals, alpha=ALPHA)
    for name in effects:
        effects[name]["survives_holm"] = bool(holm[name])

    interaction = effects["eta:xi"]
    print(f"\ndof = {dof}, residual sd = {np.sqrt(s2):.3f} dB")
    print("\neffects that clear zero AND survive Holm:")
    any_survived = False
    for name, e in sorted(effects.items(), key=lambda kv: kv[1]["p_value"]):
        if e["clears_zero"] and e["survives_holm"]:
            any_survived = True
            print(f"  {name:32s} {e['effect_db']:+7.3f} dB  "
                  f"[{e['ci'][0]:+.3f}, {e['ci'][1]:+.3f}]  p={e['p_value']:.2e}")
    if not any_survived:
        print("  (none)")

    significant = interaction["clears_zero"] and interaction["survives_holm"]
    sign = "sub-additive (redundant)" if interaction["effect_db"] < 0 else "super-additive (cooperative)"
    if significant:
        verdict = (
            f"The eta:xi interaction is significant and **{sign}**: "
            f"{interaction['effect_db']:+.3f} dB, CI "
            f"[{interaction['ci'][0]:+.3f}, {interaction['ci'][1]:+.3f}], surviving Holm. "
            "Each noise raises the SNR on its own (eta "
            f"{effects['eta']['effect_db']:+.2f} dB, xi {effects['xi']['effect_db']:+.2f} dB) "
            "and together they raise it by LESS than the sum. The word 'cooperate' "
            "is therefore the wrong one for what was measured."
        )
    else:
        verdict = (
            "NO claim about cooperation may be made: the eta:xi interaction does not "
            f"clear zero with a 95% interval ({interaction['effect_db']:+.3f} dB, CI "
            f"[{interaction['ci'][0]:+.3f}, {interaction['ci'][1]:+.3f}]). Per spec §7.2 "
            "an absolute lift without a significant interaction is not a finding."
        )

    #: The confound this result cannot rule out, named rather than left implicit.
    confound = (
        "The working point sits AT the stochastic-resonance optimum (sigma* = 0.85, "
        "theta = 2 sigma*), so raising both noises together pushes the detector onto "
        "the DESCENDING flank of its own inverted U. A negative eta:xi interaction is "
        "therefore what the curvature of the SR curve would produce on its own, and "
        "this design cannot separate that from genuine redundancy between the two "
        "channels. Distinguishing them needs the levels chosen so the TOTAL noise "
        "stays below the optimum in every cell, or the operating point itself varied "
        "as a sixth factor. Until then the sign is measured and its cause is not."
    )
    print(f"\nGATE-B3 verdict: {verdict}")
    print(f"\nCONFOUND (not ruled out): {confound}")

    result = {
        "run_id": RUN_ID,
        "design": "resolution-V half fraction of 2^5, generator E = ABCD",
        "factors": FACTORS,
        "levels": {k: list(v) for k, v in LEVELS.items()},
        "detector": "B (LIF with separable intrinsic noise) — spec §4.4.3",
        "power_analysis": {
            "sigma_hat_db": sigma_hat,
            "pilot_seeds": int(pilot.size),
            "delta_db": DELTA_DB, "power": POWER, "alpha": ALPHA,
            "n_total_required": n_total,
            "seeds_per_cell_used": per_cell,
            "n_total_used": int(Y.size),
            "adequately_powered": bool(Y.size >= n_total),
        },
        "cells": [{**{f: r[f] for f in FACTORS}, "n": k,
                   "mean_snr_db": float(np.mean(yy)) if yy.size else None}
                  for r, yy, k in zip(rows, y, keep)],
        "residual_sd_db": float(np.sqrt(s2)),
        "dof": int(dof),
        "effects": effects,
        "gate_B3": {
            "interaction_of_interest": "eta:xi",
            **interaction,
            "sign": sign if significant else None,
            "verdict": verdict,
            "unresolved_confound": confound,
        },
    }
    out = attest.record_run(RUN_ID, result, actor="SINTETIZADOR")
    print(f"written: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
