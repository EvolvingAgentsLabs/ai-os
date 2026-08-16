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

GATE = "H2"
SPEC = "7.5"


def _amp(mu: float, F: float) -> float:
    """Settled amplitude. `steady_amplitude` raises rather than return an
    unconverged number, so a red gate here is a real disagreement."""
    ch = hopf.chain(np.array([1.0]), mu)
    return float(hopf.steady_amplitude(ch, F)[0])


def test_h2_response_is_linear_far_below_criticality(report):
    """``mu_H = -1``: exponent 1 and gain ``1/|mu|``. The passive limit.

    This is spec §7.5's regression test in its derivable form. "Switch the layer
    off and Phase 1 comes back" is checkable only if what the layer does when
    off is known in closed form, and below criticality it is: ``r = F/|mu|``.
    """
    mu = -1.0
    drives = np.geomspace(1e-8, 1e-6, 3)
    amps = np.array([_amp(mu, float(F)) for F in drives])
    slope = float(np.polyfit(np.log(drives), np.log(amps), 1)[0])
    gain = float(np.mean(amps / drives))

    report(
        observed_exponent=slope,
        observed_gain=gain,
        predicted_gain=nf.linear_gain(mu),
        max_relative_error=float(max(abs(a - nf.response(mu, float(F))) / nf.response(mu, float(F))
                                     for a, F in zip(amps, drives))),
    )
    assert abs(slope - 1.0) < 0.02, f"exponent {slope:.4f}, expected 1"
    assert abs(gain - nf.linear_gain(mu)) / nf.linear_gain(mu) < 0.05
