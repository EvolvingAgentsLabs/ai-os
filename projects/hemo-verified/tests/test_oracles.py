"""The precondition SPEC.md section 7.5 puts before any experiment runs:
every oracle passes the exact solution and fails a perturbation above its
threshold. If this file is red, no H0 number means anything.
"""
import pathlib
import sys

import numpy as np
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import oracles                                       # noqa: E402
from analytical import perturb                       # noqa: E402
from analytical.fields import BC                     # noqa: E402
from analytical.solutions import (MU, PERIOD, RHO, default_grid,  # noqa: E402
                                  momentum_residual, poiseuille, womersley,
                                  womersley_number)

oracles.load()

STEADY = (BC(RHO, MU, dpdz=-100.0, u_ref=0.7143), default_grid(nr=64, nz=8))
PULSE = (BC(RHO, MU, dpdz=-100.0, period=PERIOD, u_ref=0.0139),
         default_grid(nr=64, nz=8, nt=32, period=PERIOD))


def _truth(bc, grid):
    return poiseuille(grid, bc) if bc.period == 0 else womersley(grid, bc)


@pytest.mark.parametrize("bc,grid", [STEADY, PULSE])
def test_every_oracle_passes_the_exact_solution(bc, grid):
    rows, _, decision = oracles.verdict(_truth(bc, grid), grid, bc)
    failed = [r["id"] for r in rows if not r["pass"]]
    assert not failed, f"a gate fired on a perfect field: {failed}"
    assert decision == "ACCEPT"


@pytest.mark.parametrize("name", ["noise", "divergence", "slip", "bias"])
def test_a_large_corruption_is_not_accepted(name):
    bc, grid = STEADY
    truth = _truth(bc, grid)
    bad = perturb.ALL[name](truth, 0.2, grid, bc)
    assert bad.l2_error(truth, grid) > 0.05, "the fixture must be badly wrong"
    _, _, decision = oracles.verdict(bad, grid, bc)
    assert decision != "ACCEPT", f"{name} at 0.2 was accepted"


def test_the_closed_forms_actually_solve_the_equation():
    for bc, grid in (STEADY, PULSE):
        res = momentum_residual(_truth(bc, grid), grid, bc)
        assert np.nanpercentile(res, 95) < 1e-2


def test_the_quasi_steady_limit_reproduces_poiseuille():
    # a long period has to converge on the steady solution, or the pulsatile
    # branch is a different equation wearing the same name
    bc = BC(RHO, MU, dpdz=-100.0, period=500.0, u_ref=0.7143)
    grid = default_grid(nr=64, nz=4, nt=16, period=500.0)
    assert womersley_number(bc, grid.R) < 1.0
    ratio = womersley(grid, bc).uz.max() / poiseuille(grid, STEADY[0]).uz.max()
    assert 0.99 < ratio < 1.01


def test_the_quadrature_is_exact():
    # 2*pi*r*dr at every node overshoots the cross-section by 2.6%, which is
    # larger than A1's threshold: the mass oracle would measure the quadrature
    grid = default_grid(nr=40, nz=2)
    assert abs(grid.cell_volume().sum() - np.pi * grid.R ** 2) < 1e-15


def test_the_envelope_bound_scales_with_the_sampling_interval():
    # the invented constant that used to be here failed on the exact solution
    from oracles import a10_envelope
    bc = PULSE[0]
    slacks = []
    for nt in (8, 32, 128):
        grid = default_grid(nr=64, nz=4, nt=nt, period=PERIOD)
        r = a10_envelope.check(womersley(grid, bc), grid, bc)
        assert r["pass"], f"the exact record failed A10 at nt={nt}"
        slacks.append(r["slack"])
    assert max(slacks) / min(slacks) < 1.2, "the bound does not track dt"


def test_no_oracle_can_see_the_truth():
    # structural, not a convention: check() takes no reference field
    import inspect
    for oid, (mod, _) in oracles.load().items():
        params = set(inspect.signature(mod.check).parameters)
        assert params == {"fields", "grid", "bc"}, (oid, params)


def test_oracle_files_are_read_only_after_boot():
    for p in pathlib.Path("oracles").glob("a[0-9]*.py"):
        assert oct(p.stat().st_mode)[-3:] == "444", p
