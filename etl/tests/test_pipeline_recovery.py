"""What the monthly run does when a source is down or a file is not there.

Three October 2026 failures are the subject: the EESZT portal answered 404
for one register, the pharmacy workbook was never fetched because it is not
in the NEAK directory, and the Overpass cache the centre points need was not
in the repository at all.
"""
import datetime as dt
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pharmacy


def test_the_overpass_caches_the_centre_points_need_are_in_the_repository():
    # without these the centroids step cannot run anywhere but this machine,
    # and everything downstream of it (travel time, transit, settlements)
    # is skipped
    geo = ROOT.parent / "data" / "geo"
    for name in ("cities_overpass_cache.json", "budapest_overpass_cache.json"):
        assert (geo / name).exists(), f"{name} is missing"
    ignore = (ROOT.parent / ".gitignore").read_text(encoding="utf-8")
    assert "data/geo/*_overpass_cache.json" not in ignore


def test_the_pharmacy_step_fetches_the_workbook_it_needs(monkeypatch, tmp_path):
    """build() must not demand that someone fetched the month by hand."""
    called = {}

    def fake_fetch(month):
        called["month"] = month
        raise RuntimeError("stop here: the fetch was reached")

    monkeypatch.setattr(pharmacy, "fetch", fake_fetch)
    monkeypatch.setattr(pharmacy, "RAW_DIR", tmp_path)
    with pytest.raises(RuntimeError, match="the fetch was reached"):
        pharmacy.build("2026-10")
    assert called["month"] == "2026-10"


def test_an_eeszt_outage_falls_back_to_the_archive_but_not_for_ever():
    """The age rule the run applies when a register will not download."""
    from run import EESZT_MAX_AGE_DAYS  # noqa: PLC0415 — module-level import pulls in the whole ETL

    today = dt.date(2026, 10, 7)
    nine_days = (today - dt.date(2026, 9, 28)).days
    assert nine_days <= EESZT_MAX_AGE_DAYS      # September's register is usable
    old = (today - dt.date(2026, 7, 1)).days
    assert old > EESZT_MAX_AGE_DAYS             # July's is not
