"""The membrane's mechanical profiles: ``mu(x)``, ``K(x)``, ``S(x)``, ``gamma(x)``.

Spec §3.1, on ``x`` in ``[0, 1]`` (see `units.py` -- everything here is
dimensionless).

    mu(x)    = exp(+alpha_mu x)          effective mass per unit length
    K(x)     = exp(-alpha_K x)           longitudinal stiffness
    S(x)     = K(x) / coupling^2         stiffness to ground -- see ADR-0001
    gamma(x) = gamma0 (1 + g1 x)         viscous damping

The local characteristic frequency that sets the place code is then

    omega_local(x) = sqrt(S(x) / mu(x)) = exp(-(alpha_K + alpha_mu) x / 2)

which falls exponentially, so log-frequency maps to linear position: the shape
Greenwood measured. §3.1 fixes the exponents from that requirement,
``(alpha_K + alpha_mu)/2 ~ ln(f_base/f_apex)``, rather than from a fit.

``S(x)`` is the term ADR-0001 makes explicit. It is *not* in spec equation (2.1);
read that ADR before changing it, and note that both analytic gates run at
``coupling = 0``, which is the spec's operator exactly. `BMProfile.S` explains
why the parameter is a coupling *length* rather than the transverse wavenumber
``kappa`` the ADR first wrote -- a measured failure, not a preference.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class BMProfile:
    """One membrane. Frozen: a profile mutated between assembly and analysis is
    the kind of defect that produces a plausible wrong answer and no traceback."""

    #: Growth rate of effective mass toward the apex. Spec §3.1: ``[0, 4]``.
    alpha_mu: float = 2.0
    #: Decay rate of stiffness toward the apex. Spec §3.1: ``[4, 10]``.
    alpha_K: float = 6.0
    #: **Longitudinal coupling length**, in units of ``L``. ADR-0001's parameter.
    #: ``0`` means no ground term at all: spec equation (2.1) exactly.
    coupling: float = 0.0
    #: Damping ratio scale at the base.
    zeta0: float = 0.05
    #: Linear growth of damping toward the apex.
    g1: float = 0.0

    @property
    def place_coded(self) -> bool:
        return self.coupling > 0.0

    def mu(self, x: np.ndarray | float) -> np.ndarray:
        return np.exp(self.alpha_mu * np.asarray(x, dtype=float))

    def K_ref(self, x: np.ndarray | float) -> np.ndarray:
        """The membrane's stiffness profile, before it is split between the two
        terms it appears in. This is spec §3.1's ``K(x)``."""
        return np.exp(-self.alpha_K * np.asarray(x, dtype=float))

    def K(self, x: np.ndarray | float) -> np.ndarray:
        """Stiffness in the **longitudinal** term, ``d/dx[K du/dx]``.

        Scaled by ``coupling^2``. See :meth:`S` for why the split is here rather
        than in the assembly.
        """
        eps = self.coupling
        return (eps**2 if self.place_coded else 1.0) * self.K_ref(x)

    def S(self, x: np.ndarray | float) -> np.ndarray:
        """Stiffness **to ground**. Zero for spec (2.1); ``K_ref`` otherwise.

        ADR-0001 introduced this as ``S = kappa^2 K`` with ``kappa`` a transverse
        wavenumber. That parametrisation is equivalent and it is the wrong one to
        compute in, for a reason the first run of `experiments/e2_tonotopy.py`
        found and no reading would have: **the two terms then differ in magnitude
        by ``O(N^2)``.** The longitudinal term carries ``K/dx`` and the ground
        term ``kappa^2 K dx``, so at ``kappa ~ 1`` the membrane is coupled far
        too stiffly to resonate locally, responds as a single unit, and produces
        a peak that sits at the apex for every frequency. The measured symptom
        was ``x_cf`` spanning **0.000** of the membrane across three decades.

        Dividing the eigenvalue problem through by ``kappa^2`` moves the small
        parameter where it belongs and re-anchors the time unit on the *local
        resonance at the base* rather than on the longitudinal traverse time::

            -(K phi')' + kappa^2 K phi = w^2 mu phi
            -eps^2 (K_ref phi')' + K_ref phi = W^2 mu phi,    eps = 1/kappa

        so ``omega_local(0) = 1`` by construction, ``W = 1`` is the frequency the
        base is tuned to, and ``eps`` is what it physically is: the length over
        which one section of membrane feels its neighbours, in units of ``L``.
        The cochlear regime is ``eps << 1`` -- sections are nearly independent
        oscillators, coupled through the fluid rather than through membrane
        tension -- and that is exactly the regime in which the WKB expansion of
        spec §2.5 is the natural asymptotic rather than a hopeful one.
        """
        return self.K_ref(x) if self.place_coded else np.zeros_like(np.asarray(x, dtype=float))

    def gamma(self, x: np.ndarray | float) -> np.ndarray:
        xs = np.asarray(x, dtype=float)
        # Damping written as a ratio times the local critical damping, so zeta0
        # means the same thing at every position rather than meaning "more
        # damping at the base", which is what a constant gamma would have said.
        if self.place_coded:
            crit = 2.0 * np.sqrt(self.mu(xs) * self.S(xs))
        else:
            # With no ground term there is no local critical damping to be a
            # ratio of. Fall back to the mass scale so gamma stays finite and
            # positive; the analytic gates run undamped so nothing depends on
            # the choice, and stating it is cheaper than a surprise later.
            crit = 2.0 * self.mu(xs)
        return self.zeta0 * (1.0 + self.g1 * xs) * crit

    def omega_local(self, x: np.ndarray | float) -> np.ndarray:
        """``sqrt(S/mu)`` -- the frequency this position is tuned to. ADR-0001.

        With the scaling above this is ``e^{-(alpha_K + alpha_mu) x / 2}``: equal
        to 1 at the base and falling by exactly the audible span at the apex,
        which is the constraint spec §3.1 states and `ALPHA_K_REF` enforces.
        """
        xs = np.asarray(x, dtype=float)
        if not self.place_coded:
            return np.zeros_like(xs)
        return np.sqrt(self.S(xs) / self.mu(xs))

    def wave_speed(self, x: np.ndarray | float) -> np.ndarray:
        """``c(x) = sqrt(K/mu)`` -- the local longitudinal wave speed, spec §2.5."""
        xs = np.asarray(x, dtype=float)
        return np.sqrt(self.K(xs) / self.mu(xs))


