#!/usr/bin/env python3
"""The doc illustrations, as a script rather than four orphan files.

    projects/coclea-sr/.venv/bin/python doc/assets/make-illustrations.py

Documents 00–14 each carry a header illustration; 15–18 did not, and the gap was
recorded in [18 §8](../18-from-a-hypothesis-to-a-therapeutic-surface.md) rather
than quietly dropped. This closes it, and closes it as a **generator** so the
next document does not reopen it.

## The house style, measured from the existing files rather than guessed

`12-conformation.jpg`, `13-degradation.jpg` and `14-review-study.jpg` were
sampled pixel-by-pixel to recover the palette below. Nothing here is a designer's
opinion about what the series looks like; it is what the series is.

* **1400 × 594**, the size every existing plate uses.
* **No text.** Not one of the fourteen has a word in it, and a caption belongs in
  the document where it can be corrected.
* Near-black ground, cream strokes for the ordinary thing, **teal** for a
  container that is fine, **amber** for the one that is different, **red** only
  for something that failed.
* One idea per plate, expressed geometrically. If a plate needs a legend it is
  the wrong plate.

## What each one says

* **15** — semantic zoom: the same object, revealed at more detail as you look
  closer, and a fork that is recorded rather than lost.
* **16** — the oracle is **outside** the work. The reference line never touches
  the chain of steps; the one red step is red because of a comparison, not
  because of how it looked.
* **17** — a project born empty, staffed, and furnished — with one agent
  **declared and struck through**, because a declared name is a claim and a file
  is a fact.
* **18** — the arc. A trajectory that decays and stops (amber, ending red), and a
  second one that propagates on a base the first did not have and opens into the
  seven signatures, one of them open because it is a posit.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

HERE = Path(__file__).resolve().parent

W, H = 1400, 594

#: Sampled from the existing plates, not chosen. See the module docstring.
BG = "#0b0f10"
INK = "#ece9e0"
TEAL = "#4a6a6c"
AMBER = "#d09a52"
RED = "#b6564d"

LW = 1.8
DOT = 7.5


def canvas():
    fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_xlim(0, W)
    # y inverted so the coordinates below read the way a screen does.
    ax.set_ylim(H, 0)
    ax.axis("off")
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    return fig, ax


def dot(ax, x, y, colour=INK, r=DOT, open_=False):
    ax.plot(
        [x],
        [y],
        marker="o",
        markersize=r * 2,
        markerfacecolor=BG if open_ else colour,
        markeredgecolor=colour,
        markeredgewidth=LW,
        linestyle="none",
        zorder=3,
    )


def line(ax, xs, ys, colour=INK, lw=LW, **kw):
    ax.plot(xs, ys, color=colour, linewidth=lw, solid_capstyle="butt", zorder=2, **kw)


def box(ax, x, y, w, h, colour=TEAL, lw=LW):
    ax.add_patch(Rectangle((x, y), w, h, fill=False, edgecolor=colour, linewidth=lw, zorder=1))


def save(fig, name):
    out = HERE / name
    fig.savefig(out, facecolor=BG, dpi=100, pil_kwargs={"quality": 92})
    plt.close(fig)
    print(f"wrote {out.relative_to(HERE.parent.parent)}")


def plate_15():
    """Semantic zoom, and a fork that is recorded.

    The same object three times, each time with more of it visible. The amber dot
    in the third is the menu entry that only exists because the state produced
    it — the point of the chapter, and the reason the third group is not simply a
    bigger version of the first.
    """
    fig, ax = canvas()
    cy = 222

    dot(ax, 205, cy)

    box(ax, 515, cy - 62, 170, 124)
    for dx, dy in ((-45, -28), (30, -6), (-8, 34)):
        dot(ax, 600 + dx, cy + dy)

    box(ax, 945, cy - 96, 250, 192)
    pts = [(-82, -58), (-14, -22), (58, -64), (-58, 40), (36, 44), (92, 6)]
    for dx, dy in pts:
        dot(ax, 1070 + dx, cy + dy)
    line(ax, [1070 - 82, 1070 - 14], [cy - 58, cy - 22])
    line(ax, [1070 - 14, 1070 + 58], [cy - 22, cy - 64])
    line(ax, [1070 - 14, 1070 - 58], [cy - 22, cy + 40])
    dot(ax, 1070 + 92, cy + 6, AMBER)

    # The fork. It splits, and both branches survive — one of them unresolved,
    # which is the state today's tools cannot represent at all. The stem is short
    # so the split is the subject rather than the run-up to it.
    fy = 440
    line(ax, [205, 640], [fy, fy])
    line(ax, [640, 1070], [fy, fy - 52])
    line(ax, [640, 1070], [fy, fy + 52])
    dot(ax, 1070, fy - 52)
    dot(ax, 1070, fy + 52, INK, open_=True)
    save(fig, "15-generated-interaction.jpg")


def plate_16():
    """The oracle is outside the work.

    The reference line does not touch the chain and shares nothing with it. One
    step is red, and the red vertical is the only thing connecting it to the
    reference — the comparison is what made it fail, not its appearance.
    """
    fig, ax = canvas()
    xs = [300 + i * 160 for i in range(6)]
    ref_y, step_y = 190, 380

    line(ax, [xs[0] - 60, xs[-1] + 60], [ref_y, ref_y])
    for x in xs:
        line(ax, [x, x], [ref_y - 16, ref_y + 16], AMBER)

    for i, x in enumerate(xs):
        failed = i == 3
        box(ax, x - 52, step_y - 52, 104, 104, AMBER if failed else TEAL)
        dot(ax, x, step_y, RED if failed else INK)

    line(ax, [xs[3], xs[3]], [ref_y + 20, step_y - 56], RED)
    save(fig, "16-a-workload-with-an-oracle.jpg")


def plate_17():
    """Empty, staffed, furnished — and one name with no file behind it.

    The struck-through open circle in the third box is `AnomalyScanner`: declared
    in an agent's markdown, absent from disk. A declared name is a claim; a file
    is a fact, and the desk draws the difference rather than reporting it.
    """
    fig, ax = canvas()
    cy = 297
    line(ax, [60, 176], [cy, cy])

    for k, x in enumerate((190, 620, 1050)):
        box(ax, x, cy - 106, 224, 212)
        if k >= 1:
            for dx, dy in ((56, -52), (150, -14), (86, 56)):
                dot(ax, x + dx, cy + dy)
        if k == 2:
            for dx, dy in ((162, 62), (44, 12), (176, -74)):
                dot(ax, x + dx, cy + dy)
            sx, sy = x + 112, cy - 66
            dot(ax, sx, sy, AMBER, open_=True)
            line(ax, [sx - 22, sx + 22], [sy, sy], AMBER)

    for x in (414, 844):
        line(ax, [x, x + 206], [cy, cy])
    save(fig, "17-a-project-is-born.jpg")


def plate_18():
    """The arc: a model that dies, and one that reaches a surface.

    Left, amber, descending to a red terminal mark — the traveling wave that fell
    twenty-eight orders of magnitude before arriving. It does not resume.

    Right, cream, a second trajectory that propagates on a **teal base the first
    one did not have** — the fluid ADR-0002 put into the operator — and opens into
    seven marks at seven heights. Six filled, one open: the healthy operating
    point is a posit, and the plate says so the only way a plate can.
    """
    fig, ax = canvas()

    decay = [(130, 190), (230, 220), (330, 268), (420, 334), (490, 404), (536, 454)]
    line(ax, [p[0] for p in decay], [p[1] for p in decay], AMBER)
    line(ax, [536, 536], [438, 488], RED)

    # The base the first trajectory did not have: the fluid ADR-0002 put into the
    # operator. It starts where the second trajectory does and carries the marks.
    base_y = 476
    line(ax, [628, 1284], [base_y, base_y], TEAL)

    rise = [(640, 430), (720, 384), (810, 332), (900, 292), (984, 272)]
    line(ax, [p[0] for p in rise], [p[1] for p in rise])

    # Seven marks at seven heights: the signatures, read by how far each stands
    # from the others rather than by any absolute value.
    heights = [166, 240, 202, 308, 264, 334, 218]
    for i, y in enumerate(heights):
        x = 1030 + i * 42
        line(ax, [x, x], [y + 12, base_y - 10], TEAL, lw=1.1)
        dot(ax, x, y, AMBER if i == 6 else INK, open_=(i == 6))
    save(fig, "18-from-a-hypothesis-to-a-therapeutic-surface.jpg")


if __name__ == "__main__":
    plate_15()
    plate_16()
    plate_17()
    plate_18()
