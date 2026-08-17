"""GATE-D1 -- does the model discriminate between pathologies at all? Spec §13.

§13 claims each cochlear pathology enters the model on a **different parameter**
and therefore produces a **different pattern of observables**. That claim is what
makes the section more than a story, and it is entirely capable of being false:
a model with one effective knob would map every lesion onto the same signature
and still produce plots that look like hearing loss.

So this gate builds the signature of every lesion in the catalogue and asks
whether they are actually distinct. Three things have to hold, and the second and
third are the ones that make the first mean anything.

1. **Lesions on different parameters produce different signatures.** Otherwise
   §13's discrimination table is decorative.
2. **A lesion that changes nothing produces the reference signature exactly.**
   Otherwise the observables drift on their own and "these differ" is noise.
3. **No single observable separates them.** If one did, the other six would be
   passengers and the gate would be satisfiable by an instrument far weaker than
   the one §13 claims to need.

## The collision this gate does not try to remove

`ohc-loss` and `prestin-block` have the **same sign pattern**. They are the same
lesion — the amplifier's distance to criticality — at two depths, and the model
is right to say a single measurement cannot tell them apart. What separates them
is magnitude and reversibility, so that is what is asserted about them: the knee
is ordered by depth, and only one of the two comes back when the agent is
withdrawn. Engineering a sign difference between two points on one axis would be
manufacturing a discrimination the physics does not contain.

## What this gate is not

It compares the model against **itself** — it asks whether the model's parameters
are independently observable, not whether its predictions are true of a patient.
Every clinical comparison in `PATHOLOGIES.md` is marked as a prediction awaiting
data, and none of them is checked here. A gate cannot make a claim about a
cochlea; it can only refuse to let a claim through that the model does not
support.
"""

from __future__ import annotations

import numpy as np

from coclea import pathology as P, profiles, units
from truth import hopf_normal_form as hnf
from truth import rice_sr_toy as rice

GATE = "D01"
SPEC = "13"

N = 400
BETA = 1.0
PROBE = 0.5
#: Three decades, as GATE-B1 sweeps. Fine enough that the −3 dB points of the
#: tuning curve are interpolated rather than snapped to the grid.
HZ = np.geomspace(300.0, 8000.0, 120)
OMEGA = units.SCALE.omega_tilde_of(HZ)

#: The drive window the compression exponent is read over. Chosen to sit **above
#: the healthy knee** (`0.0028`) and to straddle the lesioned ones, because below
#: every knee the response is linear and every arm reports an exponent of 1 — a
#: window that produces the same number for all lesions would report "no
#: discrimination" for a model that discriminates perfectly well.
F_LO, F_HI = 1e-2, 1.0

THETA = 1.0

#: A signature component counts as moved if it moves by more than this. Set far
#: from every measured value rather than just outside it: the smallest real
#: movement in the table is the hydrops CF ratio at 11.7%, and the largest
#: spurious one is 0.
REL_TOL = 0.02


def _signature(lesion: P.Lesion, ref: P.MechanicalSignature | None) -> dict[str, float | bool]:
    """The seven observables, three mechanical and four from the closed forms."""
    mech = P.mechanical_signature(lesion, profiles.REFERENCE, N, OMEGA, BETA, PROBE)
    base = ref if ref is not None else mech
    oscillating = lesion.mu_h > 0.0

    return {
        # Mechanics: from the transmission line.
        "cf_ratio": mech.cf_at_probe / base.cf_at_probe,
        "q_ratio": mech.q / base.q,
        "sensitivity_db": 20.0 * float(np.log10(mech.peak / base.peak)),
        # The active layer: closed form, from `truth/`, which cannot import the
        # code under test. Undefined past the bifurcation — the normal form's
        # steady branch does not exist there, and returning a number anyway is
        # how a model gets caught claiming compression from a self-oscillator.
        "compression_exponent": float("nan") if oscillating else hnf.response_exponent(lesion.mu_h, F_LO, F_HI),
        "knee_drive": float("nan") if oscillating else hnf.crossover_drive(lesion.mu_h),
        # The detector: Rice's optimum, which depends on theta and nothing else.
        "d_opt": rice.optimum_sigma(THETA * lesion.theta_factor),
        "self_oscillating": oscillating,
    }


