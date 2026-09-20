"""Geocode the EESZT licensed premises (source H) into the shared cache.

Usage:
  python etl/geocode_eeszt.py [--limit N]

Reads data/eeszt.json, collects every unique licensed-premises address and
geocodes the ones missing from etl/geocode_cache.json (same key format as
the NEAK sites: "<postal> <settlement>, <address>"). Nominatim policy is
respected (max 1 request/second); results are written to the cache after
every address, so an interrupted run resumes where it stopped.

Street-level miss -> settlement centroid, flagged geoApprox=True (the
centroid is memoised per settlement so it is fetched only once).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from geocode import _query, load_cache, normalize_street, save_cache

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    premises: dict[str, tuple[str, str, str]] = {}

    def want(postal, settlement, address) -> None:
        postal, settlement, address = postal or "", settlement or "", address or ""
        if settlement and address:  # a licence without premises cannot be geocoded
            premises[f"{postal} {settlement}, {address}"] = (postal, settlement, address)

    data = json.loads((ROOT / "data" / "eeszt.json").read_text(encoding="utf-8"))
    for e in data["praxes"].values():
        if "l" in e:
            want(e["l"][0], e["l"][1], e["l"][2])

    # the non-district dental services (source C): licensed premises where the
    # EESZT match succeeded, and the registry's own surgery address otherwise
    extra_path = ROOT / "data" / "dental_extra.json"
    if extra_path.exists():
        extra = json.loads(extra_path.read_text(encoding="utf-8"))
        for s in extra["services"]:
            lic = s.get("licence")
            if lic:
                want(lic["postalCode"], lic["settlement"], lic["address"])
            for site in s.get("sites", [{"postalCode": s["postalCode"],
                                         "settlement": s["settlement"],
                                         "address": s["address"]}]):
                want(site["postalCode"], site["settlement"], site["address"])

    cache = load_cache()
    todo = [k for k in premises if k not in cache]
    if args.limit:
        todo = todo[:args.limit]
    print(f"{len(premises)} premises, {len(premises) - len(todo)} cached, {len(todo)} to geocode")

    centroids: dict[str, dict | None] = {}
    started = time.time()
    exact = approx = failed = 0
    for i, key in enumerate(todo, 1):
        postal, sett, addr = premises[key]
        city = "Budapest" if sett.startswith("Budapest") else sett
        try:
            result = _query({"street": normalize_street(addr), "city": city,
                             "postalcode": postal})
            if result is None:
                result = _query({"street": normalize_street(addr), "city": city})
            if result is not None:
                result["geoApprox"] = False
                exact += 1
            else:
                ckey = f"{postal}|{city}"
                if ckey not in centroids:
                    c = _query({"city": city, "postalcode": postal}) or _query({"city": city})
                    centroids[ckey] = c
                c = centroids[ckey]
                result = {**c, "geoApprox": True} if c else None
                if result:
                    approx += 1
                else:
                    failed += 1
        except Exception as exc:  # noqa: BLE001 — transient network errors
            print(f"  WARNING {key}: {exc}; retrying later")
            time.sleep(30)
            continue
        cache[key] = result
        save_cache(cache)
        if i % 100 == 0:
            rate = i / (time.time() - started)
            left = (len(todo) - i) / rate / 60
            print(f"  {i}/{len(todo)} exact={exact} approx={approx} failed={failed} "
                  f"~{left:.0f} min left", flush=True)
    print(f"done: exact={exact} approx={approx} failed={failed}")


if __name__ == "__main__":
    main()
