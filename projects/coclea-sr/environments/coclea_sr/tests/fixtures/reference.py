"""A correct solution, written the way a model would be asked to write one.

Numpy and scipy only — everything a solver needs and nothing that knows the
answer. It discretises and solves rather than evaluating a closed form, which is
the point: a candidate that returned `(2n-1)*pi/2` would pass `uniform` and fail
`exponential`, where no elementary formula exists.

## The mistake this file made first, and what it cost

The first version treated the free end by zeroing the outer flux and giving the
apex node a **full cell of mass**. That is second-order in the interior and
first-order at the boundary, so every eigenvalue carries an O(dx) error. It
scored 1.0 on `uniform` (tolerance 1e-4) and **0.89 on `exponential`**
(tolerance 1e-5) — close enough to look like a tuning problem. Richardson
extrapolation then made it *worse*, 2.48e-5 to 2.75e-5, which is the giveaway:
extrapolating a second-order formula over a first-order error cancels nothing and
amplifies the noise.

The apex owns **half a cell**. That is the whole fix, it is one line, and spec
§5.1 of the project this environment exports says so explicitly — the
environment's own gate rediscovered it in the reference solution.
"""
import numpy as np
from scipy.linalg import eigh_tridiagonal


def _assemble(mu, K, N, length):
    """Finite-volume, fixed-free. Unknowns u_1..u_N; u_0 = 0 is eliminated."""
    dx = length / N
    x = np.arange(1, N + 1, dtype=float) * dx

    lower = K(x - dx / 2.0)        # K at the inner face of each cell
    upper = K(x[:-1] + dx / 2.0)   # K at the outer face, except the apex's

    volume = np.full(N, dx)
    volume[-1] = dx / 2.0          # du/dx(L) = 0: the apex owns half a cell

    d = np.empty(N)
    d[:-1] = (upper + lower[:-1]) / dx
    d[-1] = lower[-1] / dx         # no outer flux at all — that IS the Neumann
    e = -upper / dx

    m = mu(x) * volume
    return d, e, m, x


def _eigs(mu, K, n_modes, N, length):
    d, e, m, x = _assemble(mu, K, N, length)
    inv = 1.0 / np.sqrt(m)
    lam, y = eigh_tridiagonal(
        d * inv * inv, e * inv[:-1] * inv[1:], select="i", select_range=(0, n_modes - 1)
    )
    return np.sqrt(np.maximum(lam, 0.0)), y * inv[:, None], x


def _richardson(mu, K, n_modes, length, N=4000):
    """Two grids, one extrapolation. Genuinely second order now, so the leading
    error cancels: `(4 w_2N - w_N)/3`."""
    wa, _, _ = _eigs(mu, K, n_modes, N, length)
    wb, _, _ = _eigs(mu, K, n_modes, 2 * N, length)
    return ((4.0 * wb - wa) / 3.0).tolist()


def uniform_eigenfrequencies(n_modes, c, length):
    return _richardson(
        lambda x: np.ones_like(x), lambda x: np.full_like(x, c**2), n_modes, length
    )


def exponential_eigenfrequencies(n_modes, alpha, length, c):
    return _richardson(
        lambda x: np.exp(-alpha * x),
        lambda x: c**2 * np.exp(-alpha * x),
        n_modes,
        length,
    )


def uniform_mode_shapes(n_modes, x, c, length):
    k = np.array([(2 * n - 1) * np.pi / (2 * length) for n in range(1, n_modes + 1)])
    return np.sin(k[:, None] * np.asarray(x)[None, :])


def stationary_variance(omega, gamma, noise_intensity):
    """`q'' + 2G q' + w^2 q = xi`, `<xi xi> = 2D delta`, so `Var(q) = D/(2 G w^2)`.

    The factor of two is the prompt's, stated there in full. This function
    returned `D/(G w^2)` while the prompt said nothing, and scored 0.0 with a
    relative error of exactly 1.0 — which is how the prompt came to state it.
    """
    return noise_intensity / (2.0 * gamma * omega**2)
