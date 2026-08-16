"""The stochastic membrane, sampled exactly. Spec §4.1 and §5.3.

The semidiscretised system in the modal basis is a set of **independent
two-dimensional Ornstein-Uhlenbeck processes**, one per mode::

    q_n'' + 2 G_n q_n' + w_n^2 q_n = xi_n(t) + f_n(t)

and that is the whole reason this layer can be trusted: the field is Gaussian,
its stationary statistics are closed-form (`truth/lyapunov_variance.py`), and
every non-Gaussianity in the pipeline is manufactured downstream by the threshold
in `detector.py`. The linear half is exact and the non-linear half is one line.

## Three decisions that remove error rather than bound it

**1. The drive is not integrated, it is superposed.** The system is linear, so
the response to ``A sin(Omega t)`` is the analytic steady state (spec 2.13)
added to a *driveless* stochastic path. Integrating the sinusoid numerically
would introduce a discretisation error into the one component whose amplitude the
whole experiment is calibrated against — and a subthreshold drive that is 2%
wrong is a subthreshold drive whose optimum sits somewhere else.

**2. The stochastic part starts in its stationary distribution.** Sampled from
the Lyapunov covariance rather than from zero, so there is no burn-in, no
transient to discard, and no judgement call about how much to discard. A burn-in
length is a free parameter, and a free parameter in an instrument is somewhere
for the answer to hide.

**3. The transition is exact, by Van Loan.** For ``dz = A z dt + Sigma dW`` the
exact discrete transition over ``dt`` is Gaussian with mean ``e^{A dt} z`` and
covariance ``Q = int_0^dt e^{As} Sigma Sigma^T e^{A^T s} ds``. Van Loan's
identity gets both from a single matrix exponential of a 4x4 block matrix, so
**there is no time-discretisation error in the field at all** — the only ``dt``
left in the experiment is the one the crossing detector samples at. Spec §5.3
recommends this over Euler-Maruyama for exactly this reason, and
`euler_maruyama_step` is implemented beside it so GATE-A13 can measure what the
cheaper scheme costs.

## Paths are simulated together, and that is not just speed

Seeds are an axis, not a loop. Spec §7.1 wants 20 seeds per point of the SR
curve; running them as a batch amortises the per-step numpy overhead across all
of them and turns E3 from hours into minutes. It also makes the seeds *visibly*
independent — they are drawn from one `SeedSequence.spawn`, in one place, rather
than by a loop that could quietly reuse one.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from scipy.linalg import expm

from .modal import Modes

NoiseScaling = Literal["mass", "uniform"]
DetectorInput = Literal["disp", "vel"]


@dataclass(frozen=True)
class ModalSystem:
    """The membrane reduced to independent modes, with its damping and noise."""

    omega: np.ndarray
    #: Half-bandwidth per mode: the ``G`` of ``q'' + 2 G q' + w^2 q``.
    gamma: np.ndarray
    #: Noise intensity per mode, the ``D`` of ``<xi xi'> = 2 D delta``.
    noise: np.ndarray
    #: Mode shapes at the probe positions only, ``(n_probes, n_modes)``.
    phi_probe: np.ndarray
    probe_x: np.ndarray
    #: ``None`` for the 0-D toy, which has no membrane behind it.
    modes: Modes | None = None

    @property
    def n_modes(self) -> int:
        return self.omega.size


def modal_system(
    modes: Modes,
    probe_x: np.ndarray,
    noise_intensity: float,
    scaling: NoiseScaling = "mass",
) -> ModalSystem:
    """Reduce an assembled membrane to its modal stochastic form.

    ## Modal damping is a diagonal approximation, and it is named here

    ``phi^T C phi`` is not diagonal for a general ``gamma(x)``. Taking only its
    diagonal is the standard modal-damping assumption and it is exact when
    ``gamma`` is proportional to ``mu`` — which is the reference profile's case,
    because `profiles.gamma` is built as a ratio of the local critical damping.
    Off-diagonal coupling is dropped, and saying so matters: it is the one place
    this layer is an approximation rather than an exact reduction.

    ## What `scaling` actually changes

    Spec (4.2) puts a factor ``mu(x)`` in the spatial noise correlation, which
    implements local fluctuation-dissipation. Discretely the noise covariance is
    then ``2 D M``, and projecting onto ``M``-orthonormal modes gives
    ``2 D delta_nm`` — **every mode gets the same intensity**. With `uniform`
    scaling the covariance is ``2 D diag(V)`` instead and the modal intensities
    are ``D (phi^T diag(V) phi)_nn``, which are not equal. Spec §4.1 asks whether
    the spatial structure of the noise matters for stochastic resonance; this
    flag is that question, and the two arms differ in exactly one line.
    """
    sys = modes.system
    n_modes = modes.n_modes

    C_modal = modes.phi.T @ (sys.Cd[:, None] * modes.phi)
    gamma = np.diag(C_modal) / 2.0
    if np.any(gamma <= 0):
        raise ValueError("a mode with no damping has no stationary state; set zeta0 > 0")

    if scaling == "mass":
        # phi^T M phi = I, so every mode receives the same intensity.
        noise = np.full(n_modes, float(noise_intensity))
    elif scaling == "uniform":
        w = modes.phi.T @ (sys.volume[:, None] * modes.phi)
        noise = float(noise_intensity) * np.diag(w).copy()
    else:
        raise ValueError(f"unknown noise scaling: {scaling!r}")

    idx = np.array([int(np.argmin(np.abs(modes.x - xp))) for xp in np.atleast_1d(probe_x)])
    return ModalSystem(
        omega=modes.omega.copy(),
        gamma=gamma,
        noise=noise,
        phi_probe=modes.phi[idx, :].copy(),
        probe_x=modes.x[idx].copy(),
        modes=modes,
    )


def toy_modal_system(
    omega: float, gamma: float, noise_intensity: float
) -> ModalSystem:
    """A single damped mode, with no membrane behind it. The GATE-A10 toy.

    Spec §4.2 asks for a 0-D toy that validates the measurement pipeline before
    it is pointed at the PDE. **A damped mode is the right toy and an
    Ornstein-Uhlenbeck process is not**: an OU path is not differentiable, so its
    expected crossing rate is infinite and any number a simulation reported would
    be an artefact of the time step. A mode driven by white noise has a smooth
    position, Rice's formula applies to it, and it is literally one component of
    the real system rather than an analogy to it.
    """
    return ModalSystem(
        omega=np.array([float(omega)]),
        gamma=np.array([float(gamma)]),
        noise=np.array([float(noise_intensity)]),
        phi_probe=np.ones((1, 1)),
        probe_x=np.zeros(1),
        modes=None,
    )


def _van_loan(omega: np.ndarray, gamma: np.ndarray, noise: np.ndarray, dt: float):
    """Exact transition matrix and noise covariance for every mode at once.

    Van Loan's block trick::

        M = expm([[-A, Sigma Sigma^T], [0, A^T]] dt)
        e^{A dt} = M[2:, 2:]^T
        Q       = e^{A dt} @ M[:2, 2:]

    Returns ``(expA, cholQ, cholP)`` where ``P`` is the stationary covariance —
    used to start each path already in equilibrium.
    """
    n = omega.size
    expA = np.empty((n, 2, 2))
    cholQ = np.zeros((n, 2, 2))
    cholP = np.zeros((n, 2, 2))

    for k in range(n):
        A = np.array([[0.0, 1.0], [-(omega[k] ** 2), -2.0 * gamma[k]]])
        BBt = np.array([[0.0, 0.0], [0.0, 2.0 * noise[k]]])
        block = np.zeros((4, 4))
        block[:2, :2] = -A
        block[:2, 2:] = BBt
        block[2:, 2:] = A.T
        M = expm(block * dt)
        eA = M[2:, 2:].T
        Q = eA @ M[:2, 2:]
        # Symmetrise: the two halves agree to rounding and a Cholesky of a matrix
        # that is asymmetric in its last bit fails for no physical reason.
        Q = 0.5 * (Q + Q.T)
        expA[k] = eA
        cholQ[k] = _psd_chol(Q)
        # Stationary covariance, from the closed form rather than from a long run.
        P = np.array([[noise[k] / (2 * gamma[k] * omega[k] ** 2), 0.0],
                      [0.0, noise[k] / (2 * gamma[k])]])
        cholP[k] = _psd_chol(P)
    return expA, cholQ, cholP


def _psd_chol(m: np.ndarray) -> np.ndarray:
    """Cholesky that tolerates a positive-semidefinite matrix.

    ``Q`` is singular as ``dt -> 0`` (no noise has entered the position yet), so
    a plain `cholesky` raises on a perfectly valid covariance. The eigenvalue
    route is exact for 2x2, costs nothing at this size, and clips only genuinely
    negative rounding dust rather than anything physical.
    """
    vals, vecs = np.linalg.eigh(m)
    vals = np.clip(vals, 0.0, None)
    return vecs @ np.diag(np.sqrt(vals))


@dataclass(frozen=True)
class Drive:
    """A pure tone at the base. Spec §3.2, boundary injection."""

    omega: float
    amplitude: float
    #: Which node the stapes drives. Defaults to the base-adjacent node.
    node: int = 0


@dataclass(frozen=True)
class ProbeSeries:
    """What the detectors see: displacement and velocity at each probe."""

    t: np.ndarray
    #: ``(n_paths, n_steps, n_probes)``
    disp: np.ndarray
    vel: np.ndarray
    probe_x: np.ndarray
    drive_omega: float
    #: Steady-state response amplitude of the tone at each probe. The number the
    #: subthreshold calibration is about, computed analytically rather than
    #: measured out of the noisy series.
    tone_amplitude: np.ndarray

    def channel(self, which: DetectorInput) -> np.ndarray:
        return self.disp if which == "disp" else self.vel


def modal_forcing(modes: Modes, drive: Drive) -> np.ndarray:
    """Modal force amplitudes for a tone injected at one node."""
    f = np.zeros(modes.system.n)
    sys = modes.system
    # Same coupling weight `forced.respond` uses for the eliminated base node, so
    # the stochastic path and the steady-state solve are driven identically.
    f[drive.node] = drive.amplitude * sys.profile.K(sys.dx / 2.0) / sys.dx
    return modes.phi.T @ f


def simulate_ou_modal(
    ms: ModalSystem,
    drive: Drive | None,
    T: float,
    dt: float,
    rng: np.random.Generator,
    n_paths: int = 1,
    modal_force: np.ndarray | None = None,
    noise_stream_modes: int | None = None,
) -> ProbeSeries:
    """Sample the membrane at the probes over ``[0, T]``.

    The stochastic part is exact; the tone is superposed analytically. Together
    they are the exact law of the stationary driven system, so the only
    approximation left in this function is the modal truncation the caller chose.

    ## ``noise_stream_modes``, and why a truncation study needs it

    Each step draws ``(n_paths, n_modes, 2)`` normals. Run the same seed with a
    different mode count and **every retained mode gets a different stream**,
    because the draws are consumed in a different shape — so two truncations of
    the same experiment are independent realisations, not a paired comparison.

    GATE-A14 measured 0.238 dB between 40 and 80 modes that way and would have
    reported it as truncation error. It was Monte-Carlo noise: the confidence
    interval on either point was about 1 dB wide, five times the difference being
    attributed to the basis.

    Setting ``noise_stream_modes`` to the largest basis under comparison makes
    the draw shape identical across arms, so the retained modes receive
    *identical* noise and the difference between two runs is the truncation and
    nothing else. Drawing a few unused normals costs nothing; not drawing them
    costs the ability to measure the thing the gate is named after.
    """
    n_steps = int(round(T / dt))
    if n_steps < 8:
        raise ValueError("fewer than eight samples is not a time series")
    t = np.arange(n_steps) * dt

    expA, cholQ, cholP = _van_loan(ms.omega, ms.gamma, ms.noise, dt)

    n_draw = max(int(noise_stream_modes or ms.n_modes), ms.n_modes)

    # Start every path in the stationary distribution: no burn-in to choose.
    z = np.einsum(
        "nij,pnj->pni", cholP, rng.standard_normal((n_paths, n_draw, 2))[:, : ms.n_modes, :]
    )

    n_probes = ms.phi_probe.shape[0]
    disp = np.empty((n_paths, n_steps, n_probes))
    vel = np.empty((n_paths, n_steps, n_probes))

    phiT = ms.phi_probe.T  # (n_modes, n_probes)
    for k in range(n_steps):
        disp[:, k, :] = z[:, :, 0] @ phiT
        vel[:, k, :] = z[:, :, 1] @ phiT
        w = rng.standard_normal((n_paths, n_draw, 2))[:, : ms.n_modes, :]
        z = np.einsum("nij,pnj->pni", expA, z) + np.einsum("nij,pnj->pni", cholQ, w)

    tone_amp = np.zeros(n_probes)
    if drive is not None and drive.amplitude != 0.0:
        if modal_force is not None:
            f_n = np.asarray(modal_force, dtype=float)
        elif ms.modes is not None:
            f_n = modal_forcing(ms.modes, drive)
        else:
            raise ValueError("a driven system with no membrane needs an explicit modal_force")
        denom = ms.omega**2 - drive.omega**2 + 2j * ms.gamma * drive.omega
        c = f_n / denom
        # Complex probe response, then the real signal at each time.
        cp = c @ ms.phi_probe.T  # (n_probes,)
        phase = np.exp(1j * drive.omega * t)[None, :, None]
        disp += np.real(cp[None, None, :] * phase)
        vel += np.real(1j * drive.omega * cp[None, None, :] * phase)
        tone_amp = np.abs(cp)

    return ProbeSeries(
        t=t,
        disp=disp,
        vel=vel,
        probe_x=ms.probe_x,
        drive_omega=drive.omega if drive else 0.0,
        tone_amplitude=tone_amp,
    )


def euler_maruyama_step(
    ms: ModalSystem, z: np.ndarray, dt: float, rng: np.random.Generator
) -> np.ndarray:
    """One Euler-Maruyama step, for GATE-A13 to measure against the exact one.

    Kept because spec §5.3 asks for both and because the comparison is the
    evidence that the exact scheme is worth its matrix exponential. Strong order
    0.5; the stationary variance it produces is biased in ``dt``, and A13 reports
    by how much.
    """
    q, v = z[..., 0], z[..., 1]
    dw = rng.standard_normal(q.shape) * np.sqrt(dt)
    dv = (-(ms.omega**2) * q - 2.0 * ms.gamma * v) * dt + np.sqrt(2.0 * ms.noise) * dw
    return np.stack([q + v * dt, v + dv], axis=-1)


def stationary_variance(ms: ModalSystem) -> np.ndarray:
    """``D / (2 G w^2)`` per mode — the closed form, for comparison only.

    Duplicated from `truth/lyapunov_variance.py` on purpose? **No.** This is the
    solver's own copy and the gate compares it against `truth/`'s, which is
    derived by solving the Lyapunov equation in sympy. Two routes to the same
    number, one of which is forbidden from importing the other.
    """
    return ms.noise / (2.0 * ms.gamma * ms.omega**2)
