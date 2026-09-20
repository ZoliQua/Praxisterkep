"""The dental services outside the district map: parser and builder guard."""
from pathlib import Path

import pytest

from build_dental_extra import guard
from build_eeszt import EesztError
from parse_registry import parse as parse_registry
from parse_registry import parse_extra

FIXTURES = Path(__file__).parent / "fixtures"
SAMPLE = FIXTURES / "dental_registry_sample.xlsx"


def test_parse_extra_takes_exactly_what_the_districts_leave_out():
    extra = parse_extra(SAMPLE)
    primary = {e["id"] for e in parse_registry(SAMPLE)}
    assert {e["id"] for e in extra} == {"02006A425", "020066900"}
    assert not ({e["id"] for e in extra} & primary)
    by_id = {e["id"]: e for e in extra}
    # a specialist unit code carries a letter — it is not a FIN code
    assert by_id["02006A425"]["group"] == "specialist"
    assert by_id["02006A425"]["level"] == "Szakellátás"
    assert by_id["02006A425"]["unitType"] == "Szájsebészet"
    assert by_id["020066900"]["group"] == "oncall"
    assert by_id["020066900"]["unitType"] == "Ügyelet"
    # the physician and the provider travel together (CLAUDE.md rule 3)
    assert by_id["02006A425"]["doctor"] == "Dr. Minta Béla"
    assert by_id["02006A425"]["provider"] == "Minta Bt."
    assert by_id["02006A425"]["neakCode"] == "0632"


def _service(**over):
    base = {
        "id": "02006A425", "group": "specialist", "level": "Szakellátás",
        "unitType": "Szájsebészet", "county": "Baranya", "settlement": "Pécs",
        "postalCode": "7633", "address": "Dr. Veress E. u. 2.", "rows": 1,
        "doctors": ["Dr. Minta Béla"], "provider": "Minta Bt.", "neakCode": "0632",
        "trace": {"units": "000000001", "licenceId": "L1", "providerId": "P1"},
    }
    base.update(over)
    return base


def _out(services, unmatched=None, stats=None):
    return {
        "services": services,
        "unmatched": unmatched or {},
        "stats": stats or {"specialist": {"services": len(services), "licence": len(services)}},
    }


def test_guard_accepts_a_consistent_build():
    guard(_out([_service()]), 1)


def test_guard_rejects_provider_identity_without_a_physician():
    svc = _service(doctors=[], provider="Minta Bt.")
    del svc["doctors"]
    with pytest.raises(EesztError, match="provider identity"):
        guard(_out([svc]), 1)


def test_guard_rejects_a_provider_id_on_an_unnamed_service():
    svc = _service()
    del svc["doctors"]
    del svc["provider"]
    del svc["neakCode"]
    with pytest.raises(EesztError, match="provider identity"):
        guard(_out([svc]), 1)


def test_guard_rejects_a_lost_registry_row():
    with pytest.raises(EesztError, match="row count mismatch"):
        guard(_out([_service()]), 2)


def test_guard_rejects_a_service_that_is_neither_matched_nor_explained():
    out = _out([_service(), _service(id="02006A426")],
               stats={"specialist": {"services": 2, "licence": 1}})
    with pytest.raises(EesztError, match="!= 2 services"):
        guard(out, 2)


def test_guard_rejects_coordinates_outside_hungary():
    svc = _service(geo={"lat": 52.5, "lon": 13.4, "approx": False, "from": "licence"})
    with pytest.raises(EesztError, match="outside Hungary"):
        guard(_out([svc]), 1)
