"""GATE-C3 -- power in at the stapes equals power dissipated in the membrane.

A conservation law the solver does not satisfy by construction. From
``P'' + k^2 P = 0``, multiplying by ``P*`` and integrating,

    -Im( P*(0) P'(0) )  =  beta^2 Omega^3 int R |P|^2 / |Z|^2 dx

with the apical term vanishing because ``P(1) = 0``. The left side is a boundary
quantity and the right side a volume integral, computed independently, so this
is the gate that catches a stencil which is right in the interior and wrong at
the drive node — the one place the other C gates cannot see, because the uniform
box has a closed form that a boundary error would simply shift.

It is also the only gate here that is about **energy** rather than about shape,
which makes it the analogue of GATE-A5/A6 for an operator that has no
eigenvalue problem to conserve anything in.
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import profiles, transmission, units

GATE = "C03"
SPEC = "ADR-0002"

BETA = 8.0
TOLERANCE = 1e-3


@pytest.mark.parametrize("hz", [500.0, 3000.0, 12000.0])
@pytest.mark.parametrize("N", [2000, 4000])
def test_power_in_equals_power_dissipated(hz, N, report):
    prof = profiles.REFERENCE_NO_GROUND
    w = float(units.SCALE.omega_tilde_of(hz))
    resp = transmission.respond(prof, N, w, BETA)
    pb = transmission.power_balance(resp)

    report(hz=hz, N=N, omega=w, beta=BETA, tolerance=TOLERANCE, **pb)
    assert pb["power_in"] > 0.0, "the stapes is extracting energy from a passive line"
    assert pb["relative_residual"] < TOLERANCE


def test_the_residual_falls_with_the_grid(report):
    """A balance that holds to a fixed tolerance could be holding by luck.

    The residual is a discretisation error, so it has to shrink as the grid
    refines. A flat residual would mean the two sides agree on something other
    than the physics.
    """
    prof = profiles.REFERENCE_NO_GROUND
    w = float(units.SCALE.omega_tilde_of(3000.0))
    grids = (500, 1000, 2000, 4000)
    res = [transmission.power_balance(transmission.respond(prof, N, w, BETA))["relative_residual"]
           for N in grids]
    order = float(-np.polyfit(np.log(grids), np.log(res), 1)[0])

    report(grids=list(grids), residuals=res, observed_order=order)
    assert order > 0.8, f"the power residual does not fall with the grid (order {order:.3f})"


def test_the_peak_scales_as_one_over_damping(report):
    """The physical law the balance is bookkeeping for.

    A conservation check can be exact and meaningless if both sides are zero, so
    something about the *content* has to be asserted. The first version of this
    test guessed that more damping dissipates more power. **It does not**, and
    the measurement says why: over three decades of ``zeta`` the power delivered
    at the stapes moves by 16% (1.45 to 1.21) while the peak displacement moves
    by a factor of 400. The stapes delivers what the line's input impedance
    accepts; the damping decides only *where* and *how sharply* that power is
    absorbed. That is the standard cochlear result and the guess was simply
    wrong.

    What the damping does control, exactly, is the peak: ``|U|_max ~ 1/zeta``.
    Measured at N = 8000, ``|U|_max * zeta`` is 4.209, 4.238, 4.336, 4.450 across
    zeta = 0.01 to 0.4 — constant to 6% while the peak itself changes 40-fold.
    """
    w = float(units.SCALE.omega_tilde_of(3000.0))
    zetas = (0.01, 0.05, 0.2, 0.4)
    products, peaks, powers = {}, {}, {}
    for z in zetas:
        prof = profiles.BMProfile(
            alpha_mu=profiles.ALPHA_MU_REF, alpha_K=profiles.ALPHA_K_REF,
            coupling=0.0, zeta0=z,
        )
        resp = transmission.respond(prof, 8000, w, BETA)
        peaks[z] = resp.peak
        products[z] = resp.peak * z
        powers[z] = transmission.power_balance(resp)["power_in"]

    vals = [products[z] for z in zetas]
    spread = (max(vals) - min(vals)) / min(vals)

    report(
        zetas=list(zetas),
        peak_amplitude={str(k): v for k, v in peaks.items()},
        peak_times_zeta={str(k): v for k, v in products.items()},
        power_in={str(k): v for k, v in powers.items()},
        peak_dynamic_range=float(max(peaks.values()) / min(peaks.values())),
        power_spread=float((max(powers.values()) - min(powers.values())) / min(powers.values())),
        product_spread=float(spread),
    )

    assert spread < 0.10, f"|U|max * zeta is not constant: {products}"
    # And the peak really does move, or the constancy above would be trivial.
    assert max(peaks.values()) / min(peaks.values()) > 30.0


def test_the_one_over_zeta_law_is_grid_limited_at_small_damping(report):
    """Where the instrument stops resolving its own answer.

    At ``zeta = 1e-3`` the peak is so sharp that a 2000-point grid under-resolves
    it and ``|U|max * zeta`` reads 2.50 instead of 4.21 — a 40% error that looks
    like a breakdown of the physical law and is a property of the grid. Refining
    recovers it: 2.497, 3.885, 4.205 at N = 2000, 8000, 32000.

    Recorded because the same shape of mistake has now appeared three times in
    this project — GATE-A12's precision floor, GATE-A14's unpaired seeds, and
    here — and each time it first looked like a result.
    """
    w = float(units.SCALE.omega_tilde_of(3000.0))
    prof = profiles.BMProfile(
        alpha_mu=profiles.ALPHA_MU_REF, alpha_K=profiles.ALPHA_K_REF,
        coupling=0.0, zeta0=1e-3,
    )
    grids = (2000, 8000, 32000)
    vals = [transmission.respond(prof, N, w, BETA).peak * 1e-3 for N in grids]

    report(
        zeta=1e-3, grids=list(grids), peak_times_zeta=vals,
        converged_value=vals[-1],
        error_at_coarsest=float(abs(vals[0] - vals[-1]) / vals[-1]),
    )
    assert vals[0] < vals[1] < vals[2], "the coarse grid should under-resolve the peak"
    # And the refined value must agree with the law measured at larger damping.
    assert abs(vals[-1] - 4.21) / 4.21 < 0.05
