"""Pipeline entrypoint: fetch -> parse -> geocode -> validate -> build.

Usage: python etl/run.py --month 2026-08 [--kind dental|gp|all] [--skip-geocode]
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import parse_dental
import parse_gp
import parse_registry
from build import attach_geocodes, build_history, build_snapshot, write_outputs
from fetch_neak import fetch_month
from geocode import geocode_site, load_cache
from validate import (
    previous_month_count,
    validate_records,
    validate_snapshot,
    validate_statement_month,
)

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"


def _parse_kind(kind: str, raw: Path, month: str) -> tuple[list, list, list]:
    """Returns (vacant, dissolved, registry) for one kind."""
    if kind == "dental":
        for pdf in ("dental_vacant.pdf", "dental_vacant_dissolved.pdf"):
            validate_statement_month(
                parse_dental.extract_statement_month(raw / pdf), month
            )
        return (
            parse_dental.parse_vacant(raw / "dental_vacant.pdf"),
            parse_dental.parse_dissolved(raw / "dental_vacant_dissolved.pdf"),
            parse_registry.parse(raw / "dental_registry.xls"),
        )
    validate_statement_month(
        parse_dental.extract_statement_month(raw / "gp_vacant.pdf"), month
    )
    # NEAK publishes no dissolved (megszűnt) list for GP services
    return (
        parse_gp.parse_vacant(raw / "gp_vacant.pdf"),
        [],
        parse_gp.parse_registry(raw / "gp_registry.xls"),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", default=date.today().strftime("%Y-%m"))
    parser.add_argument("--kind", choices=("dental", "gp", "all"), default="all")
    parser.add_argument(
        "--skip-geocode", action="store_true",
        help="use only cached coordinates (no Nominatim requests)",
    )
    args = parser.parse_args()
    month = args.month
    kinds = ("dental", "gp") if args.kind == "all" else (args.kind,)

    print(f"[1/5] fetch {month}")
    fetch_month(month, only_kind=None)
    raw = RAW_DIR / month

    snapshots: dict[str, dict] = {}
    cache = load_cache()
    for kind in kinds:
        print(f"[2/5] parse {kind}")
        vacant, dissolved, registry = _parse_kind(kind, raw, month)
        print(f"      vacant={len(vacant)} dissolved={len(dissolved)} "
              f"registry={len(registry)}")

        print(f"[3/5] geocode {kind}")
        if not args.skip_geocode:
            for r in vacant + dissolved:
                for s in r["sites"]:
                    geocode_site(s["postalCode"], s["settlement"], s["address"], cache)
        attach_geocodes(vacant + dissolved, cache)

        print(f"[4/5] validate {kind}")
        validate_records(vacant + dissolved, previous_month_count(month, kind),
                         vacant_count=len(vacant))
        snapshot = build_snapshot(month, kind, vacant, dissolved, registry)
        validate_snapshot(snapshot)
        snapshots[kind] = snapshot

    print("[5/5] build")
    for path in write_outputs(snapshots, month):
        print(f"      wrote {path}")
    print(f"      wrote {build_history()}")
    print("done")


if __name__ == "__main__":
    main()
