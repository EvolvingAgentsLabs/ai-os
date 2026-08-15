"""§R2 on the narrowed model: is SR sharpest where the string is tuned?

One stapes drive, one threshold, one noise level for the whole membrane. Each
probe gets whatever the mode shapes deliver.
"""
import sys, numpy as np
sys.path.insert(0, "src")
from coclea import assembly, modal, profiles, sr, stochastic

N = 400
prof = profiles.BMProfile(alpha_mu=4.0, alpha_K=0.0, coupling=0.0, zeta0=0.05)
m = modal.eigenmodes(assembly.assemble(prof, N), 12)

for mode_k in (1, 3, 5):
    drive = float(m.omega[mode_k])
    x_cf = float(m.x[int(np.argmax(np.abs(m.phi[:, mode_k])))])
    probes = np.round(np.arange(0.12, 0.93, 0.06), 3)
    theta = 1.0
    # One drive for the whole membrane, set so the tone at x_cf is half threshold.
    ms = stochastic.modal_system(m, probes, 1e-12, "mass")
    ps = stochastic.simulate_ou_modal(ms, stochastic.Drive(omega=drive, amplitude=1.0),
                                      40 * 2*np.pi/drive, (2*np.pi/drive)/64,
                                      np.random.default_rng(1), n_paths=1)
    j_cf = int(np.argmin(np.abs(probes - x_cf)))
    amp = 0.5 * theta / max(float(ps.tone_amplitude[j_cf]), 1e-300)

    curves = sr.shared_sr_curve(m, probes, drive,
                                noise_grid=np.geomspace(1e-4, 1e2, 9),
                                theta=theta, drive_amplitude=amp)
    peaks = [max(e.value for e in c.snr_estimates) for c in curves]
    best = int(np.argmax(peaks))
    print(f"mode {mode_k+1}  omega={drive:5.2f}  x_cf={x_cf:5.3f}  "
          f"highest peak SNR at x={probes[best]:4.2f}  "
          f"{'MATCH' if abs(probes[best]-x_cf) <= 0.07 else 'no'}")
    print("   peak SNR by probe: " + "  ".join(f"{p:5.1f}" for p in peaks))
    print("   tone/theta       : " + "  ".join(f"{amp*float(ps.tone_amplitude[j])/theta:5.3f}" for j in range(len(probes))))
