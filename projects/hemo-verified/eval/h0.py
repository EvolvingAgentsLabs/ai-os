"""H0 — do the oracles rank an error whose size we already know?

The pre-registered kill condition, from SPEC.md section 6:

    AUC < 0.8  ->  the gates are insufficient, it gets written up, and the
                   thousands of compute-hours downstream are not spent.

Nothing here consults the true field except to *score* the result afterwards.
The oracles see only the perturbed prediction, the grid and the boundary
conditions.
"""
import argparse
import binascii
import hashlib
import json
import pathlib
import sys
import time

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import oracles                                            # noqa: E402
from analytical import perturb                            # noqa: E402
from analytical.fields import BC                          # noqa: E402
from analytical.solutions import (PERIOD, MU, RHO, default_grid,  # noqa: E402
                                  poiseuille, womersley)

LEVELS = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.35]
BAD = 0.05          # a prediction is "bad" if its true L2 error exceeds this


def cases():
    bc = BC(RHO, MU, dpdz=-100.0, u_ref=0.7143)
    g = default_grid(nr=64, nz=8)
    yield "poiseuille", g, bc, poiseuille(g, bc)
    bcw = BC(RHO, MU, dpdz=-100.0, period=PERIOD, u_ref=0.0139)
    gw = default_grid(nr=64, nz=8, nt=32, period=PERIOD)
    yield "womersley", gw, bcw, womersley(gw, bcw)


def auc(scores, labels):
    """Rank-based AUC. labels: True = the bad ones we want ranked high."""
    s, y = np.asarray(scores, float), np.asarray(labels, bool)
    pos, neg = s[y], s[~y]
    if pos.size == 0 or neg.size == 0:
        return float("nan")
    order = np.argsort(np.concatenate([pos, neg]), kind="mergesort")
    ranks = np.empty(order.size, float)
    ranks[order] = np.arange(1, order.size + 1)
    # average ranks over ties, or a constant score would score 1.0
    vals = np.concatenate([pos, neg])
    for v in np.unique(vals):
        m = vals == v
        if m.sum() > 1:
            ranks[m] = ranks[m].mean()
    return float((ranks[:pos.size].sum() - pos.size * (pos.size + 1) / 2)
                 / (pos.size * neg.size))


def spearman(a, b):
    def rank(x):
        x = np.asarray(x, float)
        o = np.argsort(x, kind="mergesort")
        r = np.empty(x.size, float)
        r[o] = np.arange(1, x.size + 1)
        for v in np.unique(x):
            m = x == v
            if m.sum() > 1:
                r[m] = r[m].mean()
        return r
    ra, rb = rank(a), rank(b)
    ra, rb = ra - ra.mean(), rb - rb.mean()
    d = np.sqrt((ra ** 2).sum() * (rb ** 2).sum())
    return float((ra * rb).sum() / d) if d > 0 else float("nan")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="gates/reports")
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    oracles.load()
    rows = []
    t0 = time.time()

    for name, grid, bc, truth in cases():
        # the exact solution itself, as the anchor of the "good" class
        r, comp, dec = oracles.verdict(truth, grid, bc)
        rows.append({"case": name, "perturbation": "none", "level": 0.0,
                     "true_error": 0.0, "composite": comp, "decision": dec,
                     "per_oracle": {x["id"]: x["score"] for x in r}})
        for pname, fn in perturb.ALL.items():
            for lv in LEVELS:
                # NOT hash(): Python randomises string hashing per process, so
                # seeding the noise with it made H0 report a different AUC on
                # every run. Caught by re-running after the merge and seeing the
                # numbers move in the fourth decimal -- which changed no
                # conclusion, by luck rather than by design.
                seed = binascii.crc32(f"{pname}:{lv}".encode())
                pf = fn(truth, lv, grid, bc, seed=seed)
                err = pf.l2_error(truth, grid)
                r, comp, dec = oracles.verdict(pf, grid, bc)
                rows.append({"case": name, "perturbation": pname, "level": lv,
                             "true_error": err, "composite": comp,
                             "decision": dec,
                             "per_oracle": {x["id"]: x["score"] for x in r}})

    labels = [r["true_error"] > BAD for r in rows]
    scores = [r["composite"] for r in rows]
    overall = auc(scores, labels)
    rho = spearman(scores, [r["true_error"] for r in rows])

    # which oracle carries the signal, one at a time
    per = {}
    ids = sorted({k for r in rows for k in r["per_oracle"]})
    for oid in ids:
        s = [r["per_oracle"].get(oid, 0.0) for r in rows]
        per[oid] = auc(s, labels)

    # the operating point: hard rejects plus composite > 1 escalate
    accepted = [r for r in rows if r["decision"] == "ACCEPT"]
    false_accept = sum(1 for r in accepted if r["true_error"] > BAD)
    out = {
        "n": len(rows), "bad_fraction": float(np.mean(labels)),
        "auc_composite": overall, "spearman_composite": rho,
        "auc_per_oracle": per,
        "accepted": len(accepted),
        "false_accept_rate": (false_accept / len(accepted)) if accepted else 0.0,
        "escalated": sum(1 for r in rows if r["decision"] == "ESCALATE"),
        "rejected": sum(1 for r in rows if r["decision"] == "REJECT"),
        "kill_threshold": 0.8,
        "verdict": ("SURVIVES" if overall >= 0.8 else "KILLED"),
        "oracle_hashes": oracles.hashes(),
        "thresholds": oracles.thresholds(),
        # everything above this line is reproducible bit for bit; wall clock
        # is not, so it lives apart rather than sitting inside the payload a
        # reader is meant to be able to hash
        "runtime": {"seconds": round(time.time() - t0, 2)},
        "rows": rows,
    }
    d = pathlib.Path(a.out)
    d.mkdir(parents=True, exist_ok=True)
    body = json.dumps(out, indent=2, sort_keys=True, default=str)
    (d / "h0.json").write_text(body + "\n")
    out["sha256"] = hashlib.sha256(body.encode()).hexdigest()[:16]

    if a.report:
        print(f"H0 — {out['n']} predictions, {out['bad_fraction']:.0%} of them "
              f"worse than {BAD:.0%} true error\n")
        print(f"  AUC (composite)      {overall:.3f}    "
              f"kill below 0.8  ->  {out['verdict']}")
        print(f"  Spearman rho         {rho:.3f}")
        print(f"\n  decisions: ACCEPT {len(accepted)}  "
              f"ESCALATE {out['escalated']}  REJECT {out['rejected']}")
        print(f"  false-accept rate    {out['false_accept_rate']:.1%}")
        print("\n  AUC by oracle, alone:")
        for k, v in sorted(per.items(), key=lambda kv: -(kv[1] if kv[1] == kv[1]
                                                         else -1)):
            print(f"    {k:5} {v:.3f}")
    return 0 if overall >= 0.8 else 1


if __name__ == "__main__":
    raise SystemExit(main())
