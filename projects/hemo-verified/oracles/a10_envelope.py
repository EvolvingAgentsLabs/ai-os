"""A10 — a pulsatile record cannot jump between phases faster than the momentum
equation allows.

The first version of this file carried a threshold of 0.05 "phase-to-phase
change over u_ref", chosen because it looked reasonable. It **failed on the
exact Womersley solution**: the true field at alpha=14.9 sampled at 32 phases
changes by 18% of u_ref between neighbouring phases, and that is physics, not
error. A gate that fires on a perfect field is not strict, it is wrong.

The bound is derivable, so it is derived. From

    rho du/dt = -dp/dz + mu (1/r) d/dr(r du/dr)

the change over one sampling interval is bounded by

    |du| <= dt/rho * (|dp/dz| + mu * u_ref / R^2 * C)

which for the reference case gives 0.180 -- the measured value to three
figures. The threshold is that bound with a factor of safety, and it scales
with dt, so halving the number of phases no longer turns a true record red.
"""
import numpy as np

ID = "A10"
HARD = False
SAFETY = 2.0
VISCOUS_C = 8.0        # (1/r)(r u')' for a parabola is 4 u_max / R^2; 8 is slack


def applicable(grid, bc):
    return grid.t.size > 4


def bound(grid, bc):
    """The physically admissible phase-to-phase change, over u_ref."""
    pressure = abs(bc.dpdz) / bc.rho
    viscous = bc.mu * bc.u_ref * VISCOUS_C / (bc.rho * grid.R ** 2)
    return SAFETY * grid.dt * (pressure + viscous) / bc.u_ref


def check(fields, grid, bc):
    d = np.abs(np.diff(fields.uz, axis=0))
    m = float(np.percentile(d, 95) / bc.u_ref)
    thr = bound(grid, bc)
    return {"id": ID, "hard": HARD, "measured": m, "threshold": thr,
            "score": m / thr, "slack": (thr / m) if m > 0 else None,
            "pass": m <= thr,
            "detail": (f"p95 phase-to-phase change {m:.3e} of u_ref against a "
                       f"momentum bound of {thr:.3e}")}
