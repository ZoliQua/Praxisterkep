from pathlib import Path

import pytest

from build import build_snapshot
from parse_registry import parse as parse_registry
from validate import ValidationError, validate_records, validate_snapshot

FIXTURES = Path(__file__).parent / "fixtures"


def test_registry_filters_and_doctor_policy():
    entries = parse_registry(FIXTURES / "dental_registry_sample.xlsx")
    # Szakellátás and Ügyelet rows excluded, duplicate FIN collapsed
    assert {e["id"] for e in entries} == {"020066098", "020066020", "200066001"}
    by_id = {e["id"]: e for e in entries}
    # filled praxis keeps the NEAK-published contracted physician...
    assert by_id["020066098"]["doctor"] == "Dr. Minta Aladár"
    # ...a vacant one (empty cell) never yields a name
    assert by_id["020066020"]["doctor"] is None
    for e in entries:
        assert e["type"] in ("adult", "child", "mixed", "school")


def _sample_data():
    registry = [
        {"id": "020066098", "kind": "dental", "type": "mixed",
         "county": "Baranya", "settlement": "Pécs", "postalCode": "7621"},
        {"id": "020066020", "kind": "dental", "type": "mixed",
         "county": "Baranya", "settlement": "Kővágószőlős", "postalCode": "7673"},
        {"id": "200066001", "kind": "dental", "type": "adult",
         "county": "Zala", "settlement": "Zalaegerszeg", "postalCode": "8900"},
    ]
    vacant = [{
        "id": "020066020", "kind": "dental", "type": "mixed", "status": "vacant",
        "county": "Baranya", "countyCode": "01", "vacantSince": "2024-06",
        "population": 2928,
        "sites": [{"postalCode": "7673", "settlement": "Kővágószőlős",
                   "address": "Rákóczi út 34.", "district": "Pécsi",
                   "isHeadquarters": True}],
    }]
    dissolved = [{
        "id": "199966001", "kind": "dental", "type": "mixed", "status": "dissolved",
        "county": "Zala", "countyCode": "20", "vacantSince": "2020-01",
        "population": 1500, "servedSettlements": ["Kispáli", "Nagypáli"],
        "sites": [{"postalCode": "8912", "settlement": "Kispáli",
                   "address": "Fő út 1.", "district": "", "isHeadquarters": True}],
    }]
    return vacant, dissolved, registry


def test_build_snapshot_aggregates():
    vacant, dissolved, registry = _sample_data()
    snap = build_snapshot("2026-08", "dental", vacant, dissolved, registry)
    # dissolved FIN missing from registry still counts in the denominator
    assert snap["national"]["totalDistricts"] == 4
    assert snap["national"]["vacant"] == 1
    assert snap["national"]["dissolved"] == 1
    assert snap["national"]["populationVacant"] == 2928
    validate_snapshot(snap)  # reconciliation invariants hold
    zala = next(c for c in snap["counties"] if c["name"] == "Zala")
    assert zala["total"] == 2 and zala["dissolved"] == 1
    kispali = next(s for s in snap["settlements"] if s["name"] == "Kispáli")
    assert kispali["affectedByDissolved"] is True


def test_validate_records_rejects_bad():
    vacant, dissolved, _ = _sample_data()
    validate_records(vacant + dissolved, previous_count=None)
    with pytest.raises(ValidationError):
        validate_records([], None)
    with pytest.raises(ValidationError):
        validate_records(vacant * 2, None)  # duplicate FIN
    with pytest.raises(ValidationError):
        validate_records(vacant + dissolved, previous_count=10)  # -80% row count


def test_validate_snapshot_catches_name_leak():
    vacant, dissolved, registry = _sample_data()
    snap = build_snapshot("2026-08", "dental", vacant, dissolved, registry)
    snap["praxes"][0]["doctor"] = "Dr. X"
    with pytest.raises(ValidationError):
        validate_snapshot(snap)
