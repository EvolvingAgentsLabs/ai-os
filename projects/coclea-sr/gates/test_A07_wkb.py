"""GATE-A7 -- the WKB quantisation condition.

Spec §2.5, equation (2.10)::

    int_0^L k_n(x) dx = w_n int_0^L ds / c(s)  ~  (2n-1) pi / 2 + corrections

with ``c(x) = sqrt(K/mu)`` the local wave speed. The spec's own statement of what
success looks like is unusual and is the point: **the error must decrease with
n**, because WKB is a semiclassical approximation that improves as the wavelength
shrinks against the scale on which the coefficients vary. A gate that demanded a
fixed tolerance would be testing the wrong thing -- it would fail on mode 1, where
WKB is not supposed to be good, and pass on mode 12 for the wrong reason.

So the assertion is *monotone decreasing*, not *small*. That is the shape of the
claim, and holding an approximation to the shape of its own claim is what
separates a gate from a threshold somebody picked.

``kappa = 0`` throughout: this is the quantisation of the spec's operator (2.1),
which has no turning point, so the plain Dirichlet-Neumann phase condition
applies with no Maslov correction beyond the quarter wave. ADR-0001's ground term
introduces a turning point and therefore a *different* quantisation; that is
Phase 2 material and is not claimed here.
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import assembly, modal, profiles

GATE = "A07"
SPEC = "2.5 / 2.10"

N = 4000
N_MODES = 12


def _phase_integral(profile, points=20001):
    """``int_0^1 ds / c(s)`` -- the traverse time, computed on its own fine grid.

    Deliberately not reusing the solver's nodes: the point of A7 is to compare
    the numerics against an independent semiclassical prediction, and computing
    the prediction on the solver's own grid would share its discretisation error.
    """
    xs = np.linspace(0.0, 1.0, points)
    return float(np.trapezoid(1.0 / profile.wave_speed(xs), xs))


@pytest.mark.parametrize(
    "name,profile",
    [
        ("exponential-3", profiles.exponential(3.0)),
        ("reference-no-ground", profiles.REFERENCE_NO_GROUND),
        ("steep-no-ground", profiles.BMProfile(alpha_mu=4.0, alpha_K=10.0, coupling=0.0)),
    ],
)
def test_the_wkb_error_falls_with_mode_number(name, profile, report):
    modes = modal.eigenmodes(assembly.assemble(profile, N), N_MODES)
    traverse = _phase_integral(profile)

    n = np.arange(1, N_MODES + 1)
    phase = modes.omega * traverse
    target = (2 * n - 1) * np.pi / 2.0
    rel = np.abs(phase - target) / target

    report(
        case=name,
        alpha_mu=profile.alpha_mu,
        alpha_K=profile.alpha_K,
        N=N,
        traverse_time=traverse,
        phase=phase.tolist(),
        target=target.tolist(),
        relative_error=rel.tolist(),
        first_mode_error=float(rel[0]),
        last_mode_error=float(rel[-1]),
        improvement_factor=float(rel[0] / rel[-1]),
    )

    assert np.all(np.diff(rel) < 0.0), (
        f"WKB error is not monotone in n: {np.round(rel, 5).tolist()}"
    )
    # And it has to actually get somewhere. A sequence falling by 1% over twelve
    # modes is monotone and is not an approximation converging.
    assert rel[0] / rel[-1] > 5.0
    assert rel[-1] < 0.05


def test_the_uniform_case_is_exact(report):
    """With ``mu`` and ``K`` constant, WKB is not an approximation.

    ``c`` is constant, ``k`` is constant, and (2.10) reduces to the exact
    eigenvalue relation of GATE-A1. The residual here is therefore pure
    discretisation error, and it is the cheapest available confirmation that the
    phase integral, the traverse time and the mode indexing are all wired up the
    way (2.10) means them -- an off-by-one in ``n`` would show as a constant
    ``pi`` offset that no varying profile would separate from a WKB correction.
    """
    profile = profiles.uniform()
    modes = modal.eigenmodes(assembly.assemble(profile, N), N_MODES)
    traverse = _phase_integral(profile)

    n = np.arange(1, N_MODES + 1)
    rel = np.abs(modes.omega * traverse - (2 * n - 1) * np.pi / 2.0) / ((2 * n - 1) * np.pi / 2.0)

    report(case="uniform", traverse_time=traverse, relative_error=rel.tolist(),
           worst=float(rel.max()))
    assert rel.max() < 1e-5, "an off-by-one in the mode index would show here"
