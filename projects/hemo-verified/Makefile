PY = .venv/bin/python

test:
	$(PY) -m pytest tests/ -q

h0: test
	$(PY) eval/h0.py --report

verify:
	$(PY) -m pytest tests/ -q
	python3 gates/check_slack.py --dir gates/reports

all: test h0 verify
