"""A3 — the momentum equation, evaluated on the prediction itself."""
import numpy as np
from analytical.solutions import momentum_residual
from . import threshold

ID = "A3"
HARD = False


def applicable(grid, bc):
    return True


def check(fields, grid, bc):
    res = momentum_residual(fields, grid, bc)
    m = float(np.nanpercentile(res, 95))
    thr = threshold("A3_momentum")
    return {"id": ID, "hard": HARD, "measured": m, "threshold": thr,
            "score": m / thr, "slack": (thr / m) if m > 0 else None,
            "pass": m <= thr,
            "detail": f"p95 normalised momentum residual {m:.3e}"}
