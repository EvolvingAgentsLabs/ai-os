"""GATE-B1 -- the place map, against Greenwood's functional form. Spec §2.7.

The spec calls this a **soft gate**: the comparison is qualitative —
monotonicity and approximate log-linearity — not a fit to Greenwood's constants.
A 1-D string with a transmission-line partition impedance is not a cochlea, and
a gate that demanded `A = 165.4` would be measuring how hard somebody tuned three
parameters.

Soft does not mean unfalsifiable, and that distinction is this file's whole job.

## What makes it able to fail

Spec §11-R2's lesson, applied here: a check that cannot go red is not a check. So
every assertion runs against a **control** whose place map should not exist —
`profiles.uniform()`, a membrane with no graded impedance at all. If the uniform
control also produced a monotone, log-linear place map, the measurement would be
an artefact of the extraction and this gate would be reporting the extractor.

The control is the reason this file is longer than the claim it makes.
"""

from __future__ import annotations

import numpy as np

from coclea import profiles, transmission, units

GATE = "B01"
SPEC = "2.7"

N = 800
BETA = 1.0
#: Three decades, as spec §7.1 E2 uses. Enough to see a trend and cheap enough
#: to sit in a suite.
HZ = np.geomspace(200.0, 12000.0, 24)


def _place_map(profile, hz: np.ndarray) -> dict[str, np.ndarray]:
    # `units.SCALE` is the one place Hz becomes dimensionless — spec §3.3 says
    # so, and a second conversion here would be a second answer to it.
    return transmission.tonotopic_map(profile, N, units.SCALE.omega_tilde_of(hz), BETA)


def _log_linearity(hz: np.ndarray, x_cf: np.ndarray) -> float:
    """R^2 of `log10(f)` against `x_cf`. Greenwood's form is log-linear in x."""
    x = np.asarray(x_cf, dtype=float)
    y = np.log10(np.asarray(hz, dtype=float))
    if x.size < 3 or np.ptp(x) == 0:
        return 0.0
    fit = np.polyfit(x, y, 1)
    resid = y - np.polyval(fit, x)
    ss_res = float(np.sum(resid**2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    return 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0


def _monotone_fraction(x_cf: np.ndarray) -> float:
    x = np.asarray(x_cf, dtype=float)
    if x.size < 2:
        return 0.0
    return float(np.mean(np.diff(x) < 0))


def test_b01_the_graded_membrane_has_a_place_map(report):
    """High frequencies near the base, low near the apex, log-linear in between.

    Three qualitative properties, each stated as the spec states them:

    * the characteristic place moves **monotonically** toward the apex as the
      frequency falls;
    * it spans a real fraction of the membrane rather than crowding at one end;
    * `log(f)` against `x_cf` is approximately **linear**, which is the shape of
      Greenwood's map and the reason a cochlea has roughly constant octaves per
      millimetre.
    """
    m = _place_map(profiles.REFERENCE, HZ)
    x_cf = np.asarray(m["x_cf"], dtype=float)

    monotone = _monotone_fraction(x_cf)
    span = float(np.ptp(x_cf))
    r2 = _log_linearity(HZ, x_cf)

    report(
        monotone_fraction=monotone,
        span=span,
        log_linearity_r2=r2,
        x_cf_first=float(x_cf[0]),
        x_cf_last=float(x_cf[-1]),
        hz_range=[float(HZ[0]), float(HZ[-1])],
    )
    assert monotone > 0.9, f"the place only moves the right way {monotone:.0%} of the time"
    assert span > 0.15, f"the map spans {span:.3f} of the membrane, which is not a map"
    assert r2 > 0.9, f"log(f) against x_cf is not close to linear: R2 = {r2:.3f}"


def test_b01_a_uniform_membrane_has_none_of_it(report):
    """The control, and the reason the assertions above mean anything.

    A membrane with no graded impedance has no characteristic place. If the
    extraction produced a monotone, log-linear map here too, the test above would
    be measuring the extractor rather than the physics — and would pass forever.
    """
    m = _place_map(profiles.uniform(), HZ)
    x_cf = np.asarray(m["x_cf"], dtype=float)

    monotone = _monotone_fraction(x_cf)
    span = float(np.ptp(x_cf))
    r2 = _log_linearity(HZ, x_cf)
    report(control_monotone_fraction=monotone, control_span=span, control_log_linearity_r2=r2)

    # It may accidentally satisfy one of the three. It must not satisfy all.
    passes = [monotone > 0.9, span > 0.15, r2 > 0.9]
    assert not all(passes), (
        "a uniform membrane produced a place map — the extraction is inventing one: "
        f"monotone={monotone:.2f} span={span:.3f} r2={r2:.3f}"
    )


def test_b01_the_gap_in_q_is_reported_rather_than_hidden(report):
    """Spec §2.7: the passive `Q` is low and **that is a result**.

    Physiology reports far sharper tuning than any passive model gives, and the
    gap is the quantitative argument for the Hopf layer. A gate that quietly
    omitted it would be hiding the project's own case for phase 2.
    """
    m = _place_map(profiles.REFERENCE, HZ)
    peak = np.asarray(m["peak"], dtype=float)

    # A crude sharpness proxy: how concentrated the response peak is across the
    # swept frequencies. The absolute number is not the claim; that it is far
    # below physiological Q is.
    ratio = float(np.max(peak) / np.median(peak)) if np.median(peak) > 0 else float("nan")
    report(peak_to_median_response=ratio, note="passive tuning; physiological Q is far higher")
    assert np.isfinite(ratio) and ratio > 1.0, "the passive membrane shows no tuning at all"
