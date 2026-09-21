"""The operating-level table: the guard that keeps a praxis row coherent."""
import pytest

from build_eeszt import EesztError
from operating import guard


def _row(**over):
    row = {
        "fin": "190090001", "group": "gp", "settlement": "Ajka", "county": "Veszprém",
        "neakCode": "M655", "provider": "DeveMed Korlátolt Felelősségű Társaság",
        "providerSource": "official", "tax": "22781110", "euszolgId": "114882",
        "units": ["001293696"], "unitCount": 1, "finUnits": ["190091045"],
        "licences": [{
            "unit": "001293696", "licenceId": "001293696/A1/6301",
            "settlement": "Ajka", "address": "Semmelweis utca 1.",
            "profession": "6301", "publicFunded": True,
        }],
        "licenceSource": "crosscheck",
    }
    row.update(over)
    return {"rows": [row], "stats": {"praxes": 1, "fromCode": 0,
                                     "fromCrosscheck": 1, "noLicence": 0}}


def test_guard_accepts_a_coherent_row():
    guard(_row())


def test_guard_rejects_a_unit_count_that_lies():
    with pytest.raises(EesztError, match="unit count"):
        guard(_row(unitCount=3))


def test_guard_rejects_a_source_that_contradicts_the_licences():
    with pytest.raises(EesztError, match="contradicts"):
        guard(_row(licences=[], licenceSource="crosscheck"))


def test_guard_accepts_a_praxis_with_no_licence_at_all():
    out = _row(licences=[], licenceSource="none", units=[], unitCount=0)
    out["stats"] = {"praxes": 1, "fromCode": 0, "fromCrosscheck": 0, "noLicence": 1}
    guard(out)


def test_guard_rejects_duplicate_praxes():
    out = _row()
    out["rows"].append(dict(out["rows"][0]))
    out["stats"]["praxes"] = 2
    out["stats"]["fromCrosscheck"] = 2
    with pytest.raises(EesztError, match="duplicate praxis"):
        guard(out)


def test_guard_rejects_sources_that_do_not_add_up():
    out = _row()
    out["stats"]["praxes"] = 5
    with pytest.raises(EesztError, match="do not add up"):
        guard(out)


def test_guard_rejects_a_unit_count_that_contradicts_the_printed_licence():
    # the financing register may link no unit at all while the cross-check
    # still finds the licence — then the count must follow what is shown
    with pytest.raises(EesztError, match="contradicts the licences"):
        guard(_row(units=[], unitCount=0))


def test_a_praxis_without_a_financing_unit_still_counts_its_licence():
    out = _row(finUnits=[])
    guard(out)
    row = out["rows"][0]
    assert row["unitCount"] == 1
    assert row["units"] == [row["licences"][0]["unit"]]
