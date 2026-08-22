from build import build_snapshot
from validate import validate_snapshot


def _gp_data():
    registry = [
        {"id": "020090006", "kind": "gp", "type": "mixed", "county": "Baranya",
         "settlement": "Beremend", "postalCode": "7827", "district": "Siklósi",
         "servedSettlements": [{"kshId": "17464", "name": "Kásád"},
                               {"kshId": "31927", "name": "Beremend"}]},
        {"id": "020090007", "kind": "gp", "type": "mixed", "county": "Baranya",
         "settlement": "Berkesd", "postalCode": "7664", "district": "Pécsi",
         "servedSettlements": [{"kshId": "06099", "name": "Ellend"},
                               {"kshId": "12867", "name": "Berkesd"}]},
    ]
    vacant = [{
        "id": "020090006", "kind": "gp", "type": "mixed", "status": "vacant",
        "county": "Baranya", "countyCode": "", "vacantSince": "2023-08",
        "population": 1237,
        "sites": [{"postalCode": "7827", "settlement": "Beremend",
                   "address": "Szabadság tér 5.", "district": "",
                   "isHeadquarters": False}],
    }]
    return vacant, registry


def test_gp_snapshot_enrichment_and_coverage():
    vacant, registry = _gp_data()
    snap = build_snapshot("2026-08", "gp", vacant, [], registry)
    validate_snapshot(snap)
    assert snap["kind"] == "gp"
    assert snap["national"]["totalDistricts"] == 2
    assert snap["national"]["dissolved"] == 0

    praxis = snap["praxes"][0]
    # district and served settlements are pulled in from the registry
    assert praxis["sites"][0]["district"] == "Siklósi"
    assert praxis["servedSettlements"] == ["Kásád", "Beremend"]

    by_name = {s["name"]: s for s in snap["settlements"]}
    # coverage-based: the served village points at the vacant praxis...
    assert by_name["Kásád"]["vacantPraxisIds"] == ["020090006"]
    # ...and villages of the filled praxis count it as coverage
    assert by_name["Ellend"]["filled"] == 1
    assert by_name["Beremend"]["filled"] == 0
