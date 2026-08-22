"""The slack computation and its auditor.

The cases that matter are the ones where a naive ratio lies: an exact identity
(dividing by zero reads as infinite slack when it is undefined), a lower-bound
assertion (the ratio inverts), and an ambiguous field name (A14 asserts `shift`
in both directions, so guessing from the name would invert half of them).
"""
import importlib.util
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


conftest = _load("gate_conftest", "gates/conftest.py")
check_slack = _load("gate_check_slack", "gates/check_slack.py")
slack = conftest._slack


def test_it_divides_the_tolerance_by_what_was_measured():
    got, note = slack({"tolerance": 1e-3, "relative_residual": 1e-9})
    assert note is None
    assert abs(got - 1e6) < 1.0


def test_an_exact_identity_has_undefined_slack_not_infinite_slack():
    # Ten A11 reports measure a symmetry defect of exactly zero. Treating those
    # as the loosest gates in the suite would be an artifact of the division.
    got, note = slack({"tolerance": 1e-12, "symmetry_defect": 0.0})
    assert got is None
    assert "exactly zero" in note


def test_the_worst_measurement_binds_not_the_first_one():
    got, _ = slack({"tolerance": 1.0, "first_mode_error": 1e-6,
                    "last_mode_error": 1e-2})
    assert abs(got - 100.0) < 1e-9


def test_an_ambiguous_field_is_refused_rather_than_guessed():
    # A14 asserts `shift < TOLERANCE_DB` in one test and `shift >` in another.
    got, note = slack({"tolerance": 2.0, "shift": 0.5})
    assert got is None and "slack_basis" in note
    got, note = slack({"tolerance": 2.0, "shift": 0.5, "slack_basis": "shift"})
    assert got == 4.0 and note is None


def test_a_lower_bound_inverts_the_ratio():
    got, _ = slack({"tolerance": 0.15, "span": 0.30,
                    "slack_basis": "span", "bound": "lower"})
    assert abs(got - 2.0) < 1e-9


def test_a_non_finite_or_absent_tolerance_produces_no_number():
    assert slack({"relative_error": 1e-3}) == (None, None)
    assert slack({"tolerance": 0.0, "relative_error": 1e-3})[0] is None
    assert slack({"tolerance": float("inf"), "relative_error": 1e-3})[0] is None
    assert slack({"tolerance": True, "relative_error": 1e-3}) == (None, None)


def test_the_auditor_flags_both_ends_and_stays_quiet_in_between(tmp_path):
    def write(name, payload):
        (tmp_path / name).write_text(json.dumps(
            {"gate": name[:3], "test": name, "passed": True, **payload}))
    write("loose.json", {"slack": 1e6})
    write("tight.json", {"slack": 1.05})
    write("fine.json", {"slack": 40.0})
    write("nomargin.json", {"tolerance": 1e-3, "slack_note": "undefined"})
    with_slack, without, bad = check_slack.load(tmp_path)
    assert len(with_slack) == 3 and len(without) == 1 and not bad
    assert check_slack.main(["--dir", str(tmp_path)]) == 0
    assert check_slack.main(["--dir", str(tmp_path), "--strict"]) == 1


def test_the_auditor_reports_unreadable_files_instead_of_skipping_them(tmp_path):
    (tmp_path / "broken.json").write_text("{not json")
    (tmp_path / "list.json").write_text("[]")
    _, _, bad = check_slack.load(tmp_path)
    assert {n for n, _ in bad} == {"broken.json", "list.json"}


def test_a_missing_directory_is_an_error_not_a_clean_bill(tmp_path):
    assert check_slack.main(["--dir", str(tmp_path / "nope")]) == 2
