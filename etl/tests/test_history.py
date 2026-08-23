from build import build_snapshot, history_entry


def _snap(month, vacant_specs, registry=None):
    vacant = [{
        "id": pid, "kind": "dental", "type": "mixed", "status": "vacant",
        "county": "Zala", "countyCode": "20", "vacantSince": since,
        "population": 1000,
        "sites": [{"postalCode": "8900", "settlement": "Zalaegerszeg",
                   "address": "Fő út 1.", "district": "", "isHeadquarters": False}],
    } for pid, since in vacant_specs]
    return build_snapshot(month, "dental", vacant, [], registry or [])


def test_history_entry_median_buckets_and_flow():
    prev = _snap("2020-01", [("000000001", "2019-06"), ("000000002", "2010-01")])
    cur = _snap("2020-06", [
        ("000000001", "2019-06"),   # 12 months vacant
        ("000000003", "2020-04"),   # 2 months — new entry
    ])
    e = history_entry(cur, prev)
    assert e["month"] == "2020-06"
    assert e["medianVacancyMonths"] == 7  # (2 + 12) / 2
    assert e["durationBuckets"] == {"0-11": 1, "12-35": 1, "36-119": 0, "120+": 0}
    assert e["flow"] == {"sincePrevMonth": "2020-01", "entered": 1, "left": 1}
    assert sum(e["durationBuckets"].values()) == e["vacant"]


def test_history_entry_without_previous_and_denominator():
    cur = _snap("2020-06", [("000000001", "2019-06")])
    e = history_entry(cur, None)
    assert e["flow"] is None
    assert e["totalDistricts"] is None
    assert e["vacancyRate"] is None


def test_history_entry_with_registry_denominator():
    registry = [
        {"id": "000000001", "kind": "dental", "type": "mixed",
         "county": "Zala", "settlement": "Zalaegerszeg", "postalCode": "8900"},
        {"id": "000000009", "kind": "dental", "type": "mixed",
         "county": "Zala", "settlement": "Keszthely", "postalCode": "8360"},
    ]
    cur = _snap("2020-06", [("000000001", "2019-06")], registry)
    e = history_entry(cur, None)
    assert e["totalDistricts"] == 2
    assert e["vacancyRate"] == 0.5
