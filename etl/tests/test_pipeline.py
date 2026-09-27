"""The step runner: a failure must stop what depends on it, and be visible."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pipeline
from pipeline import FAILED, OK, SKIPPED, Step, run_steps


@pytest.fixture
def status_file(tmp_path, monkeypatch):
    target = tmp_path / "pipeline.json"
    monkeypatch.setattr(pipeline, "STATUS", target)
    monkeypatch.setattr(pipeline, "ROOT", tmp_path)
    return target


def test_a_step_runs_and_is_recorded(status_file):
    out = run_steps([Step("a", "first", lambda: "12 rows")], "2026-09")
    assert out["failed"] == []
    assert out["steps"][0]["status"] == OK
    assert out["steps"][0]["note"] == "12 rows"
    assert json.loads(status_file.read_text())["month"] == "2026-09"


def test_a_failure_does_not_abort_the_run_but_is_recorded(status_file):
    def boom() -> str:
        raise RuntimeError("the register moved")

    out = run_steps([Step("a", "first", boom), Step("b", "second", lambda: "ok")],
                    "2026-09")
    assert [s["status"] for s in out["steps"]] == [FAILED, OK]
    assert out["failed"] == ["a"]
    assert "the register moved" in out["steps"][0]["note"]


def test_a_dependent_step_is_skipped_rather_than_fed_stale_input(status_file):
    ran = []

    def boom() -> str:
        raise RuntimeError("no data")

    out = run_steps([
        Step("a", "first", boom),
        Step("b", "second", lambda: ran.append("b") or "ok", needs=("a",)),
        Step("c", "third", lambda: ran.append("c") or "ok", needs=("b",)),
    ], "2026-09")
    # this is the whole point: the composite index must not recompute from
    # last month's driving times just because this month's did not rebuild
    assert ran == []
    assert [s["status"] for s in out["steps"]] == [FAILED, SKIPPED, SKIPPED]
    assert out["failed"] == ["a", "b", "c"]
    assert "needs a" in out["steps"][1]["note"]


def test_the_status_file_carries_the_age_of_each_output(status_file, tmp_path):
    produced = tmp_path / "thing.json"
    produced.write_text("{}", encoding="utf-8")
    out = run_steps([Step("a", "first", lambda: "ok", output=produced)], "2026-09")
    assert out["steps"][0]["output"] == "thing.json"
    assert out["steps"][0]["outputWritten"].startswith("20")


def test_check_exits_non_zero_when_a_step_failed(status_file, monkeypatch):
    def boom() -> str:
        raise RuntimeError("nope")

    run_steps([Step("a", "first", boom)], "2026-09")
    monkeypatch.setattr(sys, "argv", ["pipeline.py", "--check"])
    with pytest.raises(SystemExit) as exit_info:
        pipeline.main()
    assert "a" in str(exit_info.value)


def test_check_is_quiet_when_everything_ran(status_file, monkeypatch):
    run_steps([Step("a", "first", lambda: "ok")], "2026-09")
    monkeypatch.setattr(sys, "argv", ["pipeline.py", "--check"])
    pipeline.main()  # must not raise
