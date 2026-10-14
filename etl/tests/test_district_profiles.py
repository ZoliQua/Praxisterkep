"""The járás level: 197 rows that must add up to the same country.

The point of the file is resolution without disagreement — a járás page and a
settlement page read the same numbers — so the tests are about the seams: that
every settlement lands in exactly one járás, that a district is counted where
its surgery stands, and that the capital's kerület are not quietly dropped.
"""
from __future__ import annotations

import json

import pytest

import district_profiles as dp
from parse_dental import ParseError


def profile(name, district, county, **over):
    out = {
        "settlement": name, "slug": name.lower(), "district": district,
        "county": county, "population": 1000,
        "gp": {"state": "filled"}, "dental": {"state": "absent"},
        "index": {"band": "alacsony", "value": 30.0},
        "travel": {"gp": {"minutes": 4.0}, "oncall": {"minutes": 12.0}},
        "transit": {"gp": {"direct": True}},
    }
    out.update(over)
    return out


class TestAggregate:
    def test_counts_every_settlement_once(self):
        rows = [dp.row(profile("Alap", "Sárbogárdi", "Fejér")),
                dp.row(profile("Vajta", "Sárbogárdi", "Fejér"))]
        agg = dp.aggregate("Sárbogárdi", rows)
        assert agg["settlements"] == 2
        assert agg["population"] == 2000
        assert agg["gpFilled"] == 2
        # the states must cover every settlement, which is what the guard checks
        assert (agg["dentalFilled"] + agg["dentalPartial"]
                + agg["dentalVacantOnly"] + agg["dentalAbsent"]) == 2

    def test_medians_ignore_the_settlements_without_a_number(self):
        rows = [dp.row(profile("A", "X", "Y", travel={"gp": {"minutes": 2.0}})),
                dp.row(profile("B", "X", "Y", travel={})),
                dp.row(profile("C", "X", "Y", travel={"gp": {"minutes": 8.0}}))]
        assert dp.aggregate("X", rows)["medianGpMinutes"] == 5.0

    def test_a_járás_with_no_travel_data_says_nothing(self):
        rows = [dp.row(profile("A", "X", "Y", travel={}))]
        assert dp.aggregate("X", rows)["medianGpMinutes"] is None


class TestDistrictPlacement:
    district_of = {"alap": "Sárbogárdi", "papa": "Pápai"}

    def test_a_filled_district_is_counted_where_its_surgery_stands(self):
        praxis = {"settlement": "Alap"}
        assert dp.district_of_praxis(praxis, self.district_of) == "Sárbogárdi"

    def test_a_vacant_district_is_counted_by_its_site(self):
        praxis = {"sites": [{"settlement": "Pápa"}]}
        assert dp.district_of_praxis(praxis, self.district_of) == "Pápai"

    def test_a_service_with_no_usable_settlement_lands_nowhere(self):
        assert dp.district_of_praxis({"settlement": "Budapest"},
                                     self.district_of) == ""

    def test_the_counts_split_vacant_from_dissolved(self):
        latest = {"kinds": {"dental": {
            "filledPraxes": [{"settlement": "Alap"}, {"settlement": "Alap"}],
            "praxes": [
                {"settlement": "Alap", "status": "vacant", "longTerm": True},
                {"settlement": "Alap", "status": "dissolved"},
            ],
        }}}
        unplaced: dict[str, int] = {}
        out = dp.district_counts(latest, self.district_of, unplaced)
        cell = out["Sárbogárdi"]["dental"]
        assert cell == {"total": 4, "vacant": 1, "dissolved": 1, "longTerm": 1,
                        "rate": 0.5}
        assert unplaced == {}

    def test_what_cannot_be_placed_is_counted_apart_not_scattered(self):
        latest = {"kinds": {"dental": {
            "filledPraxes": [{"settlement": "Budapest"}],
            "praxes": [{"settlement": "Budapest", "status": "vacant"}],
        }}}
        unplaced: dict[str, int] = {}
        out = dp.district_counts(latest, self.district_of, unplaced)
        assert out == {}
        assert unplaced == {"dental": 2}


class TestGuard:
    N = 3200  # the guard also refuses a country that lost its settlements

    def base(self):
        return {
            "districts": [{
                "name": "X", "slug": "x", "seat": "A", "county": "Y",
                "settlements": self.N,
                "gpFilled": self.N, "gpPartial": 0, "gpVacantOnly": 0,
                "gpAbsent": 0,
                "dentalFilled": 0, "dentalPartial": 0, "dentalVacantOnly": 0,
                "dentalAbsent": self.N,
                "gpDistricts": {"total": 2500}, "dentalDistricts": {"total": 2500},
            }],
            "unplaced": {},
            "settlements": {"X": [[i] for i in range(self.N)]},
        }

    def test_refuses_a_wrong_number_of_districts(self):
        with pytest.raises(ParseError, match="districts, expected"):
            dp.guard(self.base())

    def test_refuses_a_district_without_a_seat(self, monkeypatch):
        monkeypatch.setattr(dp, "DISTRICTS", 1)
        out = self.base()
        out["districts"][0]["seat"] = ""
        with pytest.raises(ParseError, match="no seat"):
            dp.guard(out)

    def test_refuses_states_that_do_not_cover_the_settlements(self, monkeypatch):
        monkeypatch.setattr(dp, "DISTRICTS", 1)
        out = self.base()
        out["districts"][0]["gpFilled"] = 0
        with pytest.raises(ParseError, match="states cover"):
            dp.guard(out)


class TestShippedFile:
    """The file the site actually loads."""

    @pytest.fixture(scope="class")
    @classmethod
    def data(cls):
        if not dp.OUT.exists():
            pytest.skip("districts.json not built")
        return json.loads(dp.OUT.read_text(encoding="utf-8"))

    def test_has_every_district_of_the_country(self, data):
        assert len(data["districts"]) == dp.DISTRICTS
        assert sum(d["settlements"] for d in data["districts"]) == 3177

    def test_every_district_knows_its_seat_and_county(self, data):
        for d in data["districts"]:
            assert d["seat"] and d["county"], d["name"]

    def test_the_capital_is_twenty_three_rows(self, data):
        assert sum(1 for d in data["districts"] if d["isCapital"]) == 23

    def test_the_gp_districts_all_land_somewhere(self, data):
        placed = sum((d.get("gpDistricts") or {}).get("total", 0)
                     for d in data["districts"])
        assert placed + data["unplaced"].get("gp", 0) >= 6000
