"""Closed-form response of the Hopf normal form. Truth for GATE-H1, H2, H3.

Spec §7.5. **Imports nothing from `src/`** (§6.4 rule 4): the value a gate is
checked against cannot come from the code under test. `mpmath` only.

The oscillator is spec §7.5's::

    dz/dt = (mu + i w0) z - |z|^2 z + F e^{i w t}

At resonance (``w = w0``), substituting ``z = r e^{i w t}`` with ``r`` real and
positive removes the time dependence exactly::

    0 = mu r - r^3 + F        ==>        r^3 - mu r - F = 0            (H.1)

That cubic is the whole of this module, and it is worth being explicit about how
much it gives for free:

* **At criticality** (``mu = 0``) it collapses to ``r = F^(1/3)``. The response
  exponent is **1/3 exactly**, with no free parameter — the compression spec
  §7.5(iii) asks for, and the signature that distinguishes an active cochlea
  from a passive one. There is nothing to fit.
* **Deep below** (``mu -> -inf``) the cubic term is negligible for small ``F``
  and ``r -> F/|mu|``: exponent **1**, linear, gain ``1/|mu|``. This is the
  passive limit, and it is what makes "the Hopf layer switched off recovers
  Phase 1" a *derivable* statement rather than a hopeful one.
* **Above** (``mu > 0``) there is a limit cycle at ``r = sqrt(mu)`` even with
  ``F = 0`` — spontaneous otoacoustic emission.

The exponent therefore moves 1 -> 1/3 as ``mu -> 0`` from below, and the
crossover happens at ``F ~ |mu|^(3/2)``. A gate that only checked ``mu = 0``
would pass on a solver that always returned a cube root, so `GATE-H2` checks the
linear limit and `GATE-H3` checks the crossover scale.
"""

from __future__ import annotations

import mpmath as mp

mp.mp.dps = 40


def response(mu: float, F: float) -> float:
    """The stable steady-state amplitude ``r`` solving (H.1), to 40 digits.

    Returns the physically stable root: real, non-negative, and the largest such
    when several exist. For ``mu > 0`` and ``F = 0`` that is ``sqrt(mu)``.

    Uses `mp.polyroots` rather than a Newton iteration seeded by a guess: a
    Newton solver here would be a second numerical method checked against a
    first, and the point of this module is to be a different kind of thing from
    the solver it validates.
    """
    if F < 0:
        raise ValueError("F is an amplitude; pass |F|")
    roots = mp.polyroots([1, 0, -mp.mpf(mu), -mp.mpf(F)], maxsteps=200, extraprec=200)
    real = [mp.re(r) for r in roots if abs(mp.im(r)) < mp.mpf("1e-25") and mp.re(r) >= 0]
    if not real:
        raise ArithmeticError(f"no non-negative real root for mu={mu}, F={F}")
    return float(max(real))


def response_exponent(mu: float, F_lo: float, F_hi: float) -> float:
    """Local slope of ``log r`` against ``log F`` between two drive levels.

    This is what a gate compares against: 1/3 at criticality, 1 deep below. The
    two-point slope rather than a fit over a decade, because the exponent is
    only constant in the asymptotic regimes and a fit across the crossover
    returns an average of two different physics and reports it as one number.
    """
    r_lo, r_hi = response(mu, F_lo), response(mu, F_hi)
    return float(mp.log(r_hi / r_lo) / mp.log(mp.mpf(F_hi) / mp.mpf(F_lo)))


def crossover_drive(mu: float) -> float:
    """The drive at which linear and compressive responses meet: ``|mu|^(3/2)``.

    From (H.1): the two terms ``mu r`` and ``r^3`` are equal when
    ``r = sqrt(|mu|)``, and there ``F = |mu|^(3/2)``. Below this drive the
    oscillator is linear, above it compressive — so **an oscillator's distance
    from criticality is readable from where its own compression begins**, which
    is the whole reason §7.5 matters to a calibration engine: `mu` is not
    directly measurable and this crossover is.
    """
    return float(mp.mpf(abs(mu)) ** mp.mpf(1.5))


def linear_gain(mu: float) -> float:
    """``1/|mu|`` — the small-signal gain deep below criticality."""
    if mu >= 0:
        raise ValueError("linear gain is defined below criticality only")
    return float(1.0 / abs(mp.mpf(mu)))
