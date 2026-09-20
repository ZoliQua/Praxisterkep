"""Distance to the nearest operating surgery: geometry, bands and the guard."""
import pytest

from access import band_of, guard, haversine


def test_haversine_matches_a_known_distance():
    # Budapest (Deák tér) – Debrecen (Nagytemplom): ~190 km as the crow flies
    km = haversine(47.4979, 19.0554, 47.5316, 21.6273)
    assert 185 < km < 200
    assert haversine(47.5, 19.0, 47.5, 19.0) == 0


def test_band_edges_belong_to_the_upper_band():
    assert band_of(0) == "0-5"
    assert band_of(4.9) == "0-5"
    assert band_of(5.0) == "5-10"
    assert band_of(10.0) == "10-20"
    assert band_of(19.9) == "10-20"
    assert band_of(20.0) == "20+"
    assert band_of(120) == "20+"


def _out(**over):
    district = {
        "id": "020066020", "kind": "dental", "status": "vacant",
        "settlement": "Kővágószőlős", "county": "Baranya", "type": "mixed",
        "population": 2928, "km": 7.2, "band": "5-10", "nearestId": "020066098",
        "nearestSettlement": "Pécs", "sameSettlement": False, "geoApprox": False,
        "lat": 46.08, "lon": 18.13,
    }
    district.update(over.pop("district", {}))
    out = {
        "districts": [district],
        "stats": {"dental": {"measured": 1, "missingGeo": 0,
                             "counts": {"0-5": 0, "5-10": 1, "10-20": 0, "20+": 0}}},
    }
    out.update(over)
    return out


def _latest(n=1):
    return {"kinds": {"dental": {"praxes": [{}] * n}}}


def test_guard_accepts_a_consistent_measurement():
    guard(_out(), _latest())


def test_guard_rejects_a_filled_district_as_subject():
    with pytest.raises(ValueError, match="not a subject"):
        guard(_out(district={"status": "filled"}), _latest())


def test_guard_rejects_a_band_that_contradicts_the_distance():
    with pytest.raises(ValueError, match="does not match"):
        guard(_out(district={"km": 2.0}), _latest())


def test_guard_rejects_an_implausible_distance():
    with pytest.raises(ValueError, match="implausible"):
        guard(_out(district={"km": 512.0, "band": "20+"}), _latest())


def test_guard_rejects_a_district_that_fell_out_of_the_count():
    with pytest.raises(ValueError, match="without coordinates"):
        guard(_out(), _latest(3))
