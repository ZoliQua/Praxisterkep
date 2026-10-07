"""The county slice: it may only repeat what the settlement profiles say."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import county_profiles
from parse_dental import ParseError


def profile(name, county, population=1000, gp="filled", dental="absent",
            band="alacsony", gp_min=3.0, bus=True):
    return {
        "kshId": str(abs(hash(name)) % 90000 + 10000), "slug": name.lower(),
        "settlement": name, "county": county, "district": "", "population": population,
        "gp": {"state": gp}, "dental": {"state": dental},
        "travel": {"gp": {"minutes": gp_min}, "dental": {"minutes": 7.0},
                   "oncall": {"minutes": 12.0}, "inpatient": {"minutes": 20.0}},
        "transit": {"gp": {"direct": bus}},
        "index": {"band": band},
    }


def test_a_row_carries_what_the_county_page_shows():
    row = county_profiles.row(profile("Aba", "Fejér", population=4371))
    assert dict(zip(county_profiles.FIELDS, row)) == {
        "slug": "aba", "name": "Aba", "population": 4371, "band": "alacsony",
        "gp": "filled", "dental": "absent", "gpMin": 3.0, "dentalMin": 7.0,
        "oncallMin": 12.0, "inpatientMin": 20.0, "bus": True,
    }


def test_the_aggregate_counts_every_settlement_once():
    rows = [county_profiles.row(p) for p in (
        profile("A", "Vas", gp="filled"), profile("B", "Vas", gp="partial"),
        profile("C", "Vas", gp="vacantOnly"), profile("D", "Vas", gp="absent"),
    )]
    agg = county_profiles.aggregate("Vas", rows)
    assert agg["settlements"] == 4
    assert (agg["gpFilled"], agg["gpPartial"], agg["gpVacantOnly"], agg["gpAbsent"]) \
        == (1, 1, 1, 1)
    assert agg["slug"] == "vas"


def test_a_missing_travel_time_does_not_become_a_zero():
    p = profile("A", "Vas")
    p["travel"]["gp"] = {}
    row = county_profiles.row(p)
    assert row[county_profiles.FIELDS.index("gpMin")] is None
    agg = county_profiles.aggregate("Vas", [row])
    assert agg["medianGpMinutes"] is None


def test_the_median_ignores_the_settlements_without_a_time():
    rows = [county_profiles.row(profile(n, "Vas", gp_min=m))
            for n, m in (("A", 2.0), ("B", 4.0), ("C", 30.0))]
    rows[2][county_profiles.FIELDS.index("gpMin")] = None
    assert county_profiles.aggregate("Vas", rows)["medianGpMinutes"] == 3.0


def out(counties=20, settlements=3200):
    per = settlements // counties
    data = {"schemaVersion": 1, "dataMonth": "2026-10",
            "fields": list(county_profiles.FIELDS), "counties": [], "settlements": {}}
    for i in range(counties):
        name = f"Megye{i}"
        rows = [county_profiles.row(profile(f"T{i}_{j}", name)) for j in range(per)]
        data["settlements"][name] = rows
        data["counties"].append(county_profiles.aggregate(name, rows))
    return data


def test_the_guard_wants_every_county():
    with pytest.raises(ParseError, match="counties, expected 20"):
        county_profiles.guard(out(counties=19))


def test_the_guard_catches_a_county_whose_rows_went_missing():
    bad = out()
    bad["settlements"]["Megye3"] = []
    with pytest.raises(ParseError, match="settlements counted"):
        county_profiles.guard(bad)


def test_the_guard_catches_a_branch_state_that_vanished():
    bad = out()
    bad["counties"][0]["gpFilled"] -= 1
    with pytest.raises(ParseError, match="gp states cover"):
        county_profiles.guard(bad)
