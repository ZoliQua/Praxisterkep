"""Backfill historical months from a local collection of NEAK files.

Usage:
  python etl/backfill.py --source-dir "/path/to/collection" [--dry-run]

For every month found in the collection:
  1. copy the source files into data/raw/YYYY-MM/ under canonical names
     (the git-tracked audit trail; existing files are never overwritten),
  2. parse them with the generation-aware parsers,
  3. build a monthly snapshot WITHOUT geocoding requests (coordinates are
     attached from the existing cache where the address is already known),
  4. validate and write data/YYYY-MM/{kind}.json.

Months that already have a snapshot (e.g. the live current month) are skipped.
Statement months inside PDFs are checked against the filename month; XLSX
files carry no statement month, so the filename is trusted (they were saved
by their publication month).

When both a spreadsheet and a PDF exist for the same month, the spreadsheet
wins (native cell types, no table-extraction risk). PDF registries are not
parsed — a month without a spreadsheet registry gets a null denominator
(rates are never guessed; see build_snapshot).

Finally data/timeseries.json and data/history.json are regenerated from the
full archive.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import parse_dental
import parse_gp
import parse_registry
from build import (
    DATA_DIR,
    attach_geocodes,
    build_history,
    build_snapshot,
    rebuild_timeseries,
)
from geocode import load_cache
from validate import ValidationError, validate_records, validate_snapshot, validate_statement_month

# category -> (filename regex, canonical raw name stem)
PATTERNS = [
    ("dental_vacant", re.compile(r"^Betoltetlen_fogorvosi_szolgalatok_(\d{4})(\d{2})\.(xlsx|pdf)$")),
    ("dental_vacant", re.compile(r"^Bet_ltetlen_fogorvosi_szolg_latok_\(bet_ltetlen\)_(\d{4})(\d{2})\.(pdf)$")),
    ("dental_vacant_dissolved", re.compile(r"^Bet_ltetlen_fogorvosi_szolg_latok_\(megszunt\)_(\d{4})(\d{2})\.(pdf)$")),
    ("dental_registry", re.compile(r"^Fogorvosi_rendelok_(\d{4})(\d{2})\.(xls|xlsx)$")),
    ("gp_vacant", re.compile(r"^Betoltetlen_haziorvosi_szolgalatok_(\d{4})(\d{2})\.(xlsx|pdf)$")),
    ("gp_registry", re.compile(r"^Haziorvosi_szolgalatok_(\d{4})_?(\d{2})\.(xlsx)$")),
]
SPREADSHEET_EXTS = ("xlsx", "xls")

# sanity floors: a parse yielding fewer records than this is a broken parse,
# not a real month — fail loudly instead of archiving nonsense
MIN_COUNTS = {
    "dental_vacant": 100, "gp_vacant": 200,
    "dental_registry": 2000, "gp_registry": 5000,
    "dental_vacant_dissolved": 1,
}


def inventory(source_dir: Path) -> dict[tuple[str, str], Path]:
    """{(category, YYYY-MM): file} — spreadsheets win over PDFs."""
    files: dict[tuple[str, str], Path] = {}
    for f in sorted(source_dir.iterdir()):
        if not f.is_file() or f.name.startswith(("~", ".")):
            continue
        for category, pat in PATTERNS:
            m = pat.match(f.name)
            if not m:
                continue
            key = (category, f"{m.group(1)}-{m.group(2)}")
            old = files.get(key)
            if old is None or (
                old.suffix.lstrip(".") not in SPREADSHEET_EXTS
                and m.group(3) in SPREADSHEET_EXTS
            ):
                files[key] = f
            break
    return files


def _archive(src: Path, month: str, category: str, dry_run: bool,
             copied: list[Path] | None = None) -> Path:
    target = DATA_DIR / "raw" / month / f"{category}{src.suffix.lower()}"
    if not target.exists() and not dry_run:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)
        if copied is not None:
            copied.append(target)
    return target


def _parse_vacant(kind: str, path: Path, month: str) -> list[dict]:
    mod = parse_dental if kind == "dental" else parse_gp
    if path.suffix == ".pdf":
        validate_statement_month(parse_dental.extract_statement_month(path), month)
        return mod.parse_vacant(path)
    return mod.parse_vacant_xlsx(path)


def _check_count(category: str, records: list, path: Path) -> None:
    if len(records) < MIN_COUNTS[category]:
        raise ValidationError(
            f"{path.name}: only {len(records)} records for {category} — "
            "suspicious parse, refusing to archive"
        )


def backfill_month(kind: str, month: str, files: dict, dry_run: bool) -> str:
    copied: list[Path] = []
    try:
        return _backfill_month(kind, month, files, dry_run, copied)
    except Exception:
        # a failed month must not leave unusable files in the audit archive
        for f in copied:
            f.unlink(missing_ok=True)
        raise


def _backfill_month(kind: str, month: str, files: dict, dry_run: bool,
                    copied: list[Path]) -> str:
    snapshot_file = DATA_DIR / month / f"{kind}.json"
    if snapshot_file.exists():
        return "skip (snapshot exists)"
    vacant_src = files.get((f"{kind}_vacant", month))
    if vacant_src is None:
        return "skip (no vacant list)"

    vacant_path = _archive(vacant_src, month, f"{kind}_vacant", dry_run, copied)
    dissolved_src = files.get((f"{kind}_vacant_dissolved", month))
    registry_src = files.get((f"{kind}_registry", month))
    if dry_run:
        parts = [vacant_src.suffix.lstrip(".")]
        parts.append(f"dissolved={bool(dissolved_src)}")
        parts.append(f"registry={bool(registry_src)}")
        return "would build: " + " ".join(parts)

    vacant = _parse_vacant(kind, vacant_path, month)
    _check_count(f"{kind}_vacant", vacant, vacant_path)

    dissolved: list[dict] = []
    if dissolved_src is not None:
        p = _archive(dissolved_src, month, f"{kind}_vacant_dissolved", dry_run, copied)
        validate_statement_month(parse_dental.extract_statement_month(p), month)
        dissolved = parse_dental.parse_dissolved(p)
        _check_count(f"{kind}_vacant_dissolved", dissolved, p)

    registry: list[dict] = []
    if registry_src is not None:
        p = _archive(registry_src, month, f"{kind}_registry", dry_run, copied)
        registry = (
            parse_registry.parse(p) if kind == "dental"
            else parse_gp.parse_registry(p)
        )
        _check_count(f"{kind}_registry", registry, p)

    # no Nominatim requests for history: cached coordinates only
    attach_geocodes(vacant + dissolved, load_cache())

    validate_records(vacant + dissolved, previous_count=None)
    snapshot = build_snapshot(month, kind, vacant, dissolved, registry)
    validate_snapshot(snapshot)
    snapshot_file.parent.mkdir(parents=True, exist_ok=True)
    import json
    snapshot_file.write_text(
        json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    denom = "rate" if registry else "no-denominator"
    return (f"built: vacant={len(vacant)} dissolved={len(dissolved)} "
            f"registry={len(registry)} ({denom})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    files = inventory(Path(args.source_dir))
    months = sorted({(kind, month) for (cat, month) in files
                     for kind in ("dental", "gp") if cat == f"{kind}_vacant"})
    failures = []
    for kind, month in months:
        try:
            result = backfill_month(kind, month, files, args.dry_run)
        except Exception as exc:  # fail loudly at the end, keep going per month
            result = f"FAILED: {exc}"
            failures.append((kind, month, exc))
        print(f"{month} {kind:6s} {result}")
    if not args.dry_run:
        print(f"timeseries: {rebuild_timeseries()}")
        print(f"history:    {build_history()}")
    if failures:
        raise SystemExit(f"{len(failures)} month(s) failed — see log above")


if __name__ == "__main__":
    main()
