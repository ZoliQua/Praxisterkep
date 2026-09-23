"""Driving times and the bus feed: the parsing rules that must not drift."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import composite
import roads
import transit
import traveltime
from parse_dental import ParseError


def test_maxspeed_parsing_falls_back_to_the_road_class():
    assert roads.parse_speed("90", "primary") == 90
    assert roads.parse_speed("50 mph", "primary") == pytest.approx(80.45, abs=0.1)
    # OSM maxspeed is free text: "HU:urban", "walk", "none" and empty all fail
    assert roads.parse_speed("HU:urban", "residential") == 35
    assert roads.parse_speed(None, "motorway") == 110
    assert roads.parse_speed("", "tertiary") == 60


def test_motorways_are_never_snapping_targets():
    # you can drive along a motorway but not leave it where you need to
    assert "motorway" in roads.NO_SNAP and "trunk" in roads.NO_SNAP
    assert "primary" not in roads.NO_SNAP
    assert roads.NO_SNAP < roads.DRIVABLE


def test_the_projection_uses_one_reference_for_every_point_set():
    # projecting two sets with their own means would stretch them apart and
    # the nearest neighbour would come out wrong — this bit it once already
    a = traveltime.projector(np.array([46.0]), np.array([19.0]))
    b = traveltime.projector(np.array([46.0, 48.0]), np.array([19.0, 21.0]))
    assert a[0][0] == pytest.approx(b[0][0])
    assert a[0][1] == pytest.approx(b[0][1])


def test_travel_bands_follow_the_boundaries():
    assert traveltime.band_of(9.9) == "0-10"
    assert traveltime.band_of(10.0) == "10-20"
    assert traveltime.band_of(30.0) == "30+"


def test_gtfs_times_may_pass_midnight():
    assert transit.seconds("05:32:00") == 5 * 3600 + 32 * 60
    assert transit.seconds("25:10:00") == 25 * 3600 + 600
    assert transit.seconds("nonsense") == -1


def test_the_reference_day_is_a_wednesday_inside_the_window():
    dates = pd.DataFrame({"date": [20260921, 20260922, 20260923, 20260930, 20261001]})
    day = transit.reference_day(dates)
    assert day == 20260930  # the second Wednesday, not the first
    with pytest.raises(ParseError):
        transit.reference_day(pd.DataFrame({"date": [20260921, 20260922]}))


def test_transit_score_counts_missing_services_and_thin_service():
    full = {"capital": False, "departures": 60, "gpDirect": True,
            "oncallDirect": True, "inpatientDirect": True}
    assert composite.transit_score(full) == 0.0
    none = {"capital": False, "departures": 0, "gpDirect": False,
            "oncallDirect": False, "inpatientDirect": False}
    assert composite.transit_score(none) == 1.0
    half = {"capital": False, "departures": 15, "gpDirect": True,
            "oncallDirect": False, "inpatientDirect": True}
    assert composite.transit_score(half) == pytest.approx(0.5 * (1 / 3) + 0.25, abs=1e-3)
    # the capital runs on a feed this pipeline does not load
    assert composite.transit_score({"capital": True, "departures": None}) is None
    assert composite.transit_score(None) is None


def test_weights_still_sum_to_one_after_the_rebalance():
    assert sum(composite.WEIGHTS.values()) == pytest.approx(1.0)
    assert "gpMin" in composite.WEIGHTS and "transit" in composite.WEIGHTS
