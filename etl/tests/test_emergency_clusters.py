"""On-call distances and the care-desert clustering."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import clusters
import emergency
from build_eeszt import EesztError


def test_distance_bands_follow_the_boundaries():
    assert emergency.band_of(9.9) == "0-10"
    assert emergency.band_of(10.0) == "10-20"
    assert emergency.band_of(20.0) == "20-30"
    assert emergency.band_of(45.0) == "30+"


def test_nearest_returns_the_closest_point_and_its_settlement():
    points = [{"lat": 47.5, "lon": 19.05, "settlement": "Budapest"},
              {"lat": 47.1, "lon": 18.4, "settlement": "Székesfehérvár"}]
    km, where = emergency.nearest(47.19, 18.41, points)
    assert where == "Székesfehérvár"
    assert 0 < km < 15
    assert emergency.nearest(47.0, 19.0, []) == (None, "")


def test_county_key_drops_both_spellings():
    assert emergency.county_key("Pest megye") == "Pest"
    assert emergency.county_key("Pest vármegye") == "Pest"
    assert emergency.county_key("Budapest") == "Budapest"


def test_emergency_guard_catches_an_implausible_median():
    out = {"groups": {"oncall": {"services": 200, "located": 200},
                      "ambulance": {"services": 260, "located": 260}},
           "settlements": [{"settlement": "X", "oncallKm": 5, "ambulanceKm": 5}] * 3100,
           "stats": {"oncall": {"medianKm": 900, "counts": {"0-10": 3100},
                                "populationBeyond20": 0},
                     "ambulance": {"medianKm": 5, "counts": {"0-10": 3100},
                                   "populationBeyond20": 0}}}
    with pytest.raises(EesztError, match="implausible median"):
        emergency.guard(out)


def node(kshId, lat, lon):
    return {"kshId": kshId, "settlement": kshId, "county": "X", "population": 100,
            "index": 80.0, "band": "kiemelt", "lat": lat, "lon": lon, "raw": {}}


def test_components_join_only_within_the_radius():
    # two pairs ~2 km apart, the pairs ~30 km from each other
    nodes = [node("a", 47.00, 19.00), node("b", 47.02, 19.00),
             node("c", 47.30, 19.00), node("d", 47.32, 19.00)]
    groups = clusters.components(nodes)
    assert sorted(len(g) for g in groups) == [2, 2]


def test_components_chain_through_a_middle_settlement():
    # single linkage: a-b and b-c are close, a-c is not, yet all three join
    nodes = [node("a", 47.00, 19.00), node("b", 47.04, 19.00), node("c", 47.08, 19.00)]
    groups = clusters.components(nodes)
    assert len(groups) == 1 and len(groups[0]) == 3


def test_cluster_is_named_after_its_largest_settlement():
    group = [node("small", 47.0, 19.0), node("big", 47.02, 19.0)]
    group[1]["population"] = 5000
    group[0]["index"] = 95.0  # the worst one is the small village
    described = clusters.describe(group, 1)
    assert described["name"] == "big"
    assert described["core"] == "small"
    assert described["population"] == 5100
