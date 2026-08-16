"""The active layer: a chain of Hopf oscillators on the membrane. Spec §7.5.

Phase 2 of the specification, and the piece the product thesis turns on. Spec
§2.7 already documents the gap this exists to close: the passive membrane's
tuning is `Q ~ 1-10` and physiology reports far sharper. That gap is the
quantitative argument for an active layer, and recording it was a result rather
than a failure.

## The model

One oscillator per site, spec §7.5 verbatim::

    dz_j/dt = (mu_H + i w_j) z_j - |z_j|^2 z_j + c_f u(x_j, t) + noise

with ``w_j = w_local(x_j)`` from the passive profile, so **the active layer
inherits its tonotopy from the membrane rather than declaring its own**. The
active force ``Re(z_j)`` feeds back into ``F(x_j, t)``.

``mu_H`` is the distance to the critical point: negative is a damped passive
oscillator, zero is critical, positive is self-oscillating (spontaneous
otoacoustic emission).

## Why this matters beyond reproducing physiology

Spec §7.5(i) asks whether criticality moves ``D_opt`` toward the physiological
noise level. That question is the calibration problem stated in the model's own
terms: ``mu_H`` is not measurable in a patient, but the drive at which an
oscillator's response starts to compress **is** — `truth.hopf_normal_form.crossover_drive`
is ``|mu_H|^(3/2)``. So a compression curve, which is a standard clinical
measurement, constrains the one parameter that sets where the useful noise level
sits.

## What is deliberately not here

No fitted constants. ``c_f`` and ``mu_H`` are swept, not tuned, and the gates
check the two asymptotic regimes the normal form determines exactly (exponent
1/3 at criticality, 1 far below) rather than any intermediate number that could
be adjusted into agreement.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class HopfChain:
    """A chain of oscillators, one per probe site.

    ``mu`` may be a scalar (one distance to criticality for the whole membrane)
    or per-site. Per-site is the realistic case — hair-cell loss is patchy — and
    is what makes an individualised calibration a per-region question rather
    than a single number.
    """

    omega: np.ndarray
    mu: np.ndarray
    c_f: float = 1.0

    def __post_init__(self) -> None:
        if self.omega.ndim != 1:
            raise ValueError("omega must be one value per site")
        if self.mu.shape != self.omega.shape:
            raise ValueError("mu must be a scalar broadcast to omega's shape, or per-site")

    @property
    def n_sites(self) -> int:
        return int(self.omega.size)


def chain(omega: np.ndarray, mu: float | np.ndarray, c_f: float = 1.0) -> HopfChain:
    """Build a chain, broadcasting a scalar ``mu`` across the sites."""
    omega = np.asarray(omega, dtype=float)
    mu_arr = np.full_like(omega, float(mu)) if np.isscalar(mu) else np.asarray(mu, dtype=float)
    return HopfChain(omega=omega, mu=mu_arr, c_f=float(c_f))


def integrate(
    ch: HopfChain,
    drive: np.ndarray,
    dt: float,
    *,
    z0: np.ndarray | None = None,
    noise_sigma: float = 0.0,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """Integrate the chain against a sampled drive. Returns ``z[t, site]``.

    ``drive[t, site]`` is ``c_f * u(x_j, t)`` already sampled — the membrane is
    integrated by `stochastic`/`dynamics` and this consumes its output, so the
    two layers stay separable and the ``c_f = 0`` regression in GATE-H3 is a
    real switch rather than a code path.

    **Exponential (exact) treatment of the linear part**, cubic term explicit.
    The linear part ``(mu + i w)`` is stiff near criticality in exactly the
    regime the physics lives in, and an explicit step there needs ``dt`` far
    below anything the drive requires. Splitting it out costs one `exp` per step
    and removes that constraint; what remains is the cubic, which is smooth and
    small wherever the response is compressive.

    The noise is added in the rotating-free complex plane with variance
    ``noise_sigma^2 * dt`` per component, which is the Euler-Maruyama increment
    for an additive complex Wiener process. It is deliberately additive and not
    multiplicative: spec §4.1's noise enters the membrane, and a second
    multiplicative noise here would confound which layer the resonance came
    from — the question §7.5(ii) exists to ask.
    """
    n_t = int(drive.shape[0])
    if drive.shape[1] != ch.n_sites:
        raise ValueError(f"drive has {drive.shape[1]} sites, chain has {ch.n_sites}")
    if noise_sigma > 0.0 and rng is None:
        raise ValueError("a stochastic run needs an explicit rng (spec §6.4 rule 6)")

    lin = ch.mu + 1j * ch.omega
    prop = np.exp(lin * dt)
    z = np.zeros(ch.n_sites, dtype=complex) if z0 is None else np.asarray(z0, dtype=complex).copy()
    out = np.empty((n_t, ch.n_sites), dtype=complex)

    scale = noise_sigma * np.sqrt(dt / 2.0)
    for k in range(n_t):
        out[k] = z
        # Exact on the linear part; the cubic and the drive as one explicit
        # increment. Both are O(dt) and neither is stiff.
        z = prop * z + dt * (-(np.abs(z) ** 2) * z + drive[k])
        if scale > 0.0:
            z = z + scale * (rng.standard_normal(ch.n_sites) + 1j * rng.standard_normal(ch.n_sites))
    return out


def steady_amplitude(
    ch: HopfChain,
    forcing: float,
    *,
    samples_per_period: int = 256,
    chunk_periods: int = 200,
    max_periods: int = 400_000,
    tol: float = 2e-4,
) -> np.ndarray:
    """Drive each site at its own frequency and return the settled ``|z|``.

    This is what the gates compare against `truth.hopf_normal_form.response`.
    Each site is driven at ``w_j`` — its own resonance — because that is the
    condition under which (H.1) holds exactly; driving off resonance is a
    different and messier problem, and a gate that used it would be checking the
    solver against a formula that does not apply.

    **It integrates until it has settled, and raises if it does not.** The first
    version ran a fixed 600 periods and returned whatever it had, which produced
    a measured compression exponent of **0.481 against the exact 1/3** — not a
    modelling error but four unconverged numbers fitted to a line. The sign gave
    it away: at criticality the approach to steady state is *algebraic* rather
    than exponential, with a relaxation rate that falls like the amplitude
    squared, so the weakest drive is the least converged and the fitted slope
    tilts up.

    ``samples_per_period`` is 256 rather than the 64 that resolves the drive:
    the cubic term is stepped explicitly, so its local error is O(dt), and at
    64 the weakest drive still landed 5.6% off the closed form after settling.
    Both knobs were moved for stated reasons and the tolerance in the gate was
    not touched — loosening the check instead would have been the cheaper edit
    and the wrong one.

    That failure is the whole reason this loop exists. **The stopping condition
    is measured from the trajectory, never from the expected answer** — seeding
    or truncating from ``F^(1/3)`` would make the gate a check that the solver
    can reproduce a number it was given.
    """
    period = 2.0 * np.pi / np.max(ch.omega)
    dt = period / samples_per_period
    n_chunk = int(chunk_periods * samples_per_period)
    t0 = 0.0
    z = np.zeros(ch.n_sites, dtype=complex)
    previous: np.ndarray | None = None
    done = 0

    while done < max_periods:
        t = t0 + np.arange(n_chunk) * dt
        drive = forcing * np.exp(1j * ch.omega[None, :] * t[:, None])
        traj = integrate(ch, drive, dt, z0=z)
        z = traj[-1]
        t0 = t[-1] + dt
        done += chunk_periods
        # Compare the second half of this chunk against the first: a settled
        # amplitude is flat within a chunk, and that is checkable without
        # knowing what it settled to.
        half = n_chunk // 2
        first = np.abs(traj[:half]).mean(axis=0)
        second = np.abs(traj[half:]).mean(axis=0)
        drift = np.max(np.abs(second - first) / np.maximum(second, 1e-300))
        if previous is not None and drift < tol:
            return second
        previous = second

    raise RuntimeError(
        f"amplitude had not settled after {max_periods} periods at F={forcing:.3e} "
        f"(last drift {drift:.3e} > {tol:.1e}); returning it would report an "
        f"unconverged number as a measurement"
    )
