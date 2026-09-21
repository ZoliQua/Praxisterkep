"""The specialist lists: shape guards and the two spellings of one profession."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import specialist
from parse_dental import ParseError


def row(**over):
    base = {
        "care": "outpatient", "fin": "022821001", "neakCode": "0986",
        "institution": "EÜ-MED Kft.", "county": "Baranya", "unit": "Ortopédia",
        "professionCode": "1000", "profession": "ortopédia",
        "settlement": "Komló", "postalCode": "7300", "address": "Pécsi út 1.",
        "seatSettlement": "Komló", "seatAddress": "Pécsi út 1.",
        "lat": None, "lon": None, "geoApprox": None,
    }
    base.update(over)
    return base


def out_of(rows):
    ksh = None
    return {
        "schemaVersion": 1, "dataMonth": "2026-09",
        "stats": {c: specialist.care_stats([r for r in rows if r["care"] == c], ksh)
                  for c in specialist.FILES},
        "counties": specialist.by_county(rows, ksh),
        "professions": specialist.by_profession(rows),
        "institutions": specialist.by_institution(rows),
        "sites": specialist.by_site(rows),
        "rows": rows,
    }


def test_county_and_settlement_keys():
    assert specialist.county_key("Baranya megye") == "Baranya"
    assert specialist.county_key("Csongrád-Csanád vármegye") == "Csongrád-Csanád"
    assert specialist.county_key("Budapest") == "Budapest"
    # the site column writes the capital with its district, the seat does not
    assert specialist.settlement_key("Budapest VIII. kerület") == "Budapest"
    assert specialist.settlement_key("Komló") == "Komló"


@pytest.mark.parametrize("code", ["1000", "0105", "Q08", "010C", "180C"])
def test_accepted_profession_codes(code):
    assert specialist.PROFESSION_RE.fullmatch(code)


@pytest.mark.parametrize("code", ["100", "10000", "QQ8", "010X", ""])
def test_rejected_profession_codes(code):
    assert not specialist.PROFESSION_RE.fullmatch(code)


def test_profession_groups_by_code_and_keeps_the_longer_label():
    # the two lists spell the same profession differently; the code is the key
    rows = [row(), row(fin="022821002", profession="Ortopédia és traumatológia")]
    groups = specialist.by_profession(rows)
    assert len(groups) == 1
    assert groups[0]["profession"] == "Ortopédia és traumatológia"
    assert groups[0]["units"] == 2


def test_guard_rejects_a_duplicate_room_id():
    rows = [row(), row(profession="Ortopédia")]
    out = out_of(rows)
    out["stats"]["outpatient"]["rows"] = specialist.BASELINE["outpatient"]
    out["stats"]["inpatient"]["rows"] = specialist.BASELINE["inpatient"]
    with pytest.raises(ParseError):
        specialist.guard(out)


def test_guard_rejects_a_row_count_that_collapsed():
    out = out_of([row()])
    with pytest.raises(ParseError, match="outside"):
        specialist.guard(out)
