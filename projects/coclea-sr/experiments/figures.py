"""Figures, each carrying the run that produced it. Spec §8.4.

> cada PNG/SVG lleva en metadatos el run_id y el hash del manifiesto

Every figure here is drawn **from an attested run on disk**, never from a fresh
computation, and stamps the run id and the manifest hash into the file's own
metadata. That is §6.4 rule 3 — every number in a figure traceable to a run —
made mechanical rather than remembered: a plot that cannot find its run does not
get drawn, and one that does carries its provenance inside the bytes.

Read it back with::

    python3 -c "from PIL import Image; print(Image.open('report/e3-sr-curve.png').text)"

or, without Pillow::

    strings report/e3-sr-curve.png | head

    cd projects/coclea-sr && PYTHONPATH=src .venv/bin/python experiments/figures.py
"""

from __future__ import annotations

import glob
import json
import sys as _sys
import textwrap
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
_sys.path.insert(0, str(ROOT / "src"))
_sys.path.insert(0, str(ROOT))

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from coclea import units  # noqa: E402

OUT = ROOT / "report"

#: Ticks for the E4 frequency axis, matching the swept characteristic frequencies.
CF_TICKS = [125, 250, 500, 1000, 2000, 4000, 8000]


def load(run_prefix: str) -> tuple[dict, dict, str]:
    """Read the newest run with this prefix, plus its manifest and directory name.

    Raises rather than falling back to a fresh computation. A figure drawn from
    live code instead of from a run is a figure whose numbers are not in the
    ledger, which is exactly what §6.4 rule 3 forbids.

    **"Newest" is by the manifest's timestamp, not by sorting the directory
    names.** Run directories are content-addressed — ``e2-tonotopy-51dd5c3e79dd``
    — so their names carry a hash and no order at all. The first version took the
    lexically last one and drew the tonotopy figure from a *superseded* run whose
    arms had different names; it failed loudly with a KeyError, which was luck.
    Had the schema not changed, it would have drawn a stale result under a
    correct-looking provenance stamp.
    """
    dirs = [Path(d) for d in glob.glob(str(ROOT / "runs" / f"{run_prefix}-*"))]
    dirs = [d for d in dirs if (d / "manifest.json").exists()]
    if not dirs:
        raise SystemExit(f"no attested run for {run_prefix}; run its experiment first")
    dirs.sort(key=lambda d: json.loads((d / "manifest.json").read_text())["at"])
    d = dirs[-1]
    result = json.loads((d / "result.json").read_text())
    manifest = json.loads((d / "manifest.json").read_text())
    return result, manifest, d.name


def stamp(manifest: dict, run_dir: str) -> dict[str, str]:
    """The provenance that goes into the PNG's own text chunks."""
    return {
        "run_id": run_dir,
        "result_sha256": manifest["result_sha256"],
        "git_commit": manifest["git_commit"],
        "project": "coclea-sr",
        "Software": "coclea-sr/experiments/figures.py",
    }


def _finish(fig, name: str, meta: dict[str, str], caption: str):
    """Save with metadata and a scope caption on the figure itself.

    Spec §R4 asks every figure to carry the legend of its scope. Putting it in
    the image rather than in a document beside it is the only version that
    survives the figure being copied into a slide.
    """
    # Reserve the strip first, then write into it. Placing the text before
    # making room for it put the caption across the x-axis label — legible in a
    # thumbnail and not in the figure, which is the wrong way round.
    fig.tight_layout(rect=(0.0, 0.10, 1.0, 1.0))
    wrapped = "\n".join(textwrap.wrap(caption, width=150))
    fig.text(0.5, 0.012, wrapped, ha="center", va="bottom", fontsize=6.5,
             color="#555555", linespacing=1.5)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    # `bbox_inches="tight"` would crop the reserved strip back off.
    fig.savefig(path, dpi=160, metadata=meta)
    plt.close(fig)
    print(f"  wrote {path.relative_to(ROOT)}  [{meta['run_id']}]")


# --- E3: the main result ------------------------------------------------------