def _fingerprint(sig: dict, ref: dict) -> tuple:
    """Each observable reduced to *moved up*, *moved down*, or *did not move*.

    Signs and not magnitudes, because §13's claims are ordinal. A discrimination
    that needed the third decimal of a 1-D model's output would be a claim about
    the discretisation.
    """

    def direction(key: str) -> str:
        a, b = sig[key], ref[key]
        if not (np.isfinite(a) and np.isfinite(b)):
            return "undefined" if not np.isfinite(a) else "defined"
        if b == 0:
            return "0" if a == 0 else "+"
        rel = (a - b) / abs(b)
        return "+" if rel > REL_TOL else ("-" if rel < -REL_TOL else "0")

    return (
        direction("cf_ratio"),
        direction("q_ratio"),
        "-" if sig["sensitivity_db"] < -1.0 else ("+" if sig["sensitivity_db"] > 1.0 else "0"),
        direction("compression_exponent"),
        direction("knee_drive"),
        direction("d_opt"),
        bool(sig["self_oscillating"]),
    )


def _table() -> tuple[dict[str, dict], dict[str, tuple]]:
    ref_mech = P.mechanical_signature(P.HEALTHY, profiles.REFERENCE, N, OMEGA, BETA, PROBE)
    sigs = {lesion.name: _signature(lesion, ref_mech) for lesion in P.CATALOGUE}
    ref = sigs["healthy"]
    return sigs, {name: _fingerprint(sig, ref) for name, sig in sigs.items()}


def test_d01_lesions_on_different_parameters_are_distinguishable(report):
    """The claim of §13, stated as a count and checked as one.

    Seven lesions, six distinct signatures: every pair except the two that sit on
    the same parameter. The named exception is asserted rather than excused — a
    gate that dropped it from the comparison would pass just as well if the model
    had collapsed everything onto one axis.
    """
    sigs, prints = _table()
    groups: dict[tuple, list[str]] = {}
    for name, fp in prints.items():
        groups.setdefault(fp, []).append(name)
    collisions = {"/".join(v): list(k) for k, v in groups.items() if len(v) > 1}

    report(
        signatures={k: {kk: (None if isinstance(vv, float) and not np.isfinite(vv) else vv)
                        for kk, vv in v.items()} for k, v in sigs.items()},
        fingerprints={k: list(v) for k, v in prints.items()},
        distinct=len(groups),
        of=len(prints),
        collisions=collisions,
    )

    assert len(groups) == len(prints) - 1, (
        f"expected exactly one collision (the two amplifier depths), got {collisions}"
    )
    assert set(collisions) == {"ohc-loss/prestin-block"}, (
        f"the collision is not the documented one: {collisions}"
    )


def test_d01_the_two_amplifier_lesions_are_ordered_by_depth(report):
    """They share an axis, so depth and reversibility are what separates them.

    This is the check that keeps the previous test honest. Without it, "one
    documented collision" would be satisfied by a model in which the two lesions
    were literally identical.
    """
    sigs, _ = _table()
    healthy, prestin, ohc = sigs["healthy"], sigs["prestin-block"], sigs["ohc-loss"]

    report(
        knee_healthy=healthy["knee_drive"],
        knee_prestin_block=prestin["knee_drive"],
        knee_ohc_loss=ohc["knee_drive"],
        exponent_healthy=healthy["compression_exponent"],
        exponent_prestin_block=prestin["compression_exponent"],
        exponent_ohc_loss=ohc["compression_exponent"],
        reversible={l.name: l.reversible for l in P.CATALOGUE},
    )
    assert healthy["knee_drive"] < prestin["knee_drive"] < ohc["knee_drive"], (
        "the compression knee is not ordered by how far the amplifier has fallen"
    )
    assert healthy["compression_exponent"] < prestin["compression_exponent"] < ohc["compression_exponent"], (
        "compression does not weaken monotonically as the amplifier is lost"
    )
    assert P.PRESTIN_BLOCK.reversible and not P.OHC_LOSS.reversible


