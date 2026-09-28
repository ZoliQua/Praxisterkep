"""Contracted pharmacies: the settlement fold and the guards."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pharmacy
from parse_dental import ParseError


def test_the_fold_flattens_the_long_vowels_the_source_drops():
    assert pharmacy.fold("Győr") == pharmacy.fold("Gyor")
    assert pharmacy.fold("Hévíz") == pharmacy.fold("Heviz")


def test_a_district_or_a_quarter_still_means_its_settlement():
    assert pharmacy.settlement_key("Budapest IX.ker.") == "Budapest"
    assert pharmacy.settlement_key("Budapest") == "Budapest"
    assert pharmacy.settlement_key("Szigetvár (Zsibót)") == "Szigetvár"
    assert pharmacy.settlement_key("Pécs") == "Pécs"


def ph(name="Fehér Sas Gyógyszertár", postal="7900", settlement="Szigetvár",
       address="Deák tér 1."):
    return {"name": name, "postalCode": postal, "settlement": settlement,
            "address": address}


def out(rows=None, **over):
    rows = rows if rows is not None else (
        [ph(settlement="Budapest")] * 400 + [ph()] * 1700)
    base = {
        "pharmacies": rows,
        "counties": [{"county": "Baranya", "pharmacies": 100}],
        "stats": {"pharmacies": len(rows), "settlements": 1500},
    }
    base["stats"] |= over.pop("stats", {})
    return base | over


def test_the_guard_accepts_a_plausible_list():
    pharmacy.guard(out())


def test_too_few_pharmacies_means_the_list_changed():
    rows = [ph(settlement="Budapest")] * 400 + [ph()] * 600
    with pytest.raises(ParseError, match="the list changed"):
        pharmacy.guard(out(rows))


def test_a_broken_postcode_is_fatal():
    rows = [ph(settlement="Budapest")] * 400 + [ph(postal="79 00")] * 1700
    with pytest.raises(ParseError, match="not a postcode"):
        pharmacy.guard(out(rows))


def test_an_address_without_a_street_is_fatal():
    rows = [ph(settlement="Budapest")] * 400 + [ph(address="")] * 1700
    with pytest.raises(ParseError, match="incomplete address"):
        pharmacy.guard(out(rows))


def test_a_capital_that_fell_apart_is_fatal():
    # what a broken fold looks like: Budapest split into district fragments
    rows = [ph(settlement=f"Budapest {i}. ker.") for i in range(1, 24)]
    rows += [ph()] * 2100
    with pytest.raises(ParseError, match="settlement fold"):
        pharmacy.guard(out(rows))


def test_county_counts_may_not_exceed_the_whole():
    bad = out()
    bad["counties"] = [{"county": "Baranya", "pharmacies": 9999}]
    with pytest.raises(ParseError, match="exceed"):
        pharmacy.guard(bad)
