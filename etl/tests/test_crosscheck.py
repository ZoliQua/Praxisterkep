"""Address/name normalisation and the guard of the cross-check."""
import pytest

from build_eeszt import EesztError
from crosscheck import (
    address_key, guard, name_match, name_tokens, settlement_key, street_core,
)


def test_address_key_irons_out_the_spelling():
    a = address_key("Pécs", "Dr. Veress Endre u. 2.")
    b = address_key("PÉCS", "Dr. Veress Endre utca 2")
    assert a == b == ("pecs", "dr veress endre utca", "2")
    # a different house number is a different key (street stays comparable)
    other = address_key("Pécs", "Dr. Veress Endre utca 4.")
    assert other[:2] == a[:2] and other[2] != a[2]


def test_budapest_districts_collapse_to_one_settlement():
    assert settlement_key("Budapest 07") == settlement_key("Budapest VII. kerület") == "budapest"
    assert settlement_key("Budaörs") == "budaors"


def test_name_tokens_drop_short_words_and_accents():
    assert name_tokens("Dr. Balatonyi Fogászati Bt.") == {"balatonyi", "fogaszati"}


def _rec(**over):
    base = {
        "id": "020066062", "source": "district-dental", "family": "dental",
        "reason": "noUnitLicence", "named": False, "settlement": "Pécs",
        "county": "Baranya", "address": "Dr. Veress Endre u. 2.", "units": "020066062",
        "verdict": "otherUnitSameProfession", "candidateCount": 1,
        "settlementLicences": 12,
        "candidates": [{
            "unit": "000040249", "licenceId": "000040249/A1/1300", "profession": "1300",
            "settlement": "Pécs", "address": "Dr. Veress Endre utca 2", "match": "address",
            "publicFunded": True, "otherUnit": True, "taxMatch": False,
        }],
    }
    base.update(over)
    return {"records": [base], "eesztOnly": []}


def test_guard_accepts_a_consistent_suggestion():
    guard(_rec())


def test_guard_rejects_a_provider_name_without_a_named_physician():
    with pytest.raises(EesztError, match="provider name"):
        guard(_rec(provider="Minta Bt."))


def test_guard_rejects_a_verdict_without_a_candidate():
    with pytest.raises(EesztError, match="verdict without a candidate"):
        guard(_rec(candidates=[], candidateCount=0))


def test_guard_rejects_candidates_under_a_none_verdict():
    with pytest.raises(EesztError, match="candidates under a 'none' verdict"):
        guard(_rec(verdict="none"))


def test_guard_rejects_an_unknown_verdict():
    with pytest.raises(EesztError, match="unknown verdict"):
        guard(_rec(verdict="looksAboutRight"))


def test_street_core_bridges_an_abbreviated_forename():
    # NEAK writes the middle initial, the licence register leaves it out
    assert street_core("Ajka", "Semmelweis I. u. 1.") == ("ajka", "semmelweis", "utca", "1")
    assert street_core("Ajka", "Semmelweis utca 1.") == ("ajka", "semmelweis", "utca", "1")
    # a title is not the street's name either
    assert street_core("Pécs", "Dr. Veress Endre u. 2.")[1] == "veress"
    # the street type still separates two different streets
    assert street_core("X", "Kossuth tér 1") != street_core("X", "Kossuth utca 1")


def test_name_match_ignores_the_legal_form():
    assert name_match("DeveMed Kft.", "DeveMed Korlátolt Felelősségű Társaság") == 1.0
    assert name_match("Minta Kft.", "Példa Korlátolt Felelősségű Társaság") == 0.0
    # agreeing on nothing but the legal form proves nothing
    assert name_match("Orvosi Bt.", "Fogorvosi Betéti Társaság") == 0.0


def test_guard_rejects_an_unknown_match_basis():
    out = _rec()
    out["records"][0]["candidates"][0]["match"] = "vibes"
    with pytest.raises(EesztError, match="unknown match basis"):
        guard(out)
