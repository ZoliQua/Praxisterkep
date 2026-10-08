"""Coordinates for the surgeries that have a doctor.

Until now only vacant and dissolved districts were geocoded: the map needed
to show where care was missing, and a filled district was a number in a
table. A street-level map of a settlement needs the opposite — where the
surgeries that do work actually stand.

Nothing here is new machinery: the same Nominatim client, the same cache file
(etl/geocode_cache.json, git-tracked), the same one request per second. It is
a separate entry point because it is a long, resumable job: the cache is
written after every hit, so an interrupted run loses nothing.

Usage:
  python etl/geocode_filled.py [--limit 500]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from geocode import geocode_site, load_cache

ROOT = Path(__file__).resolve().parent.parent


def addresses() -> list[tuple[str, str, str]]:
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    seen: set[tuple[str, str, str]] = set()
    out: list[tuple[str, str, str]] = []
    for kind in ("gp", "dental"):
        for f in latest["kinds"][kind].get("filledPraxes", []):
            key = (f.get("postalCode", ""), f.get("settlement", ""), f.get("address", ""))
            if key[2] and key not in seen:
                seen.add(key)
                out.append(key)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0,
                        help="stop after this many lookups (0 = all)")
    args = parser.parse_args()

    cache = load_cache()
    todo = [a for a in addresses()
            if f"{a[0]} {a[1]}, {a[2]}" not in cache]
    print(f"{len(todo)} addresses to look up "
          f"(cache holds {len(cache)} entries)", flush=True)

    done = exact = approx = failed = 0
    for postal, settlement, address in todo:
        if args.limit and done >= args.limit:
            break
        result = geocode_site(postal, settlement, address, cache)
        done += 1
        if result is None or result.get("lat") is None:
            failed += 1
        elif result.get("geoApprox"):
            approx += 1
        else:
            exact += 1
        if done % 100 == 0:
            print(f"  {done}/{len(todo)}: exact={exact} approx={approx} "
                  f"failed={failed}", flush=True)
    print(f"done: {done} looked up — exact={exact} approx={approx} failed={failed}")


if __name__ == "__main__":
    main()
