"""How long a district has been filled — and where the claim has to stop."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import tenure
from parse_dental import ParseError


def snap(*filled):
    return {"filledPraxes": [{"id": fin, "doctor": doc} for fin, doc in filled],
            "praxes": []}


def fake_archive(monkeypatch, months):
    monkeypatch.setattr(tenure, "months", lambda: sorted(months))
    monkeypatch.setattr(tenure, "snapshot",
                        lambda m, kind: months.get(m, {}).get(kind))


def test_a_name_spelled_differently_is_still_the_same_physician():
    assert tenure.doctor_key("Dr. Kovács Béla") == tenure.doctor_key("dr Kovács Béla")
    assert tenure.doctor_key("Dr. Kovács Béla") != tenure.doctor_key("Dr. Kovács Béci")


def test_month_diff_counts_whole_months():
    assert tenure.month_diff("2025-10", "2026-10") == 12
    assert tenure.month_diff("2026-09", "2026-10") == 1


def test_a_spell_survives_while_the_same_doctor_holds_it(monkeypatch):
    fake_archive(monkeypatch, {
        "2024-01": {"dental": snap(("A", "Dr. X"))},
        "2025-01": {"dental": snap(("A", "Dr. X"))},
        "2026-01": {"dental": snap(("A", "Dr. X"))},
    })
    spells, seen = tenure.walk("dental", tenure.months())
    assert seen == ["2024-01", "2025-01", "2026-01"]
    assert spells["A"]["since"] == "2024-01"
    assert spells["A"]["snapshots"] == 3


def test_a_new_physician_starts_a_new_spell(monkeypatch):
    fake_archive(monkeypatch, {
        "2024-01": {"dental": snap(("A", "Dr. X"))},
        "2025-01": {"dental": snap(("A", "Dr. Y"))},
    })
    spells, _ = tenure.walk("dental", tenure.months())
    assert spells["A"]["since"] == "2025-01"
    assert spells["A"]["doctor"] == "Dr. Y"


def test_going_vacant_in_between_restarts_the_clock(monkeypatch):
    fake_archive(monkeypatch, {
        "2024-01": {"dental": snap(("A", "Dr. X"))},
        "2025-01": {"dental": snap(("B", "Dr. Z"))},   # A is not filled here
        "2026-01": {"dental": snap(("A", "Dr. X"), ("B", "Dr. Z"))},
    })
    spells, _ = tenure.walk("dental", tenure.months())
    assert spells["A"]["since"] == "2026-01"
    assert spells["B"]["since"] == "2025-01"


def test_a_month_without_a_registry_says_nothing_and_breaks_nothing(monkeypatch):
    # several archived months were rebuilt from the vacancy list alone: they
    # hold no filled districts, and must not end every spell in the country
    fake_archive(monkeypatch, {
        "2024-01": {"dental": snap(("A", "Dr. X"))},
        "2025-01": {"dental": {"filledPraxes": [], "praxes": [{"id": "A"}]}},
        "2026-01": {"dental": snap(("A", "Dr. X"))},
    })
    spells, seen = tenure.walk("dental", tenure.months())
    assert seen == ["2024-01", "2026-01"]
    assert spells["A"]["since"] == "2024-01"


def out(**over):
    base = {
        "schemaVersion": 1, "dataMonth": "2026-10",
        "kinds": {k: {"A": {"since": "2024-01", "months": 33, "snapshots": 3,
                            "fromStart": True, "doctor": "Dr. X"}}
                  for k in tenure.KINDS},
        "stats": {k: {"snapshots": 8, "from": "2024-01", "districts": 1,
                      "fromStart": 1} for k in tenure.KINDS},
    }
    return base | over


def test_the_guard_wants_every_spell_to_be_filled_today(monkeypatch):
    monkeypatch.setattr(tenure, "snapshot", lambda m, kind: snap(("A", "Dr. X")))
    tenure.guard(out())
    monkeypatch.setattr(tenure, "snapshot", lambda m, kind: snap(("B", "Dr. Y")))
    with pytest.raises(ParseError, match="without a spell"):
        tenure.guard(out())


def test_the_guard_catches_an_or_longer_flag_that_lost_its_date(monkeypatch):
    monkeypatch.setattr(tenure, "snapshot", lambda m, kind: snap(("A", "Dr. X")))
    bad = out()
    bad["kinds"]["dental"]["A"]["since"] = "2025-06"
    with pytest.raises(ParseError, match="contradicts"):
        tenure.guard(bad)


def test_the_guard_refuses_a_spell_that_starts_after_the_data_month(monkeypatch):
    monkeypatch.setattr(tenure, "snapshot", lambda m, kind: snap(("A", "Dr. X")))
    bad = out()
    bad["kinds"]["dental"]["A"] |= {"since": "2027-01", "fromStart": False,
                                    "months": 3}
    with pytest.raises(ParseError, match="is after"):
        tenure.guard(bad)
