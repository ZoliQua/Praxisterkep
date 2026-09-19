import pytest

from build_eeszt import EesztError, district_no, guard, same_place


@pytest.mark.parametrize("raw,expected", [
    ("BETÖLTETLEN - 1. körzet, Beremend", "1. körzet"),
    ("Tatabánya 8. sz. gyermek körzet.", "8. gyermek körzet"),
    ("Miskolc, 10.sz. Házi Gyermekorvosi körzet", "10. házi gyermekorvosi körzet"),
    ("2sz.körzet+Cikó", "2. körzet"),
    ("Dr. Ferencz Irén - Szigetvár, 2. felnőtt körzet", "2. felnőtt körzet"),
    ("Fogászati Ellátás", None),
    ("BETÖLTETLEN - Csányoszró", None),
])
def test_district_no_extracts_only_the_number(raw, expected):
    assert district_no(raw) == expected


def test_district_no_never_carries_a_name():
    # the physician's name before the dash must not survive extraction
    label = district_no("Dr. Makk László - Szigetvár, 1. gyermek körzet")
    assert label == "1. gyermek körzet"
    assert "dr" not in label.lower()


def test_same_place_budapest_district_matches_bare_city():
    assert same_place("Budapest", "Budapest VIII. kerület")
    assert same_place("Budapest XIV. kerület", "Budapest 14. ker.")
    assert not same_place("Kővágószőlős", "Pécs")


def _latest(filled_ids, vacant_ids):
    return {"kinds": {
        "dental": {"filledPraxes": [{"id": i} for i in filled_ids],
                   "praxes": [{"id": i} for i in vacant_ids]},
        "gp": {"filledPraxes": [], "praxes": []},
    }}


def test_guard_rejects_provider_on_vacant_district():
    out = {"praxes": {"000000002": {"k": "d", "p": "Valami Bt."}}, "settlements": {}}
    with pytest.raises(EesztError):
        guard(out, _latest(["000000001"], ["000000002"]))


def test_guard_allows_provider_on_filled_district():
    out = {"praxes": {"000000001": {"k": "d", "p": "Valami Bt.", "i": "1234"}},
           "settlements": {}}
    guard(out, _latest(["000000001"], []))


def test_guard_rejects_unknown_fields():
    out = {"praxes": {"000000002": {"k": "d", "unitName": "Dr. X rendelője"}},
           "settlements": {}}
    with pytest.raises(EesztError):
        guard(out, _latest([], ["000000002"]))


def test_guard_rejects_malformed_unmatched_reason():
    out = {"praxes": {}, "settlements": {},
           "unmatched": {"000000002": ["d", "becauseISaySo", ""]}}
    with pytest.raises(EesztError):
        guard(out, _latest([], ["000000002"]))


def test_guard_rejects_name_in_unmatched_detail():
    out = {"praxes": {}, "settlements": {},
           "unmatched": {"000000002": ["d", "otherProfession", "Dr. Kiss rendelője"]}}
    with pytest.raises(EesztError):
        guard(out, _latest([], ["000000002"]))
