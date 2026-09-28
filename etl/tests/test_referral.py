"""The referral master list: the name rule and the guards around the join."""
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import referral
from parse_dental import ParseError


def frame(rows):
    return pd.DataFrame(rows).fillna("")


def row(fin="001078209", label="Szigetvár 2. felnőtt körzet", type_="HSZ"):
    return {"IDOSZAK": "202609", "GYFKOD": fin, "VARMEGYE": "Baranya megye",
            "INTKOD": "3927", "INTNEV": "Bt.", "TIPUS": type_,
            "GYFKOD_KAPCS_NEV": label}


def test_a_label_that_names_a_physician_is_withheld():
    rows = referral.rows_of(frame([
        row(label="Dr. Ferencz Irén - Szigetvár, 2. felnőtt körzet"),
        row(fin="001078210", label="Pécsvárad 1. körzet"),
    ]), with_address=False)
    assert rows[0]["labelWithheld"] and rows[0]["label"] == ""
    assert not rows[1]["labelWithheld"]
    assert rows[1]["label"] == "Pécsvárad 1. körzet"


def test_a_row_without_a_financing_code_is_dropped():
    assert referral.rows_of(frame([row(fin="")]), with_address=False) == []


def out(**over):
    base = {
        "period": "202609",
        "stats": {"rows": 35000, "districts": 9000, "entered": 33, "exited": 65,
                  "changed": 10, "labelsWithheld": 5000, "unknownTypes": {},
                  "oursInMaster": 9000, "oursMissing": 0,
                  "exitedKnownToUs": 11, "enteredKnownToUs": 0},
        "rows": [referral.rows_of(frame([row()]), with_address=False)[0]],
        "entered": [], "exited": [],
    }
    base["stats"] |= over.pop("stats", {})
    return base | over


def test_the_guard_accepts_a_plausible_month():
    referral.guard(out())


def test_a_withheld_label_that_was_published_anyway_is_fatal():
    bad = out()
    bad["rows"][0] |= {"labelWithheld": True, "label": "Dr. Valaki"}
    with pytest.raises(ParseError, match="withheld"):
        referral.guard(bad)


def test_a_district_code_must_be_nine_characters():
    bad = out()
    bad["rows"][0]["fin"] = "12345"
    with pytest.raises(ParseError, match="nine characters"):
        referral.guard(bad)


def test_a_repeated_district_code_is_fatal():
    bad = out()
    bad["rows"] = bad["rows"] * 2
    with pytest.raises(ParseError, match="duplicate"):
        referral.guard(bad)


def test_our_districts_must_be_present_in_the_master_list():
    with pytest.raises(ParseError, match="absent"):
        referral.guard(out(stats={"oursInMaster": 9000, "oursMissing": 500}))


def test_a_large_undocumented_branch_code_means_the_register_moved():
    with pytest.raises(ParseError, match="undocumented"):
        referral.guard(out(stats={"unknownTypes": {"XYZ": 900}}))
    # a handful of odd rows is recorded, not fatal
    referral.guard(out(stats={"unknownTypes": {"XYZ": 3}}))


def test_the_period_must_be_a_yyyymm_stamp():
    with pytest.raises(ParseError, match="YYYYMM"):
        referral.guard(out(period="2026-09"))
