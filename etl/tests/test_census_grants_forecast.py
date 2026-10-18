"""The census shares, the grant-list reader and the vacancy forecast."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import forecast
import ksh_census
import neak_grants
import outcomes
from parse_dental import ParseError


# ------------------------------------------------------------------ census

def full_cells(**over):
    cells = {
        "NEME_KEV1": 1000, "Y_LT10": 100, "Y10-19": 100, "LISK5": 160,
        "EMP": 450, "UNE": 30, "INACI": 250, "INACE": 120,
        "DIGI0": 150, "DIGI1": 300, "DIGI2": 300, "DIGI3": 190,
        "KOMF_TOTAL": 400, "KOMF_COMF1": 300, "KOMF_COMF2": 80,
        "KOMF_COMF3": 10, "KOMF_COMF4": 8, "KOMF_COMF5": 2,
        "H1": 120, "H2": 130, "H3": 70, "H4": 50, "H5": 20, "HGE6": 10, "HO_65": 110,
    }
    cells.update(over)
    return cells


def test_census_shares():
    m = ksh_census.measures(full_cells())
    assert m["degree"] == pytest.approx(160 / 800, abs=1e-4)   # per resident aged 20+
    assert m["employed"] == pytest.approx(450 / 850, abs=1e-4)
    assert m["noDigital"] == pytest.approx(150 / 940, abs=1e-4)
    assert m["poorHousing"] == pytest.approx(20 / 400, abs=1e-4)
    assert m["elderlyOnly"] == pytest.approx(110 / 400, abs=1e-4)


def test_suppressed_cell_leaves_only_its_measure_null():
    m = ksh_census.measures(full_cells(DIGI2=None))
    assert m["noDigital"] is None
    assert m["degree"] is not None and m["employed"] is not None


def test_poor_housing_recovered_by_identity():
    # the small cells hidden, the large ones published: total − full − plain
    m = ksh_census.measures(full_cells(KOMF_COMF4=None, KOMF_COMF5=None))
    assert m["poorHousing"] == pytest.approx(20 / 400, abs=1e-4)


def test_comfort_levels_must_add_up():
    with pytest.raises(ParseError):
        ksh_census.measures(full_cells(KOMF_COMF1=301))


# ------------------------------------------------------------------ grants

def test_roman_kerulet():
    assert neak_grants._roman("XI") == 11
    assert neak_grants._roman("XIX") == 19
    assert neak_grants._roman("IV") == 4
    assert neak_grants._roman("XXIII") == 23


def test_bare_folds_accents_and_case():
    assert neak_grants._bare("BORSOD-ABAUJ-ZEMPLÉN") == neak_grants._bare("Borsod-Abaúj-Zemplén")


@pytest.fixture(scope="module")
def places():
    try:
        return neak_grants.Places()
    except ParseError:
        pytest.skip("the KSH gazetteer is not built")


@pytest.mark.parametrize("raw,expected", [
    ("Komárom-E.", "Komárom-Esztergom"),
    ("P E S T", "Pest"),
    ("Borsod-Abaúj Zemplén", "Borsod-Abaúj-Zemplén"),
    ("Jász-Nagykun-\nSzolnok", "Jász-Nagykun-Szolnok"),
    ("Csongrád", "Csongrád-Csanád"),
])
def test_county_spellings(places, raw, expected):
    assert places.county(raw) == expected


def test_settlement_corrections(places):
    entry, fixes = places.settlement("Pest", "Budapest, XXI.")
    assert entry["name"] == "Budapest 21. ker." and fixes == ["county"]
    entry, fixes = places.settlement("Budapest", "Szeged")
    assert entry["county"] == "Csongrád-Csanád" and fixes == ["county"]
    entry, fixes = places.settlement("Békés", "Gyomaenrőd")
    assert entry["name"] == "Gyomaendrőd" and fixes == ["settlement"]
    with pytest.raises(ParseError):
        places.settlement("Pest", "Nincsilyenfalva")


@pytest.mark.parametrize("key", list(neak_grants.FILES))
def test_every_archived_list_parses_without_names(places, key):
    path = neak_grants.RAW / neak_grants._file_name(key)
    if not path.exists():
        pytest.skip("grant lists not archived")
    rows = neak_grants.parse(path, *key, places)
    assert rows and [r["seq"] for r in rows] == list(range(1, len(rows) + 1))
    # the winners' names, read straight from the PDF table, must appear in
    # no field ("Dr. Lumniczer S. u." is a street and may)
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        names = {" ".join(str(c).replace("*", "").split())
                 for page in pdf.pages for t in page.extract_tables() for row in t
                 for c in [[x for x in row if x not in (None, "")][1:2] or [None]][0:1]
                 if c and str(c).strip()}
    assert names
    for r in rows:
        assert "name" not in r
        for v in r.values():
            assert not (isinstance(v, str) and v in names)


def snap(month, vacant=(), filled=()):
    return {"month": month,
            "vacant": [{"id": f, "vacantSince": "2020-01",
                        "sites": [{"settlement": "Falu", "address": "Fő u. 1."}]} for f in vacant],
            "filled": [{"id": f, "settlement": "Falu", "address": "Fő u. 1."} for f in filled]}


WINNER = {"year": 2021, "settlement": "Falu", "address": "Fő u. 1."}


def test_match_single_vacant_district():
    snaps = [snap("2021-02", vacant=["A"], filled=["B"]), snap("2022-06", filled=["A", "B"])]
    fins, how, since = neak_grants.match(WINNER, snaps)
    assert (fins, how, since) == (["A"], "vacant", "2020-01")


def test_shared_address_resolved_by_who_left_the_vacant_list():
    snaps = [snap("2021-02", vacant=["A", "C"]),
             snap("2022-06", vacant=["C"], filled=["A"])]
    fins, how, _ = neak_grants.match(WINNER, snaps)
    assert (fins, how) == (["A"], "vacant")


def test_shared_address_left_ambiguous():
    snaps = [snap("2021-02", vacant=["A", "C"]), snap("2022-06", filled=["A", "C"])]
    fins, how, _ = neak_grants.match(WINNER, snaps)
    assert how == "ambiguous" and fins == ["A", "C"]


def test_registry_fallback_needs_a_single_district():
    one = [snap("2021-06", filled=["A"])]
    assert neak_grants.match(WINNER, one)[:2] == (["A"], "registry")
    two = [snap("2021-06", filled=["A", "B"])]
    assert neak_grants.match(WINNER, two)[1] == "ambiguous"


def test_status_now():
    latest = {"filledIds": {"A"}, "vacantIds": {"B"}}
    assert neak_grants.status_now(["A"], latest) == "filled"
    assert neak_grants.status_now(["B"], latest) == "vacant"
    assert neak_grants.status_now(["Z"], latest) == "gone"


# ---------------------------------------------------------------- forecast

CURVE = [{"month": m, "survival": s} for m, s in enumerate([1.0, 0.9, 0.8, 0.7, 0.6])]


def test_refill_chance_is_conditional():
    # open for 1 month (S = 0.9); after 2 more, S = 0.7
    assert forecast.refill_chance(CURVE, 1, 2) == pytest.approx(1 - 0.7 / 0.9)


def test_refill_chance_beyond_the_curve_is_zero():
    assert forecast.refill_chance(CURVE, 10, 12) == 0.0


def test_tally_flows_add_up():
    t = forecast.Tally()
    for _ in range(10):
        t.add_filled(0.1)
    t.add_vacant(CURVE, 0)
    out = t.out()
    assert out["expectedNew"] == pytest.approx(1.0)
    assert out["vacantIn12"] == pytest.approx(1 - (1 - 0.6) + 1.0, abs=0.1)
    assert out["path"][0] == pytest.approx(1.0)
    low, high = out["vacantIn12Band"]
    assert low <= out["vacantIn12"] <= high


# ---------------------------------------------------------------- outcomes

def test_second_order_partial_matches_first_order_when_w_is_unrelated():
    # with w uncorrelated with everything, r_xy·zw = r_xy·z
    first = outcomes.partial(0.5, 0.3, 0.4)
    assert outcomes.partial2(0.5, 0.3, 0.4, 0.0, 0.0, 0.0) == pytest.approx(first)