# --- the reference profile, derived rather than typed -------------------------
#
# Spec §3.1 states the constraint that fixes the exponents and does not state
# the exponents:
#
#     (alpha_K + alpha_mu)/2 ~ ln(f_base / f_apex)
#
# because ``omega_local(x) = kappa e^{-(alpha_K + alpha_mu) x / 2}`` has to fall
# by exactly the span of the audible range across the membrane. **A hand-picked
# pair that violates it produces no tonotopic map at all**, in either arm of the
# ADR-0001 experiment, and the symptom is a flat ``x_cf`` that reads as "the map
# exists and is compressed" rather than as "the profile is wrong". That happened
# here first, with ``alpha_mu = 2, alpha_K = 6`` -- a sum of 4.0 against the 6.95
# the constraint requires, so the membrane spanned 1.7 decades of a 3.0-decade
# range. Deriving it from the same Greenwood constants `units.py` holds is what
# stops it happening again.

from . import units  # noqa: E402  -- leaf module, no cycle

_DECADES = float(np.log(units.greenwood_hz(0.0) / units.greenwood_hz(1.0)))

#: Top of spec §3.1's exploration range for the mass exponent, ``[0, 4]``.
ALPHA_MU_REF = 4.0
#: Whatever the constraint then forces. Lands at ~9.9, inside §3.1's ``[4, 10]``.
ALPHA_K_REF = 2.0 * _DECADES - ALPHA_MU_REF

#: Longitudinal coupling length, in units of ``L``. The cochlear regime is
#: ``eps << 1``; see `BMProfile.S`.
COUPLING_REF = 0.02

#: Spec §3.1's reference profile, with ADR-0001's ground term on.
#:
#: ``COUPLING_REF`` is the one genuinely free modelling parameter: how far along
#: the membrane one section feels its neighbours, in units of ``L``. It is swept
#: rather than fitted -- `experiments/e2_tonotopy.py` reports the place map at
#: several values -- and the reference value is the middle of that sweep.
REFERENCE = BMProfile(
    alpha_mu=ALPHA_MU_REF, alpha_K=ALPHA_K_REF, coupling=COUPLING_REF, zeta0=0.05
)

#: The same membrane with ADR-0001's term switched off: spec equation (2.1)
#: exactly. This is the **control arm** of the tonotopy experiment, and the arm
#: that decides whether ADR-0001 was necessary at all.
REFERENCE_NO_GROUND = BMProfile(
    alpha_mu=ALPHA_MU_REF, alpha_K=ALPHA_K_REF, coupling=0.0, zeta0=0.05
)


def uniform() -> BMProfile:
    """The GATE-A1 membrane: ``mu = K = 1``, no ground term, so ``c = 1``."""
    return BMProfile(alpha_mu=0.0, alpha_K=0.0, coupling=0.0, zeta0=0.0)


def exponential(alpha: float) -> BMProfile:
    """The GATE-A8 membrane: ``K = mu = e^{-alpha x}``, so ``c`` is constant at 1.

    In this parametrisation ``mu = e^{+alpha_mu x}`` and ``K = e^{-alpha_K x}``,
    so ``mu = K = e^{-alpha x}`` needs ``alpha_mu = -alpha`` and
    ``alpha_K = +alpha``. Spec §3.1 calls this the degenerate case
    ``alpha_mu = -alpha_K`` and says it is the one with a closed form.
    """
    return BMProfile(alpha_mu=-alpha, alpha_K=alpha, coupling=0.0, zeta0=0.0)
