"""Oracle registry. Read-only, content-hashed at boot, and never given truth.

The contract every oracle keeps:

    check(fields, grid, bc) -> {id, pass, score, detail, slack, measured,
                                threshold, hard}

`score` is the measured quantity divided by its threshold, so 1.0 is the
boundary and higher is worse. `slack` is its reciprocal -- how much room the
gate left -- recorded because a threshold is only evidence in proportion to how
tightly it binds.

No oracle receives the true field. The signature makes that structural rather
than a rule someone has to remember.
"""
import hashlib
import importlib
import pathlib

import yaml

_DIR = pathlib.Path(__file__).resolve().parent
_REGISTRY = {}
_THRESHOLDS = {}


def load():
    global _THRESHOLDS
    _THRESHOLDS = yaml.safe_load((_DIR / "thresholds.yaml").read_text())
    for p in sorted(_DIR.glob("a[0-9]*.py")):
        mod = importlib.import_module(f"oracles.{p.stem}")
        h = hashlib.sha256(p.read_bytes()).hexdigest()[:16]
        _REGISTRY[mod.ID] = (mod, h)
        p.chmod(0o444)
    return _REGISTRY


def thresholds():
    return dict(_THRESHOLDS)


def threshold(key):
    return _THRESHOLDS[key]


def hashes():
    return {k: v[1] for k, v in _REGISTRY.items()}


def verdict(fields, grid, bc, skip=()):
    """Run every applicable oracle. -> (rows, composite_score, decision)."""
    rows = []
    for oid, (mod, h) in sorted(_REGISTRY.items()):
        if oid in skip or not mod.applicable(grid, bc):
            continue
        r = mod.check(fields, grid, bc)
        r["oracle_hash"] = h
        rows.append(r)
    hard_fail = any(r["hard"] and not r["pass"] for r in rows)
    soft = [r["score"] for r in rows if not r["hard"]]
    composite = max(soft) if soft else 0.0
    decision = "REJECT" if hard_fail else ("ACCEPT" if composite <= 1.0
                                           else "ESCALATE")
    return rows, composite, decision
