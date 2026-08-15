"""The stochastic-resonance curve on the membrane. Spec §7.1 E3, GATE-B2.

One function, used by GATE-A14 and by `experiments/e3_sr_curve.py`, so the
truncation check and the headline result cannot drift apart by being two
different pieces of code that happen to be pointed at the same physics.

## The prediction carries over from 0-D, and that is what makes B2 checkable

`truth/rice_sr_toy` derives ``sigma_opt = theta / 2`` for a single damped mode.
The probe series here is a **sum** of independent modes, so it is still a
stationary Gaussian process — the sum only changes the effective frequency in
Rice's rate,

    r0 = (1 / 2pi) (sigma_vdot / sigma_v) exp(-theta^2 / 2 sigma_v^2)

and that prefactor scales the SNR without moving its maximum. So the membrane
should put its optimum in the same place as the toy, and GATE-B2 has a
*quantitative* prediction to miss rather than only the qualitative "there is a
bump somewhere".

## Why the sweep is in sigma and reported in D

The physical control is the noise intensity ``D``; the theory is about the
standard deviation ``sigma`` the probe actually sees, and the map between them
depends on the mode shapes at that probe. Sweeping ``sigma`` and inverting to
``D`` keeps the grid centred on the region where an answer could be seen for
*every* probe, instead of one probe getting a well-resolved peak and the others a
flat flank of the same curve. Both are recorded.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import analysis, calibrate, detector, stochastic
from .modal import Modes
from .stochastic import DetectorInput, NoiseScaling


@dataclass(frozen=True)
class SRPoint:
    """One point of the curve: a noise level and what the detector made of it."""

    sigma: float
    noise_intensity: float
    snr: analysis.Estimate
    vs: analysis.Estimate
    event_rate: float
    tone_amplitude: float


@dataclass(frozen=True)
class SRCurve:
    probe_x: float
    drive_omega: float
    theta: float
    points: list[SRPoint] = field(default_factory=list)

    @property
    def sigma_grid(self) -> np.ndarray:
        return np.array([p.sigma for p in self.points])

    @property
    def snr_estimates(self) -> list[analysis.Estimate]:
        return [p.snr for p in self.points]

    def verdict(self) -> dict[str, object]:
        return analysis.interior_maximum(self.sigma_grid, self.snr_estimates)


def probe_sigma(ms: stochastic.ModalSystem, probe: int, which: DetectorInput = "disp") -> float:
    """Standard deviation the detector at ``probe`` sees, in closed form.

    Modes are independent, so the variance of the probe series is the weighted
    sum of the modal variances. Computed rather than measured, because it is the
    quantity the theoretical optimum is stated in and estimating it off a noisy
    trace would put sampling error into the x-axis of the result.
    """
    var_q = ms.noise / (2.0 * ms.gamma * ms.omega**2)
    w = ms.phi_probe[probe] ** 2
    if which == "vel":
        var_q = ms.noise / (2.0 * ms.gamma)
    return float(np.sqrt(np.sum(w * var_q)))


def noise_for_sigma(ms: stochastic.ModalSystem, probe: int, target: float,
                    which: DetectorInput = "disp") -> float:
    """Invert :func:`probe_sigma`. Linear in ``D``, so it is a division."""
    unit = probe_sigma(
        stochastic.ModalSystem(
            omega=ms.omega, gamma=ms.gamma, noise=np.ones_like(ms.noise),
            phi_probe=ms.phi_probe, probe_x=ms.probe_x, modes=ms.modes,
        ),
        probe, which,
    )
    return float((target / unit) ** 2)


def sr_curve(
    modes: Modes,
    probe_x: float,
    drive_omega: float,
    *,
    sigma_grid: np.ndarray,
    theta: float | None = None,
    subthreshold_fraction: float = 0.5,
    n_seeds: int = 20,
    n_periods: int = 200,
    samples_per_period: int = 200,
    detector_input: DetectorInput = "disp",
    noise_scaling: NoiseScaling = "mass",
    tau_ref: float = 0.0,
    n_modes: int | None = None,
    noise_stream_modes: int | None = None,
    master_seed: int = 20260814,
    n_boot: int = 2000,
) -> SRCurve:
    """Measure SNR and vector strength across a noise grid at one probe.

    ``theta`` defaults to ``2 * median(sigma_grid)``, which puts the theoretical
    optimum in the middle of the swept window — see `calibrate.calibrate_threshold`
    for why that centres the instrument without deciding its answer.
    """
    if n_modes is not None:
        modes = Modes(
            omega=modes.omega[:n_modes],
            phi=modes.phi[:, :n_modes],
            x=modes.x,
            system=modes.system,
        )

    ms0 = stochastic.modal_system(modes, np.array([probe_x]), 1.0, noise_scaling)
    theta = theta if theta is not None else calibrate.calibrate_threshold(float(np.median(sigma_grid)))

    cal = calibrate.calibrate_subthreshold(ms0, drive_omega, theta, probe=0,
                                           fraction=subthreshold_fraction)
    if not cal.subthreshold:
        raise ValueError("the calibrated tone is not subthreshold; the run would measure a detector")

    period = 2.0 * np.pi / drive_omega
    dt = period / samples_per_period
    T = n_periods * period

    # One SeedSequence, spawned once. Spec §6.4 rule 6 wants an explicit seed per
    # run; deriving them from one root in one place is what makes them provably
    # distinct rather than distinct-looking.
    seeds = np.random.SeedSequence(master_seed).spawn(len(sigma_grid))

    points: list[SRPoint] = []
    for s_target, seed in zip(sigma_grid, seeds):
        D = noise_for_sigma(ms0, 0, float(s_target), detector_input)
        ms = stochastic.modal_system(modes, np.array([probe_x]), D, noise_scaling)
        ps = stochastic.simulate_ou_modal(
            ms,
            stochastic.Drive(omega=drive_omega, amplitude=cal.drive_amplitude),
            T, dt, np.random.default_rng(seed), n_paths=n_seeds,
            noise_stream_modes=noise_stream_modes,
        )
        v = ps.channel(detector_input)
        ev = detector.threshold_events(v, ps.t, theta, tau_ref)
        boot_rng = np.random.default_rng(seed.spawn(1)[0])
        points.append(
            SRPoint(
                sigma=float(s_target),
                noise_intensity=D,
                snr=analysis.snr_db(ev, ps.t, drive_omega, 0, n_boot=n_boot, rng=boot_rng),
                vs=analysis.vector_strength(ev, drive_omega, 0, n_boot=n_boot, rng=boot_rng),
                event_rate=float(ev.rates().mean()),
                tone_amplitude=float(ps.tone_amplitude[0]),
            )
        )

    return SRCurve(probe_x=float(ms0.probe_x[0]), drive_omega=drive_omega,
                   theta=theta, points=points)


def shared_sr_curve(
    modes: Modes,
    probe_xs: np.ndarray,
    drive_omega: float,
    *,
    noise_grid: np.ndarray,
    theta: float,
    drive_amplitude: float,
    n_seeds: int = 8,
    n_periods: int = 60,
    samples_per_period: int = 64,
    detector_input: DetectorInput = "disp",
    noise_scaling: NoiseScaling = "mass",
    tau_ref: float = 0.0,
    master_seed: int = 20260815,
    n_boot: int = 400,
) -> list[SRCurve]:
    """The SR curve at several probes on **one** membrane, sharing everything.

    `sr_curve` cannot answer a spatial question and this is the reason: it
    calibrates the tone to be subthreshold *at the probe*, and picks `theta`
    from the sigma grid, so every probe is independently equalised. Comparing
    peak SNR across probes then compares three separate instruments. Measured on
    the graded string: 13.02 dB at ``x=0.20`` against 10.80 dB at ``x=0.375``,
    which is mode 3's own peak — the opposite of the expected ordering, produced
    by the normalisation rather than by the membrane.

    Here one stapes drive, one threshold and one noise intensity are applied to
    the whole membrane, and each probe sees whatever the mode shapes deliver to
    it. That is the arrangement spec §R2's question is about, and it is the same
    correction ADR-0003 made for the transmission line — applied to the plain
    string, which is all the narrowed model has.

    Returns one `SRCurve` per probe, in the order given.
    """
    period = 2.0 * np.pi / drive_omega
    dt = period / samples_per_period
    T = n_periods * period
    seeds = np.random.SeedSequence(master_seed).spawn(len(noise_grid))

    per_probe: list[list[SRPoint]] = [[] for _ in probe_xs]
    for D, seed in zip(noise_grid, seeds):
        ms = stochastic.modal_system(modes, np.asarray(probe_xs, dtype=float), float(D), noise_scaling)
        ps = stochastic.simulate_ou_modal(
            ms,
            stochastic.Drive(omega=drive_omega, amplitude=drive_amplitude),
            T, dt, np.random.default_rng(seed), n_paths=n_seeds,
        )
        v = ps.channel(detector_input)
        ev = detector.threshold_events(v, ps.t, theta, tau_ref)
        for j in range(len(probe_xs)):
            boot_rng = np.random.default_rng(seed.spawn(len(probe_xs))[j])
            per_probe[j].append(
                SRPoint(
                    sigma=float(np.std(v[:, :, j])),
                    noise_intensity=float(D),
                    snr=analysis.snr_db(ev, ps.t, drive_omega, j, n_boot=n_boot, rng=boot_rng),
                    vs=analysis.vector_strength(ev, drive_omega, j, n_boot=n_boot, rng=boot_rng),
                    event_rate=float(ev.rates()[:, j].mean()),
                    tone_amplitude=float(ps.tone_amplitude[j]),
                )
            )
    return [
        SRCurve(probe_x=float(px), drive_omega=drive_omega, theta=theta, points=pts)
        for px, pts in zip(probe_xs, per_probe)
    ]


# --- the same curve, on the operator that has a place code -------------------

def tl_sr_curve(
    profile,
    probe_x: float,
    drive_omega: float,
    *,
    beta: float,
    sigma_grid: np.ndarray | None = None,
    noise_grid: np.ndarray | None = None,
    stapes_drive: float | None = None,
    N: int = 1000,
    n_spectrum: int = 200,
    omega_band: tuple[float, float] | None = None,
    theta: float | None = None,
    subthreshold_fraction: float = 0.5,
    n_seeds: int = 20,
    n_periods: int = 200,
    samples_per_period: int = 200,
    tau_ref: float = 0.0,
    master_seed: int = 20260815,
    n_boot: int = 2000,
) -> SRCurve:
    """SR curve at one probe of the **transmission line**. ADR-0003.

    Same detector, same estimator, same bootstrap as `sr_curve` — deliberately,
    so a difference between the two is a difference in the operator and not in
    the instrument. What changes is where the field comes from: a spectrum
    computed once per frequency by reciprocity, synthesised into a stationary
    Gaussian series, with the stapes-driven tone superposed analytically.

    ## Two modes, and only one of them can answer a spatial question

    **`sigma_grid`** normalises: the noise is scaled so the probe sees exactly
    this ``sigma``, ``theta`` follows from it, and the tone is scaled to a fixed
    fraction of ``theta``. Every probe is then placed at the *same operating
    point*. Good for asking "does this probe show stochastic resonance"; useless
    for asking "which probe shows it most", because it **normalises away exactly
    the quantity the spatial question is about**.

    E5 was first written that way and produced a peak-SNR curve flat to 1.5 dB
    across the whole membrane, at every frequency — the pre-registered condition
    failed, and the cause was the instrument rather than the physics.

    **`noise_grid` + `stapes_drive`** is the physical mode: one noise intensity
    for the whole membrane, one threshold, one drive at the stapes, and whatever
    the traveling wave delivers at each position is what the detector there
    sees. That is the only arrangement in which "the resonance is sharpest where
    the membrane is tuned" is a statement about the membrane.
    """
    if (sigma_grid is None) == (noise_grid is None):
        raise ValueError("give exactly one of sigma_grid (normalised) or noise_grid (physical)")
    from . import tl_stochastic

    lo, hi = omega_band or (drive_omega / 40.0, drive_omega * 40.0)
    w = np.geomspace(lo, hi, n_spectrum)
    spec = tl_stochastic.probe_spectrum(profile, N, w, beta, probe_x)

    unit_var = spec.variance(1.0)
    if noise_grid is not None:
        # Physical mode: D is given, sigma is whatever the membrane delivers here.
        grid = np.asarray(noise_grid, dtype=float)
        sigmas = np.sqrt(grid * unit_var)
        if theta is None:
            raise ValueError("physical mode needs an explicit theta, shared across probes")
    else:
        grid = None
        sigmas = np.asarray(sigma_grid, dtype=float)
        theta = theta if theta is not None else calibrate.calibrate_threshold(
            float(np.median(sigmas))
        )

    tone_c = tl_stochastic.tone_at_probe(profile, N, drive_omega, beta, probe_x, 1.0)
    if abs(tone_c) <= 0:
        raise ValueError(f"probe {probe_x} has no response at Omega={drive_omega}")
    if stapes_drive is not None:
        # Whatever the wave actually delivers here from a fixed drive at the base.
        tone_amp = float(abs(tone_c) * stapes_drive)
    else:
        tone_amp = subthreshold_fraction * theta
    phase = float(np.angle(tone_c))

    period = 2.0 * np.pi / drive_omega
    dt = period / samples_per_period
    n_steps = int(round(n_periods * samples_per_period))
    t = np.arange(n_steps) * dt

    seeds = np.random.SeedSequence(master_seed).spawn(len(sigmas))

    points: list[SRPoint] = []
    for k, (s_target, seed) in enumerate(zip(sigmas, seeds)):
        D = float(grid[k]) if grid is not None else float(s_target**2 / unit_var)
        rng = np.random.default_rng(seed)
        y = tl_stochastic.synthesise(spec, D, n_steps, dt, rng, n_paths=n_seeds)
        y = y + tone_amp * np.cos(drive_omega * t + phase)[None, :]
        v = y[:, :, None]  # (paths, steps, one probe) -- the detector's shape

        ev = detector.threshold_events(v, t, theta, tau_ref)
        boot_rng = np.random.default_rng(seed.spawn(1)[0])
        points.append(
            SRPoint(
                sigma=float(s_target),
                noise_intensity=D,
                snr=analysis.snr_db(ev, t, drive_omega, 0, n_boot=n_boot, rng=boot_rng),
                vs=analysis.vector_strength(ev, drive_omega, 0, n_boot=n_boot, rng=boot_rng),
                event_rate=float(ev.rates().mean()),
                tone_amplitude=float(tone_amp),
            )
        )

    return SRCurve(probe_x=float(probe_x), drive_omega=drive_omega,
                   theta=theta, points=points)
