"""Non-dimensionalisation, and the one place physical units are allowed to exist.

Spec §3.3 makes this mandatory and gives the reason implicitly: the model spans
nanometres of displacement, kilohertz of frequency and millimetres of length,
and a single stray conversion between them produces a number that is wrong by
orders of magnitude while remaining entirely plausible on a plot.

So everything downstream of this module is dimensionless:

* ``x~ = x / L``                 -- position, in ``[0, 1]``
* ``t~ = t c0 / L``              -- time, in units of one traverse of the membrane
* ``w~ = w L / c0``              -- angular frequency
* ``c0 = sqrt(K0 / mu0)``        -- the reference wave speed at the base

and this file is the only one permitted to know that ``L`` is 35 mm.

The rule is enforced socially rather than mechanically -- there is no import
guard -- so the compensating measure is that every conversion function here is
round-tripped in `gates/test_units.py`. A conversion that is its own inverse to
machine precision cannot be silently transposed.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

#: Length of the human basilar membrane, unrolled. Spec §1.1.
LENGTH_MM = 35.0

#: Greenwood (1990) constants for the human place-frequency map, spec §1.1:
#: ``f(x) = A (10^{a (1 - x/L)} - k)`` with ``x`` measured from the base.
GREENWOOD_A_HZ = 165.4
GREENWOOD_a = 2.1
GREENWOOD_k = 0.88


def greenwood_hz(x_rel: np.ndarray | float) -> np.ndarray:
    """Characteristic frequency at relative position ``x/L``, base at 0.

    The empirical map the simulated one is compared against in GATE-B1. Kept
    here rather than in `forced.py` so that the comparison cannot accidentally
    be made against a curve the model itself produced.
    """
    x = np.asarray(x_rel, dtype=float)
    return GREENWOOD_A_HZ * (10.0 ** (GREENWOOD_a * (1.0 - x)) - GREENWOOD_k)


def greenwood_place(hz: np.ndarray | float) -> np.ndarray:
    """Inverse of :func:`greenwood_hz` -- relative position of a frequency."""
    f = np.asarray(hz, dtype=float)
    return 1.0 - np.log10(f / GREENWOOD_A_HZ + GREENWOOD_k) / GREENWOOD_a


@dataclass(frozen=True)
class Scale:
    """The bridge between the dimensionless model and physical units.

    ``c0`` is not given directly: it is *derived* from the frequency range the
    membrane is asked to span, which is the only physically anchored quantity
    available. Setting it independently would let the tonotopic map be tuned by
    a constant, which is the same as tuning the result.
    """

    length_mm: float = LENGTH_MM
    #: Frequency at the base of the membrane, Hz. Greenwood at ``x = 0``.
    f_base_hz: float = float(greenwood_hz(0.0))
    #: Frequency at the apex, Hz. Greenwood at ``x = 1``.
    f_apex_hz: float = float(greenwood_hz(1.0))

    @property
    def c0_mm_per_s(self) -> float:
        """Reference wave speed, mm/s.

        Fixed by requiring that the dimensionless fundamental of the reference
        profile correspond to ``f_base_hz``. One anchor, stated once.
        """
        return 2.0 * np.pi * self.f_base_hz * self.length_mm

    def hz_of(self, omega_tilde: np.ndarray | float) -> np.ndarray:
        """Dimensionless angular frequency -> Hz."""
        w = np.asarray(omega_tilde, dtype=float)
        return w * self.c0_mm_per_s / (2.0 * np.pi * self.length_mm)

    def omega_tilde_of(self, hz: np.ndarray | float) -> np.ndarray:
        """Hz -> dimensionless angular frequency. Inverse of :meth:`hz_of`."""
        f = np.asarray(hz, dtype=float)
        return f * 2.0 * np.pi * self.length_mm / self.c0_mm_per_s

    def mm_of(self, x_rel: np.ndarray | float) -> np.ndarray:
        """Relative position -> mm from the base."""
        return np.asarray(x_rel, dtype=float) * self.length_mm

    def x_rel_of(self, mm: np.ndarray | float) -> np.ndarray:
        """mm from the base -> relative position. Inverse of :meth:`mm_of`."""
        return np.asarray(mm, dtype=float) / self.length_mm


#: The single instance everything else uses.
SCALE = Scale()
