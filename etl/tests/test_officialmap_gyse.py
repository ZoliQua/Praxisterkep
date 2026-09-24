"""The official FIN→provider comparison and the medical-aid register."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import gyse
import officialmap
from build_eeszt import EesztError, resolve


def test_verdicts_cover_every_combination():
    assert officialmap.verdict_of(["a"], ["a"]) == "agree"
    assert officialmap.verdict_of(["a"], ["b"]) == "differ"
    assert officialmap.verdict_of(["a", "b"], ["b"]) == "agree"  # any overlap counts
    assert officialmap.verdict_of([], ["b"]) == "onlyOfficial"
    assert officialmap.verdict_of(["a"], []) == "onlyOurs"
    assert officialmap.verdict_of([], []) == "neither"


def row(**over):
    base = {"fin": "010090001", "group": "gp", "settlement": "X", "county": "Y",
            "neakCode": "0001", "licenceSource": "code", "ourProviderIds": ["111111"],
            "ourProvider": "Ours", "ourLicenceIds": [], "ourUnits": [],
            "officialProviderIds": ["111111"], "officialProvider": "Theirs",
            "officialTax": "", "officialUnits": [], "officialUnitHasLicence": False,
            "verdict": "agree"}
    base.update(over)
    return base


def test_guard_rejects_an_agreement_without_a_shared_provider():
    rows = [row(officialProviderIds=["999999"])] * 1
    rows = rows * 5001
    out = {"rows": rows, "verdicts": list(officialmap.VERDICTS),
           "stats": officialmap.overall(rows), "counties": officialmap.by_county(rows)}
    with pytest.raises(EesztError, match="agree without a shared provider"):
        officialmap.guard(out)


def test_overall_splits_by_where_our_licence_came_from():
    rows = [row(), row(fin="2", licenceSource="crosscheck", verdict="differ",
                       officialProviderIds=["999999"]),
            row(fin="3", licenceSource="none", ourProviderIds=[],
                officialProviderIds=[], verdict="neither")]
    st = officialmap.overall(rows)
    assert st["bySource"]["code"]["agree"] == 1
    assert st["bySource"]["crosscheck"]["differ"] == 1
    assert st["bySource"]["none"]["neither"] == 1
    assert st["decidable"] == 2
    assert st["agreement"] == pytest.approx(0.5)


def test_every_licensed_activity_has_a_label():
    # a new GYS code must not silently fall into "other"
    assert set(gyse.KINDS) == {f"GYS{i}" for i in range(1, 8)}
    assert set(gyse.RETAIL) <= set(gyse.KINDS.values())
    assert "repair" not in gyse.RETAIL  # a repair shop dispenses nothing


def test_county_and_settlement_keys():
    assert gyse.county_key("Vas") == "Vas"
    assert gyse.county_key("Pest vármegye") == "Pest"
    assert gyse.settlement_key("Budapest XIII. kerület") == "Budapest"


def test_snapshot_resolution_prefers_the_newest_at_or_before_a_date():
    # the registers are not always fetched on the same day; a later snapshot
    # must never be used for an earlier pinned date
    assert resolve("neak_finszolg_ext", "2099-01-01") <= "2099-01-01"
    with pytest.raises(EesztError):
        resolve("neak_finszolg_ext", "2000-01-01")
