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

GATE = "H3"
SPEC = "7.5"


def _amp(mu: float, F: float) -> float:
    """Settled amplitude. `steady_amplitude` raises rather than return an
    unconverged number, so a red gate here is a real disagreement."""
    ch = hopf.chain(np.array([1.0]), mu)
    return float(hopf.steady_amplitude(ch, F)[0])


@pytest.mark.parametrize("mu", [-0.04, -0.01])
def test_h3_the_compression_knee_sits_where_mu_puts_it(report, mu):
    """The knee is at ``F = |mu|^(3/2)`` — the gate H1 and H2 cannot both fake.

    Measured as the drive at which the local slope has fallen halfway from 1 to
    1/3. This is the observable a calibration engine reads ``mu_H`` from: a
    compression curve is a standard clinical measurement, and ``mu_H`` is not.
    """
    predicted_knee = nf.crossover_drive(mu)
    drives = np.geomspace(predicted_knee * 1e-3, predicted_knee * 1e3, 25)
    amps = np.array([_amp(mu, float(F)) for F in drives])

    log_d, log_a = np.log(drives), np.log(amps)
    slopes = np.gradient(log_a, log_d)
    target = 0.5 * (1.0 + 1.0 / 3.0)
    # Where the slope crosses the halfway value, interpolated in log-drive.
    below = np.where(slopes <= target)[0]
    assert below.size, "the response never compressed over three decades either side"
    i = int(below[0])
    if i == 0:
        knee = float(drives[0])
    else:
        f = (slopes[i - 1] - target) / (slopes[i - 1] - slopes[i])
        knee = float(np.exp(log_d[i - 1] + f * (log_d[i] - log_d[i - 1])))

    ratio = knee / predicted_knee
    report(
        mu=mu,
        observed_knee=knee,
        predicted_knee=predicted_knee,
        knee_ratio=ratio,
    )
    # Within a factor of three. The knee is a soft feature of a smooth curve and
    # a tighter bound would be measuring the halfway convention rather than the
    # physics; a factor of three still separates |mu|^(3/2) from |mu| or mu^2,
    # which is what the gate is for.
    assert 1 / 3 < ratio < 3, f"knee at {knee:.3e}, |mu|^1.5 = {predicted_knee:.3e}"
