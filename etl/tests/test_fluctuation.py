"""Physician turnover: what counts as a change, and what must not."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import fluctuation
import tenure
from parse_dental import ParseError


def snap(*filled):
    return {"filledPraxes": [{"id": fin, "doctor": doc, "county": county}
                             for fin, doc, county in filled], "praxes": []}


def archive(monkeypatch, months):
    monkeypatch.setattr(tenure, "months", lambda: sorted(months))
    monkeypatch.setattr(tenure, "snapshot", lambda m, kind: months.get(m, {}).get(kind))


def test_a_new_name_on_the_same_code_is_a_change(monkeypatch):
    archive(monkeypatch, {
        "2025-01": {"gp": snap(("A", "Dr. X", "Vas"))},
        "2026-01": {"gp": snap(("A", "Dr. Y", "Vas"))},
    })
    found, seen = fluctuation.changes("gp", tenure.months())
    assert len(seen) == 2
    assert found == [{"month": "2026-01", "fin": "A", "county": "Vas"}]


def test_the_same_physician_spelled_differently_is_not_a_change(monkeypatch):
    archive(monkeypatch, {
        "2025-01": {"gp": snap(("A", "Dr. Kovács Béla", "Vas"))},
        "2026-01": {"gp": snap(("A", "dr Kovács  Béla", "Vas"))},
    })
    found, _ = fluctuation.changes("gp", tenure.months())
    assert found == []


def test_a_district_that_was_vacant_in_between_counts_once(monkeypatch):
    archive(monkeypatch, {
        "2024-01": {"gp": snap(("A", "Dr. X", "Vas"))},
        "2025-01": {"gp": snap(("B", "Dr. Z", "Vas"))},   # A not filled
        "2026-01": {"gp": snap(("A", "Dr. Y", "Vas"))},
    })
    found, _ = fluctuation.changes("gp", tenure.months())
    assert [c["month"] for c in found] == ["2026-01"]


def test_a_month_without_a_registry_is_skipped(monkeypatch):
    archive(monkeypatch, {
        "2024-01": {"gp": snap(("A", "Dr. X", "Vas"))},
        "2025-01": {"gp": {"filledPraxes": [], "praxes": []}},
        "2026-01": {"gp": snap(("A", "Dr. X", "Vas"))},
    })
    found, seen = fluctuation.changes("gp", tenure.months())
    assert seen == ["2024-01", "2026-01"]
    assert found == []


def test_the_county_suffix_is_dropped_and_the_capital_folded():
    assert fluctuation.county_key("Vas megye") == "Vas"
    assert fluctuation.county_key("Baranya vármegye") == "Baranya"
    assert fluctuation.county_key("Budapest 04. ker.") == "Budapest"


def test_the_recent_window_is_twelve_months():
    assert fluctuation.recent_cutoff("2026-10") == "2025-10"
    assert fluctuation.recent_cutoff("2026-01") == "2025-01"


def out(**over):
    base = {
        "schemaVersion": 1, "dataMonth": "2026-10", "recentMonths": 12,
        "kinds": {kind: {
            "from": "2019-03", "snapshots": 20, "changes": 100,
            "recentChanges": 30, "districts": 2000,
            "byYear": {"2025": 70, "2026": 30},
            "counties": [{"county": f"M{i}", "districts": 100, "recentChanges": 1,
                          "changes": 5, "recentRate": 1.0,
                          "medianTenureMonths": 60, "unchangedWholeWindow": 40}
                         for i in range(20)],
            "events": [],
        } for kind in fluctuation.KINDS},
    }
    for kind in fluctuation.KINDS:
        base["kinds"][kind].update(over.get(kind, {}))
    return base


def test_the_guard_wants_the_counties_to_add_up():
    fluctuation.guard(out())
    with pytest.raises(ParseError, match="districts in counties"):
        fluctuation.guard(out(gp={"districts": 2500}))


def test_the_guard_refuses_more_recent_changes_than_changes():
    with pytest.raises(ParseError, match="more recent changes"):
        fluctuation.guard(out(gp={"recentChanges": 200, "changes": 100}))


def test_the_guard_refuses_a_county_that_changed_more_often_than_it_has_districts():
    bad = out()
    bad["kinds"]["gp"]["counties"][0]["recentChanges"] = 400
    with pytest.raises(ParseError, match="changes in"):
        fluctuation.guard(bad)
