"""GATE-D3 -- does the model tell treatments apart? Spec §13 / PATHOLOGIES §5.

GATE-D1 asked whether the model discriminates **lesions**. This asks the question
one level up, and it is the one that decides whether a causes-by-treatments matrix
is worth writing at all:

    do the treatment modalities move different observables, and does each one
    repair some lesions and fail on others?

If every modality moved the same observables, or if everything repaired
everything, the matrix would be decorative however complete it looked. That is
the failure this gate exists to catch, and it is checkable in closed form for the
price of an afternoon — which is [FRICTION](../FRICTION.md) F5 applied before the
work rather than after it.

## The observable a treatment is actually aimed at

D1's seven observables are properties of the **system**. A treatment that changes
where the ear *operates* — calibrated noise — changes none of them, and a gate
built only on those would report "noise does nothing" for the one intervention
this whole project is about.

So D3 adds an eighth: **detection**, the Rice SNR of a subthreshold tone at the
noise level the ear is actually sitting at. `truth/rice_sr_toy.snr_shape` gives
it in closed form, unnormalised, which is all a comparison of *ratios* needs.

## Why the implant is a flag and not a factor

`bypasses_mechanics` is not a change of degree. An implant does not improve the
membrane; it stops the membrane being in the path. So under it, `beta`, `S`, `M`
and `mu_H` become irrelevant by construction and the outcome is set by what
remains — the detector. The gate checks that consequence rather than asserting
it, because it is also a clinical prediction: **synaptopathy should limit an
implant and hair-cell loss should not.**

## The three checks, and the last two are what make the first mean anything

1. Treatments move **different** observables — not all the same column.
2. **The null treatment changes nothing**, to `0.0` in every component.
3. **Some treatment fails on some lesion** — the implant and the fluid agent do.
   A model where everything repairs everything has nothing to say.

## The check that went red, and what it cost

Point 3 was originally *"every treatment fails on at least one lesion"*, because
PATHOLOGIES §5 predicted that amplification could not repair synaptopathy. It
went red — amplification helps all four, `synaptopathy` by 2.6e15 — and
[ADR-0008](../decisions/0008-a-raised-threshold-is-not-synaptopathy.md) is what
came of it: a raised `theta` **is** a raised audiogram threshold, so it was never
hidden hearing loss, and the model has no fibre-count axis to represent one.

The assertion now pins that gap instead of wishing against it.
"""

from __future__ import annotations

import numpy as np

from coclea import pathology as P, profiles, units
from truth import hopf_normal_form as hnf
from truth import rice_sr_toy as rice

GATE = "D03"
SPEC = "13"

N = 400
BETA = 1.0
PROBE = 0.5
HZ = np.geomspace(300.0, 8000.0, 120)
OMEGA = units.SCALE.omega_tilde_of(HZ)

F_LO, F_HI = 1e-2, 1.0
THETA = 1.0

#: The tone the ear is trying to hear, as a fraction of the healthy threshold.
#: Subthreshold by construction — that is the regime the whole project is about,
#: and `rice_sr_toy.subthreshold_bound` is asserted rather than assumed.
TONE = 0.5

#: Where a resting ear sits on the noise axis. Below the healthy optimum of
#: `theta/2`, so there is room for calibrated noise to help and room for it to
#: be useless — a resting point already at the optimum would make one of the six
#: treatments untestable and the gate would not say so.
RESTING_SIGMA = 0.20

REL_TOL = 0.02

#: The lesions treated. Four, spanning the four knobs a treatment can reach.
LESIONS = (P.CONDUCTIVE, P.OHC_LOSS, P.HYDROPS, P.SYNAPTOPATHY)  # the last is a
#: detector sensitivity loss and NOT synaptopathy — ADR-0008. The constant keeps
#: its name in `pathology.py` until the fibre axis exists to rename it into.


def _mechanics(lesion: P.Lesion) -> P.MechanicalSignature:
    return P.mechanical_signature(lesion, profiles.REFERENCE, N, OMEGA, BETA, PROBE)


