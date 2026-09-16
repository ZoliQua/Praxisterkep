from parse_ksh import KshRef, load_reference, normalize_settlement


def test_normalize_budapest_variants():
    expect = "budapest 14 ker"
    assert normalize_settlement("Budapest XIV. kerület") == expect
    assert normalize_settlement("Budapest 14. ker.") == expect
    assert normalize_settlement("Budapest 14") == expect
    # the capital as a whole is NOT a kerület
    assert normalize_settlement("Budapest") == "budapest"
    assert normalize_settlement("Kásád") == "kasad"


def test_county_population_counts_budapest_once():
    ref = KshRef([
        {"name": "Budapest", "kshId": "13578", "county": "Budapest",
         "district": "", "population": 100, "isDistrictOfCapital": False},
        {"name": "Budapest 01. ker.", "kshId": "09566", "county": "Budapest",
         "district": "Budapest 01. ker.", "population": 40, "isDistrictOfCapital": True},
        {"name": "Zalaegerszeg", "kshId": "25876", "county": "Zala",
         "district": "Zalaegerszegi", "population": 55, "isDistrictOfCapital": False},
    ])
    assert ref.county_population == {"Budapest": 100, "Zala": 55}
    assert ref.country_population == 155
    assert ref.lookup("Budapest I. kerület")["kshId"] == "09566"


def test_real_reference_when_archived():
    ref = load_reference()
    assert ref is not None, "gazetteer must be archived under data/raw/ksh/"
    assert 9_000_000 < ref.country_population < 10_500_000
    assert len(ref.county_population) == 20
    hit = ref.lookup("Vasvár")
    assert hit and hit["county"] == "Vas" and hit["population"] > 0
