"""GATE-C4 -- the noise sampler on the transmission line. ADR-0003.

A new sampler needs its own checks before any result rests on it, and this one
had a factor of two in it that no curve would have shown: the synthesised field
carried exactly **half** the variance its own spectrum predicted, and every SR
curve drawn from it would have looked entirely reasonable.

Three things are checked, and only the first is about numbers agreeing with
themselves:

* **the variance identity** — the sampled series matches the closed-form
  spectrum integral. ADR-0003's pre-registered condition 1;
* **reciprocity** — the whole trick that makes this affordable. If
  ``G(x_p, x_j) != G(x_j, x_p)`` the one-solve shortcut is invalid and the
  spectrum is wrong at every frequency;
* **the place code is in the noise** — the spectrum at a probe peaks at that
  probe's own characteristic frequency. On the string this is not merely wrong,
  it is undefined; here it is the reason the operator was built.
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import profiles, tl_stochastic, transmission, units

GATE = "C04"
SPEC = "ADR-0003"

BETA = 8.0
N = 800
PROF = profiles.REFERENCE_NO_GROUND


def _band(omega, n=120):
    return np.geomspace(omega / 8, omega * 8, n)


@pytest.mark.parametrize("hz", [800.0, 3000.0, 9000.0])
def test_the_synthesised_variance_matches_the_spectrum(hz, report):
    """ADR-0003 condition 1 — and what caught the factor of two."""
    omega = float(units.SCALE.omega_tilde_of(hz))
    xcf = float(transmission.respond(PROF, 2000, omega, BETA).x_cf)
    spec = tl_stochastic.probe_spectrum(PROF, N, _band(omega), BETA, xcf)

    dt = (2 * np.pi / omega) / 32
    y = tl_stochastic.synthesise(spec, 1.0, 1 << 16, dt, np.random.default_rng(5), n_paths=8)
    ratio = float(np.var(y) / spec.variance(1.0))

    report(hz=hz, x_cf=xcf, closed_form_variance=spec.variance(1.0),
           sampled_variance=float(np.var(y)), ratio=ratio)
    assert abs(ratio - 1.0) < 0.05, (
        f"sampled/closed-form variance = {ratio:.4f}; a ratio near 0.5 is the "
        "one-sided/two-sided convention"
    )


def test_the_greens_function_is_reciprocal(report):
    """The identity the whole approach rests on.

    Without it the one-solve shortcut is invalid — and it would still produce a
    smooth, plausible spectrum, because nothing downstream of it knows what the
    Green's function was supposed to be.
    """
    omega = float(units.SCALE.omega_tilde_of(3000.0))
    a, b = 0.22, 0.55

    g_a, x, _, _, ia = tl_stochastic.green_row(PROF, N, omega, BETA, a)
    g_b, _, _, _, ib = tl_stochastic.green_row(PROF, N, omega, BETA, b)

    # G(x_b, x_a) from the solve sourced at a, against G(x_a, x_b) from the one
    # sourced at b.
    lhs, rhs = complex(g_a[ib]), complex(g_b[ia])
    rel = abs(lhs - rhs) / max(abs(lhs), abs(rhs))

    report(a=a, b=b, G_ba=[lhs.real, lhs.imag], G_ab=[rhs.real, rhs.imag],
           relative_difference=rel)
    assert rel < 1e-9, f"the operator is not reciprocal: {rel:.3e}"


@pytest.mark.parametrize("probe", [0.15, 0.30, 0.50])
def test_the_noise_spectrum_peaks_at_the_probes_own_tuned_frequency(probe, report):
    """The place code, present in the **noise** and not only in the response.

    A probe sees a membrane tuned to one frequency, so even undriven it should
    fluctuate mostly there. The string cannot do this — it has no characteristic
    place — which is exactly why the operator was replaced.
    """
    wide = np.geomspace(
        units.SCALE.omega_tilde_of(120.0), units.SCALE.omega_tilde_of(19000.0), 300
    )
    spec = tl_stochastic.probe_spectrum(PROF, N, wide, BETA, probe)
    peak_omega = float(spec.omega[int(np.argmax(spec.density))])

    # The frequency this position is tuned to, from the impedance alone: where
    # Re(Z) changes sign. No field involved, so this is a genuine comparison.
    tuned = float(transmission.respond(PROF, 2000, peak_omega, BETA).characteristic_place())
    rel = abs(tuned - probe) / probe

    report(probe_x=probe, spectrum_peak_omega=peak_omega,
           spectrum_peak_hz=float(units.SCALE.hz_of(peak_omega)),
           tuned_place_of_that_frequency=tuned, relative_difference=rel)
    assert rel < 0.15, (
        f"the noise at x={probe} peaks at a frequency whose tuned place is {tuned:.3f}"
    )


def test_the_spectrum_grid_is_fine_enough(report):
    """The one approximation in the module, measured rather than assumed.

    The spectrum is interpolated onto the FFT grid from a few hundred points. A
    grid too coarse to resolve the resonance under-counts the variance, which
    shifts the probe's sigma and moves the whole SR curve along its own axis.
    """
    omega = float(units.SCALE.omega_tilde_of(3000.0))
    xcf = float(transmission.respond(PROF, 2000, omega, BETA).x_cf)
    conv = tl_stochastic.spectrum_convergence(
        PROF, N, BETA, xcf, omega / 8, omega * 8, counts=(60, 120, 240)
    )
    report(**conv)
    assert conv["relative_change_from_finest"]["120"] < 0.02, (
        "120 frequencies do not resolve the resonance; production uses that grid"
    )
