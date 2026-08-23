PY = .venv/bin/python

test:
	$(PY) -m pytest tests/ -q

h0: test
	$(PY) eval/h0.py --report

verify:
	$(PY) -m pytest tests/ -q
	python3 gates/check_slack.py --dir gates/reports

# COCLEA-SR has had this since it existed; this project did not, and that is how
# an artifact produced by superseded code survived a merge. Same environment ->
# bit-identical or it fails; different environment -> classified, and a
# statistic that moves in the second decimal still fails.
reproduce:
	$(PY) eval/reproduce.py

all: test h0 verify reproduce
