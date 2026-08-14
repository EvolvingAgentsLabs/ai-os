"""E2 -- the tonotopic map, across three operators. Spec §7.1 E2, GATE-B1.

Three arms, and the first two are controls that are expected to fail:

* **control-string** -- spec equation (2.1) exactly as written.
* **control-ground-spring** -- ADR-0001's stiffness to ground, falsified.
* **transmission-line** -- ADR-0002's operator, the one with a place code.

Running the failures beside the result is not sentiment. GATE-C2 pre-registered
"the treatment is accepted only if the control remains false", and a control arm
that quietly started working would void the comparison without anything else
changing. It costs two extra sweeps of a banded solve.

Also reports what spec §2.7 asks for and predicts will be disappointing: the
tuning sharpness ``Q_10dB``. The passive model is expected to fall far short of
the physiological figure, and **documenting that gap is the quantitative argument
for the active layer of Phase 2** rather than a shortfall.

    cd projects/coclea-sr && PYTHONPATH=src .venv/bin/python experiments/e2_tonotopy.py
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
_sys.path.insert(0, str(ROOT / "src"))

from coclea import assembly, attest, forced, profiles, transmission, units  # noqa: E402

RUN_ID = "e2-tonotopy"
N = 4000
N_FREQ = 60
BETA = 8.0
HZ_LO, HZ_HI = 200.0, 18000.0


def verdict(hz, x_cf, interior) -> dict[str, object]:
    """Is this a place map at all? Three questions, cheapest-to-kill first."""
    x = np.asarray(x_cf)
    span = float(x.max() - x.min())
    frac_interior = float(np.mean(interior))
    order = np.argsort(hz)
    decreasing = float(np.mean(np.diff(x[order]) <= 1e-12))
    return {
        "x_cf_span": span,
        "fraction_of_peaks_interior": frac_interior,
        "fraction_monotone_decreasing": decreasing,
        "is_place_map": bool(span > 0.1 and frac_interior > 0.8 and decreasing > 0.95),
    }


def greenwood_comparison(hz, x_cf) -> dict[str, float]:
    """GATE-B1, a soft gate: shape, not magnitude.

    Spec §R4 is explicit that a one-dimensional abstraction cannot match
    Greenwood quantitatively, so a close numerical agreement would be a
    coincidence rather than a result. What is compared is monotonicity, the
    correlation, and the slope per decade — the log-linear form Greenwood has.
    """
    gw = np.asarray(units.greenwood_place(hz), dtype=float)
    xc = np.asarray(x_cf, dtype=float)
    return {
        "pearson_r": float(np.corrcoef(gw, xc)[0, 1]),
        "slope_per_decade": float(np.polyfit(np.log10(hz), xc, 1)[0]),
        "greenwood_slope_per_decade": float(np.polyfit(np.log10(hz), gw, 1)[0]),
        "mean_absolute_offset": float(np.mean(np.abs(gw - xc))),
    }


def q10db(profile, omegas, probe_x: float) -> dict[str, float]:
    """Tuning sharpness at one place, from the transmission line. Spec §2.7."""
    mags = []
    for w in omegas:
        r = transmission.respond(profile, N, float(w), BETA)
        i = int(np.argmin(np.abs(r.x - probe_x)))
        mags.append(abs(r.U[i]))
    mags = np.asarray(mags)
    k = int(np.argmax(mags))
    f_c = float(omegas[k])
    cutoff = mags[k] / (10.0 ** (10.0 / 20.0))
    below = omegas[:k][mags[:k] < cutoff]
    above = omegas[k + 1:][mags[k + 1:] < cutoff]
    if not below.size or not above.size:
        return {"probe_x": probe_x, "f_c": f_c, "q10db": float("nan"), "bracketed": False}
    return {
        "probe_x": probe_x,
        "f_c": f_c,
        "q10db": float(f_c / (float(above[0]) - float(below[-1]))),
        "bracketed": True,
    }


def main() -> int:
    hz = np.logspace(np.log10(HZ_LO), np.log10(HZ_HI), N_FREQ)
    omegas = np.asarray(units.SCALE.omega_tilde_of(hz), dtype=float)
    arms: dict[str, dict] = {}

    # --- control 1: the specification's own string, equation (2.1) ------------
    prof = profiles.REFERENCE_NO_GROUND
    sysm = assembly.assemble(prof, 2000)
    m = forced.tonotopic_map(sysm, omegas)
    arms["control_string"] = {
        "operator": "spec (2.1), string, no ground term",
        "hz": hz.tolist(), "x_cf": m["x_cf"].tolist(),
        "peak_is_interior": m["peak_is_interior"].tolist(),
        **verdict(hz, m["x_cf"], m["peak_is_interior"]),
    }

    # --- control 2: ADR-0001's ground spring, already falsified ---------------
    prof2 = profiles.BMProfile(
        alpha_mu=profiles.ALPHA_MU_REF, alpha_K=profiles.ALPHA_K_REF,
        coupling=0.05, zeta0=0.05,
    )
    sys2 = assembly.assemble(prof2, 2000)
    m2 = forced.tonotopic_map(sys2, omegas)
    arms["control_ground_spring"] = {
        "operator": "ADR-0001, string + stiffness to ground (falsified)",
        "coupling": prof2.coupling,
        "hz": hz.tolist(), "x_cf": m2["x_cf"].tolist(),
        "peak_is_interior": m2["peak_is_interior"].tolist(),
        **verdict(hz, m2["x_cf"], m2["peak_is_interior"]),
    }

    # --- treatment: ADR-0002's transmission line ------------------------------
    tl = transmission.tonotopic_map(prof, N, omegas, BETA)
    treat = {
        "operator": "ADR-0002, long-wave transmission line",
        "beta": BETA, "N": N,
        "hz": hz.tolist(), "x_cf": tl["x_cf"].tolist(),
        "characteristic_place": tl["characteristic_place"].tolist(),
        "peak_is_interior": tl["peak_is_interior"].tolist(),
        "cochlear_orientation": tl["cochlear_orientation"].tolist(),
        "all_cochlear_orientation": bool(np.all(tl["cochlear_orientation"])),
        **verdict(hz, tl["x_cf"], tl["peak_is_interior"]),
    }
    if treat["is_place_map"]:
        treat["greenwood"] = greenwood_comparison(hz, tl["x_cf"])
    arms["transmission_line"] = treat

    for name, a in arms.items():
        print(
            f"{name:24s} span={a['x_cf_span']:.4f} interior={a['fraction_of_peaks_interior']:.2f} "
            f"monotone={a['fraction_monotone_decreasing']:.2f} "
            f"place map: {'YES' if a['is_place_map'] else 'NO'}",
            flush=True,
        )
    if "greenwood" in treat:
        g = treat["greenwood"]
        print(f"  vs Greenwood: r={g['pearson_r']:+.4f}  slope {g['slope_per_decade']:+.4f}/decade "
              f"(Greenwood {g['greenwood_slope_per_decade']:+.4f})")

    # --- Q_10dB, and the gap spec §2.7 predicts -------------------------------
    qs = [q10db(prof, omegas, xp) for xp in (0.15, 0.3, 0.5, 0.7)]
    for q in qs:
        print(f"  Q10dB at x={q['probe_x']:.2f}: {q['q10db']:.2f}" +
              ("" if q["bracketed"] else "  (not bracketed by the sweep)"))

    result = {
        "run_id": RUN_ID, "N": N, "n_frequencies": N_FREQ,
        "hz_range": [HZ_LO, HZ_HI], "beta": BETA,
        "arms": arms,
        "q10db": qs,
        "q10db_note": (
            "Spec §2.7 predicts Q ~ 1-10 for a passive model against a much sharper "
            "figure in vivo. The gap is the quantitative argument for the Phase-2 "
            "active layer and is reported as a result, not a shortfall."
        ),
        "adr_0002_verdict": (
            "accepted"
            if treat["is_place_map"] and treat["all_cochlear_orientation"]
            and not arms["control_string"]["is_place_map"]
            and not arms["control_ground_spring"]["is_place_map"]
            else "PRE-REGISTERED CONDITION NOT MET"
        ),
    }
    out = attest.record_run(RUN_ID, result)
    print(f"\nADR-0002: {result['adr_0002_verdict']}")
    print(f"written: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
