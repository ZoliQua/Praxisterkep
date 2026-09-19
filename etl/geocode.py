"""Nominatim geocoding with a git-tracked cache. Max 1 request/second.

Only addresses absent from geocode_cache.json are queried.
Failed street-level geocode -> settlement centroid fallback with geoApprox=True.
Cache entry: {"lat": .., "lon": .., "geoApprox": bool} or null (both levels failed).
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import requests

CACHE_PATH = Path(__file__).resolve().parent / "geocode_cache.json"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "OEP-Alapellatas/1.0 (+https://github.com/ZoliQua/OEP-Alapellatas)"

# common Hungarian address abbreviations Nominatim tends to miss
_ABBREV = [
    (re.compile(r"\bu\.(?=\s|\d|$)", re.IGNORECASE), "utca"),
    (re.compile(r"\bút\.", re.IGNORECASE), "út"),
    (re.compile(r"\bkrt\.", re.IGNORECASE), "körút"),
    (re.compile(r"\bltp\.?", re.IGNORECASE), "lakótelep"),
    (re.compile(r"\bszt\.", re.IGNORECASE), "Szent"),
]


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict) -> None:
    CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True),
        encoding="utf-8",
    )


def normalize_street(address: str) -> str:
    out = address
    for pat, repl in _ABBREV:
        out = pat.sub(repl, out)
    # strip floor/door suffixes ("fsz.1.", "I/2.") that break matching
    out = re.sub(r"\b(fsz|em|ajtó)\.?.*$", "", out, flags=re.IGNORECASE).strip(" ,.")
    return out


def _query(params: dict) -> dict | None:
    resp = requests.get(
        NOMINATIM,
        params={"countrycodes": "hu", "format": "json", "limit": 1, **params},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    time.sleep(1.1)  # Nominatim usage policy: max 1 req/s
    hits = resp.json()
    if not hits:
        return None
    return {"lat": round(float(hits[0]["lat"]), 6), "lon": round(float(hits[0]["lon"]), 6)}


def geocode_site(postal: str, settlement: str, address: str, cache: dict) -> dict | None:
    """Geocode one surgery site. Returns {lat, lon, geoApprox} or None."""
    key = f"{postal} {settlement}, {address}"
    if key in cache:
        return cache[key]
    # Nominatim doesn't know "Budapest XIV. kerület" as a city; the postal
    # code already pins the district
    query_city = "Budapest" if settlement.startswith("Budapest") else settlement
    result = _query({
        "street": normalize_street(address),
        "city": query_city,
        "postalcode": postal,
    })
    if result is None:  # retry without postal code (NEAK postal data is imperfect)
        result = _query({"street": normalize_street(address), "city": query_city})
    if result is not None:
        result["geoApprox"] = False
    else:  # settlement centroid fallback, flagged as approximate
        result = _query({"city": query_city, "postalcode": postal})
        if result is None:
            result = _query({"city": query_city})
        if result is not None:
            result["geoApprox"] = True
    cache[key] = result
    save_cache(cache)  # persist incrementally: an aborted run keeps its progress
    return result
