"""A6 — the kinetic energy budget: what the pressure puts in, viscosity takes."""
import numpy as np
from . import threshold

ID = "A6"
HARD = False


def applicable(grid, bc):
    return bc.period == 0.0        # steady only until the transient term is in


def check(fields, grid, bc):
    w = grid.cell_volume()
    q = float(np.einsum("tzr,r->tz", fields.uz, w).mean())
    power_in = abs(bc.dpdz) * abs(q)
    dudr = np.gradient(fields.uz, grid.dr, axis=2)
    dissipation = float(bc.mu * np.einsum("tzr,r->", dudr ** 2, w)
                        / (fields.uz.shape[0] * fields.uz.shape[1]))
    m = (abs(power_in - dissipation) / power_in if power_in > 0
         else float("inf"))
    thr = threshold("A6_energy")
    return {"id": ID, "hard": HARD, "measured": m, "threshold": thr,
            "score": m / thr, "slack": (thr / m) if m > 0 else None,
            "pass": m <= thr,
            "detail": f"energy budget closes to {m:.3%}"}
