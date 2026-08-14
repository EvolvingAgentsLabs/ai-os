"""E2 -- the tonotopic map, and the headroom check ADR-0001 owes.

Two arms, identical but for one parameter:

* **control** -- ``coupling = 0``: spec equation (2.1) exactly as written.
* **treatment** -- ``coupling > 0``: ADR-0001's local stiffness to ground, swept
  across the coupling length rather than reported at one value.

The control is run **first and on its own terms**. If the spec's own equation
already produces a monotone place map, ADR-0001 bought nothing and should be
reverted; the workspace rule is to find that out before building on the
treatment, not after. It costs one extra sweep of a banded solve.

    cd projects/coclea-sr && PYTHONPATH=src .venv/bin/python experiments/e2_tonotopy.py

Writes `runs/<id>/` with the manifest, the two arms and the verdict.
"""

from __future__ import annotations

import json
import sys as _sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
_sys.path.insert(0, str(ROOT / "src"))

from coclea import assembly, attest, forced, profiles, units  # noqa: E402

RUN_ID = "e2-tonotopy"
N = 2000
#: 60 drive frequencies over three decades. Spec §7.1 E2.
N_FREQ = 60


def sweep(profile, omegas):
    sys_ = assembly.assemble(profile, N)
    return sys_, forced.tonotopic_map(sys_, omegas)


def wave_regions(profile, omega) -> dict[str, object]:
    """Where the response propagates and where it decays.

    The operator ``-eps^2 (K phi')' + (K - W^2 mu) phi = 0`` has local wavenumber

        k^2(x) = (W^2 mu - K) / (eps^2 K)

    and the sign of ``k^2`` is the whole physics: ``k^2 > 0`` propagates,
    ``k^2 < 0`` decays. **Bekesy's traveling wave requires propagating basal to
    the characteristic place and evanescent apical to it** -- the wave runs in
    from the stapes, slows, piles up, and dies. This function measures which way
    round it actually is, which is the diagnostic that turns "no place map" from
    a symptom into a cause.
    """
    if not profile.place_coded:
        return {"applicable": False}
    x = np.linspace(1e-4, 1.0, 4001)
    K, mu = profile.K_ref(x), profile.mu(x)
    k2 = (omega**2 * mu - K) / (profile.coupling**2 * K)
    x_star = 2.0 * np.log(1.0 / omega) / (profile.alpha_K + profile.alpha_mu)
    basal, apical = x < x_star, x > x_star
    return {
        "applicable": True,
        "characteristic_place": float(x_star),
        "basal_is_propagating": bool(np.mean(k2[basal] > 0) > 0.5) if basal.any() else None,
        "apical_is_propagating": bool(np.mean(k2[apical] > 0) > 0.5) if apical.any() else None,
        "cochlear_orientation": (
            bool(np.mean(k2[basal] > 0) > 0.5 and np.mean(k2[apical] > 0) < 0.5)
            if basal.any() and apical.any()
            else None
        ),
    }


def verdict(m) -> dict[str, object]:
    """Is this a place map at all?

    Three questions, in the order that can kill the claim cheapest:

    1. Does the peak sit **inside** the membrane, or at an end? A response that
       grows monotonically to the apex has its maximum at the last node for
       every frequency, and reporting that as ``x_cf`` produces a flat line that
       an eye reads as "the map exists but is compressed".
    2. Does ``x_cf`` **move**? A map that spans a thousandth of the membrane over
       three decades is not a map.
    3. Does it move **monotonically**, high frequency toward the base?
    """
    x = m["x_cf"]
    span = float(x.max() - x.min())
    interior = float(np.mean(m["peak_is_interior"]))
    # Sorted by ascending frequency, x_cf must be non-increasing: high
    # frequencies belong near the base.
    order = np.argsort(m["omega"])
    xs = x[order]
    decreasing = float(np.mean(np.diff(xs) <= 1e-12))
    return {
        "x_cf_span": span,
        "fraction_of_peaks_interior": interior,
        "fraction_monotone_decreasing": decreasing,
        "is_place_map": bool(span > 0.1 and interior > 0.8 and decreasing > 0.95),
    }


