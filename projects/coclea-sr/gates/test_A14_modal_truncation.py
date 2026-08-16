"""GATE-A14 -- the answer does not depend on how many modes were kept.

Spec §5.5: production runs in a truncated modal basis, so every result carries a
choice nobody measured unless somebody checks it. Repeat a point of the SR curve
with twice the modes and require the SNR to shift by less than **0.2 dB**.

## Why this gate is not optional here

The truncation interacts with the noise in a way it does not interact with a
deterministic drive. White noise excites **every** mode equally (spec 4.2 with
mass scaling gives each mode the same intensity), so the variance the detector
sees is a sum over all retained modes and grows as modes are added. Drop too
many and the probe's ``sigma`` is wrong — which moves the whole SR curve along
its own x-axis, because the optimum is at ``theta/2`` in ``sigma``.

That failure is invisible in a deterministic run and invisible in a single SR
curve. It only shows when the mode count is varied, which is what this does.

Spec §5.5 asks for a double criterion on the mode count: the highest retained
frequency above ``10 x`` the drive, **and** more than 99% of the noise variance
captured. Both are computed and reported here rather than assumed from the
number of modes somebody picked.
"""

from __future__ import annotations

import numpy as np

from coclea import assembly, modal, profiles, sr, stochastic

GATE = "A14"
SPEC = "5.5"

TOLERANCE_DB = 0.2
N_MODES = 40
N_GRID = 400


def _membrane():
    prof = profiles.BMProfile(alpha_mu=1.0, alpha_K=2.0, coupling=0.0, zeta0=0.06)
    return modal.eigenmodes(assembly.assemble(prof, N_GRID), 2 * N_MODES)


def test_the_truncation_criteria_are_met_and_reported(report):
    """Spec §5.5's two conditions, computed rather than assumed."""
    modes = _membrane()
    drive_omega = float(modes.omega[2] * 0.35)

    ms_full = stochastic.modal_system(modes, np.array([0.5]), 1.0, "mass")
    var_all = (ms_full.phi_probe[0] ** 2) * ms_full.noise / (
        2.0 * ms_full.gamma * ms_full.omega**2
    )
    captured = float(np.sum(var_all[:N_MODES]) / np.sum(var_all))
    ratio = float(modes.omega[N_MODES - 1] / drive_omega)

    report(
        n_modes=N_MODES,
        drive_omega=drive_omega,
        highest_retained_omega=float(modes.omega[N_MODES - 1]),
        omega_ratio=ratio,
        omega_ratio_required=10.0,
        noise_variance_captured=captured,
        noise_variance_required=0.99,
    )
    assert ratio > 10.0, f"the highest retained mode is only {ratio:.1f}x the drive"
    assert captured > 0.99, f"only {captured:.4%} of the noise variance is retained"


def test_doubling_the_modes_does_not_move_the_snr(report):
    """The gate. Spec §5.5: shift below 0.2 dB."""
    modes = _membrane()
    drive_omega = float(modes.omega[2] * 0.35)
    # One point, at the noise level where the curve is steepest in neither
    # direction: near the optimum, where a shift in sigma would show as a shift
    # in SNR least — which makes this the *hardest* place to detect a truncation
    # error and therefore the honest place to test it. Reported so the choice is
    # visible.
    grid = np.array([0.85])

    # Paired: both arms draw noise in the shape of the LARGER basis, so the
    # retained modes get identical streams and the difference is the truncation
    # rather than two independent realisations. See `simulate_ou_modal`.
    out = {}
    for n in (N_MODES, 2 * N_MODES):
        curve = sr.sr_curve(
            modes, 0.5, drive_omega,
            sigma_grid=grid, n_seeds=12, n_periods=150, n_modes=n,
            noise_stream_modes=2 * N_MODES,
            n_boot=500, master_seed=4242,
        )
        out[n] = curve.points[0]

    shift = abs(out[N_MODES].snr.value - out[2 * N_MODES].snr.value)
    sigma_shift = abs(out[N_MODES].sigma - out[2 * N_MODES].sigma)

    report(
        n_modes=N_MODES,
        n_modes_doubled=2 * N_MODES,
        sigma=float(grid[0]),
        snr_at_n=out[N_MODES].snr.value,
        snr_at_2n=out[2 * N_MODES].snr.value,
        snr_ci_at_n=[out[N_MODES].snr.ci_lo, out[N_MODES].snr.ci_hi],
        snr_ci_at_2n=[out[2 * N_MODES].snr.ci_lo, out[2 * N_MODES].snr.ci_hi],
        shift_db=float(shift),
        tolerance_db=TOLERANCE_DB,
        sigma_shift=float(sigma_shift),
        event_rate_at_n=out[N_MODES].event_rate,
        event_rate_at_2n=out[2 * N_MODES].event_rate,
    )

    assert shift < TOLERANCE_DB, (
        f"doubling the modes moved the SNR by {shift:.3f} dB, tolerance {TOLERANCE_DB}"
    )


def test_a_deliberately_starved_basis_does_move_it(report):
    """The gate's own headroom check.

    A tolerance nothing can violate is not a tolerance. Paired against the same
    noise streams, so this measures the basis and not the seed. Four modes capture a
    fraction of the noise variance, so the probe's ``sigma`` is wrong and the SNR
    must move by more than 0.2 dB. If it does not, this gate is measuring
    nothing and the 0.2 dB above is decoration.
    """
    modes = _membrane()
    drive_omega = float(modes.omega[2] * 0.35)
    grid = np.array([0.85])

    starved = sr.sr_curve(
        modes, 0.5, drive_omega, sigma_grid=grid, n_seeds=12, n_periods=150,
        n_modes=4, noise_stream_modes=2 * N_MODES, n_boot=500, master_seed=4242,
    ).points[0]
    full = sr.sr_curve(
        modes, 0.5, drive_omega, sigma_grid=grid, n_seeds=12, n_periods=150,
        n_modes=2 * N_MODES, noise_stream_modes=2 * N_MODES, n_boot=500, master_seed=4242,
    ).points[0]

    shift = abs(starved.snr.value - full.snr.value)
    report(
        starved_modes=4,
        snr_starved=starved.snr.value,
        snr_full=full.snr.value,
        shift_db=float(shift),
        tolerance_db=TOLERANCE_DB,
        discriminates=bool(shift > TOLERANCE_DB),
    )
    assert shift > TOLERANCE_DB, (
        f"a four-mode basis shifted the SNR by only {shift:.3f} dB; GATE-A14 cannot fail"
    )
