"""The workforce module: pseudonymisation, turnover and portfolios."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import workforce
from risk import RiskError


def test_names_normalise_to_the_same_key_across_spellings():
    # title, order, accents and punctuation must not create a second physician
    a = workforce.key_of("Dr. Kovács Béla István")
    b = workforce.key_of("Kovacs Bela Istvan dr")
    c = workforce.key_of("István Béla Kovács")
    assert a == b == c
    assert workforce.key_of("Dr. Nagy Béla") != a


def test_the_key_is_a_pseudonym_not_the_name():
    key = workforce.key_of("Dr. Kovács Béla")
    assert len(key) == 12 and key.isalnum()
    assert "kovacs" not in key and "bela" not in key


def test_an_empty_name_yields_no_key():
    assert workforce.key_of("") == ""
    assert workforce.key_of("Dr.") == ""


def test_portfolio_bands_split_at_four():
    portfolios = [{"districts": n} for n in (1, 1, 2, 3, 4, 7)]
    bands = {b["band"]: b for b in workforce.portfolio_bands(portfolios)}
    assert bands["1"]["physicians"] == 2
    assert bands["2"]["physicians"] == 1
    assert bands["4+"]["physicians"] == 2
    assert bands["4+"]["districts"] == 11


def test_guard_stops_a_name_in_the_output():
    out = {"schemaVersion": 1, "dataMonth": "2026-09", "kinds": {"gp": {
        "months": ["2026-09"], "archiveMonths": 0,
        "stats": {"districtsObserved": 1200, "districtsHeldToday": 1,
                  "physicians": 1, "multiDistrictPhysicians": 0,
                  "districtsInMultiHands": 0, "largestPortfolio": 1,
                  "districtsWithAChange": 0, "changes": 0, "changeShare": 0.0,
                  "neverChanged": 1200, "crossCountyPhysicians": 0},
        "counties": [], "portfolioBands": [{"band": "1", "physicians": 1, "districts": 1}],
        "portfolios": [], "districts": [{"id": "1", "doctor": "Dr. Kovács Béla"}],
    }}}
    with pytest.raises(RiskError, match="name reached the output"):
        workforce.guard(out)
