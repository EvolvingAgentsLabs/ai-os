"""Controlled corruptions of an exact solution.

Each takes a level and returns a field that is wrong by an amount we chose, so
the true error is known by construction rather than estimated. The set is meant
to span the ways a learned surrogate actually fails -- not to be easy to catch.
"""
import numpy as np

from .fields import Fields


def _rng(seed):
    return np.random.default_rng(seed)


def noise(f, level, grid, bc, seed=0):
    """White noise on uz. The failure every model has."""
    g = _rng(seed)
    return Fields(f.uz + level * bc.u_ref * g.standard_normal(f.uz.shape),
                  f.ur.copy(), f.p.copy())


def divergence(f, level, grid, bc, seed=0):
    """A radial velocity that no incompressible flow in a rigid tube can have."""
    r = grid.r[None, None, :] / grid.R
    return Fields(f.uz.copy(),
                  f.ur + level * bc.u_ref * r * (1.0 - r),
                  f.p.copy())


def slip(f, level, grid, bc, seed=0):
    """Flow that does not stop at the wall. Smooth, plausible, and impossible."""
    uz = f.uz.copy()
    r = grid.r / grid.R
    blend = np.clip((r - 0.7) / 0.3, 0.0, 1.0) ** 2
    uz += level * bc.u_ref * blend[None, None, :]
    return Fields(uz, f.ur.copy(), f.p.copy())


def bias(f, level, grid, bc, seed=0):
    """A uniformly mis-scaled field: the right shape, the wrong magnitude."""
    return Fields(f.uz * (1.0 + level), f.ur.copy(), f.p.copy())


def smooth(f, level, grid, bc, seed=0):
    """Radial over-smoothing -- what a surrogate does to a sharp profile."""
    uz = f.uz.copy()
    k = max(1, int(round(level * 20)))
    for _ in range(k):
        interior = uz[..., 1:-1]
        uz[..., 1:-1] = 0.25 * uz[..., :-2] + 0.5 * interior + 0.25 * uz[..., 2:]
    return Fields(uz, f.ur.copy(), f.p.copy())


def phase(f, level, grid, bc, seed=0):
    """A time shift. Only meaningful on a pulsatile record."""
    if grid.t.size < 2:
        return f.copy()
    shift = int(round(level * grid.t.size))
    return Fields(np.roll(f.uz, shift, axis=0), np.roll(f.ur, shift, axis=0),
                  np.roll(f.p, shift, axis=0))


ALL = {"noise": noise, "divergence": divergence, "slip": slip,
       "bias": bias, "smooth": smooth, "phase": phase}
