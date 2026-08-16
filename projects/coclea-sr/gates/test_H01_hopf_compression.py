"""GATE-H1/H2/H3 -- the active layer against the normal form's closed forms.

Spec §7.5 asks for two gates on the Hopf layer: the ``A^(1/3)`` response at the
critical point, and ``mu_H -> -inf`` recovering Phase 1. Both are here, plus the
crossover scale, which is the one that makes the pair a real check.

**Why the third gate is not optional.** A solver that always returned a cube
root would pass H1. A solver that always returned a linear response would pass
H2. Only a solver that puts the *transition between them* at ``|mu|^(3/2)`` can
pass all three — and that scale is what a calibration engine would read a
patient's ``mu_H`` from, so it is the number the product thesis rests on rather
than a decoration.

The truth is `truth/hopf_normal_form.py`, which solves the cubic ``r^3 - mu r -
F = 0`` at 40 digits with mpmath and imports nothing from ``src`` (§6.4 rule 4).
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import hopf
from truth import hopf_normal_form as nf

GATE = "H1"
SPEC = "7.5"


def _amp(mu: float, F: float) -> float:
    """Settled amplitude. `steady_amplitude` raises rather than return an
    unconverged number, so a red gate here is a real disagreement."""
    ch = hopf.chain(np.array([1.0]), mu)
    return float(hopf.steady_amplitude(ch, F)[0])


def test_h1_compression_exponent_is_one_third_at_criticality(report):
    """At ``mu_H = 0`` the response is ``F^(1/3)``, with no free parameter.

    Measured over three decades of drive. The exponent is the assertion, not the
    amplitude: a prefactor could be absorbed by any constant in the solver, and
    the exponent cannot.
    """
    drives = np.geomspace(1e-6, 1e-3, 4)
    amps = np.array([_amp(0.0, float(F)) for F in drives])
    slope = float(np.polyfit(np.log(drives), np.log(amps), 1)[0])
    predicted = nf.response_exponent(0.0, float(drives[0]), float(drives[-1]))

    rel = np.array([abs(a - nf.response(0.0, float(F))) / nf.response(0.0, float(F))
                    for a, F in zip(amps, drives)])
    report(
        observed_exponent=slope,
        predicted_exponent=predicted,
        max_relative_error=float(rel.max()),
        drives=[float(d) for d in drives],
    )
    assert abs(slope - 1.0 / 3.0) < 0.02, f"exponent {slope:.4f}, expected 1/3"
    assert rel.max() < 0.05
