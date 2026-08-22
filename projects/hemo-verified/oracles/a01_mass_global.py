"""A1 — mass, globally. What flows in has to flow out."""
import numpy as np
from . import threshold

ID = "A1"
HARD = False


def applicable(grid, bc):
    return grid.z.size > 1


def check(fields, grid, bc):
    w = grid.cell_volume()
    flux = np.einsum("tzr,r->tz", fields.uz, w)          # axial flux per station
    inflow = flux[:, 0]
    imbalance = np.abs(flux - inflow[:, None]).max(axis=1)
    scale = np.abs(inflow).mean()
    m = float(imbalance.mean() / scale) if scale > 0 else float("inf")
    thr = threshold("A1_mass_global")
    return {"id": ID, "hard": HARD, "measured": m, "threshold": thr,
            "score": m / thr, "slack": (thr / m) if m > 0 else None,
            "pass": m <= thr,
            "detail": f"axial flux varies by {m:.3%} of the inflow along z"}