def figure_sr_curve():
    result, manifest, run_dir = load("e3-sr-curve")
    meta = stamp(manifest, run_dir)

    fig, axes = plt.subplots(1, 2, figsize=(10, 4.0))
    ax, axv = axes

    colours = {"low": "#2f6fb5", "mid": "#c8781b", "high": "#6b4fa8"}
    probe = "0.45"
    for band, colour in colours.items():
        p = result["results"][band]["probes"][probe]
        sigma = np.array(p["sigma"], dtype=float)
        snr = np.array([np.nan if v is None else v for v in p["snr_db"]], dtype=float)
        ci = np.array([[np.nan if x is None else x for x in c] for c in p["snr_ci"]], dtype=float)

        ax.plot(sigma, snr, "-o", ms=3.5, color=colour,
                label=f"{band}  $\\Omega$={result['results'][band]['omega']:.3f}")
        ax.fill_between(sigma, ci[:, 0], ci[:, 1], color=colour, alpha=0.18, linewidth=0)

        vs = np.array([np.nan if v is None else v for v in p["vector_strength"]], dtype=float)
        axv.plot(sigma, vs, "-o", ms=3.5, color=colour)

    theta = result["results"]["mid"]["probes"][probe]["theta"]
    ax.axvline(theta / 2.0, color="#b03a2e", ls="--", lw=1.2)
    ax.annotate(r"$\sigma_{\rm opt}=\theta/2$", xy=(theta / 2.0, ax.get_ylim()[1]),
                xytext=(4, -12), textcoords="offset points",
                color="#b03a2e", fontsize=8)

    ax.set_xscale("log")
    ax.set_xlabel(r"noise level at the probe, $\sigma$  (dimensionless)")
    ax.set_ylabel("SNR at the drive frequency  (dB)")
    ax.set_title("GATE-B2 — stochastic resonance", fontsize=10)
    ax.legend(fontsize=7.5, frameon=False)
    ax.grid(alpha=0.25, lw=0.5)

    axv.set_xscale("log")
    axv.set_xlabel(r"$\sigma$")
    axv.set_ylabel("vector strength")
    axv.set_title("phase locking falls monotonically", fontsize=10)
    axv.grid(alpha=0.25, lw=0.5)

    b2 = result["gate_B2"]
    _finish(fig, "e3-sr-curve.png", meta,
            f"Passive string, modal Ornstein-Uhlenbeck (spec §4.1, §5.3), probe x={probe}. "
            f"Bands are BCa 95% intervals over {result['n_seeds']} seeds. "
            f"GATE-B2: {b2['n_with_significant_interior_maximum']}/{b2['n_curves']} curves across all "
            f"probes have a significant interior maximum. One-dimensional model — see spec §R4.")


def figure_sr_spatial():
    """The spatial modulation §R2 calls the interesting part."""
    result, manifest, run_dir = load("e3-sr-curve")
    meta = stamp(manifest, run_dir)

    fig, ax = plt.subplots(figsize=(6.2, 4.0))
    for band, colour in {"low": "#2f6fb5", "mid": "#c8781b", "high": "#6b4fa8"}.items():
        probes = result["results"][band]["probes"]
        xs = sorted(probes, key=float)
        peaks = [probes[x]["peak"] for x in xs]
        ax.plot([float(x) for x in xs], peaks, "-o", ms=4, color=colour,
                label=f"{band}  $\\Omega$={result['results'][band]['omega']:.3f}")

    ax.set_xlabel("probe position along the membrane,  $x/L$   (base $\\to$ apex)")
    ax.set_ylabel("peak SNR at the optimum  (dB)")
    ax.set_title("Spatial modulation of the resonance", fontsize=10)
    ax.legend(fontsize=8, frameon=False)
    ax.grid(alpha=0.25, lw=0.5)

    _finish(fig, "e3-spatial.png", meta,
            "This is the string's mode shapes, NOT a place code: ADR-0003 records that the noise "
            "runs on spec (2.1)'s string while the tonotopic map comes from ADR-0002's "
            "transmission line. Whether the resonance is sharpest where the membrane is tuned "
            "cannot be asked until they are unified.")


# --- E2: the place map --------------------------------------------------------

