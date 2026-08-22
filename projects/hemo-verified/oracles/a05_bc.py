"""A5 — the prediction's inlet against the boundary condition that was asked for.

This uses the prescribed BC, which the caller supplies, and never the interior
solution. That distinction is the whole licence for this oracle to exist.
"""
import numpy as np
from . import threshold

ID = "A5"
HARD = False


def applicable(grid, bc):
    return True


def check(fields, grid, bc):
    w = grid.cell_volume()
    q = float(np.einsum("tzr,r->tz", fields.uz, w)[:, 0].mean())
    area = float(w.sum())
    # the mean velocity the prescribed gradient implies, by Poiseuille
    q_bc = (-bc.dpdz / (8.0 * bc.mu)) * grid.R ** 2 * area
    if bc.period > 0:                      # pulsatile: cycle mean is zero
        return {"id": ID, "hard": HARD, "measured": 0.0, "threshold": 1.0,
                "score": 0.0, "slack": None, "pass": True,
                "detail": "not applied to a zero-mean pulsatile record"}
    m = abs(q - q_bc) / abs(q_bc) if q_bc != 0 else float("inf")
    thr = threshold("A5_bc")
    return {"id": ID, "hard": HARD, "measured": m, "threshold": thr,
            "score": m / thr, "slack": (thr / m) if m > 0 else None,
            "pass": m <= thr,
            "detail": f"inlet flow rate is {m:.3%} from the prescribed gradient"}