def _detection(lesion: P.Lesion, treatment: P.Treatment, ref_peak: float) -> float:
    """Rice SNR of the tone, at the noise level this ear is operating at.

    The tone and the noise both reach the detector through the same chain, so
    both are scaled by the mechanics and by the amplifier's gain — which is why a
    pure gain change cannot help a detector-limited ear and the arithmetic says
    so rather than the prose.
    """
    theta = THETA * lesion.theta_factor

    if treatment.bypasses_mechanics:
        # The membrane is out of the path: the stimulus is delivered to the
        # detector directly, so nothing mechanical scales it. What is left is the
        # detector's own threshold, which the implant does not repair.
        amplitude, sigma = TONE, RESTING_SIGMA
    else:
        mech = _mechanics(lesion)
        transfer = mech.peak / ref_peak if ref_peak > 0 else 0.0
        gain = hnf.linear_gain(lesion.mu_h) / hnf.linear_gain(P.HEALTHY_MU_H)
        amplitude = TONE * transfer * gain
        sigma = RESTING_SIGMA * transfer * gain

    if treatment.delivers_optimal_noise:
        # The one intervention that changes no parameter of the ear at all. It
        # moves where on the inverted U the ear sits, and `rice_sr_toy` fixes
        # that point at `theta/2` with everything else cancelled.
        sigma = rice.optimum_sigma(theta)

    omega = float(OMEGA[len(OMEGA) // 2])
    return rice.snr_shape(omega, theta, sigma, amplitude)


def _signature(lesion: P.Lesion, treatment: P.Treatment, ref_peak: float) -> dict:
    treated = P.treat(lesion, treatment)
    oscillating = treated.mu_h > 0.0
    mech = _mechanics(treated)
    return {
        "cf": mech.cf_at_probe,
        "q": mech.q,
        "peak": mech.peak,
        "compression": float("nan") if oscillating else hnf.response_exponent(treated.mu_h, F_LO, F_HI),
        "knee": float("nan") if oscillating else hnf.crossover_drive(treated.mu_h),
        "d_opt": rice.optimum_sigma(THETA * treated.theta_factor),
        "self_oscillating": oscillating,
        "detection": _detection(treated, treatment, ref_peak),
    }


def _moved(after: dict, before: dict) -> tuple[str, ...]:
    """Which observables the treatment moved. Names, not a count."""
    out = []
    for key in ("cf", "q", "peak", "compression", "knee", "d_opt", "detection"):
        a, b = float(after[key]), float(before[key])
        if not (np.isfinite(a) and np.isfinite(b)):
            out.append(key)
            continue
        if b == 0.0:
            if a != 0.0:
                out.append(key)
        elif abs(a - b) / abs(b) > REL_TOL:
            out.append(key)
    if bool(after["self_oscillating"]) != bool(before["self_oscillating"]):
        out.append("self_oscillating")
    return tuple(out)


def _table() -> tuple[dict, dict]:
    healthy_peak = _mechanics(P.HEALTHY).peak
    untreated = {l.name: _signature(l, P.NO_TREATMENT, healthy_peak) for l in LESIONS}
    treated = {
        (l.name, t.name): _signature(l, t, healthy_peak)
        for l in LESIONS
        for t in P.TREATMENTS
    }
    return untreated, treated


def test_d03_the_tone_is_subthreshold_or_nothing_here_is_about_anything(report):
    """Spec §R2's warning, checked before the gate rather than after.

    A suprathreshold tone fires the detector on its own, the inverted U becomes
    monotone, and every "improvement" below would be a detector being switched
    on. `truth/rice_sr_toy` states the bound; this asserts it.
    """
    ok = rice.subthreshold_bound(THETA, TONE)
    report(theta=THETA, tone=TONE, resting_sigma=RESTING_SIGMA,
           healthy_optimum=rice.optimum_sigma(THETA), subthreshold=bool(ok))
    assert ok, "the tone is not subthreshold; this gate would be measuring the detector"
    assert RESTING_SIGMA < rice.optimum_sigma(THETA), (
        "the resting ear already sits at its optimum, so calibrated noise could "
        "not help and the gate would not be able to say so"
    )


def test_d03_the_null_treatment_changes_nothing(report):
    """The control, and the reason every difference below is a difference.

    `Treatment()` multiplies every factor by one and closes zero of the distance
    to the bifurcation, so it must return the lesion untouched in all eight
    observables. If it did not, the composition in `treat` would be leaking.
    """
    untreated, treated = _table()
    deltas = {}
    for lesion in LESIONS:
        before = untreated[lesion.name]
        after = treated[(lesion.name, "none")]
        moved = _moved(after, before)
        deltas[lesion.name] = list(moved)
    report(moved_under_null_treatment=deltas)
    assert all(not v for v in deltas.values()), f"the null treatment moved something: {deltas}"


def test_d03_the_modalities_move_different_observables(report):
    """The claim. Four modalities, and they must not all be the same column.

    Reported as the set each treatment moves, per lesion, because *which* one
    moved is the diagnosis — a count would say four treatments differ and not
    say how.
    """
    untreated, treated = _table()
    fingerprints: dict[str, set[tuple[str, ...]]] = {}
    detail: dict[str, dict[str, list[str]]] = {}
    for t in P.TREATMENTS:
        if t.name == "none":
            continue
        per_lesion = {}
        for lesion in LESIONS:
            moved = _moved(treated[(lesion.name, t.name)], untreated[lesion.name])
            per_lesion[lesion.name] = list(moved)
            fingerprints.setdefault(t.name, set()).add(moved)
        detail[t.name] = per_lesion

    # The union of what each treatment ever moves. Two treatments with the same
    # union are indistinguishable by this observable set, whatever the per-lesion
    # detail looks like.
    unions = {name: tuple(sorted({k for fp in fps for k in fp})) for name, fps in fingerprints.items()}
    report(moved_by_treatment_and_lesion=detail, union_per_treatment=unions,
           distinct_unions=len(set(unions.values())), treatments=len(unions))

    assert len(set(unions.values())) >= 4, (
        f"only {len(set(unions.values()))} distinct observable sets across "
        f"{len(unions)} treatments: {unions}"
    )
    # The fluid agent is the only class that can move the place map, and that is
    # PATHOLOGIES §5.3's whole clinical claim. If anything else moves `cf`, the
    # discrimination it rests on is gone.
    movers_of_cf = [n for n, u in unions.items() if "cf" in u]
    assert movers_of_cf == ["fluid-agent"], (
        f"the place map is moved by {movers_of_cf}, not by the fluid agent alone"
    )


def test_d03_amplification_helps_every_threshold_lesion_and_that_is_the_known_gap(report):
    """The check that went red, rewritten to **pin the defect** rather than the wish.

    It was written asserting that every treatment fails on something, because the
    sharpest prediction in PATHOLOGIES §5 was that amplification cannot repair
    synaptopathy. It went red: amplification improves detection on all four
    lesions, `synaptopathy` included, by 2.6e15.

    [ADR-0008](../decisions/0008-a-raised-threshold-is-not-synaptopathy.md) is
    what came of it. The arithmetic is right and the representation was wrong — a
    raised `theta` **is** a raised audiogram threshold, and a raised threshold is
    exactly what amplification repairs. Hidden hearing loss is hidden because the
    audiogram is normal, so `theta` up was never synaptopathy, and this model has
    no fibre-count axis to represent one.

    **A test that encodes what we want and fails is not a gate.** So this now
    encodes what is true: every threshold-type lesion is helped by gain, the
    model cannot currently represent a lesion that gain does not help, and it goes
    red the moment that changes — which is when somebody has either built the
    fibre axis or broken something quietly.
    """
    untreated, treated = _table()
    helps: dict[str, dict[str, float]] = {}
    for t in P.TREATMENTS:
        if t.name == "none":
            continue
        row = {}
        for lesion in LESIONS:
            before = untreated[lesion.name]["detection"]
            after = treated[(lesion.name, t.name)]["detection"]
            row[lesion.name] = float("inf") if before == 0 and after > 0 else (
                after / before if before > 0 else 0.0
            )
        helps[t.name] = row

    report(detection_ratio=helps,
           known_gap="ADR-0008: theta-up is a sensitivity loss, not synaptopathy; "
                     "no fibre-count axis exists, so nothing here is a lesion that "
                     "gain cannot repair")

    # What is true, and what would notice a change.
    for lesion in LESIONS:
        assert helps["amplification"][lesion.name] > 1.05, (
            f"amplification stopped helping {lesion.name}. If a fibre-count axis "
            "was added, this gate is the place to say so — see ADR-0008."
        )

    # And the treatments that genuinely do fail on something still must, because
    # that half of the original check was never in doubt and is what makes the
    # matrix non-decorative.
    for name in ("implant", "fluid-agent"):
        row = helps[name]
        assert any(v <= 1.05 for v in row.values()), (
            f"{name} improves detection for every lesion, which is a model with "
            f"nothing to say: {row}"
        )


def test_d03_the_implant_is_limited_by_the_detector_and_not_by_the_mechanics(report):
    """The electrical modality's structural prediction.

    An implant takes the membrane out of the path, so hair-cell loss should stop
    mattering and synaptopathy should not. That is the spiral-ganglion-survival
    question, and the model reproduces it without having been given it.
    """
    untreated, treated = _table()
    ratios = {
        l.name: treated[(l.name, "implant")]["detection"] / untreated[l.name]["detection"]
        if untreated[l.name]["detection"] > 0
        else float("inf")
        for l in LESIONS
    }
    report(implant_detection_ratio=ratios,
           synaptopathy_theta=P.SYNAPTOPATHY.theta_factor)

    assert ratios["ohc-loss"] > ratios["synaptopathy"], (
        "the implant does not distinguish a mechanical lesion from a detector one, "
        f"so it predicts nothing about who it helps: {ratios}"
    )
