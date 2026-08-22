from pathlib import Path

import pytest

from parse_dental import (
    ParseError,
    _parse_date,
    _parse_population,
    extract_statement_month,
    parse_dissolved,
    parse_vacant,
)

FIXTURES = Path(__file__).parent / "fixtures"
VACANT_PDF = FIXTURES / "dental_vacant_2026-08.pdf"
DISSOLVED_PDF = FIXTURES / "dental_vacant_dissolved_2026-08.pdf"


def test_statement_month():
    assert extract_statement_month(VACANT_PDF) == "2026-08"


def test_parse_vacant_counts_and_shape():
    records = parse_vacant(VACANT_PDF)
    assert len(records) == 257
    for r in records:
        assert len(r["id"]) == 9 and r["id"].isdigit()
        assert r["kind"] == "dental"
        assert r["status"] == "vacant"
        assert r["type"] in ("adult", "child", "mixed", "school")
        assert r["county"]
        assert r["sites"], r["id"]
        assert r["vacantSince"] >= "2000-01"


def test_parse_vacant_known_record():
    records = {r["id"]: r for r in parse_vacant(VACANT_PDF)}
    r = records["020066020"]  # first row of the 2026-08 statement
    assert r["county"] == "Baranya"
    assert r["population"] == 2928
    assert r["vacantSince"] == "2024-06"
    assert r["sites"][0]["settlement"] == "Kővágószőlős"
    assert r["sites"][0]["isHeadquarters"] is True
    assert r["sites"][0]["district"] == "Pécsi"


def test_parse_vacant_multi_site():
    records = {r["id"]: r for r in parse_vacant(VACANT_PDF)}
    r = records["030096097"]  # Kisszállás + Kiskunhalas
    assert len(r["sites"]) == 2
    assert r["sites"][1]["settlement"] == "Kiskunhalas"


def test_parse_dissolved():
    records = parse_dissolved(DISSOLVED_PDF)
    assert len(records) == 38
    by_id = {r["id"]: r for r in records}
    r = by_id["020066093"]
    assert r["status"] == "dissolved"
    assert "Almamellék" in r["servedSettlements"]
    assert r["population"] == 6160


def test_no_personal_names_in_output():
    # vacant lists carry no physician names; guard against schema drift
    for r in parse_vacant(VACANT_PDF) + parse_dissolved(DISSOLVED_PDF):
        assert "doctor" not in r and "orvos" not in r


def test_parse_date():
    assert _parse_date("2024.06.01") == "2024-06"
    assert _parse_date(" 2011.03.01. ") == "2011-03"
    with pytest.raises(ParseError):
        _parse_date("June 2024")


def test_parse_population():
    assert _parse_population("2 928") == 2928
    assert _parse_population("") is None
