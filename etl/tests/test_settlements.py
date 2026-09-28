"""Settlement profiles: the slug rules and what the guard must catch."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import settlements
from parse_dental import ParseError


def entry(name, county="Nógrád", population=1000, ksh=None, capital=False):
    return {"name": name, "county": county, "population": population,
            "kshId": ksh or f"{abs(hash(name)) % 90000 + 10000}",
            "district": "", "isDistrictOfCapital": capital}


def test_slug_strips_accents_and_punctuation():
    assert settlements.slug("Nagybárkány") == "nagybarkany"
    assert settlements.slug("Budapest 03. ker.") == "budapest-03-ker"
    assert settlements.slug("Hajdúszoboszló") == "hajduszoboszlo"


def test_accent_collisions_are_settled_by_size_then_county():
    # Komló and Kömlő both strip to "komlo": the larger keeps the plain slug
    komlo = entry("Komló", county="Baranya", population=22000, ksh="11111")
    komlo_heves = entry("Kömlő", county="Heves", population=1891, ksh="22222")
    slugs = settlements.resolve_slugs([komlo_heves, komlo])
    assert slugs["11111"] == "komlo"
    assert slugs["22222"] == "komlo-heves"


def test_a_collision_inside_one_county_falls_back_to_the_code():
    a = entry("Fóka", county="Vas", population=100, ksh="30001")
    b = entry("Fóka", county="Vas", population=100, ksh="30002")
    slugs = settlements.resolve_slugs([a, b])
    assert slugs["30001"] != slugs["30002"]
    assert len(set(slugs.values())) == 2


def test_every_settlement_gets_exactly_one_slug():
    entries = [entry(f"Falu {i}", ksh=str(40000 + i)) for i in range(50)]
    slugs = settlements.resolve_slugs(entries)
    assert len(slugs) == 50 and len(set(slugs.values())) == 50


def profile(**over):
    base = {"kshId": "17376", "slug": "aba", "settlement": "Aba",
            "county": "Fejér", "district": "Székesfehérvári", "population": 4371,
            "benefit": False, "index": {"value": 50.0, "band": "kozepes",
                                        "rank": 1, "of": 3177, "parts": {}}}
    base.update(over)
    return base


def test_guard_rejects_duplicate_slugs():
    rows = [profile() for _ in range(3100)]
    out = {"settlements": rows}
    with pytest.raises(ParseError, match="not unique"):
        settlements.guard(out)


def test_guard_rejects_a_rank_outside_the_field():
    rows = [profile(slug=f"s{i}", index={"value": 1.0, "band": "alacsony",
                                         "rank": 9999, "of": 3177, "parts": {}})
            for i in range(3100)]
    with pytest.raises(ParseError, match="rank out of range"):
        settlements.guard({"settlements": rows})


def test_guard_rejects_a_thin_country():
    with pytest.raises(ParseError, match="only 2 settlement profiles"):
        settlements.guard({"settlements": [profile(), profile(slug="b")]})
