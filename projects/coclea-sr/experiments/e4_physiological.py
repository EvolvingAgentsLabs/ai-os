"""E4 -- is the auditory system operating near the stochastic-resonance optimum?
Spec §4.5. The prediction that motivated the whole project.

> Si el sistema auditivo opera cerca del óptimo de RE, entonces el nivel de ruido
> inferido de la actividad basal (vía r₀ y la fórmula de Rice invertida) debe
> caer en la vecindad de D_opt de la curva SNR(D) del propio modelo.

## The obstacle, and the way §4.5 gets round it

The model is dimensionless: §3.3 sets ``ũ = u / u_ref`` and never fixes
``u_ref``. So the optimum ``σ_opt = θ/2`` cannot be compared against nanometres
without inventing a scale, and any such comparison would be a statement about
the scale somebody chose rather than about hearing.

§4.5 supplies the escape in one parenthesis — infer the noise from the
**spontaneous rate**. Rice's crossing rate inverts to

    θ/σ = sqrt( 2 ln( ω_eff / (2π r₀) ) )

in which the displacement units cancel. Both sides are dimensionless, the model
predicts ``θ/σ = 2``, and physiology supplies ``r₀``. **No displacement scale
enters anywhere.** `truth/rice_inverse.py` derives it; GATE-A10 validates it
against a simulated spontaneous rate to 0.25%.

## What is measured against what

The model's own optimum is taken from the E3 run rather than from the formula, so
the comparison uses what was *observed*: E3 reports the optimum at ``σ/θ`` =
0.558 (`θ/σ` = 1.79) against the predicted 0.5 (`θ/σ` = 2.0), the gap being the
resolution of its σ grid. Both bounds are carried through.

## The load-bearing assumption, named so it can be attacked

``ω_eff`` is the *effective bandwidth of the internal noise*, and a fibre's
characteristic frequency is used as its stand-in. This is the assumption the
whole verdict rests on and it is not verified here: if the internal noise is
broader-band than the tuning, ``ω_eff`` is larger, the rate required at the
optimum rises in proportion, and the verdict moves against the hypothesis. If it
is narrower, the verdict moves in favour. **Anyone attacking this result should
attack that number first.**

    cd projects/coclea-sr && PYTHONPATH=src .venv/bin/python experiments/e4_physiological.py
"""

from __future__ import annotations

import glob
import json
import math
import sys as _sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
_sys.path.insert(0, str(ROOT / "src"))
_sys.path.insert(0, str(ROOT))

from coclea import attest  # noqa: E402
from truth import rice_inverse  # noqa: E402

RUN_ID = "e4-physiological"

#: Empirical ranges. **[read] from COCLEA-SR-SPEC §4.5**, which states them, and
#: NOT independently verified against the primary literature in this pass.
#: Upgrading them is exactly what the LITERATURA role of §6.2 is for, and the
#: verdict below reports how much it would move if they are wrong.
EMPIRICAL = {
    "source": "COCLEA-SR-SPEC.md §4.5 — not independently verified in this pass",
    "spontaneous_rate_sp_per_s": [0.0, 100.0],
    "stereocilia_brownian_noise_nm_rms": [1.0, 3.0],
    "threshold_bm_displacement_nm": [0.1, 1.0],
}

#: Characteristic frequencies to evaluate, spanning the audible range.
CF_HZ = [125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0]
#: Spontaneous rates spanning the auditory-nerve population, from the near-silent
#: fibres to the fastest. The whole span is swept rather than one value picked,
#: because the point of the sweep is which part of it lands on the optimum.
RATES_SP_PER_S = [0.5, 2.0, 10.0, 18.0, 40.0, 60.0, 80.0, 100.0]


def model_optimum() -> dict:
    """The optimum as E3 measured it and as the theory predicts it."""
    runs = sorted(glob.glob(str(ROOT / "runs" / "e3-sr-curve-*" / "result.json")))
    if not runs:
        raise SystemExit("no E3 run on disk; run experiments/e3_sr_curve.py first")
    path = runs[-1]
    e3 = json.loads(Path(path).read_text())

    ratios = []
    for band in e3["results"].values():
        for probe in band["probes"].values():
            if probe["significant_interior_maximum"]:
                ratios.append(probe["theta"] / probe["argmax_value"])
    return {
        "e3_run": Path(path).parent.name,
        "theta_over_sigma_predicted": 2.0,
        "theta_over_sigma_measured_median": float(np.median(ratios)),
        "theta_over_sigma_measured_range": [float(min(ratios)), float(max(ratios))],
        "n_curves": len(ratios),
        "grid_resolution": e3["prediction_check"]["grid_resolution"],
    }


def acceptance_band(opt: dict) -> list[float]:
    """The interval a physiological fibre must land in to count as "at the optimum".

    Spans the predicted value and E3's measured one, widened by **half** the σ
    grid spacing — the resolution with which E3 could locate an optimum at all.
    Stated before the physiology is looked at, so the band is not drawn round
    the answer.
    """
    lo = min(opt["theta_over_sigma_predicted"], opt["theta_over_sigma_measured_median"])
    hi = max(opt["theta_over_sigma_predicted"], opt["theta_over_sigma_measured_median"])
    half = opt["grid_resolution"] / 2.0
    return [lo * (1.0 - half), hi * (1.0 + half)]