def main() -> int:
    scale = units.SCALE
    hz = np.logspace(np.log10(200.0), np.log10(20000.0), N_FREQ)
    omegas = np.asarray(scale.omega_tilde_of(hz), dtype=float)

    sweep_eps = (0.005, 0.01, 0.02, 0.05, 0.1)
    trials = [("control_no_ground", profiles.REFERENCE_NO_GROUND)]
    trials += [
        (
            f"treatment_eps_{eps}",
            profiles.BMProfile(
                alpha_mu=profiles.ALPHA_MU_REF,
                alpha_K=profiles.ALPHA_K_REF,
                coupling=eps,
                zeta0=0.05,
            ),
        )
        for eps in sweep_eps
    ]

    arms = {}
    for name, profile in trials:
        _, m = sweep(profile, omegas)
        v = verdict(m)
        mid = float(omegas[len(omegas) // 2])
        regions = wave_regions(profile, mid)
        arms[name] = {
            "coupling": profile.coupling,
            "alpha_mu": profile.alpha_mu,
            "alpha_K": profile.alpha_K,
            "zeta0": profile.zeta0,
            "hz": hz.tolist(),
            "x_cf": m["x_cf"].tolist(),
            "peak": m["peak"].tolist(),
            "peak_is_interior": m["peak_is_interior"].tolist(),
            "wave_regions_at_mid_frequency": regions,
            **v,
        }
        print(
            f"{name:22s} eps={profile.coupling:6.3f}  span={v['x_cf_span']:.4f}  "
            f"interior={v['fraction_of_peaks_interior']:.2f}  "
            f"monotone={v['fraction_monotone_decreasing']:.2f}  "
            f"place map: {'YES' if v['is_place_map'] else 'NO'}"
            + (
                ""
                if not regions.get("applicable")
                else f"  cochlear wave orientation: {'YES' if regions['cochlear_orientation'] else 'NO -- INVERTED'}"
            ),
            flush=True,
        )

    # Greenwood, for the soft comparison of GATE-B1. Compared on shape only:
    # the model is a one-dimensional abstraction and a quantitative match would
    # be a coincidence rather than a result (spec R4).
    best = max(
        (k for k in arms if k.startswith("treatment")),
        key=lambda k: (arms[k]["is_place_map"], arms[k]["x_cf_span"]),
    )
    treat = arms[best]
    if treat["is_place_map"]:
        gw = np.asarray(units.greenwood_place(hz), dtype=float)
        xc = np.asarray(treat["x_cf"], dtype=float)
        treat["greenwood_pearson_r"] = float(np.corrcoef(gw, xc)[0, 1])
        # Slope of x_cf against log10 f -- the log-linearity Greenwood has.
        treat["slope_per_decade"] = float(np.polyfit(np.log10(hz), xc, 1)[0])
        treat["greenwood_slope_per_decade"] = float(np.polyfit(np.log10(hz), gw, 1)[0])
        print(
            f"  vs Greenwood: r={treat['greenwood_pearson_r']:+.4f}  "
            f"slope {treat['slope_per_decade']:+.4f}/decade "
            f"(Greenwood {treat['greenwood_slope_per_decade']:+.4f})"
        )

    result = {
        "run_id": RUN_ID,
        "N": N,
        "n_frequencies": N_FREQ,
        "hz_range": [float(hz[0]), float(hz[-1])],
        "coupling_sweep": list(sweep_eps),
        "best_treatment_arm": best,
        "arms": arms,
        "adr_0001_verdict": (
            "REVERT-ADR-0001"
            if arms["control_no_ground"]["is_place_map"]
            else "treatment-required"
            if treat["is_place_map"]
            else "neither-arm-produces-a-place-map"
        ),
    }
    out = attest.record_run(RUN_ID, result)
    print(f"\nverdict: {result['adr_0001_verdict']}")
    print(f"written: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
