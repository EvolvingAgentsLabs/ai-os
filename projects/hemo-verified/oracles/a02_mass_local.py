"""A2 — mass, locally. div u = 0 everywhere, in cylindrical coordinates."""
import numpy as np
from . import threshold

ID = "A2"
HARD = False


def applicable(grid, bc):
    return True


def check(fields, grid, bc):
    r = np.maximum(grid.r, 1e-12)[None, None, :]
    rur = r * fields.ur
    div = np.gradient(rur, grid.dr, axis=2) / r
    if grid.z.size > 1:
        div = div + np.gradient(fields.uz, grid.dz, axis=1)
    gradu = np.abs(np.gradient(fields.uz, grid.dr, axis=2))
    scale = np.percentile(gradu, 95) + 1e-30
    m = float(np.percentile(np.abs(div[..., :-1]), 95) / scale)
    thr = threshold("A2_mass_local")
    return {"id": ID, "hard": HARD, "measured": m, "threshold": thr,
            "score": m / thr, "slack": (thr / m) if m > 0 else None,
            "pass": m <= thr,
            "detail": f"p95 |div u| is {m:.3e} of the velocity gradient scale"}
