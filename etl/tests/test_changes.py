"""What changed between two snapshots: every district accounted for, and
nothing guessed where a month cannot tell."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import changes
from parse_dental import ParseError


def snap(kind="gp", vacant=(), dissolved=(), filled=(), month="2026-01"):
    praxes = ([{"id": f, "status": "vacant", "county": "Vas", "type": "mixed",
                "sites": [{"settlement": "Ják"}], "population": 1000} for f in vacant]
              + [{"id": f, "status": "dissolved", "county": "Vas", "type": "mixed",
                  "sites": [{"settlement": "Ják"}], "population": 500} for f in dissolved])
    return changes.Month(month, {
        "kind": kind, "praxes": praxes,
        "filledPraxes": [{"id": f, "county": "Vas", "settlement": "Ják"} for f in filled],
        "national": {"vacant": len(vacant), "totalDistricts": len(vacant) + len(filled),
                     "populationVacant": 1000 * len(vacant), "longTerm": 0},
    })


def test_every_vacancy_is_followed_by_its_code():
    a = snap(vacant=["A", "B", "C"], filled=["D", "E"], month="2026-01")
    b = snap(vacant=["A", "D", "N"], filled=["B", "E", "N2"], month="2026-02")
    p = changes.compare(a, b, {}, True)
    f = p["flows"]
    assert (p["vacantFrom"], p["vacantTo"]) == (3, 3)
    assert f["stillVacant"] == 1
    assert (f["ended"], f["filled"], f["leftRegistry"]) == (2, 1, 1)      # B filled, C gone
    assert (f["newVacant"], f["fromFilled"], f["newDistrict"]) == (2, 1, 1)  # D was filled, N is new
    assert {e["id"]: e["how"] for e in p["endedList"]} == {"B": "filled", "C": "leftRegistry"}


def test_a_month_without_a_registry_says_unknown_not_left():
    a = snap(vacant=["A", "B"], filled=["X"], month="2026-01")
    b = snap(vacant=["A"], filled=[], month="2026-02")   # vacancy list only
    f = changes.compare(a, b, {}, False)["flows"]
    assert (f["ended"], f["unknownFate"], f["leftRegistry"], f["filled"]) == (1, 1, 0, 0)


def test_a_dental_month_without_the_dissolved_list_cannot_say_left():
    a = snap("dental", vacant=["A", "B"], dissolved=["Z"], filled=["X"], month="2026-01")
    b = snap("dental", vacant=["A"], filled=["X"], month="2026-02")
    f = changes.compare(a, b, {}, False)["flows"]
    assert f["unknownFate"] == 1 and f["leftRegistry"] == 0
    assert changes.compare(a, b, {}, False)["dissolvedTo"] is None


def test_the_dissolved_list_is_a_destination_of_its_own():
    a = snap("dental", vacant=["A"], dissolved=["Z"], filled=["X"], month="2026-01")
    b = snap("dental", vacant=[], dissolved=["A", "Z"], filled=["X"], month="2026-02")
    f = changes.compare(a, b, {}, False)["flows"]
    assert (f["ended"], f["toDissolved"]) == (1, 1)


def test_the_list_must_match_the_national_count():
    with pytest.raises(ParseError):
        changes.Month("2026-01", {"kind": "gp", "praxes": [{"id": "A", "status": "vacant"}],
                                  "national": {"vacant": 2}})


def test_the_guard_refuses_flows_that_do_not_add_up():
    a = snap(vacant=["A"], filled=["B"], month="2026-01")
    b = snap(vacant=["B"], filled=["A"], month="2026-02")
    pair = changes.compare(a, b, {}, True)
    out = {"year": "2026", "kinds": {k: {"monthly": [pair], "yearly": [], "span": pair}
                                     for k in changes.KINDS}}
    changes.guard(out)
    pair["vacantTo"] = 5
    with pytest.raises(ParseError):
        changes.guard(out)
