# Spec §8.3: a third party must be able to regenerate a run bit for bit.
#
# Content-addressed run directories make the check automatic: a rerun that
# produces the same bytes lands in the same directory and the ledger does not
# grow. `make reproduce` re-runs the deterministic experiments and reports
# whether anything moved.
#
# OMP_NUM_THREADS is pinned because a multithreaded BLAS reduction is not
# bit-reproducible. The manifest records the value rather than assuming it.

PY := PYTHONPATH=src OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 .venv/bin/python

.PHONY: gates experiments figures reproduce verify all

gates:
	.venv/bin/python -m pytest gates/ -q

experiments:
	$(PY) experiments/e2_tonotopy.py
	$(PY) experiments/e3_sr_curve.py
	$(PY) experiments/e4_physiological.py
	$(PY) experiments/b3_interactions.py

figures:
	$(PY) experiments/figures.py

verify:
	python3 verify_ledger.py

reproduce:
	@echo "recording the run directories that exist now..."
	@ls runs > /tmp/coclea-runs-before.txt
	@$(MAKE) --no-print-directory experiments > /dev/null
	@ls runs > /tmp/coclea-runs-after.txt
	@if diff -q /tmp/coclea-runs-before.txt /tmp/coclea-runs-after.txt > /dev/null; then \
		echo "REPRODUCED: every rerun landed in its existing content-addressed directory."; \
	else \
		echo "NOT REPRODUCED — these run directories are new:"; \
		diff /tmp/coclea-runs-before.txt /tmp/coclea-runs-after.txt | grep '^>' || true; \
		exit 1; \
	fi
	@python3 verify_ledger.py

all: gates experiments figures verify
