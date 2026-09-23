"""Survival, coverage and the composite index: the arithmetic that must hold."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import composite
import coverage
import survival
from parse_dental import ParseError


def test_kaplan_meier_matches_a_hand_computed_curve():
    # four spells: refilled at 1, 2 and 4 months, one censored at 3
    rows = [
        {"months": 1, "censored": False}, {"months": 2, "censored": False},
        {"months": 3, "censored": True}, {"months": 4, "censored": False},
    ]
    c = survival.curve(rows)
    points = {p["month"]: p["survival"] for p in c["points"]}
    assert points[1] == pytest.approx(0.75)          # 1 - 1/4
    assert points[2] == pytest.approx(0.5)           # 0.75 * (1 - 1/3)
    assert points[3] == pytest.approx(0.5)           # censored, no drop
    assert points[4] == pytest.approx(0.0)           # the last one refilled
    assert (c["refilled"], c["stillOpen"]) == (3, 1)
    assert c["median"] == 2


def test_a_censored_spell_leaves_the_risk_set_without_being_an_event():
    rows = [{"months": 2, "censored": True}, {"months": 5, "censored": False}]
    c = survival.curve(rows)
    at = {p["month"]: p["atRisk"] for p in c["points"]}
    assert at[2] == 2 and at[3] == 1
    assert c["points"][2]["survival"] == 1.0


def test_population_bands_follow_the_boundaries():
    assert survival.population_band(999) == "<1000"
    assert survival.population_band(1000) == "1000-3000"
    assert survival.population_band(10000) == "10000+"
    assert survival.population_band(None) == "ismeretlen"


def test_percentiles_are_ranks_not_values():
    assert composite.percentiles([1.0, 2.0, 3.0]) == [0.0, 0.5, 1.0]
    # ties share the average rank, and a missing value stays missing
    assert composite.percentiles([5.0, 5.0, None, 9.0]) == [0.25, 0.25, None, 1.0]
    assert composite.percentiles([None, None]) == [None, None]


def test_vacancy_score_ranks_the_states():
    assert composite.vacancy_score("vacantOnly", "filled") == 1.0
    assert composite.vacancy_score("partial", "filled") == 0.5
    assert composite.vacancy_score("filled", "filled") == 0.0
    # the dental registry publishes seats only, so its evidence weighs less
    assert composite.vacancy_score("filled", "vacantOnly") == pytest.approx(0.8)


def test_weights_sum_to_one():
    assert sum(composite.WEIGHTS.values()) == pytest.approx(1.0)


def test_coverage_guard_catches_a_class_that_contradicts_itself():
    rows = [{"kshId": "00001", "settlement": "X", "county": "Y", "district": "",
             "population": 100, "filled": 1, "vacant": 1, "dissolved": 0,
             "class": "filled", "isSeat": False, "youngShare": None,
             "oldShare": None, "old": None}]
    out = {"schemaVersion": 1, "dataMonth": "2026-09", "kinds": {"gp": {
        "servedListPublished": True,
        "stats": coverage.summarise(rows, set()),
        "counties": coverage.by_county(rows),
        "series": [],
        "settlements": rows,
    }}}
    out["kinds"]["gp"]["stats"]["settlements"] = 3178
    out["kinds"]["gp"]["stats"]["byClass"]["filled"] = 3178
    out["kinds"]["gp"]["stats"]["populationByClass"]["filled"] = 100
    out["kinds"]["gp"]["counties"][0]["settlements"] = 3178
    with pytest.raises(ParseError, match="filled and vacant"):
        coverage.guard(out)
