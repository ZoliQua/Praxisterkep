"""Backfill OKFŐ long-term vacancy flags for archived months from the
Wayback Machine.

Usage:
  python etl/backfill_okfo.py [--cdx-dir DIR] [--sleep 2.0] [--dry-run]

For each kind, every archived Wayback snapshot of the OKFŐ long-term list
is fetched (original bytes, cached under data/raw/okfo_wayback/), its
"Aktuális: YYYY. hónap N." statement month extracted, and — where that
month exactly matches an archived data/YYYY-MM snapshot that does not yet
carry longTermAsOf — the praxes are flagged with the same
settlement+type+vacantSince matcher the live pipeline uses. County and
national longTerm counts are recomputed and the snapshot re-validated
before writing. Months without a matching capture stay untouched — the
flag is never guessed.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

import parse_okfo
from validate import validate_snapshot

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "raw" / "okfo_wayback"
CDX_URL = ("https://web.archive.org/cdx/search/cdx?url=alapellatas.okfo.gov.hu/"
           "tajekoztato-a-tartosan-betoltetlen-{slug}-korzetekrol/"
           "&fl=timestamp,statuscode,length&collapse=digest")
SNAP_URL = ("https://web.archive.org/web/{ts}id_/https://alapellatas.okfo.gov.hu/"
            "tajekoztato-a-tartosan-betoltetlen-{slug}-korzetekrol/")
SLUGS = {"dental": "fogorvosi", "gp": "haziorvosi"}
HEADERS = {"User-Agent": "OEP-Alapellatas/1.0 (+https://github.com/ZoliQua/OEP-Alapellatas)"}


def cdx_list(kind: str, cdx_dir: Path | None) -> list[str]:
    if cdx_dir is not None:
        cached = cdx_dir / f"{SLUGS[kind]}.txt"
        if cached.exists():
            text = cached.read_text(encoding="utf-8")
            return [ln.split()[0] for ln in text.splitlines()
                    if ln and ln.split()[1] == "200"]
    resp = requests.get(CDX_URL.format(slug=SLUGS[kind]), headers=HEADERS, timeout=120)
    resp.raise_for_status()
    return [ln.split()[0] for ln in resp.text.splitlines()
            if ln and ln.split()[1] == "200"]


def fetch_snapshot(kind: str, ts: str, sleep: float) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / f"{kind}_{ts}.html"
    if target.exists():
        return target
    last: Exception | None = None
    for attempt in range(4):
        try:
            resp = requests.get(SNAP_URL.format(ts=ts, slug=SLUGS[kind]),
                                headers=HEADERS, timeout=120)
            resp.raise_for_status()
            target.write_bytes(resp.content)
            time.sleep(sleep)
            return target
        except Exception as exc:  # noqa: BLE001 — connection-refused bans pass
            last = exc
            time.sleep(45 * (attempt + 1))
    raise RuntimeError(f"snapshot {ts} failed after retries: {last}")


def recount(snapshot: dict, as_of: str) -> None:
    per_county: dict[str, int] = {}
    total = 0
    for p in snapshot["praxes"]:
        if p.get("longTerm"):
            per_county[p["county"]] = per_county.get(p["county"], 0) + 1
            total += 1
    for c in snapshot["counties"]:
        c["longTerm"] = per_county.get(c["name"], 0)
    snapshot["national"]["longTerm"] = total
    snapshot["longTermAsOf"] = as_of


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cdx-dir", default=None)
    parser.add_argument("--sleep", type=float, default=2.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    cdx_dir = Path(args.cdx_dir) if args.cdx_dir else None

    failures = 0
    for kind in ("dental", "gp"):
        # months that exist in the archive but have no long-term data yet
        wanted: dict[str, Path] = {}
        for d in sorted(DATA_DIR.iterdir()):
            f = d / f"{kind}.json"
            if d.is_dir() and f.exists():
                snap = json.loads(f.read_text(encoding="utf-8"))
                if not snap.get("longTermAsOf"):
                    wanted[snap["month"]] = f
        print(f"[{kind}] {len(wanted)} months without long-term data")

        # newest capture wins per statement month
        by_month: dict[str, tuple[str, Path]] = {}
        for ts in cdx_list(kind, cdx_dir):
            try:
                html = fetch_snapshot(kind, ts, args.sleep)
                as_of = parse_okfo.extract_as_of(html.read_text(encoding="utf-8", errors="replace"))
            except Exception as exc:  # noqa: BLE001 — skip broken captures
                print(f"  WARNING {ts}: {exc}")
                failures += 1
                continue
            if as_of in wanted:
                by_month[as_of] = (ts, html)

        for month, (ts, html) in sorted(by_month.items()):
            try:
                as_of, rows = parse_okfo.parse(html, kind)
                snap_file = wanted[month]
                snapshot = json.loads(snap_file.read_text(encoding="utf-8"))
                matched, unmatched = parse_okfo.apply_longterm(snapshot["praxes"], rows)
                recount(snapshot, as_of)
                validate_snapshot(snapshot)
                if args.dry_run:
                    print(f"  {month} <- {ts}: would flag {matched} (unmatched {unmatched})")
                    continue
                raw = DATA_DIR / "raw" / month / f"okfo_{kind}.html"
                if not raw.exists():
                    raw.parent.mkdir(parents=True, exist_ok=True)
                    raw.write_bytes(html.read_bytes())
                snap_file.write_text(
                    json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8",
                )
                print(f"  {month} <- {ts}: flagged {matched} praxes (unmatched {unmatched})")
            except Exception as exc:  # noqa: BLE001 — keep going per month
                print(f"  FAILED {month}: {exc}")
                failures += 1
    if failures:
        print(f"{failures} capture(s)/month(s) skipped — see warnings above")


if __name__ == "__main__":
    main()