def test_d01_a_lesion_that_changes_nothing_changes_nothing(report):
    """The null control, and the reason any of the above means anything.

    `Lesion()` is every default, so it is the reference membrane under another
    name. If its signature differed from healthy's in any component, the
    observables would be drifting on their own — solver noise, a non-deterministic
    reduction, a sweep whose peak lands between grid points — and every
    "difference" in the first test would be that drift.
    """
    ref_mech = P.mechanical_signature(P.HEALTHY, profiles.REFERENCE, N, OMEGA, BETA, PROBE)
    ref = _signature(P.HEALTHY, ref_mech)
    null = _signature(P.Lesion(name="null-control"), ref_mech)

    deltas = {
        k: abs(float(null[k]) - float(ref[k]))
        for k in ref
        if not isinstance(ref[k], bool) and np.isfinite(float(ref[k]))
    }
    report(deltas=deltas, fingerprint=list(_fingerprint(null, ref)))
    assert max(deltas.values()) == 0.0, f"the observables drift with no lesion applied: {deltas}"


def test_d01_no_single_observable_separates_the_catalogue(report):
    """Otherwise six of the seven are passengers.

    §13's argument is that the *pattern* carries the diagnosis — that a
    conductive loss and a synaptopathy can both present as "worse hearing" and
    are told apart by which other observables did **not** move. If one column
    already separated everything, that argument would be false and the honest
    thing would be to say so and keep the one column.
    """
    _, prints = _table()
    names = list(prints)
    per_column = {}
    for col, label in enumerate(
        ("cf", "q", "sensitivity", "compression", "knee", "d_opt", "oscillating")
    ):
        values = [prints[n][col] for n in names]
        per_column[label] = len(set(values))

    report(distinct_values_per_observable=per_column, catalogue_size=len(names))
    assert max(per_column.values()) < len(names) - 1, (
        f"one observable nearly separates the whole catalogue: {per_column} — "
        "the discrimination does not need the other six"
    )


def test_d01_the_detector_lesion_moves_the_useful_noise_level(report):
    """§13's one prediction that only a stochastic-resonance model can make.

    Synaptopathy raises the detector's threshold and touches nothing mechanical.
    Rice's optimum is ``sigma_opt = theta / 2`` — the closed form GATE-A10 already
    validated against the toy — so the model says the noise level that helps most
    **moves up with the threshold, in proportion**, while the audiogram, the
    tuning curve and the compression curve all stay where they were.

    That is a falsifiable prediction with a number attached and no free
    parameter. It is also the point at which this project's hypothesis stops
    being about the cochlea and starts being about a therapy, which is why
    `PATHOLOGIES.md` states the limits next to it.
    """
    sigs, prints = _table()
    healthy, synapto = sigs["healthy"], sigs["synaptopathy"]

    ratio = synapto["d_opt"] / healthy["d_opt"]
    mechanical_moved = [c for c in prints["synaptopathy"][:5] if c not in ("0", "defined")]
    report(
        theta_factor=P.SYNAPTOPATHY.theta_factor,
        d_opt_healthy=healthy["d_opt"],
        d_opt_synaptopathy=synapto["d_opt"],
        d_opt_ratio=ratio,
        mechanical_components_that_moved=mechanical_moved,
    )
    assert abs(ratio - P.SYNAPTOPATHY.theta_factor) < 1e-12, (
        f"the optimum moved by {ratio:.4f} for a threshold raised {P.SYNAPTOPATHY.theta_factor}x; "
        "sigma_opt = theta/2 says these are the same number"
    )
    assert not mechanical_moved, (
        f"a purely synaptic lesion moved mechanical observables: {mechanical_moved}"
    )
