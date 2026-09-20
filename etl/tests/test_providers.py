"""The unified provider list: the guard that keeps a row honest."""
import pytest

from build_eeszt import EesztError
from providers import GROUPS, guard


def _row(**over):
    row = {
        "neakCode": "3936", "neakName": "Dr. Baumholzer Fogászati Bt.",
        "tax": "20101189", "match": "tax",
        "counts": dict.fromkeys(GROUPS, 0), "total": 0,
        "counties": ["Baranya"], "settlements": 1,
        "euszolgId": "032175",
        "officialName": "DR. BAUMHOLZER Fogászati, Kereskedelmi és Szolgáltató Betéti Társaság",
        "seatCounty": "Baranya", "seatPostal": "7627", "seatSettlement": "Pécs",
        "seatAddress": "Bokor utca 12/2.",
    }
    row["counts"]["dental"] = 2
    row["total"] = 2
    row.update(over)
    return {"providers": [row], "stats": {"providers": 1}}


def test_guard_accepts_a_consistent_row():
    guard(_row())


def test_guard_rejects_a_portfolio_that_does_not_add_up():
    with pytest.raises(EesztError, match="do not add up"):
        guard(_row(total=5))


def test_guard_rejects_a_provider_without_a_neak_name():
    with pytest.raises(EesztError, match="without a NEAK name"):
        guard(_row(neakName=""))


def test_guard_rejects_a_match_without_a_provider_id():
    row = _row()
    del row["providers"][0]["euszolgId"]
    with pytest.raises(EesztError, match="matched without a provider id"):
        guard(row)


def test_guard_rejects_an_unknown_match():
    with pytest.raises(EesztError, match="unknown match"):
        guard(_row(match="hunch"))


def test_guard_rejects_an_officer_field_sneaking_in():
    # company officers are in none of the registers we use
    with pytest.raises(EesztError, match="unexpected fields"):
        guard(_row(managingDirector="Dr. Minta Elek"))


def test_guard_rejects_duplicate_codes():
    out = _row()
    out["providers"].append(dict(out["providers"][0]))
    out["stats"]["providers"] = 2
    with pytest.raises(EesztError, match="duplicate NEAK code"):
        guard(out)
