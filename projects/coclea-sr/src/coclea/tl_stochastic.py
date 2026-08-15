"""Noise on the transmission line — the operator that has a place code.
ADR-0003, and the route it named.

## What this closes

Until now the two halves of the project sat on different equations: the noise on
spec (2.1)'s string (§4.1, §5.3), the place code on ADR-0002's transmission line.
So the spatial modulation E3 reported was the string's **mode shapes**, and the
question spec §R2 calls the interesting one — *is the resonance sharpest where the
membrane is tuned?* — could not be asked at all.

Here the noise drives the line itself.

## Why this is a spectrum and not a simulation

The line is linear, so a noise-driven field is a **stationary Gaussian process**
and is fully determined by its power spectrum. There is no need to march it in
time: compute the spectrum at the probe, synthesise a series with that spectrum,
and the result is exact in law.

With noise `eta(x)` forcing each section, the membrane obeys `Z U = P + eta` and
the fluid `P'' = -beta^2 Omega^2 U`, so

    P'' + k^2 P = -(beta^2 Omega^2 / Z) eta,      k^2 = beta^2 Omega^2 / Z

and the probe sees

    U_p = (1/Z_p) [ eta_p - beta^2 Omega^2 SUM_j G(x_p, x_j) eta_j dx / Z_j ]

which is a **linear functional of the noise**: `U_p = sum_j a_j eta_j`. Its
variance needs `G(x_p, x_j)` for every source position `x_j`.

## The reciprocity trick, which is why this is affordable

Written naively that needs one solve per source node, per frequency — `N` solves
where `N` is the grid. The operator is symmetric, so

    G(x_p, x_j) = G(x_j, x_p)

and the whole row is the response to a **single** point source placed at the
probe. **One tridiagonal solve per frequency instead of N.** At `N = 2000` that
is a factor of two thousand, and it is the difference between this being a
module and being a cluster job.

## The one approximation, stated

The spectrum is computed on a few hundred frequencies and interpolated onto the
FFT grid, because a synthesis over 40,000 samples would otherwise want 20,000
solves. `S_u(omega)` is smooth — it is a rational function of the impedance — so
interpolation error is small, and `spectrum_convergence` measures it rather than
assuming it.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.linalg import solve_banded

from .profiles import BMProfile
from .transmission import partition_impedance, respond


@dataclass(frozen=True)
class ProbeSpectrum:
    """One-sided power spectrum of the membrane displacement at one probe."""

    omega: np.ndarray
    #: ``S_u(omega)`` per unit noise intensity. Multiply by ``D`` to scale.
    density: np.ndarray
    probe_x: float
    beta: float

    def variance(self, noise_intensity: float) -> float:
        """``Var(u) = D * integral S_u domega / (2 pi)``, the closed form the
        synthesised series has to reproduce. ADR-0003's condition 1."""
        return float(noise_intensity * np.trapezoid(self.density, self.omega) / np.pi)


def _bands(profile: BMProfile, N: int, omega: float, beta: float):
    """The tridiagonal operator ``d^2/dx^2 + k^2`` on the interior nodes."""
    dx = 1.0 / N
    x = np.linspace(0.0, 1.0, N + 1)[1:-1]
    Z = partition_impedance(profile, x, omega)
    k2 = (beta**2) * (omega**2) / Z

    ab = np.zeros((3, x.size), dtype=complex)
    ab[0, 1:] = 1.0 / dx**2
    ab[1, :] = -2.0 / dx**2 + k2
    ab[2, :-1] = 1.0 / dx**2
    return ab, x, Z, dx


def green_row(profile: BMProfile, N: int, omega: float, beta: float, probe_x: float):
    """``G(x_j, x_p)`` for every ``j`` — one solve, by reciprocity.

    A unit point source at the probe. Both ends are Dirichlet (no stapes drive
    here: this is the noise problem, and the tone is superposed separately), so
    the operator is symmetric and the row equals the column.
    """
    ab, x, Z, dx = _bands(profile, N, omega, beta)
    i = int(np.argmin(np.abs(x - probe_x)))

    rhs = np.zeros(x.size, dtype=complex)
    # A discrete delta of unit *integral*: the source is a density, so its
    # amplitude carries a 1/dx. Getting this wrong scales every spectrum by dx
    # and the error hides completely in a curve that is only ever compared
    # against itself.
    rhs[i] = 1.0 / dx
    g = solve_banded((1, 1), ab, rhs)
    return g, x, Z, dx, i


