"""The health-visitor branch: aggregation guards and the name policy."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import vedono
from build_eeszt import EesztError


def row(**over):
    base = {
        "fin": "010097001", "branch": "territorial", "county": "Baranya",
        "neakCode": "0986", "provider": "Baranya Vármegyei Kórház",
        "unit": "010097001", "licenceId": "010097001/A1/7901",
        "profession": "7901", "publicFunded": True, "settlement": "Komló",
        "postalCode": "7300", "district": "Komlói", "address": "Pécsi út 1.",
        "lat": None, "lon": None, "geoApprox": None,
    }
    base.update(over)
    return base


def out_of(rows):
    return {
        "schemaVersion": 1, "asOf": "2026-09-20", "referenceResidents": 2500,
        "stats": vedono.overall(rows, None),
        "counties": vedono.by_county(rows, None),
        "providers": vedono.by_provider(rows),
        "settlements": [],
        "rows": rows,
    }


def test_county_key_handles_both_spellings():
    assert vedono.county_key("Baranya megye") == "Baranya"
    assert vedono.county_key("Baranya vármegye") == "Baranya"
    assert vedono.county_key("Budapest") == "Budapest"


def test_branches_and_counties_add_up():
    rows = [row(), row(fin="010097002", branch="school", profession="7902"),
            row(fin="010097003", county="Tolna")]
    out = out_of(rows)
    out["stats"]["services"] = 4000  # clear the "too few services" floor
    with pytest.raises(EesztError, match="add up"):
        vedono.guard(out)


def test_guard_stops_a_health_visitors_name():
    rows = [row(provider="Tevékenységet végzi Kovács Zsuzsanna védőnő (reg. szám: 087693).")]
    out = out_of(rows)
    for key in ("services", "territorial", "withLicence"):
        out["stats"][key] = 4000
    out["stats"]["withoutLicence"] = 0
    out["counties"][0]["services"] = 4000
    out["providers"][0]["services"] = 4000
    with pytest.raises(EesztError, match="personal-name marker"):
        vedono.guard(out)


def test_school_and_territorial_are_counted_apart():
    rows = [row(), row(fin="010097002", branch="school", profession="7902")]
    st = vedono.overall(rows, None)
    assert (st["territorial"], st["school"], st["services"]) == (1, 1, 2)
