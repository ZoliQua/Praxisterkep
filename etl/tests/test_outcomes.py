"""The statistics behind the outcome analyses.

Each of these numbers ends up as a sentence on the page ("r = 0,44, and
0,36 with income held still"), so the arithmetic is pinned against values
worked out by hand, and the grid against a set small enough to count.
"""
from __future__ import annotations

import math

import outcomes as oc
import pytest


def test_pearson_matches_a_hand_computed_value():
    xs = [1, 2, 3, 4, 5]
    ys = [2, 4, 5, 4, 5]
    # Σ(x−3)(y−4) = 6, Σ(x−3)² = 10, Σ(y−4)² = 6 -> 6 / √60
    assert oc.pearson(xs, ys) == pytest.approx(6 / math.sqrt(60))


def test_pearson_refuses_a_constant_series():
    assert oc.pearson([1, 1, 1, 1], [1, 2, 3, 4]) is None


def test_spearman_is_one_for_any_increasing_relation():
    assert oc.spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25]) == pytest.approx(1.0)


def test_ranks_share_ties():
    assert oc._ranks([10, 20, 20, 30]) == [1, 2.5, 2.5, 4]


def test_partial_correlation_removes_a_shared_cause():
    # x and y both follow z exactly and are related only through it
    assert oc.partial(0.6, 0.6 ** 0.5, 0.6 ** 0.5) == pytest.approx(0.0, abs=1e-9)
    # with no correlation to the control, the partial is the raw r
    assert oc.partial(0.44, 0.0, 0.0) == pytest.approx(0.44)


def test_p_value_shrinks_with_n():
    assert oc.p_value(0.44, 174) < 1e-6
    assert oc.p_value(0.44, 10) > 0.05


def test_fit_recovers_a_line():
    f = oc.fit([0, 1, 2, 3], [1, 3, 5, 7])
    assert (f["slope"], f["intercept"]) == (2.0, 1.0)


def test_month_shift_crosses_years():
    assert oc._shift("2026-09", -24) == "2024-09"
    assert oc._shift("2026-01", -1) == "2025-12"


def test_grid_puts_each_district_in_one_cell():
    rows = [{"slug": f"j{i}", "capital": False, "income": inc, "gpRate": vac, "avoidable": a}
            for i, (inc, vac, a) in enumerate([
                (1, 0.0, 500), (1, 0.5, 560), (1, 0.9, 600),
                (2, 0.0, 400), (2, 0.5, 450), (2, 0.9, 480),
                (3, 0.0, 300), (3, 0.5, 330), (3, 0.9, 390)])]
    rows.append({"slug": "kerulet", "capital": True, "income": 9, "gpRate": 0.1, "avoidable": 200})
    g = oc.grid(rows, "avoidable")
    assert sum(c["n"] for row in g["cells"] for c in row) == 9      # the capital is out
    assert g["cells"][0][2]["median"] == 600                         # poorest, most vacant
    assert g["cells"][2][0]["median"] == 300                         # richest, fewest vacant
