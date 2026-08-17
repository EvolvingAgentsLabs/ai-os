"""GATE-B2 -- the project's headline result, as a gate rather than a report.

Spec §4.3.4 names this the MVP's success criterion: **a statistically
significant interior maximum** in SNR against noise intensity. `experiments/e3_sr_curve.py`
measured it at 24 of 24 probe-and-frequency combinations and wrote the numbers
into `runs/`. Until now that was all: a number in a result file, with no gate
enforcing it, so `ai-flows/src/gates.ts` had nothing to read and no gated flow
could be held to the project's own headline claim.

## Why this is not a re-read of `runs/`

The cheapest version of this file would load E3's `result.json` and assert the
flag it already contains. That checks that a number was once written down. It
would stay green after the physics broke, because the file would not change.

So this **runs a curve**: 9 noise levels, 20 seeds, 150 periods.

Those numbers were raised, not chosen. At 8 seeds and 60 periods the maximum was
interior and beat the quiet end — which reads `-inf`, because at the lowest noise
there are no crossings at all — but its interval overlapped the loud end's:
peak 9.77 dB [7.66, 12.33] against 6.70 dB [2.29, 9.69]. **The criterion was not
loosened.** A gate whose bound is relaxed until the data clears it is a gate
measuring the author's patience.

## The control is the gate

Spec §11 R2 states the risk directly: *"la RE aparece trivialmente por diseño del
detector"*. A test that only asserts an interior maximum on a subthreshold tone
cannot tell stochastic resonance from a detector that was switched on, and
`CLAUDE.md` is explicit that a check which cannot fail is not a check.

The negative control is a **suprathreshold** tone at the same probe, same
threshold, same grid. There the detector already fires on the signal alone, noise
can only decorrelate it, and SNR must fall monotonically — **no interior
maximum**. If both arms show one, the finding is the detector, and this gate goes
red on the arm that is supposed to be flat.

`shared_sr_curve` is used rather than `sr_curve` because the control has to be
suprathreshold on purpose: `sr_curve` calibrates the tone to be subthreshold and
raises if it is not, which is correct for the treatment arm and makes the control
inexpressible.
"""

from __future__ import annotations

import numpy as np

from coclea import analysis, assembly, modal, profiles, sr, stochastic

GATE = "B02"
SPEC = "4.3.4 / 11-R2"

N = 400
PROBE = np.array([0.35])
THETA = 1.0
NOISE_GRID = np.geomspace(1e-4, 1e2, 9)


def _curve(drive_fraction: float):
    """One SR curve at `PROBE`, with the tone set to `drive_fraction * theta`.

    The drive amplitude is calibrated against the noise-free response at the
    probe, so `drive_fraction` means the same thing in both arms — which is what
    makes the two comparable at all.
    """
    prof = profiles.BMProfile(alpha_mu=4.0, alpha_K=0.0, coupling=0.0, zeta0=0.05)
    modes = modal.eigenmodes(assembly.assemble(prof, N), 12)
    drive_omega = float(modes.omega[2])

    # Noise-free probe response to a unit drive, so the tone can be placed at a
    # stated fraction of threshold rather than at an amplitude nobody can read.
    ms = stochastic.modal_system(modes, PROBE, 1e-12, "mass")
    period = 2.0 * np.pi / drive_omega
    ps = stochastic.simulate_ou_modal(
        ms,
        stochastic.Drive(omega=drive_omega, amplitude=1.0),
        40 * period,
        period / 64,
        np.random.default_rng(1),
        n_paths=1,
    )
    unit = max(float(ps.tone_amplitude[0]), 1e-300)

    curves = sr.shared_sr_curve(
        modes,
        PROBE,
        drive_omega,
        noise_grid=NOISE_GRID,
        theta=THETA,
        drive_amplitude=drive_fraction * THETA / unit,
        n_seeds=20,
        n_periods=150,
        samples_per_period=64,
        n_boot=2000,
        master_seed=20260816,
    )
    return curves[0]


def test_b02_a_subthreshold_tone_shows_a_significant_interior_maximum(report):
    """The treatment arm. Tone at half threshold: noise should help, then hurt."""
    curve = _curve(0.5)
    verdict = analysis.interior_maximum(NOISE_GRID, curve.snr_estimates)
    report(arm="subthreshold", drive_fraction=0.5, **verdict)
    assert verdict["maximum_is_interior"], (
        f"the best SNR was at grid index {verdict['argmax_index']} of "
        f"{len(NOISE_GRID) - 1} — an end, not an interior optimum"
    )
    assert verdict["significant_interior_maximum"], (
        f"peak {verdict['peak']:.2f} dB {verdict['peak_ci']} does not clear both ends "
        f"({verdict['left_end']:.2f} {verdict['left_end_ci']}, "
        f"{verdict['right_end']:.2f} {verdict['right_end_ci']})"
    )


def test_b02_a_suprathreshold_tone_does_not(report):
    """The control, and the reason this gate can fail.

    At twice threshold the detector fires on the tone alone. Noise cannot help
    something already crossing; it can only decorrelate the crossings. So SNR
    must be highest at the quietest end and fall from there.

    If this arm *also* showed a significant interior maximum, the finding above
    would be a property of the detector rather than of the membrane, and spec
    §11-R2 says so in as many words.
    """
    curve = _curve(2.0)
    verdict = analysis.interior_maximum(NOISE_GRID, curve.snr_estimates)
    report(arm="suprathreshold", drive_fraction=2.0, **verdict)
    assert not verdict["significant_interior_maximum"], (
        "the control arm shows stochastic resonance too, so the treatment arm is "
        "measuring the detector rather than the mechanism"
    )