def figure_tonotopy():
    result, manifest, run_dir = load("e2-tonotopy")
    meta = stamp(manifest, run_dir)

    fig, ax = plt.subplots(figsize=(6.6, 4.2))
    arms = [
        ("control_string", "#9a9a9a", "spec (2.1) string — no place code"),
        ("control_ground_spring", "#b03a2e", "ADR-0001 ground spring — falsified"),
        ("transmission_line", "#2f6fb5", "ADR-0002 transmission line"),
    ]
    for key, colour, label in arms:
        a = result["arms"][key]
        ax.plot(a["hz"], a["x_cf"], "-", lw=1.8, color=colour, label=label)

    hz = np.array(result["arms"]["transmission_line"]["hz"], dtype=float)
    ax.plot(hz, units.greenwood_place(hz), "k--", lw=1.2, label="Greenwood (1990)")

    ax.set_xscale("log")
    ax.invert_yaxis()
    ax.set_xlabel("drive frequency  (Hz)")
    ax.set_ylabel("characteristic place,  $x_{cf}/L$   (base $\\to$ apex)")
    ax.set_title("GATE-B1 — the tonotopic map, three operators", fontsize=10)
    ax.legend(fontsize=7.5, frameon=False, loc="lower left")
    ax.grid(alpha=0.25, lw=0.5)

    g = result["arms"]["transmission_line"].get("greenwood", {})
    _finish(fig, "e2-tonotopy.png", meta,
            f"Compared on SHAPE only — spec §R4: a one-dimensional abstraction cannot match "
            f"Greenwood quantitatively, so a close numerical agreement would be a coincidence. "
            f"Pearson r = {g.get('pearson_r', float('nan')):+.4f}; slope "
            f"{g.get('slope_per_decade', float('nan')):+.3f} per decade against Greenwood's "
            f"{g.get('greenwood_slope_per_decade', float('nan')):+.3f}.")


# --- E4: the physiological verdict --------------------------------------------

def figure_physiological():
    result, manifest, run_dir = load("e4-physiological")
    meta = stamp(manifest, run_dir)

    fig, ax = plt.subplots(figsize=(6.8, 4.2))
    band = result["acceptance_band"]
    ax.axhspan(band[0], band[1], color="#3f8f3f", alpha=0.15, lw=0)
    ax.axhline(2.0, color="#3f8f3f", lw=1.4)
    ax.annotate("model optimum  $\\theta/\\sigma = 2$", xy=(140, 2.0),
                xytext=(0, 5), textcoords="offset points", fontsize=8, color="#2c6e2c")

    rows = [r for r in result["grid"] if r["theta_over_sigma"] is not None]
    rates = sorted({r["rate"] for r in rows})
    cmap = plt.get_cmap("viridis")
    for i, rate in enumerate(rates):
        pts = sorted([r for r in rows if r["rate"] == rate], key=lambda r: r["cf_hz"])
        ax.plot([p["cf_hz"] for p in pts], [p["theta_over_sigma"] for p in pts],
                "-o", ms=3, lw=1.2, color=cmap(i / max(1, len(rates) - 1)),
                label=f"$r_0$ = {rate:g} sp/s")

    ax.set_xscale("log")
    # Explicit ticks: matplotlib's log minor labels collide at this width and
    # render as an unreadable smear rather than as axis labels.
    ax.set_xticks(CF_TICKS)
    ax.set_xticklabels([f"{v:g}" for v in CF_TICKS])
    ax.minorticks_off()
    ax.set_xlabel("characteristic frequency  (Hz)")
    ax.set_ylabel(r"$\theta/\sigma$  inferred from the spontaneous rate")
    ax.set_title("E4 — is the auditory nerve near the SR optimum?", fontsize=10)
    ax.legend(fontsize=6.8, frameon=False, ncol=2)
    ax.grid(alpha=0.25, lw=0.5)

    v = result["verdict"]
    _finish(fig, "e4-physiological.png", meta,
            f"Inferred through Rice's rate inverted, so no displacement scale is involved. "
            f"Green band = the model's optimum widened by E3's own grid resolution, fixed before "
            f"the physiology was looked at. Crossover at ~{v['crossover_cf_hz']:.0f} Hz. "
            f"Spontaneous-rate range [read] from spec §4.5, not independently verified. "
            f"LOAD-BEARING ASSUMPTION: omega_eff = 2*pi*CF.")


def main() -> int:
    print("figures (each stamped with its run):")
    figure_sr_curve()
    figure_sr_spatial()
    figure_tonotopy()
    figure_physiological()
    print(f"\nprovenance is in the PNG metadata; read it with Pillow or `strings`.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
