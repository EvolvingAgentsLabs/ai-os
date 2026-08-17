"""Pathology as a parameter transform, and what the model can therefore say.

Spec §13. The claim this module exists to make testable is narrow and it is not
clinical:

> Each cochlear pathology enters this model on a **different parameter**, so the
> model predicts a **different pattern of observables** for each. If it does not
> — if every lesion produces the same signature — the model has no diagnostic
> content and §13 is a story.

That is a falsifiable statement about the model and `gates/test_D01` is where it
is attacked. Nothing here is a claim about a patient.

## The parameters, and what is physically attached to each

The transmission line (`transmission.py`) is
``Z(x) = S(x) - Omega^2 M(x) + i Omega R(x)`` driven at the stapes, with the
fluid entering through ``beta`` in ``k^2 = beta^2 Omega^2 / Z``. The active layer
(`hopf.py`) adds ``mu_H``, the distance to the bifurcation. The detector
(`detector.py`) adds ``theta``. That is five independent knobs:

===========  ===============================  =====================================
knob         what it is                       what moves it in a real cochlea
===========  ===============================  =====================================
``drive``    pressure delivered at the        ossicular chain: otosclerosis,
             stapes                           effusion, perforation
``beta``     fluid coupling — scala area,     endolymph volume and composition;
             density, duct geometry           hydrops; osmotic and diuretic agents
``S``, ``M`` partition stiffness and          partition distension, fibrosis,
             entrained mass                   mass loading
``R``        viscous loss                     fluid viscosity, temperature
``mu_H``     distance to the Hopf point       outer hair cells: count, prestin,
                                              endocochlear potential, MOC efferents
``theta``    the detector's threshold         inner-hair-cell ribbon synapses,
                                              auditory-nerve fibre complement
===========  ===============================  =====================================

Two of those columns are the reason this file was written. **``beta`` is a fluid
parameter and fluid is druggable** — that is the whole mechanism of a loop
diuretic or an osmotic agent. And **``mu_H`` is druggable in the wrong direction
already**: salicylate blocks prestin and furosemide collapses the endocochlear
potential, both reversibly, both reducing the gain. A knob with a known drug that
turns it one way is a knob, whatever the state of the drug that turns it the
other.

## What this module is not

It fits nothing to patient data, it contains no dosing of anything, and every
number it produces is an ordinal prediction of the form *"this observable should
move in this direction, and that one should not"*. The model is a 1-D line with a
scalar active layer; it is not entitled to a magnitude. `PATHOLOGIES.md` states
that limit in the same paragraph as each prediction, and any use of this file
that drops the limit is a misuse of it.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np

from .profiles import BMProfile
from .transmission import respond


@dataclass(frozen=True)
class LesionedProfile(BMProfile):
    """A membrane with its stiffness and mass scaled.

    A subclass rather than three new fields on `BMProfile`, because `BMProfile`
    is what fourteen frozen gates were measured against and adding fields to it
    would change the object those measurements refer to. The scale factors are
    ``1.0`` by construction here, so a `LesionedProfile` with no lesion **is**
    the reference membrane and the gates' meaning is untouched.
    """

    #: Multiplies ``S(x)``: partition stiffness.
    stiffness_factor: float = 1.0
    #: Multiplies ``M(x)``: effective mass, membrane plus entrained fluid.
    mass_factor: float = 1.0

    def K_ref(self, x):  # noqa: D102 - see BMProfile
        return self.stiffness_factor * super().K_ref(x)

    def mu(self, x):  # noqa: D102 - see BMProfile
        return self.mass_factor * super().mu(x)


@dataclass(frozen=True)
class Lesion:
    """One pathology, as the set of parameters it moves.

    Every field defaults to *no change*, so a `Lesion()` is a healthy cochlea and
    the diff against it is the lesion. That is also the null control the gate
    needs: an empty lesion must produce the reference signature exactly, or the
    observables are drifting on their own and "these signatures differ" would
    mean nothing.
    """

    name: str = "healthy"
    #: What is physically damaged. Prose, for the report — never parsed.
    lesion: str = "nothing"

    #: Stapes drive, as a fraction of normal. Conductive loss lives here.
    drive_factor: float = 1.0
    #: Fluid coupling ``beta``, as a fraction. Hydrops and osmotic agents.
    beta_factor: float = 1.0
    #: Partition stiffness and entrained mass, as fractions.
    stiffness_factor: float = 1.0
    mass_factor: float = 1.0
    #: Viscous damping, as a fraction of ``zeta0``.
    damping_factor: float = 1.0
    #: Distance to the Hopf point. Negative is damped, 0 critical, positive
    #: self-oscillating. The healthy value is a **choice** — see `HEALTHY_MU_H`.
    mu_h: float = -0.02
    #: Detector threshold, as a fraction of normal.
    theta_factor: float = 1.0
    #: Whether the lesion is known to reverse when the agent is withdrawn.
    reversible: bool = False

    def profile(self, base: BMProfile) -> LesionedProfile:
        """The membrane this lesion implies, from a reference membrane."""
        return LesionedProfile(
            alpha_mu=base.alpha_mu,
            alpha_K=base.alpha_K,
            coupling=base.coupling,
            zeta0=base.zeta0 * self.damping_factor,
            g1=base.g1,
            stiffness_factor=self.stiffness_factor,
            mass_factor=self.mass_factor,
        )


#: The healthy operating point, and the one number here that is a **posit**.
#:
#: Physiology says the live cochlea sits close to but below the bifurcation; it
#: does not say how close, and this model has no way to derive it. Everything in
#: §13 is therefore stated as a *direction of movement from* this point, never as
#: an absolute. ADR-0006 records that choice and what would falsify it.
HEALTHY_MU_H = -0.02

HEALTHY = Lesion()

#: Otosclerosis, effusion, a perforation: the ossicular chain delivers less
#: pressure and the cochlea itself is intact. The textbook conductive loss.
CONDUCTIVE = Lesion(
    name="conductive",
    lesion="ossicular chain — less pressure reaches the stapes",
    drive_factor=0.1,
)

#: Noise damage, aminoglycosides, cisplatin, age: outer hair cells die and the
#: gain goes with them. Irreversible, and in a real cochlea basal-first — which
#: this scalar `mu_h` cannot express. See `ohc_loss_graded` for the version that
#: can, and `PATHOLOGIES.md` for why the scalar is still the right default here.
OHC_LOSS = Lesion(
    name="ohc-loss",
    lesion="outer hair cells lost — the amplifier is gone",
    mu_h=-0.5,
)

#: Salicylate blocks prestin; furosemide collapses the endocochlear potential.
#: Same axis as OHC loss, smaller, uniform, and **it comes back**. This row is
#: why `mu_h` counts as a druggable parameter rather than a modelling
#: convenience: two agents move it in humans today, both in the losing direction.
PRESTIN_BLOCK = Lesion(
    name="prestin-block",
    lesion="prestin blocked / endocochlear potential reduced — gain down, reversibly",
    mu_h=-0.2,
    reversible=True,
)

#: Endolymphatic hydrops (Ménière's). Fluid volume and pressure change the
#: coupling and distend the partition — a **fluid-mechanical** lesion, which is
#: the one class the pre-ADR-0002 string model could not have represented at all.
HYDROPS = Lesion(
    name="hydrops",
    lesion="endolymph volume up — fluid coupling down, partition distended",
    beta_factor=0.6,
    stiffness_factor=1.6,
    mass_factor=1.3,
    reversible=True,
)

#: Cochlear synaptopathy, "hidden hearing loss". Ribbon synapses are lost while
#: the mechanics and the amplifier are untouched, so an audiogram can be normal.
#: In this model that is a lesion **on the detector alone**, and it is the case
#: where a stochastic-resonance model says something no mechanical model can.
SYNAPTOPATHY = Lesion(
    name="synaptopathy",
    lesion="ribbon synapses lost — the detector's threshold is higher, mechanics intact",
    theta_factor=1.8,
)

#: The far side of the bifurcation: the oscillator runs without an input. This
#: is the model's account of a spontaneous otoacoustic emission, and of the
#: tonal tinnitus that sometimes accompanies one. It is included here mostly as
#: a **hazard**: any therapy that pushes `mu_h` up passes through zero.
OVERDRIVEN = Lesion(
    name="overdriven",
    lesion="past the Hopf point — self-oscillating (SOAE / tonal tinnitus)",
    mu_h=+0.05,
)

CATALOGUE: tuple[Lesion, ...] = (
    HEALTHY,
    CONDUCTIVE,
    OHC_LOSS,
    PRESTIN_BLOCK,
    HYDROPS,
    SYNAPTOPATHY,
    OVERDRIVEN,
)


def ohc_loss_graded(depth: float, x: np.ndarray, *, basal_first: bool = True) -> np.ndarray:
    """Per-site ``mu_h`` for hair-cell loss that is worse at one end.

    Real hair-cell loss is patchy and basal-first, which is why `HopfChain.mu` is
    per-site. `OHC_LOSS` uses a scalar because the *discrimination* question does
    not need the grading; a per-region calibration does, and that is what
    [ADR-0005] built the machinery for.
    """
    x = np.asarray(x, dtype=float)
    weight = (1.0 - x) if basal_first else x
    return HEALTHY_MU_H - float(depth) * weight


@dataclass(frozen=True)
class MechanicalSignature:
    """What the passive line does under a lesion. Cheap: one solve per frequency.

    The **tuning curve at a fixed place** rather than the response at a fixed
    frequency, because the first version measured ``x_cf`` of the response that
    peaked at the probe — which is where the probe is, by construction, for every
    lesion. A circular observable reports "no shift" for a lesion that moved the
    whole map, and it reports it in exactly the confident, uniform way that reads
    as a null result.
    """

    #: The frequency that peaks at the probe: that place's characteristic
    #: frequency. This is the tonotopic map, read the way a clinician reads it.
    cf_at_probe: float
    #: ``f0 / bandwidth`` at −3 dB. Sharpness of tuning.
    q: float
    #: Peak displacement at the probe. Compared against healthy, never absolute.
    peak: float
    peak_is_interior: bool


def mechanical_signature(
    lesion: Lesion,
    base: BMProfile,
    N: int,
    omega: np.ndarray,
    beta: float,
    probe: float = 0.5,
) -> MechanicalSignature:
    """Characteristic frequency, sharpness and sensitivity at one probe position.

    Three quantities that a real cochlea reports separately — the audiogram's
    place map, the physiologist's tuning curve, and the threshold — and that this
    model lets move independently. Whether they *do* move independently is
    GATE-D1's question, not this function's assumption.
    """
    profile = lesion.profile(base)
    eff_beta = beta * lesion.beta_factor

    responses = [respond(profile, N, float(w), eff_beta, drive=lesion.drive_factor) for w in omega]
    idx = int(np.argmin(np.abs(responses[0].x - probe)))
    at_probe = np.array([float(np.abs(r.U[idx])) for r in responses])

    peak_i = int(np.argmax(at_probe))
    return MechanicalSignature(
        cf_at_probe=float(omega[peak_i]),
        q=_quality_factor(omega, at_probe, peak_i),
        peak=float(at_probe[peak_i]),
        peak_is_interior=bool(responses[peak_i].peak_is_interior),
    )


def _quality_factor(omega: np.ndarray, magnitude: np.ndarray, peak_i: int) -> float:
    """``f0 / bandwidth`` at −3 dB, by linear interpolation on the sweep.

    Returns ``nan`` when the peak sits at an end of the sweep or the curve never
    falls 3 dB — a Q measured off a truncated peak is a measurement of the sweep
    bounds, and reporting it as a number would put the grid into the result.
    """
    half = magnitude[peak_i] / np.sqrt(2.0)
    lo = _cross(omega, magnitude, peak_i, half, step=-1)
    hi = _cross(omega, magnitude, peak_i, half, step=+1)
    if not (np.isfinite(lo) and np.isfinite(hi)) or hi <= lo:
        return float("nan")
    return float(omega[peak_i] / (hi - lo))


def _cross(omega: np.ndarray, magnitude: np.ndarray, start: int, level: float, step: int) -> float:
    i = start
    while 0 <= i + step < omega.size:
        a, b = magnitude[i], magnitude[i + step]
        if (a - level) * (b - level) <= 0 and a != b:
            f = (a - level) / (a - b)
            return float(omega[i] + f * (omega[i + step] - omega[i]))
        i += step
    return float("nan")
