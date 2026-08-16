"""The measurement pipeline: SNR, vector strength, and confidence intervals.
Spec §4.3 and §7.3.

Every quantifier here is defined exactly once, in this file, and GATE-A10
exercises all of it on the 0-D toy whose answer is known in closed form **before
any of it touches the PDE**. A pipeline first exercised on the thing it is meant
to measure cannot be told apart from the thing it is measuring, which is the
failure spec §4.2 is guarding against when it insists A10 comes first.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.signal import welch

from .detector import EventTrain, binned


@dataclass(frozen=True)
class WelchCfg:
    """Spec §4.3: Welch, 50% overlap, per-segment detrend."""

    nperseg: int = 4096
    overlap: float = 0.5
    detrend: str = "constant"
    #: Half-width of the sideband used for the noise floor, in bins.
    band_bins: int = 40
    #: Bins either side of the signal excluded from the floor. Spec says +-2.
    guard_bins: int = 2


@dataclass(frozen=True)
class Estimate:
    """A number with an interval. Never returned without one — spec §7.3."""

    value: float
    ci_lo: float
    ci_hi: float
    n: int

    def __repr__(self) -> str:  # pragma: no cover - display only
        return f"{self.value:.4g} [{self.ci_lo:.4g}, {self.ci_hi:.4g}] n={self.n}"


def spectral_snr_db(y: np.ndarray, dt: float, drive_omega: float, cfg: WelchCfg) -> float:
    """Spec §4.3.1, for a single realisation.

    ``SNR = 10 log10( S(Omega) / <S_noise> )`` with the floor averaged over
    sidebands that exclude the signal bin and its guard.

    The floor is the **median** of the sideband bins, not the mean. A periodogram
    floor is exponentially distributed, so its mean is pulled up by its own tail
    and by any harmonic that happens to land in the band; the median is not, and
    the difference shows up as a systematic offset in every SNR the run reports.
    """
    nper = min(cfg.nperseg, y.size)
    f, pxx = welch(
        y,
        fs=1.0 / dt,
        nperseg=nper,
        noverlap=int(nper * cfg.overlap),
        detrend=cfg.detrend,
        scaling="density",
    )
    f_sig = drive_omega / (2.0 * np.pi)
    k = int(np.argmin(np.abs(f - f_sig)))
    if k == 0:
        raise ValueError("the drive fell in the DC bin; nperseg is too small to resolve it")

    lo = max(1, k - cfg.band_bins)
    hi = min(f.size, k + cfg.band_bins + 1)
    band = np.concatenate([pxx[lo : k - cfg.guard_bins], pxx[k + cfg.guard_bins + 1 : hi]])
    if band.size < 8:
        raise ValueError("fewer than eight sideband bins; the noise floor is not estimable")

    floor = float(np.median(band))
    if floor <= 0:
        return -np.inf
    return float(10.0 * np.log10(pxx[k] / floor))


def snr_db(
    events: EventTrain,
    t: np.ndarray,
    drive_omega: float,
    probe: int = 0,
    cfg: WelchCfg | None = None,
    n_boot: int = 10_000,
    rng: np.random.Generator | None = None,
) -> Estimate:
    """SNR across paths, with a BCa interval over the seeds. Spec §4.3.1, §7.3.

    The bootstrap resamples **seeds**, not time. Resampling within one path would
    treat a correlated series as independent samples and produce an interval far
    too narrow — the classic way an SR curve acquires error bars that make every
    point significantly different from every other.
    """
    cfg = cfg or WelchCfg()
    dt = float(t[1] - t[0])
    per_path = np.array(
        [
            spectral_snr_db(binned(events, t, p, probe), dt, drive_omega, cfg)
            for p in range(events.n_paths)
        ]
    )
    finite = per_path[np.isfinite(per_path)]
    if finite.size == 0:
        return Estimate(value=-np.inf, ci_lo=-np.inf, ci_hi=-np.inf, n=0)
    return bootstrap_bca(finite, np.mean, n_boot=n_boot, rng=rng)


def vector_strength(
    events: EventTrain,
    drive_omega: float,
    probe: int = 0,
    n_boot: int = 10_000,
    rng: np.random.Generator | None = None,
) -> Estimate:
    """``VS = |<exp(i Omega t_k)>|`` over crossing times. Spec §4.3.2.

    The standard measure in auditory physiology, so the number is directly
    comparable with the literature the LITERATURA role is asked to confront.
    """
    per_path = []
    for p in range(events.n_paths):
        tk = events.times[p][probe]
        # Fewer than about ten events gives a vector strength dominated by its
        # own small-sample bias — |mean of n unit vectors| ~ 1/sqrt(n) even for
        # uniform phase — so those paths are dropped rather than averaged in.
        if tk.size >= 10:
            per_path.append(abs(np.mean(np.exp(1j * drive_omega * tk))))
    if not per_path:
        return Estimate(value=0.0, ci_lo=0.0, ci_hi=0.0, n=0)
    return bootstrap_bca(np.asarray(per_path), np.mean, n_boot=n_boot, rng=rng)


def bootstrap_bca(
    sample: np.ndarray,
    statistic,
    n_boot: int = 10_000,
    alpha: float = 0.05,
    rng: np.random.Generator | None = None,
) -> Estimate:
    """Bias-corrected and accelerated bootstrap interval. Spec §7.3.

    BCa rather than percentile because the SR statistic is skewed near the ends
    of the noise grid, where the interval matters most: at very low ``D`` most
    paths produce almost no events, the distribution of per-path SNR is strongly
    asymmetric, and a percentile interval is visibly off-centre there. BCa
    corrects for both the median bias (``z0``) and the skew (``a``, from the
    jackknife).
    """
    rng = rng or np.random.default_rng(0)
    x = np.asarray(sample, dtype=float)
    n = x.size
    theta_hat = float(statistic(x))
    if n < 3:
        return Estimate(value=theta_hat, ci_lo=theta_hat, ci_hi=theta_hat, n=n)

    boots = np.array([statistic(x[rng.integers(0, n, n)]) for _ in range(n_boot)])

    from scipy.stats import norm

    prop = np.mean(boots < theta_hat)
    # A degenerate resample distribution (every bootstrap identical) makes z0
    # infinite. Fall back to the percentile interval rather than returning NaN.
    if prop <= 0.0 or prop >= 1.0:
        lo, hi = np.percentile(boots, [100 * alpha / 2, 100 * (1 - alpha / 2)])
        return Estimate(value=theta_hat, ci_lo=float(lo), ci_hi=float(hi), n=n)
    z0 = norm.ppf(prop)

    jack = np.array([statistic(np.delete(x, i)) for i in range(n)])
    jbar = jack.mean()
    num = np.sum((jbar - jack) ** 3)
    den = 6.0 * (np.sum((jbar - jack) ** 2) ** 1.5)
    a = 0.0 if den == 0 else num / den

    def adjust(z):
        return norm.cdf(z0 + (z0 + z) / (1 - a * (z0 + z)))

    lo_q = adjust(norm.ppf(alpha / 2))
    hi_q = adjust(norm.ppf(1 - alpha / 2))
    lo, hi = np.percentile(boots, [100 * lo_q, 100 * hi_q])
    return Estimate(value=theta_hat, ci_lo=float(lo), ci_hi=float(hi), n=n)


def interior_maximum(
    grid: np.ndarray, estimates: list[Estimate]
) -> dict[str, object]:
    """GATE-B2: is there a statistically significant interior maximum?

    Spec §4.3.4: the value at ``D_opt`` must exceed **both** grid ends with
    non-overlapping 95% intervals. Both ends, not the better one — a curve that
    only beats its left end is a saturating curve, and a saturating curve is what
    a detector that has simply been switched on looks like.
    """
    values = np.array([e.value for e in estimates])
    k = int(np.argmax(values))
    interior = 0 < k < len(estimates) - 1
    peak = estimates[k]
    lo_end, hi_end = estimates[0], estimates[-1]

    separated_lo = peak.ci_lo > lo_end.ci_hi
    separated_hi = peak.ci_lo > hi_end.ci_hi
    return {
        "argmax_index": k,
        "argmax_value": float(grid[k]),
        "peak": peak.value,
        "peak_ci": [peak.ci_lo, peak.ci_hi],
        "left_end": lo_end.value,
        "left_end_ci": [lo_end.ci_lo, lo_end.ci_hi],
        "right_end": hi_end.value,
        "right_end_ci": [hi_end.ci_lo, hi_end.ci_hi],
        "maximum_is_interior": bool(interior),
        "separated_from_left": bool(separated_lo),
        "separated_from_right": bool(separated_hi),
        "significant_interior_maximum": bool(interior and separated_lo and separated_hi),
    }


def holm(pvalues: dict[str, float], alpha: float = 0.05) -> dict[str, bool]:
    """Holm-Bonferroni. Spec §7.3, for the interaction table of GATE-B3.

    Holm rather than Bonferroni: uniformly more powerful, same family-wise error
    rate, three lines. There is no reason to use the weaker one.
    """
    items = sorted(pvalues.items(), key=lambda kv: kv[1])
    m = len(items)
    out: dict[str, bool] = {}
    rejected_so_far = True
    for i, (name, p) in enumerate(items):
        threshold = alpha / (m - i)
        rejected_so_far = rejected_so_far and (p <= threshold)
        out[name] = rejected_so_far
    return out
