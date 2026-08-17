"""GATE-D2 -- a lesion that is worse at one end produces a sloping audiogram. Spec §13.

[PATHOLOGIES.md §7](../PATHOLOGIES.md) lists this first among the things that
could kill §13 cheaply, and names the gap precisely:

> **Basal-first grading is absent from the catalogue.** Real hair-cell loss is
> patchy and worst at the base; `OHC_LOSS` uses a scalar `mu_H`. The per-site
> machinery exists (`pathology.ohc_loss_graded`, `HopfChain.mu` is per-site) and
> is what ADR-0005 built, but the discrimination question does not need it and it
> is not exercised here. **A frequency-graded audiogram is not yet something this
> catalogue predicts.**

So this is the missing prediction, made and attacked. The claim:

    a lesion graded along the membrane produces a hearing loss graded in
    frequency, sloping the way the lesion does

It is not free. It could fail three ways, and each is a real possibility rather
than a rhetorical one: the per-site machinery might not carry the grading through
at all (flat result); the normal form's `1/|mu|` gain might compress the
difference below anything measurable; or the map from position to characteristic
frequency might not be monotone enough to turn a spatial slope into a spectral
one.

## Why the answer is a closed form and not a simulation

Everything here comes from `truth/hopf_normal_form.py` — `linear_gain` is
`1/|mu|` and `crossover_drive` is `|mu|^{3/2}`, both exact — and from
`profiles.BMProfile.omega_local`, which is the passive place map the active layer
inherits (`hopf.py` says so, and it is the reason the active layer does not
declare a tonotopy of its own).

No integration, no seeds, nothing to converge. If this gate is wrong it is wrong
about the model rather than about a solver, which is the only kind of wrong worth
a gate this cheap.

## The two controls, which are most of the file

A basal-first lesion sloping one way proves nothing on its own — a bug that
returned "loss rises with frequency" regardless of input would pass it. So:

* **apex-first** must slope the **other** way. Same code, one flag.
* **uniform** must slope **flat**. Same code, no grading.

If all three sloped the same way, the measurement would be reporting the
extractor and not the lesion.
"""

from __future__ import annotations

import numpy as np

from coclea import pathology as P, profiles, units
from truth import hopf_normal_form as hnf

GATE = "D02"
SPEC = "13"

#: Enough sites to fit a slope through, few enough to stay a gate rather than a
#: sweep. The claim is ordinal; the resolution is not the result.
N_SITES = 24

#: How far the amplifier retreats at the worst-affected end. The healthy point is
#: `pathology.HEALTHY_MU_H = -0.02`; this takes the worst end to about -0.42,
#: which is the depth `OHC_LOSS` uses as a scalar. Same severity, distributed.
DEPTH = 0.40

#: A slope this small is flat for the purposes of an ordinal claim. Set from the
#: uniform control's own measured value rather than chosen: it comes out at
#: machine zero, so anything above a whisker is real.
FLAT = 0.5


def _sites() -> tuple[np.ndarray, np.ndarray]:
    """Positions, and the characteristic frequency each one is tuned to.

    Endpoints trimmed. `omega_local` is exact at `x = 0` and `x = 1`, but a place
    map is about the interior — the apex in particular is where the passive model
    is least trustworthy and where `forced.py` already refuses to call a peak a
    characteristic place.
    """
    x = np.linspace(0.05, 0.95, N_SITES)
    cf = profiles.REFERENCE.omega_local(x)
    return x, np.asarray(cf, dtype=float)


def _loss_db(mu: np.ndarray) -> np.ndarray:
    """Gain lost at each site, in dB, against the healthy operating point.

    `linear_gain` is `1/|mu|` exactly, so this is `20 log10(|mu| / |mu_healthy|)`
    — a ratio of two closed forms with nothing fitted between them.
    """
    healthy = hnf.linear_gain(P.HEALTHY_MU_H)
    return np.array([20.0 * np.log10(healthy / hnf.linear_gain(float(m))) for m in mu])


def _slope_per_decade(cf: np.ndarray, loss_db: np.ndarray) -> float:
    """dB of loss per decade of characteristic frequency.

    Positive means *worse at high frequencies*, which is the shape a basal-first
    lesion should produce and the shape a sloping high-frequency audiogram has.
    """
    return float(np.polyfit(np.log10(cf), loss_db, 1)[0])


def test_d02_a_basal_first_lesion_slopes_toward_high_frequencies(report):
    """The prediction §7 says the catalogue does not yet make.

    Hair cells die worst at the base; the base is tuned high; so the loss should
    be worst at high frequencies. Sloping *and* monotone — a slope fitted through
    a non-monotone scatter is a summary of noise.
    """
    x, cf = _sites()
    mu = P.ohc_loss_graded(DEPTH, x, basal_first=True)
    loss = _loss_db(mu)
    slope = _slope_per_decade(cf, loss)

    # Monotone in position: every step apically must lose less than the one basal
    # to it, because the lesion is monotone in position by construction.
    monotone = bool(np.all(np.diff(loss) < 0))

    report(
        depth=DEPTH,
        mu_at_base=float(mu[0]),
        mu_at_apex=float(mu[-1]),
        cf_range=[float(cf[-1]), float(cf[0])],
        loss_db_at_base=float(loss[0]),
        loss_db_at_apex=float(loss[-1]),
        slope_db_per_decade=slope,
        monotone_in_position=monotone,
    )
    assert monotone, "the loss is not monotone along the membrane, but the lesion is"
    assert slope > 2.0, (
        f"a basal-first lesion produced {slope:.2f} dB per decade — the grading did not "
        "reach the audiogram"
    )
    assert loss[0] > loss[-1] + 5.0, (
        f"base {loss[0]:.1f} dB against apex {loss[-1]:.1f} dB is not a graded audiogram"
    )


