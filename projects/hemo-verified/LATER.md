# Later — and the one-line reason each is not in v0.1

Every line here is something a reviewer will ask for. None of them changes
whether the oracles rank error, which is the only question v0.1 answers.

- **Moving walls / FSI** — triples the solver cost and adds a second source of
  prediction error, before we know the gates work on the rigid case.
- **Non-Newtonian rheology** — changes the viscous terms A3 and A6 read; worth
  doing only once those two have measured detection power on the Newtonian case.
- **Mitral valve geometry** — a modelling project of its own, and the oracles do
  not depend on it.
- **4D-flow / echo assimilation** — introduces a second ground truth with its own
  error model, which would confound the one thing being measured.
- **Any risk score, any patient-level output** — out of scope at every version,
  not just this one. This project reports field quantities on a geometry.
- **The 400-geometry batch** — 6,000+ core-hours. Not funded until H2 reports on
  20.
- **Real-time / in-loop control** — HydroGym makes it tempting because the API is
  a Gym; it is a different claim.
