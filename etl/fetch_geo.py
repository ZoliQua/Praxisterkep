"""Fetch and simplify járás (district) boundaries from OpenStreetMap.

Usage:
  python etl/fetch_geo.py [--cache /path/to/overpass.json]

Queries Overpass for every Hungarian admin_level=7 boundary (the 174
járások), assembles polygons with osm2geojson, simplifies them with
shapely, and writes data/geo/jaras.geojson with {"name": "Ajkai"}-style
properties (the " járás" suffix is stripped to match the NEAK district
names). Budapest has no járás subdivision in this dataset — the capital's
polygon is copied from data/geo/counties.geojson as one "Budapest"
feature (NEAK's kerület-level districts are aggregated onto it).

The raw Overpass response is cached next to the output for re-runs, but
only the simplified GeoJSON is committed (same policy as counties.geojson).
© OpenStreetMap contributors, ODbL.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
GEO_DIR = ROOT / "data" / "geo"
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]
QUERY = """
[out:json][timeout:300];
area["ISO3166-1"="HU"][admin_level=2]->.hu;
rel(area.hu)["admin_level"="7"]["boundary"="administrative"];
out geom;
"""
HEADERS = {"User-Agent": "OEP-Alapellatas/1.0 (+https://github.com/ZoliQua/OEP-Alapellatas)"}
SIMPLIFY_TOLERANCE = 0.0025  # degrees; matches the counties layer's weight


def fetch(cache: Path) -> dict:
    if cache.exists():
        print(f"using cached Overpass response: {cache}")
        return json.loads(cache.read_text(encoding="utf-8"))
    last_error: Exception | None = None
    for url in OVERPASS_MIRRORS:
        print(f"querying {url} (this can take a minute)…")
        try:
            resp = requests.post(url, data={"data": QUERY}, headers=HEADERS, timeout=600)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001 — try the next mirror
            print(f"  failed: {exc}")
            last_error = exc
            continue
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(data), encoding="utf-8")
        return data
    raise SystemExit(f"every Overpass mirror failed — last error: {last_error}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", default=str(GEO_DIR / "jaras_overpass_cache.json"))
    args = parser.parse_args()

    import osm2geojson
    from shapely.geometry import mapping, shape

    data = fetch(Path(args.cache))
    fc = osm2geojson.json2geojson(data)
    features = []
    for f in fc["features"]:
        tags = f.get("properties", {}).get("tags", {})
        name = tags.get("name", "")
        if not name.endswith(" járás"):
            continue
        geom = shape(f["geometry"]).simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        features.append({
            "type": "Feature",
            "properties": {"name": name.removesuffix(" járás")},
            "geometry": mapping(geom),
        })
    if len(features) < 170:
        sys.exit(f"only {len(features)} járás polygons assembled — refusing to publish")

    counties = json.loads((GEO_DIR / "counties.geojson").read_text(encoding="utf-8"))
    budapest = next(
        (f for f in counties["features"]
         if str(f["properties"].get("name", "")).upper() == "BUDAPEST"),
        None,
    )
    if budapest is not None:
        features.append({
            "type": "Feature",
            "properties": {"name": "Budapest"},
            "geometry": budapest["geometry"],
        })

    features.sort(key=lambda f: f["properties"]["name"])
    out = GEO_DIR / "jaras.geojson"
    out.write_text(
        json.dumps({"type": "FeatureCollection", "features": features},
                   ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    size = out.stat().st_size / 1024
    print(f"wrote {out} — {len(features)} features, {size:.0f} KiB")


if __name__ == "__main__":
    main()
