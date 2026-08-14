"""The threshold element: where the non-linearity lives. Spec §4.4.

Everything upstream of this file is linear and Gaussian and exactly solvable.
Everything interesting — the inverted U, the whole phenomenon — is manufactured
here, by a comparison against a number. That separation is the design's main
strength, because it means a failure can be localised: if the field's variance
matches Lyapunov (GATE-A9) and the SR curve is still wrong, the fault is in these
forty lines and nowhere else.

## Two detectors, and the question that needs both

**Detector A** — threshold with refractoriness. Fires on an upward crossing of
``theta`` provided the last event was more than ``tau_ref`` ago.

**Detector B** — leaky integrate-and-fire, with its *own* intrinsic noise ``xi``.
This exists to ask the question spec §7.2 calls the central one: the mechanical
noise in the membrane and the neuronal noise at the synapse are different
physical channels, and only a model carrying both separately can ask which one
is the agent of the resonance — or whether they interact.

## Crossings are interpolated, and that is not cosmetic

The sampled series says the signal was below ``theta`` at ``t_k`` and above at
``t_{k+1}``; taking ``t_{k+1}`` as the event time quantises every event onto the
sampling grid. Vector strength is a measure of *phase* concentration, so grid
quantisation adds a jitter of up to one sample directly to the quantity being
measured — at 200 samples per cycle that is 1.8 degrees of spurious phase spread
on every event, and it biases VS downward hardest exactly where VS is highest.
Linear interpolation between the bracketing samples removes it.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class EventTrain:
    """Crossing times, one list per path and probe.

    Ragged by nature — different paths cross a different number of times — so it
    is stored as lists rather than padded into an array. A padded array would
    need a sentinel, and a sentinel in a list of event times is an event.
    """

    #: ``times[path][probe]`` -> 1-D array of crossing instants.
    times: list[list[np.ndarray]]
    duration: float
    theta: float
    tau_ref: float

    @property
    def n_paths(self) -> int:
        return len(self.times)

    @property
    def n_probes(self) -> int:
        return len(self.times[0]) if self.times else 0

    def rate(self, path: int, probe: int) -> float:
        """Events per unit time. The observable spec §4.5 calls ``r0``."""
        return len(self.times[path][probe]) / self.duration

    def rates(self) -> np.ndarray:
        """``(n_paths, n_probes)`` of event rates."""
        return np.array(
            [[self.rate(p, q) for q in range(self.n_probes)] for p in range(self.n_paths)]
        )


def _crossings_1d(v: np.ndarray, t: np.ndarray, theta: float, tau_ref: float) -> np.ndarray:
    """Upward crossings of ``theta`` in one series, interpolated and refractory."""
    below = v[:-1] < theta
    above = v[1:] >= theta
    idx = np.flatnonzero(below & above)
    if idx.size == 0:
        return np.empty(0)

    v0, v1 = v[idx], v[idx + 1]
    # Linear interpolation of the instant the line v(t) meets theta.
    frac = (theta - v0) / np.where(v1 == v0, np.inf, v1 - v0)
    times = t[idx] + frac * (t[idx + 1] - t[idx])

    if tau_ref <= 0:
        return times

    # Refractoriness, applied forward: an event suppresses everything within
    # tau_ref *after* it, and the suppressed ones do not themselves suppress.
    # Doing it the other way round (a sliding window over all candidates) would
    # let a burst of near-simultaneous crossings delete a later legitimate one.
    kept = [times[0]]
    for tv in times[1:]:
        if tv - kept[-1] > tau_ref:
            kept.append(tv)
    return np.asarray(kept)


def threshold_events(
    v: np.ndarray, t: np.ndarray, theta: float, tau_ref: float = 0.0
) -> EventTrain:
    """Detector A. ``v`` is ``(n_paths, n_steps, n_probes)``."""
    n_paths, _, n_probes = v.shape
    times = [
        [_crossings_1d(v[p, :, q], t, theta, tau_ref) for q in range(n_probes)]
        for p in range(n_paths)
    ]
    return EventTrain(times=times, duration=float(t[-1] - t[0]), theta=theta, tau_ref=tau_ref)


def lif_events(
    v: np.ndarray,
    t: np.ndarray,
    *,
    tau_m: float,
    beta: float,
    v_th: float,
    intrinsic_noise: float,
    rng: np.random.Generator,
    tau_ref: float = 0.0,
) -> EventTrain:
    """Detector B. ``dV/dt = -V/tau_m + beta v(t) + xi``, spike and reset at ``v_th``.

    ``intrinsic_noise`` is the standard deviation of ``xi`` per unit time, and it
    is a **separate channel** from the mechanical noise driving the membrane.
    Keeping them apart is the entire reason this detector exists: with one noise
    source the question "which noise causes the resonance" has no referent.

    Integrated with exponential Euler on the leak, which is exact for the
    deterministic part of a leaky integrator and therefore does not put a
    ``dt``-dependent bias into the membrane potential — a bias there would move
    the firing rate, and the firing rate is the measurement.
    """
    n_paths, n_steps, n_probes = v.shape
    dt = float(t[1] - t[0])
    decay = np.exp(-dt / tau_m)
    # Variance of the integrated noise over one step for the same leak.
    noise_sd = intrinsic_noise * np.sqrt(tau_m * 0.5 * (1.0 - decay**2))

    times: list[list[list[float]]] = [[[] for _ in range(n_probes)] for _ in range(n_paths)]
    V = np.zeros((n_paths, n_probes))
    last = np.full((n_paths, n_probes), -np.inf)

    for k in range(n_steps):
        drive = beta * v[:, k, :] * tau_m * (1.0 - decay)
        V = V * decay + drive
        if noise_sd > 0:
            V = V + noise_sd * rng.standard_normal((n_paths, n_probes))
        fired = (V >= v_th) & ((t[k] - last) > tau_ref)
        if fired.any():
            for p, q in zip(*np.nonzero(fired)):
                times[p][q].append(float(t[k]))
            last[fired] = t[k]
            V[fired] = 0.0
        # A neuron that reached threshold inside its refractory period is held,
        # not silently allowed to keep integrating past v_th for ever.
        V = np.minimum(V, v_th)

    return EventTrain(
        times=[[np.asarray(times[p][q]) for q in range(n_probes)] for p in range(n_paths)],
        duration=float(t[-1] - t[0]),
        theta=v_th,
        tau_ref=tau_ref,
    )


def binned(events: EventTrain, t: np.ndarray, path: int, probe: int) -> np.ndarray:
    """Events as a counts-per-bin series on the simulation grid.

    What `analysis.snr_db` transforms. Counts rather than a 0/1 indicator: two
    crossings inside one bin are two events, and flattening them to one would
    make the estimator's answer depend on the sampling rate.
    """
    dt = float(t[1] - t[0])
    y = np.zeros(t.size)
    ev = events.times[path][probe]
    if ev.size:
        idx = np.clip(((ev - t[0]) / dt).astype(int), 0, t.size - 1)
        np.add.at(y, idx, 1.0)
    return y
