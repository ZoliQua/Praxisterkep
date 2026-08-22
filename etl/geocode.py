"""Nominatim geocoding with a git-tracked cache. Max 1 request/second.

Only addresses absent from geocode_cache.json are queried.
Failed geocode -> settlement centroid fallback with geoApprox=True.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

CACHE_PATH = Path(__file__).resolve().parent / "geocode_cache.json"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Magyar-Alapellatas/0.1 (zoltan@drdul.hu)"


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict) -> None:
    CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True),
        encoding="utf-8",
    )


def geocode(address: str, cache: dict) -> dict | None:
    if address in cache:
        return cache[address]
    resp = requests.get(
        NOMINATIM,
        params={"q": address, "countrycodes": "hu", "format": "json", "limit": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    hits = resp.json()
    result = (
        {"lat": float(hits[0]["lat"]), "lon": float(hits[0]["lon"])} if hits else None
    )
    cache[address] = result
    time.sleep(1.0)  # Nominatim usage policy
    return result
