from pathlib import Path

import pytest

from parse_dental import ParseError, extract_statement_month
from parse_gp import canonical_county, parse_registry, parse_vacant

FIXTURES = Path(__file__).parent / "fixtures"
VACANT_PDF = FIXTURES / "gp_vacant_2026-08.pdf"
REGISTRY_XLSX = FIXTURES / "gp_registry_sample.xlsx"


def test_statement_month():
    assert extract_statement_month(VACANT_PDF) == "2026-08"


def test_parse_vacant_counts_and_shape():
    records = parse_vacant(VACANT_PDF)
    assert len(records) == 1018
    for r in records:
        assert len(r["id"]) == 9 and r["id"].isdigit()
        assert r["kind"] == "gp"
        assert r["status"] == "vacant"
        assert r["type"] in ("adult", "child", "mixed")
        assert len(r["sites"]) == 1
        assert r["sites"][0]["settlement"]
    assert len({r["id"] for r in records}) == len(records)


def test_parse_vacant_known_record():
    records = {r["id"]: r for r in parse_vacant(VACANT_PDF)}
    r = records["020090006"]  # first row of the 2026-08 statement
    assert r["county"] == "Baranya"
    assert r["type"] == "mixed"
    assert r["population"] == 1237
    assert r["vacantSince"] == "2023-08"
    assert r["sites"][0]["settlement"] == "Beremend"


def test_canonical_county():
    assert canonical_county("NOGRÁD") == "Nógrád"
    assert canonical_county("HAJDU-BIHAR") == "Hajdú-Bihar"
    assert canonical_county(" BARANYA ") == "Baranya"
    with pytest.raises(ParseError):
        canonical_county("ATLANTISZ")


def test_parse_registry_filters_and_shape():
    entries = parse_registry(REGISTRY_XLSX)
    # TN row excluded
    assert {e["id"] for e in entries} == {"020090006", "120090001"}
    beremend = next(e for e in entries if e["id"] == "020090006")
    assert beremend["district"] == "Siklósi"
    assert beremend["servedSettlements"] == [
        {"kshId": "17464", "name": "Kásád"},
        {"kshId": "31927", "name": "Beremend"},
    ]
    by_id = {e["id"]: e for e in entries}
    # BETÖLTETLEN marker is not a name; real names stay on filled praxes
    assert by_id["020090006"]["doctor"] is None
    assert by_id["120090001"]["doctor"] == "Dr. Minta Elek"
    # the provider organisation and its NEAK code follow the physician: a
    # district with no contracted physician carries neither
    assert "provider" not in by_id["020090006"]
    assert "neakCode" not in by_id["020090006"]
    for e in entries:
        assert "phone" not in e
