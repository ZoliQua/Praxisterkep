"""Fetch map layers from OpenStreetMap: járás boundaries, city points and
the Budapest district boundaries.

Usage:
  python etl/fetch_geo.py [--what jaras|cities|budapest|all] [--cache PATH]

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
import collections
import json
import re
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
CITY_QUERY = """
[out:json][timeout:300];
area["ISO3166-1"="HU"][admin_level=2]->.hu;
node(area.hu)["place"~"^(city|town|village)$"]["name"];
out body;
"""
JARAS_SEAT_QUERY = """
[out:json][timeout:300];
area["ISO3166-1"="HU"][admin_level=2]->.hu;
rel(area.hu)["admin_level"="7"]["boundary"="administrative"];
node(r:"admin_centre");
out body;
"""
BUDAPEST_QUERY = """
[out:json][timeout:300];
area["ISO3166-1"="HU"][admin_level=2]->.hu;
rel(area.hu)["admin_level"="9"]["boundary"="administrative"];
out geom;
"""

# administrative facts, stable between censuses: the county seats and the
# other cities with county rank (megyei jogú város)
COUNTY_SEATS = {
    "Budapest", "Békéscsaba", "Debrecen", "Eger", "Győr", "Kaposvár",
    "Kecskemét", "Miskolc", "Nyíregyháza", "Pécs", "Salgótarján", "Szeged",
    "Székesfehérvár", "Szekszárd", "Szolnok", "Szombathely", "Tatabánya",
    "Veszprém", "Zalaegerszeg",
}
COUNTY_RANK = {"Dunaújváros", "Érd", "Hódmezővásárhely", "Nagykanizsa", "Sopron"}
# everything else needs this many residents to earn a label
TOWN_MIN_POPULATION = 20000
HEADERS = {"User-Agent": "OEP-Alapellatas/1.0 (+https://github.com/ZoliQua/OEP-Alapellatas)"}
SIMPLIFY_TOLERANCE = 0.0025  # degrees; matches the counties layer's weight


def fetch(cache: Path, query: str = QUERY) -> dict:
    if cache.exists():
        print(f"using cached Overpass response: {cache}")
        return json.loads(cache.read_text(encoding="utf-8"))
    last_error: Exception | None = None
    for url in OVERPASS_MIRRORS:
        print(f"querying {url} (this can take a minute)…")
        try:
            resp = requests.post(url, data={"data": query}, headers=HEADERS, timeout=600)
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


def build_cities(cache: Path) -> None:
    """City points for the map: county seats, county-rank cities and every
    other town of at least TOWN_MIN_POPULATION residents."""
    data = fetch(cache, CITY_QUERY)
    # the járás seats come from the admin_centre members of the district
    # relations, so no name has to be guessed from the járás name
    seats = fetch(cache.with_name("jaras_seat_overpass_cache.json"), JARAS_SEAT_QUERY)
    jaras_seats = {el["tags"]["name"] for el in seats.get("elements", [])
                   if el.get("tags", {}).get("name")}
    if len(jaras_seats) < 150:
        sys.exit(f"only {len(jaras_seats)} járás seats returned — refusing to publish")
    features = []
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name", "")
        if not name:
            continue
        try:
            population = int(re.sub(r"[^0-9]", "", tags.get("population", "")) or 0)
        except ValueError:
            population = 0
        if name in COUNTY_SEATS:
            rank = "seat"
        elif name in COUNTY_RANK:
            rank = "county"
        elif name in jaras_seats:
            rank = "jarasSeat"
        elif population >= TOWN_MIN_POPULATION:
            rank = "town"
        else:
            continue
        props = {"name": name, "rank": rank}
        if population:
            props["population"] = population
        if population >= TOWN_MIN_POPULATION:
            # the "larger towns" layer is about size, not administrative rank,
            # so a járás seat above the threshold belongs to both
            props["big"] = True
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "Point", "coordinates": [round(el["lon"], 5),
                                                          round(el["lat"], 5)]},
        })
    seats = sum(1 for f in features if f["properties"]["rank"] == "seat")
    if seats < len(COUNTY_SEATS):
        missing = COUNTY_SEATS - {f["properties"]["name"] for f in features}
        sys.exit(f"only {seats} county seats found — missing {sorted(missing)}")
    features.sort(key=lambda f: (f["properties"]["rank"], f["properties"]["name"]))
    out = GEO_DIR / "cities.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                              ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    ranks = collections.Counter(f["properties"]["rank"] for f in features)
    big = sum(1 for f in features if f["properties"].get("big"))
    print(f"wrote {out} — {len(features)} points {dict(ranks)}, {big} above "
          f"{TOWN_MIN_POPULATION} residents, {out.stat().st_size / 1024:.0f} KiB")


def build_budapest(cache: Path) -> None:
    """The 23 Budapest district boundaries (admin_level=9)."""
    import osm2geojson
    from shapely.geometry import mapping, shape

    data = fetch(cache, BUDAPEST_QUERY)
    fc = osm2geojson.json2geojson(data)
    features = []
    for f in fc["features"]:
        tags = f.get("properties", {}).get("tags", {})
        name = tags.get("name", "")
        if "kerület" not in name:
            continue
        geom = shape(f["geometry"]).simplify(SIMPLIFY_TOLERANCE / 2, preserve_topology=True)
        features.append({
            "type": "Feature",
            "properties": {"name": name, "ref": tags.get("ref:HU:kerulet", tags.get("ref", ""))},
            "geometry": mapping(geom),
        })
    if len(features) != 23:
        sys.exit(f"{len(features)} Budapest districts assembled (expected 23)")
    features.sort(key=lambda f: f["properties"]["name"])
    out = GEO_DIR / "budapest.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                              ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    print(f"wrote {out} — {len(features)} districts, {out.stat().st_size / 1024:.0f} KiB")


def build_jaras(cache: Path) -> None:
    import osm2geojson
    from shapely.geometry import mapping, shape

    data = fetch(cache)
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--what", choices=("jaras", "cities", "budapest", "all"),
                        default="all")
    parser.add_argument("--cache-dir", default=str(GEO_DIR))
    args = parser.parse_args()
    cache_dir = Path(args.cache_dir)
    if args.what in ("jaras", "all"):
        build_jaras(cache_dir / "jaras_overpass_cache.json")
    if args.what in ("cities", "all"):
        build_cities(cache_dir / "cities_overpass_cache.json")
    if args.what in ("budapest", "all"):
        build_budapest(cache_dir / "budapest_overpass_cache.json")


if __name__ == "__main__":
    main()