def main() -> int:
    opt = model_optimum()
    band = acceptance_band(opt)
    print(f"model optimum  theta/sigma: predicted {opt['theta_over_sigma_predicted']:.3f}, "
          f"E3 measured {opt['theta_over_sigma_measured_median']:.3f} "
          f"({opt['n_curves']} curves)")
    print(f"acceptance band (pre-registered from E3's own resolution): "
          f"[{band[0]:.3f}, {band[1]:.3f}]\n")

    rows = []
    for f_c in CF_HZ:
        omega_eff = 2.0 * math.pi * f_c
        for r0 in RATES_SP_PER_S:
            try:
                ratio = rice_inverse.threshold_over_sigma(r0, omega_eff)
            except ValueError as exc:
                rows.append({"cf_hz": f_c, "rate": r0, "theta_over_sigma": None,
                             "in_band": False, "note": str(exc)})
                continue
            rows.append({
                "cf_hz": f_c,
                "rate": r0,
                "theta_over_sigma": ratio,
                "distance_from_predicted_optimum": abs(ratio - 2.0) / 2.0,
                "in_band": bool(band[0] <= ratio <= band[1]),
            })

    # What rate would put each characteristic frequency exactly at the optimum,
    # and is that rate physiologically reachable?
    ceiling = EMPIRICAL["spontaneous_rate_sp_per_s"][1]
    required = []
    for f_c in CF_HZ:
        omega_eff = 2.0 * math.pi * f_c
        lo = rice_inverse.rate_from_ratio(band[1], omega_eff)
        hi = rice_inverse.rate_from_ratio(band[0], omega_eff)
        required.append({
            "cf_hz": f_c,
            "rate_at_predicted_optimum": rice_inverse.rate_at_optimum(omega_eff),
            "rate_band_sp_per_s": [lo, hi],
            "reachable_within_empirical_ceiling": bool(lo <= ceiling),
        })
        mark = "yes" if lo <= ceiling else "NO"
        print(f"  CF {f_c:7.0f} Hz -> needs r0 in [{lo:8.1f}, {hi:8.1f}] sp/s "
              f"(optimum {rice_inverse.rate_at_optimum(omega_eff):8.1f})   reachable: {mark}")

    reachable = [r["cf_hz"] for r in required if r["reachable_within_empirical_ceiling"]]
    crossover = max(reachable) if reachable else None

    # Sensitivity: how much the verdict moves if the rates are wrong by 10x.
    sens = rice_inverse.sensitivity_to_rate(60.0, 2.0 * math.pi * 1000.0)

    verdict = {
        "compatible_at_cf_hz": reachable,
        "incompatible_at_cf_hz": [r["cf_hz"] for r in required
                                  if not r["reachable_within_empirical_ceiling"]],
        "crossover_cf_hz": crossover,
        "statement": (
            "The stochastic-resonance optimum is reachable by auditory-nerve fibres at "
            f"characteristic frequencies up to about {crossover:.0f} Hz and is not "
            "reachable above it: the required spontaneous rate scales with the "
            "effective bandwidth, and above the crossover it exceeds the highest rate "
            "the empirical range allows."
        ) if crossover else (
            "No characteristic frequency in the swept range can reach the optimum "
            "within the empirical spontaneous-rate ceiling."
        ),
    }

    print(f"\nVERDICT: {verdict['statement']}")
    print(f"  sensitivity: a 10x error in r0 moves theta/sigma by "
          f"{sens['relative_change_if_rate_divided_by_factor']:.1%} downward"
          + ("; the upward arm crosses the ceiling where Rice does not apply"
             if sens["upward_arm_crosses_ceiling"] else ""))

    result = {
        "run_id": RUN_ID,
        "model_optimum": opt,
        "acceptance_band": band,
        "empirical_ranges": EMPIRICAL,
        "grid": rows,
        "required_rate_by_cf": required,
        "sensitivity_at_1kHz_60sp": sens,
        "verdict": verdict,
        "load_bearing_assumption": (
            "omega_eff is taken as 2*pi*CF — the internal noise bandwidth is assumed "
            "equal to the fibre's characteristic frequency. It is NOT verified here. "
            "A broader-band internal noise raises the required rate proportionally and "
            "moves the verdict against the hypothesis; a narrower one moves it in "
            "favour. Attack this number first."
        ),
        "not_used": (
            "The stereocilia Brownian-noise range (1-3 nm RMS) and the threshold "
            "displacement range (0.1-1 nm) are recorded but NOT used in the verdict: "
            "both are displacements, and the model has no displacement scale to "
            "compare them against. Using them would require inventing u_ref."
        ),
    }
    out = attest.record_run(RUN_ID, result, actor="LITERATURA")
    print(f"written: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
