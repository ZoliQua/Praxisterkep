"""Unit age from the licence snapshots: the summary and what the guard stops.

The module's own finding — that a unit belongs to its provider for good — is
why these tests are about unit age and never about who operated a district.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import eeszt_history
from build_eeszt import EesztError

DATES = ["2024-01-15", "2025-01-15", "2026-01-15"]


def snapshot(date, units=30000, ambiguous=0):
    return {"date": date, "rows": units * 3, "units": units,
            "licences": units * 3, "ambiguous": ambiguous}


def district(fin, first_seen, type_="HSZ"):
    return {"fin": fin, "type": type_, "county": "Baranya", "institution": "Bt.",
            "unit": f"U{fin}", "provider": "P1", "providerName": "Bt.",
            "settlement": "Szigetvár", "olderThanWindow": first_seen == DATES[0],
            "firstSeen": first_seen,
            "appearedAfter": "" if first_seen == DATES[0]
                             else DATES[DATES.index(first_seen) - 1]}


def everything():
    """Every service the register links to a unit, dated or not."""
    return ([district(f"{i:09d}", DATES[0]) for i in range(20000)]
            + [district(f"1{i:08d}", DATES[1]) for i in range(1000)]
            + [district(f"2{i:08d}", DATES[2], "FOG") for i in range(500)])


def out(districts=None, snapshots=None):
    districts = everything() if districts is None else districts
    snapshots = snapshots or [snapshot(d) for d in DATES]
    churn = [{"from": a["date"], "to": b["date"], "left": 100, "arrived": 200,
              "carried": 29900} for a, b in zip(snapshots, snapshots[1:])]
    return {"schemaVersion": 1, "snapshots": snapshots, "churn": churn,
            "stats": eeszt_history.summarise(districts, snapshots, churn),
            # as the module publishes it: only the dated rows
            "districts": [d for d in districts if not d["olderThanWindow"]]}


def test_the_summary_counts_the_window_and_the_branches():
    st = out()["stats"]
    assert st["districtsFollowed"] == 21500
    assert st["unitsOlderThanWindow"] == 20000
    assert st["unitsNewerThanWindow"] == 1500
    assert st["newByType"] == {"HSZ": 1000, "FOG": 500}
    assert st["newByDate"] == {DATES[1]: 1000, DATES[2]: 500}
    assert st["unitsLeft"] == 200 and st["unitsArrived"] == 400


def test_the_guard_accepts_a_plausible_timeline():
    eeszt_history.guard(out())


def test_a_unit_naming_two_providers_at_once_breaks_the_fold():
    snaps = [snapshot(DATES[0]), snapshot(DATES[1], ambiguous=5000),
             snapshot(DATES[2])]
    with pytest.raises(EesztError, match="more than one provider"):
        eeszt_history.guard(out(snapshots=snaps))
    # a few are tolerated: the register does carry the odd duplicate
    eeszt_history.guard(out(snapshots=[snapshot(DATES[0]),
                                       snapshot(DATES[1], ambiguous=12),
                                       snapshot(DATES[2])]))


def test_a_truncated_snapshot_is_fatal():
    snaps = [snapshot(DATES[0]), snapshot(DATES[1], units=900), snapshot(DATES[2])]
    with pytest.raises(EesztError, match="truncated"):
        eeszt_history.guard(out(snapshots=snaps))


def test_snapshots_out_of_order_are_fatal():
    snaps = [snapshot(DATES[1]), snapshot(DATES[0]), snapshot(DATES[2])]
    with pytest.raises(EesztError, match="date order"):
        eeszt_history.guard(out(snapshots=snaps))


def test_a_row_carrying_no_date_may_not_be_published():
    # a unit present in the first snapshot is older than the window, and no
    # date may be put on it — so it may not appear among the published rows
    bad = out()
    bad["districts"] = bad["districts"] + [district("999999999", DATES[0])]
    with pytest.raises(EesztError, match="do not match"):
        eeszt_history.guard(bad)
    bad["stats"]["unitsNewerThanWindow"] += 1
    bad["stats"]["districtsFollowed"] += 1
    with pytest.raises(EesztError, match="without a date"):
        eeszt_history.guard(bad)


def test_a_date_that_is_not_a_snapshot_is_fatal():
    districts = everything()
    districts[-1] |= {"firstSeen": "2025-06-01"}
    with pytest.raises(EesztError, match="not a snapshot date"):
        eeszt_history.guard(out(districts))
