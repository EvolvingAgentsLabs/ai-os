"""GATE-C2 -- ADR-0002's pre-registered acceptance condition.

The ADR wrote its own stopping condition **before** the operator was built:

> the transmission line is accepted only if `cochlear_orientation` is true and
> the control arm — this operator — remains false.

Both arms are here. The control is the string-with-a-ground-spring the ADR
falsified; the treatment is the transmission line. Registering the condition in
advance is what stops this from being a search for the arrangement that agrees.

Békésy's traveling wave requires the response to **propagate basal** to the
characteristic place and to be **evanescent apical** to it: the wave runs in from
the stapes, slows, piles up, and dies beyond its place.
"""

from __future__ import annotations

import numpy as np

from coclea import assembly, forced, profiles, transmission, units

GATE = "C02"
SPEC = "ADR-0002"

BETA = 8.0
N = 4000
HZ = np.array([200.0, 500.0, 1500.0, 3000.0, 6000.0, 12000.0])


def test_the_treatment_has_the_cochlear_orientation(report):
    """The condition ADR-0002 committed to in advance."""
    prof = profiles.REFERENCE_NO_GROUND
    rows = []
    for hz in HZ:
        w = float(units.SCALE.omega_tilde_of(float(hz)))
        r = transmission.respond(prof, N, w, BETA)
        reg = transmission.wave_regions(r)
        rows.append({
            "hz": float(hz), "omega": w, "x_cf": r.x_cf,
            "characteristic_place": reg.get("characteristic_place"),
            "peak_is_interior": bool(r.peak_is_interior),
            "basal_is_propagating": reg.get("basal_is_propagating"),
            "apical_is_propagating": reg.get("apical_is_propagating"),
            "cochlear_orientation": reg.get("cochlear_orientation"),
        })

    report(arm="treatment-transmission-line", beta=BETA, N=N, rows=rows)
    assert all(r["cochlear_orientation"] for r in rows), "the wave runs the wrong way"
    assert all(r["peak_is_interior"] for r in rows), "a peak at an end is not a place"


def test_the_control_arm_still_fails(report):
    """The other half of the pre-registered condition.

    If the string-with-a-ground-spring had started producing a place map, the
    comparison would say nothing about the new operator — the difference would
    be somewhere else in the code.
    """
    prof = profiles.BMProfile(
        alpha_mu=profiles.ALPHA_MU_REF, alpha_K=profiles.ALPHA_K_REF,
        coupling=0.05, zeta0=0.05,
    )
    sysm = assembly.assemble(prof, 2000)
    rows = []
    for hz in HZ:
        w = float(units.SCALE.omega_tilde_of(float(hz)))
        r = forced.respond(sysm, w)
        # The string's local wavenumber: k^2 = (W^2 mu - K) / (eps^2 K).
        K, mu = prof.K_ref(sysm.x), prof.mu(sysm.x)
        k2 = (w**2 * mu - K) / (prof.coupling**2 * K)
        x_star = 2.0 * np.log(1.0 / w) / (prof.alpha_K + prof.alpha_mu)
        basal, apical = sysm.x < x_star, sysm.x > x_star
        rows.append({
            "hz": float(hz), "x_cf": r.x_cf, "peak_is_interior": bool(r.peak_is_interior),
            "basal_is_propagating": bool(np.mean(k2[basal] > 0) > 0.5) if basal.any() else None,
            "apical_is_propagating": bool(np.mean(k2[apical] > 0) > 0.5) if apical.any() else None,
        })

    orientation = [
        bool(r["basal_is_propagating"]) and not bool(r["apical_is_propagating"]) for r in rows
    ]
    report(arm="control-string-with-ground-spring", rows=rows, cochlear_orientation=orientation)
    assert not any(orientation), (
        "the control arm acquired a cochlear orientation; the comparison is void"
    )


def test_the_peak_sits_where_the_membrane_is_tuned(report):
    """A peak is only a *place* code if it lands where the impedance resonates.

    `x_cf` comes from the solved field; `characteristic_place` comes from the
    impedance alone, with no field involved. Their agreement is what makes this
    a tonotopic map rather than a bump that happens to move.
    """
    prof = profiles.REFERENCE_NO_GROUND
    gaps = []
    for hz in HZ:
        w = float(units.SCALE.omega_tilde_of(float(hz)))
        r = transmission.respond(prof, N, w, BETA)
        x_star = r.characteristic_place()
        gaps.append(abs(r.x_cf - x_star))

    report(hz=HZ.tolist(), gap=gaps, worst_gap=float(max(gaps)))
    # One grid spacing is the resolution of x_cf; a few of them is agreement.
    assert max(gaps) < 5.0 / N, f"peak and tuned place differ by {max(gaps):.5f}"