def test_d02_reversing_the_lesion_reverses_the_audiogram(report):
    """The first control, and the reason the sign above means anything.

    Same function, one flag. If both directions sloped toward high frequencies,
    the gate would be measuring the extractor.
    """
    x, cf = _sites()
    basal = _slope_per_decade(cf, _loss_db(P.ohc_loss_graded(DEPTH, x, basal_first=True)))
    apical = _slope_per_decade(cf, _loss_db(P.ohc_loss_graded(DEPTH, x, basal_first=False)))

    report(slope_basal_first=basal, slope_apex_first=apical, sum=basal + apical)
    assert basal > 0 > apical, f"both gradings slope the same way: {basal:.2f} and {apical:.2f}"
    # Mirror images by construction, so they should very nearly cancel. This is
    # the check that would catch a grading applied to the wrong axis.
    assert abs(basal + apical) < 0.05 * abs(basal), (
        f"the two gradings are not mirror images: {basal:.3f} and {apical:.3f}"
    )


def test_d02_an_ungraded_lesion_produces_a_flat_audiogram(report):
    """The second control. A scalar `mu_H` must not slope at all.

    `OHC_LOSS` is the scalar version and the catalogue's `1.000 / 1.000` row for
    the place map says its damage is frequency-flat. If this sloped, GATE-D1's
    seventh column would be describing something it does not have.
    """
    x, cf = _sites()
    flat_mu = np.full_like(x, P.OHC_LOSS.mu_h)
    slope = _slope_per_decade(cf, _loss_db(flat_mu))
    spread = float(np.ptp(_loss_db(flat_mu)))

    report(slope_db_per_decade=slope, loss_spread_db=spread, mu=P.OHC_LOSS.mu_h)
    assert abs(slope) < FLAT, f"an ungraded lesion sloped {slope:.3f} dB per decade"
    assert spread < 1e-9, f"an ungraded lesion varies by {spread:.3e} dB across the membrane"


def test_d02_the_knee_slopes_harder_than_the_threshold(report):
    """§5.4's claim, now per-frequency instead of at a point.

    Gain goes as `|mu|^-1` and the knee as `|mu|^{+3/2}`, so across a graded
    lesion the knee's slope in log terms must be **1.5×** the threshold's. That
    is the quantitative content of *"watch the compression knee, not the
    audiogram"*, and until now it was only asserted at a single depth.
    """
    x, cf = _sites()
    mu = P.ohc_loss_graded(DEPTH, x, basal_first=True)

    healthy_knee = hnf.crossover_drive(P.HEALTHY_MU_H)
    knee_db = np.array([20.0 * np.log10(hnf.crossover_drive(float(m)) / healthy_knee) for m in mu])
    loss_db = _loss_db(mu)

    knee_slope = _slope_per_decade(cf, knee_db)
    loss_slope = _slope_per_decade(cf, loss_db)
    ratio = knee_slope / loss_slope

    report(
        knee_slope_db_per_decade=knee_slope,
        threshold_slope_db_per_decade=loss_slope,
        ratio=ratio,
        predicted_ratio=1.5,
    )
    assert abs(ratio - 1.5) < 1e-9, (
        f"the knee slopes {ratio:.4f}x the threshold, and the normal form says exactly 1.5"
    )


def test_d02_the_hopf_chain_accepts_the_graded_lesion(report):
    """The machinery `ohc_loss_graded` exists for, actually exercised.

    §7 called it unused. A per-site `mu` that the chain rejects would make every
    number above a statement about a closed form and none about the model, so the
    gate builds the chain the grading is for and checks it carries the values
    through unchanged.
    """
    from coclea import hopf

    x, _ = _sites()
    mu = P.ohc_loss_graded(DEPTH, x, basal_first=True)
    omega = np.asarray(profiles.REFERENCE.omega_local(x), dtype=float)
    ch = hopf.chain(omega, mu)

    report(
        n_sites=ch.n_sites,
        mu_first=float(ch.mu[0]),
        mu_last=float(ch.mu[-1]),
        omega_first=float(ch.omega[0]),
        omega_last=float(ch.omega[-1]),
        hz_first=float(units.SCALE.hz_of(ch.omega[0])) if hasattr(units.SCALE, "hz_of") else None,
    )
    assert ch.n_sites == N_SITES
    assert np.allclose(ch.mu, mu), "the chain did not carry the per-site lesion through"
    assert ch.mu[0] < ch.mu[-1] < 0, "the chain's worst site is not the base, or it is not damped"
