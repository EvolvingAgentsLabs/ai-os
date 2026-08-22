"""A4 — no-slip. Fluid does not slide along a wall. Hard: no score to weigh."""
import numpy as np
from . import threshold

ID = "A4"
HARD = True


def applicable(grid, bc):
    return True


def check(fields, grid, bc):
    wall = np.sqrt(fields.uz[..., -1] ** 2 + fields.ur[..., -1] ** 2)
    m = float(np.abs(wall).max() / bc.u_ref)
    thr = threshold("A4_noslip")
    return {"id": ID, "hard": HARD, "measured": m, "threshold": thr,
            "score": m / thr, "slack": (thr / m) if m > 0 else None,
            "pass": m <= thr,
            "detail": f"max wall speed is {m:.3e} of u_ref"}