def probe_spectrum(
    profile: BMProfile,
    N: int,
    omegas: np.ndarray,
    beta: float,
    probe_x: float,
) -> ProbeSpectrum:
    """Power spectrum of the displacement at ``probe_x`` under unit white noise."""
    dens = np.empty(omegas.size)
    for m, w in enumerate(omegas):
        g, x, Z, dx, i = green_row(profile, N, float(w), beta, probe_x)
        Zp = Z[i]

        # a_j = -(1/Z_p) beta^2 w^2 G(x_p,x_j) dx / Z_j, plus the local term at j=p.
        a = -(1.0 / Zp) * (beta**2) * (w**2) * g * dx / Z
        a[i] += 1.0 / Zp

        # White noise of unit intensity per unit length: <eta_i eta_j*> = delta_ij / dx.
        dens[m] = float(np.sum(np.abs(a) ** 2) / dx)
    return ProbeSpectrum(omega=np.asarray(omegas, dtype=float), density=dens,
                         probe_x=float(probe_x), beta=beta)


def synthesise(
    spec: ProbeSpectrum,
    noise_intensity: float,
    n_steps: int,
    dt: float,
    rng: np.random.Generator,
    n_paths: int = 1,
) -> np.ndarray:
    """A stationary Gaussian series with the given spectrum. ``(n_paths, n_steps)``.

    Spectral synthesis: draw a complex Gaussian at each positive frequency,
    weight it by ``sqrt(S(omega))``, and inverse-transform. Exact in law for a
    stationary Gaussian process up to the circulant wrap-around, which is
    negligible when the record is long against the correlation time — and the
    correlation time here is set by the damping, which `zeta0` keeps short.
    """
    freqs = np.fft.rfftfreq(n_steps, d=dt)
    w = 2.0 * np.pi * freqs

    # Interpolated in log-density: the spectrum spans orders of magnitude across
    # the resonance and linear interpolation of a peak that sharp would clip it.
    lo, hi = spec.omega[0], spec.omega[-1]
    wq = np.clip(w, lo, hi)
    dens = np.exp(np.interp(wq, spec.omega, np.log(np.maximum(spec.density, 1e-300))))
    # Outside the computed band there is no support: extrapolating a resonance
    # is inventing one.
    dens[(w < lo) | (w > hi)] = 0.0

    df = freqs[1] - freqs[0] if freqs.size > 1 else 1.0

    # The factor of two is the one-sided/two-sided convention, and it was wrong
    # first. `probe_spectrum` returns a TWO-sided density, so the variance is
    # `(1/pi) int_0^inf S domega` — while `irfft` of coefficients drawn at the
    # positive frequencies alone reconstructs `(1/2pi) int_0^inf S domega`.
    # Without the 2 the synthesised series carried exactly half the variance the
    # closed form predicted: ratio 0.4929, which is not a rounding error and is
    # not visible in a curve only ever compared against itself.
    #
    # ADR-0003 pre-registered "the synthesised field's variance matches the
    # spectrum integral" as the condition to check before trusting this sampler.
    # This is what it caught.
    amp = np.sqrt(noise_intensity * dens * df) * n_steps

    z = (rng.standard_normal((n_paths, freqs.size))
         + 1j * rng.standard_normal((n_paths, freqs.size))) / np.sqrt(2.0)
    spec_c = amp[None, :] * z
    spec_c[:, 0] = 0.0  # no DC: the membrane has no mean displacement
    return np.fft.irfft(spec_c, n=n_steps, axis=1)


def tone_at_probe(profile: BMProfile, N: int, omega: float, beta: float,
                  probe_x: float, drive: float = 1.0) -> complex:
    """Steady-state complex amplitude of the stapes-driven tone at the probe.

    The same forced solve ADR-0002 validated, evaluated at one point. Superposed
    onto the noise rather than simulated with it: the system is linear, so this
    is exact and carries no discretisation error into the amplitude the whole
    subthreshold calibration depends on.
    """
    r = respond(profile, N, omega, beta, drive)
    i = int(np.argmin(np.abs(r.x - probe_x)))
    return complex(r.U[i])


def spectrum_convergence(
    profile: BMProfile, N: int, beta: float, probe_x: float,
    omega_lo: float, omega_hi: float, counts=(100, 200, 400),
) -> dict:
    """How much the frequency grid changes the answer. The approximation, measured.

    Reports the variance implied by each grid. A spectrum too coarse to resolve
    the resonance under-counts the variance, which shifts the probe's ``sigma``
    and therefore moves the whole SR curve along its own axis — the same failure
    GATE-A14 exists for on the string.
    """
    out = {}
    for n in counts:
        w = np.geomspace(omega_lo, omega_hi, n)
        s = probe_spectrum(profile, N, w, beta, probe_x)
        out[n] = s.variance(1.0)
    ref = out[max(counts)]
    return {
        "variance_by_grid": {str(k): v for k, v in out.items()},
        "relative_change_from_finest": {
            str(k): abs(v - ref) / ref for k, v in out.items()
        },
    }
