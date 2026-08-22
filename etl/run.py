"""Pipeline entrypoint: fetch -> parse -> geocode -> validate -> build.

Usage: python etl/run.py --month 2026-08 [--skip-geocode]
MVP scope: dental only (see CLAUDE.md).
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build import attach_geocodes, build_snapshot, write_outputs
from fetch_neak import fetch_month
from geocode import geocode_site, load_cache
from parse_dental import extract_statement_month, parse_dissolved, parse_vacant
from parse_registry import parse as parse_registry
from validate import (
    previous_month_count,
    validate_records,
    validate_snapshot,
    validate_statement_month,
)

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", default=date.today().strftime("%Y-%m"))
    parser.add_argument(
        "--skip-geocode", action="store_true",
        help="use only cached coordinates (no Nominatim requests)",
    )
    args = parser.parse_args()
    month = args.month

    print(f"[1/5] fetch {month}")
    fetch_month(month)
    raw = RAW_DIR / month

    print("[2/5] parse")
    for pdf in ("dental_vacant.pdf", "dental_vacant_dissolved.pdf"):
        validate_statement_month(extract_statement_month(raw / pdf), month)
    vacant = parse_vacant(raw / "dental_vacant.pdf")
    dissolved = parse_dissolved(raw / "dental_vacant_dissolved.pdf")
    registry = parse_registry(raw / "dental_registry.xls")
    print(f"      vacant={len(vacant)} dissolved={len(dissolved)} registry={len(registry)}")

    print("[3/5] geocode")
    cache = load_cache()
    if not args.skip_geocode:
        for r in vacant + dissolved:
            for s in r["sites"]:
                geocode_site(s["postalCode"], s["settlement"], s["address"], cache)
    attach_geocodes(vacant + dissolved, cache)

    print("[4/5] validate")
    validate_records(vacant + dissolved, previous_month_count(month))
    snapshot = build_snapshot(month, vacant, dissolved, registry)
    validate_snapshot(snapshot)

    print("[5/5] build")
    for path in write_outputs(snapshot):
        print(f"      wrote {path}")
    print("done")


if __name__ == "__main__":
    main()
