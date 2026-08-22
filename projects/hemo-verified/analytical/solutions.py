"""Exact solutions, and the machinery to say how exact they are.

These are the ground truth for H0. They are the only place in the project where
the true answer is known in closed form, which is what lets us measure whether
an oracle's score tracks an error whose size we already know.
"""
import numpy as np
from scipy.special import jv

from .fields import BC, Fields, Grid

# Blood-like, and a tube on the scale of a large vessel. The numbers only have
# to be physically sane: H0 asks whether the oracles rank error, not whether
# this is anyone's artery.
RHO = 1060.0          # kg/m^3
MU = 3.5e-3           # Pa.s
RADIUS = 0.01         # m
PERIOD = 60.0 / 70.0  # s, at 70 bpm


def default_grid(nr=64, nz=8, nt=1, period=0.0, length=0.05):
    t = (np.linspace(0.0, period, nt, endpoint=False) if period > 0
         else np.zeros(1))
    return Grid(np.linspace(0.0, RADIUS, nr),
                np.linspace(0.0, length, nz), t)


def poiseuille(grid, bc):
    """Steady Hagen-Poiseuille: uz = -dpdz/(4 mu) (R^2 - r^2), ur = 0."""
    r = grid.r
    uz = (-bc.dpdz / (4.0 * bc.mu)) * (grid.R ** 2 - r ** 2)
    uz = np.broadcast_to(uz, (grid.t.size, grid.z.size, r.size)).copy()
    ur = np.zeros_like(uz)
    p = bc.dpdz * grid.z[None, :] * np.ones((grid.t.size, 1))
    return Fields(uz, ur, p)


def womersley_number(bc, R=RADIUS):
    omega = 2.0 * np.pi / bc.period
    return R * np.sqrt(omega * bc.rho / bc.mu)


def womersley(grid, bc):
    """Pulsatile flow in a rigid tube driven by dp/dz = dpdz * cos(omega t).

    u(r,t) = Re{ (i P / (rho omega)) [1 - J0(i^{3/2} alpha r/R) /
                                          J0(i^{3/2} alpha)] e^{i omega t} }
    with P = -dpdz so that a negative gradient drives flow in +z.
    """
    omega = 2.0 * np.pi / bc.period
    alpha = womersley_number(bc, grid.R)
    i32 = 1j ** 1.5
    lam = i32 * alpha
    num = jv(0, lam * (grid.r / grid.R))
    den = jv(0, lam)
    # i * Ghat / (omega rho), with Ghat the amplitude of dp/dz itself. Writing
    # -dpdz here inverts the sign and the quasi-steady limit stops reproducing
    # Poiseuille -- which is exactly the check that caught it.
    shape = (1j * bc.dpdz / (bc.rho * omega)) * (1.0 - num / den)
    phase = np.exp(1j * omega * grid.t)[:, None]
    uz_rt = np.real(shape[None, :] * phase)              # (nt, nr)
    uz = np.repeat(uz_rt[:, None, :], grid.z.size, axis=1)
    ur = np.zeros_like(uz)
    p = (bc.dpdz * np.cos(omega * grid.t)[:, None]) * grid.z[None, :]
    return Fields(uz, ur, p)


def momentum_residual(fields, grid, bc):
    """rho du/dt + dp/dz - mu (1/r) d/dr (r du/dr), normalised.

    Used both to check that the closed forms above are actually solutions and,
    with the same code, as oracle A3. If the exact solutions do not null this,
    the oracle is wrong and every H0 number would be meaningless.
    """
    r = grid.r
    uz = fields.uz
    # mu * (1/r) d/dr (r du/dr) with a symmetry condition at the axis
    dudr = np.gradient(uz, grid.dr, axis=2)
    flux = r[None, None, :] * dudr
    visc = np.gradient(flux, grid.dr, axis=2)
    with np.errstate(divide="ignore", invalid="ignore"):
        visc = np.where(r[None, None, :] > 0, visc / np.maximum(r, 1e-300),
                        np.nan)
    # on the axis the limit is 2 * d2u/dr2; take the first interior value
    visc[..., 0] = visc[..., 1]
    visc *= bc.mu

    if grid.t.size > 1:
        dudt = np.gradient(uz, grid.dt, axis=0)
        # the record is one period: the time derivative wraps
        dudt[0] = (uz[1] - uz[-1]) / (2 * grid.dt)
        dudt[-1] = (uz[0] - uz[-2]) / (2 * grid.dt)
    else:
        dudt = np.zeros_like(uz)

    if bc.period > 0:
        omega = 2.0 * np.pi / bc.period
        dpdz = bc.dpdz * np.cos(omega * grid.t)[:, None, None]
    else:
        dpdz = np.full_like(uz, bc.dpdz)

    res = bc.rho * dudt + dpdz - visc
    scale = bc.mu * bc.u_ref / grid.R ** 2 + abs(bc.dpdz)
    out = np.abs(res) / scale
    # The two nodes at the wall carry one-sided differences, and on the exact
    # solution they read 0.11 and 0.22 while the interior reads 1e-13. That is
    # the quadrature, not the physics, and leaving it in would let A3 fire on
    # a perfect field. The wall is A4's job; A3 keeps to the interior.
    out[..., -2:] = np.nan
    return out
