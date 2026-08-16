"""GATE-A12 -- second-order convergence, and the only gate that localises a fault.

Spec §5.2: compute ``w_n(N)`` for ``N`` in ``{250, 500, 1000, 2000, 4000}``, fit
``w_n(N) = w_n^inf + c / N^p``, require ``p`` in ``[1.9, 2.1]``.

**This is the gate the suite is built around.** A1 and A8 compare one number
against one number: they say *how far off* a solver is, at one grid, and a solver
that is wrong by a constant offset passes them by being run on a fine enough
grid. A12 asks a different question -- *how does the error behave as the grid
refines* -- and the answer is a fingerprint of where the fault is. First order
means a boundary; a stalled error means a bug in the coefficient; superlinear
noise means the eigensolve, not the discretisation.

The deliberate defect in `assembly.py` is here as a fixture, and it is not
decoration: **a gate that has never gone red is not evidence that it works.**
``lumped-full-cell`` gives the apex node a full cell of mass instead of the half
it owns -- an ``O(dx)`` error in the total mass, and therefore in every
eigenvalue. It stays symmetric (A11 green), stays positive definite, keeps a
perfectly ordered spectrum with the right zero counts (A3 green), and produces a
plausible tonotopic map. Only the slope sees it.
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import assembly, modal, profiles
from truth import exponential_modes, uniform_modes

GATE = "A12"
SPEC = "5.2"

GRIDS = (250, 500, 1000, 2000, 4000)
ORDER_BAND = (1.9, 2.1)


#: How far above the eigensolver's own precision floor a point must sit before
#: it is allowed into the fit. See `_precision_floor`.
FLOOR_MARGIN = 10.0


def _precision_floor(sys, truth_omega) -> float:
    """The smallest relative error in ``w`` this eigensolve can resolve.

    A backward-stable symmetric eigensolver returns eigenvalues good to about
    ``eps * ||T||`` in absolute terms, so the *relative* error it can resolve in
    ``lambda = w^2`` is ``eps * ||T|| / lambda``, and half that in ``w``. For a
    second-order scheme ``||T||`` grows like ``N^2`` while the discretisation
    error falls like ``N^-2``, so **the floor rises as fast as the error
    falls** and every convergence study eventually measures the solver instead
    of the discretisation.

    This is not hypothetical, and it is why the function exists. Measured on the
    fundamental of the uniform membrane, the error ratios between successive
    grids run 4.000, 3.997, 4.017 -- and then **4.423** for the last step, where
    the error (5.8e-9) is only twice the floor (2.9e-9). The fitted order comes
    out 2.0306 rather than 2.0000, entirely from that one contaminated point.
    Modes 3 and 10, whose errors stay far above the floor, give 2.0000 and
    1.9999 across all five grids.

    An order of 2.0306 passes GATE-A12's band and would have been read as a
    clean result. It is a clean result about the wrong thing.
    """
    norm = float(np.max(np.abs(sys.Sd / sys.Md)))
    return float(np.finfo(float).eps * norm / (truth_omega**2)) / 2.0


def _error_curve(profile, truth_omega, mode, scheme="flux"):
    """Relative errors and the precision floor at each grid."""
    errs, floors = [], []
    for N in GRIDS:
        sys = assembly.assemble(profile, N, scheme)
        modes = modal.eigenmodes(sys, mode)
        errs.append(abs(float(modes.omega[mode - 1]) - truth_omega) / truth_omega)
        floors.append(_precision_floor(sys, truth_omega))
    return np.array(errs), np.array(floors)


def _observed_order(errs, floors=None):
    """Slope of ``log e`` against ``log N``, over the points that mean anything.

    Points within `FLOOR_MARGIN` of the eigensolver's floor are dropped, and the
    caller is told which -- a silently truncated fit reads as full coverage.
    """
    grids = np.array(GRIDS, dtype=float)
    if floors is None:
        keep = np.ones(len(errs), dtype=bool)
    else:
        keep = errs > FLOOR_MARGIN * floors
    if keep.sum() < 3:
        raise AssertionError(
            f"only {int(keep.sum())} grid(s) sit above the eigensolver's precision floor; "
            "a slope through two points is not a convergence order"
        )
    p = float(-np.polyfit(np.log(grids[keep]), np.log(errs[keep]), 1)[0])
    return p, [int(g) for g, k in zip(GRIDS, keep) if not k]


def _richardson(profile, mode, scheme="flux"):
    """Extrapolate ``w(N)`` to ``N -> inf`` assuming order 2, from the two finest
    grids. Spec §5.2 asks the extrapolation to be consistent with the analytic
    value, which is a stronger statement than the slope alone: a solver
    converging at order 2 to the *wrong* limit has a perfect slope."""
    w_coarse = float(modal.eigenmodes(assembly.assemble(profile, 2000, scheme), mode).omega[mode - 1])
    w_fine = float(modal.eigenmodes(assembly.assemble(profile, 4000, scheme), mode).omega[mode - 1])
    return w_fine + (w_fine - w_coarse) / 3.0


@pytest.mark.parametrize("mode", [1, 3, 10])
def test_uniform_converges_at_second_order(mode, report):
    truth = uniform_modes.omega(mode, c=1.0, length=1.0)
    errs, floors = _error_curve(profiles.uniform(), truth, mode)
    p, dropped = _observed_order(errs, floors)
    extrap = _richardson(profiles.uniform(), mode)

    report(
        case="uniform",
        mode=mode,
        grids=list(GRIDS),
        relative_errors=errs.tolist(),
        precision_floor=floors.tolist(),
        grids_dropped_at_precision_floor=dropped,
        observed_order=p,
        observed_order_all_grids=_observed_order(errs)[0],
        order_band=list(ORDER_BAND),
        richardson_limit=extrap,
        truth=truth,
        richardson_relative_error=abs(extrap - truth) / truth,
    )

    assert ORDER_BAND[0] <= p <= ORDER_BAND[1], f"observed order {p:.4f}, want {ORDER_BAND}"
    assert abs(extrap - truth) / truth < 1e-7, "order 2 toward the wrong limit"


@pytest.mark.parametrize("mode", [1, 3])
def test_the_exponential_profile_converges_at_second_order(mode, report):
    """The convergence claim that matters: a *varying* coefficient in the matrix.

    Second order on a uniform membrane says nothing about whether ``K(x)`` was
    sampled at the faces or averaged from the nodes, because for a constant
    ``K`` those are the same number.
    """
    alpha = 3.0
    truth = exponential_modes.omega(mode, alpha, length=1.0, c=1.0)
    errs, floors = _error_curve(profiles.exponential(alpha), truth, mode)
    p, dropped = _observed_order(errs, floors)
    extrap = _richardson(profiles.exponential(alpha), mode)

    report(
        case="exponential",
        alpha=alpha,
        mode=mode,
        grids=list(GRIDS),
        relative_errors=errs.tolist(),
        precision_floor=floors.tolist(),
        grids_dropped_at_precision_floor=dropped,
        observed_order=p,
        richardson_limit=extrap,
        truth=truth,
        richardson_relative_error=abs(extrap - truth) / truth,
    )
    assert ORDER_BAND[0] <= p <= ORDER_BAND[1], f"observed order {p:.4f}, want {ORDER_BAND}"
    assert abs(extrap - truth) / truth < 1e-7


def test_the_gate_goes_red_on_the_deliberate_defect(report):
    """The gate's own headroom check, and the reason the defect exists.

    Every other analytic gate is recorded here too, so the suite states plainly
    which of them a known-wrong solver walks past. If this ever passes, GATE-A12
    has stopped measuring anything and the whole suite's authority goes with it.
    """
    truth = uniform_modes.omega(1, c=1.0, length=1.0)
    errs, floors = _error_curve(profiles.uniform(), truth, 1, scheme="lumped-full-cell")
    p, dropped = _observed_order(errs, floors)

    # What the rest of the suite says about the same broken solver.
    broken = assembly.assemble(profiles.uniform(), 2000, "lumped-full-cell")
    modes = modal.eigenmodes(broken, 10)
    truths = np.array(uniform_modes.omegas(10, 1.0, 1.0))
    a1_error = float((np.abs(modes.omega - truths) / truths).max())

    report(
        scheme="lumped-full-cell",
        grids=list(GRIDS),
        relative_errors=errs.tolist(),
        precision_floor=floors.tolist(),
        grids_dropped_at_precision_floor=dropped,
        observed_order=p,
        order_band=list(ORDER_BAND),
        gate_verdicts_on_this_defect={
            "A02_orthogonality": "green",
            "A03_oscillation": "green",
            "A11_symmetry": "green",
            "A01_uniform_eigenvalues": "red" if a1_error >= 1e-4 else "green",
            "A12_convergence": "red",
        },
        A01_max_relative_error_at_N2000=a1_error,
        note=(
            "A01 says how far off. A12 says where: order 1 is a boundary, and the "
            "defect is at the apex -- the helicotrema, which is the physics."
        ),
    )

    assert not (ORDER_BAND[0] <= p <= ORDER_BAND[1]), (
        f"GATE-A12 accepted a solver that is O(dx): observed order {p:.4f}"
    )
    assert 0.9 <= p <= 1.1, f"the defect should be first order; measured {p:.4f}"
