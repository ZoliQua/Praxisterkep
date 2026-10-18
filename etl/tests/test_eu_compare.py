import pytest

import eu_compare as e
from parse_dental import ParseError


def jsonstat(values, geos=("HU", "AT"), years=("2023", "2024"), extra=None):
    """A minimal JSON-stat answer: geo × time, with one-category extras."""
    extra = extra or {"unit": ["P_HTHAB"]}
    ids = [*extra, "geo", "time"]
    dims = {d: {"category": {"index": {c: i for i, c in enumerate(cs)},
                             "label": {c: c for c in cs}}} for d, cs in extra.items()}
    dims["geo"] = {"category": {"index": {g: i for i, g in enumerate(geos)},
                                "label": {g: f"name {g}" for g in geos}}}
    dims["time"] = {"category": {"index": {y: i for i, y in enumerate(years)}}}
    sizes = [len(extra[d]) for d in extra] + [len(geos), len(years)]
    return {"id": ids, "size": sizes, "dimension": dims,
            "value": {str(k): v for k, v in values.items()}}


def test_cube_reads_geo_by_year():
    d = jsonstat({0: 10.0, 1: 11.0, 3: 21.5})
    assert e.cube(d) == {"HU": {"2023": 10.0, "2024": 11.0}, "AT": {"2024": 21.5}}


def test_cube_refuses_an_unfixed_dimension():
    d = jsonstat({0: 1.0}, extra={"unit": ["A", "B"]})
    with pytest.raises(ParseError):
        e.cube(d)
    # picking the category explicitly is fine
    assert e.cube(d, {"unit": "A"})["HU"]["2023"] == 1.0


def test_older_share_uses_an_exact_identity_or_nothing():
    years = {"2024": None}
    counts = {b: {} for b in ["TOTAL", *e.OLD_BANDS, *e.YOUNG_BANDS]}
    counts["TOTAL"] = {"HU": {"2024": 100.0}, "SK": {"2024": 100.0}, "PL": {"2024": 100.0}}
    for b, v in zip(e.OLD_BANDS, (20.0, 15.0, 5.0), strict=True):
        counts[b]["HU"] = {"2024": v}
    # Slovakia: no 75+ band published, but every younger band is
    counts["Y55-64"]["SK"] = {"2024": 20.0}
    counts["Y65-74"]["SK"] = {"2024": 10.0}
    for b, v in zip(e.YOUNG_BANDS, (20.0, 25.0, 23.0), strict=True):
        counts[b]["SK"] = {"2024": v}
    # Poland: neither side complete -> no value rather than an understatement
    counts["Y55-64"]["PL"] = {"2024": 30.0}
    out = e.older_share(counts)
    assert out["HU"]["2024"] == 40.0
    assert out["SK"]["2024"] == 32.0
    assert "PL" not in out
    del years


def test_oecd_match_must_be_unique():
    rows = [{"REF_AREA": "HUN", "TIME_PERIOD": "2023", "OBS_VALUE": "112.1", "MEASURE": "X",
             "SEX": "_T"},
            {"REF_AREA": "HUN", "TIME_PERIOD": "2023", "OBS_VALUE": "100", "MEASURE": "X",
             "SEX": "F"},
            {"REF_AREA": "GBR", "TIME_PERIOD": "2022", "OBS_VALUE": "5", "MEASURE": "X",
             "SEX": "_T"}]
    assert e.oecd_series(rows, {"MEASURE": "X", "SEX": "_T"}) == \
        {"HU": {"2023": 112.1}, "UK": {"2022": 5.0}}
    with pytest.raises(ParseError):
        e.oecd_series(rows, {"MEASURE": "X"})


def test_clip_drops_the_outermost_regions_and_rounds():
    canary = [[[-16.0, 28.0], [-15.0, 28.0], [-15.0, 29.0], [-16.0, 28.0]]]
    budapest = [[[19.0412, 47.4], [19.2, 47.4], [19.2, 47.6], [19.0412, 47.4]]]
    out = e._clip({"type": "MultiPolygon", "coordinates": [canary, budapest]})
    assert out == {"type": "MultiPolygon",
                   "coordinates": [[[[19.04, 47.4], [19.2, 47.4], [19.2, 47.6], [19.04, 47.4]]]]}
    assert e._clip({"type": "Polygon", "coordinates": canary}) is None


def test_groups_are_inside_the_carried_countries():
    assert set(e.GROUPS["v4"]) == {"HU", "CZ", "PL", "SK"}
    assert set(e.GROUPS["cee"]) <= set(e.COUNTRIES)
    assert len(e.EU27) == 27 and "UK" not in e.EU27
    for a, b in e.BORDER_PAIRS:
        assert a.startswith("HU") and not b.startswith("HU")


def test_the_published_file_passes_its_own_guard():
    import json
    out = json.loads(e.OUT.read_text(encoding="utf-8"))
    geometry = json.loads(e.GEO_OUT.read_text(encoding="utf-8"))
    e.guard(out, geometry)
    # one publisher per country per series: only the UK is ever taken whole
    # from the OECD, and only for the workforce series it was checked on
    for key, ind in out["indicators"].items():
        assert set(ind["sourceByGeo"]) <= {"UK"}, key
        if ind["sourceByGeo"]:
            assert key in e.OECD_UK


def _mig(ref, origin, place, year, n):
    return {"MEASURE": "HW", "UNIT_MEASURE": "PS", "HEALTH_PROF": "PHYS", "REF_AREA": ref,
            "ORIGIN": origin, "TRAINING_PLACE": place, "TIME_PERIOD": year, "OBS_VALUE": str(n)}


def test_migration_reads_both_directions_and_keeps_years():
    rows = [_mig("HUN", "W", "FOREIGN", "2024", 300), _mig("HUN", "W", "DOMESTIC", "2024", 3000),
            _mig("HUN", "ROU", "FOREIGN", "2024", 200), _mig("HUN", "UKR", "FOREIGN", "2024", 50),
            # an older origin row does not mix into the 2024 parts
            _mig("HUN", "SRB", "FOREIGN", "2019", 40),
            _mig("DEU", "HUN", "FOREIGN", "2024", 120), _mig("ISR", "HUN", "FOREIGN", "2025", 90)]
    m = e.build_migration(rows)
    hu = m["inflow"]["HU"]
    assert hu["origins"] == [["RO", 200], ["UA", 50]]
    assert hu["other"] == 50 and hu["domestic"] == 3000
    assert m["outflow"]["HU"]["destinations"] == [["DE", "2024", 120], ["IL", "2025", 90]]
    assert m["outflow"]["HU"]["total"] == 210


def test_migration_parts_may_not_exceed_the_whole():
    rows = [_mig("HUN", "W", "FOREIGN", "2024", 100), _mig("HUN", "ROU", "FOREIGN", "2024", 150)]
    with pytest.raises(ParseError):
        e.build_migration(rows)


def test_the_landing_facts_are_computed_from_the_file():
    import json
    out = json.loads(e.OUT.read_text(encoding="utf-8"))
    facts = e.summary_facts(out)["facts"]
    gp = facts["gp"]
    assert gp["key"] == "gpDensity"
    assert gp["value"] == out["indicators"]["gpDensity"]["values"]["HU"][gp["year"]]
    assert 1 <= gp["rank"] <= gp["of"] <= len(e.GROUPS["cee"])
