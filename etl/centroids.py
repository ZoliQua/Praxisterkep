"""A coordinate for every settlement, so questions can be asked at that level.

The site geocodes surgery addresses, which answers "where is this district's
door"; it does not answer "where is this settlement". For the coverage and
composite-index analyses every settlement needs a point, including the ones
that host no surgery at all.

Source: the OpenStreetMap place nodes already cached for the city layer
(data/geo/cities_overpass_cache.json) — one node per city, town and village,
matched to the KSH gazetteer by normalised name. Budapest's 23 districts are
not place nodes, so their centre comes from the bounding box of the district
boundary relation cached for the Budapest layer.

Output: data/geo/settlements.geojson, one Point per settlement with its KSH
code, county, district and resident population.

Usage:
  python etl/centroids.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_ksh import load_reference, normalize_settlement

ROOT = Path(__file__).resolve().parent.parent
GEO_DIR = ROOT / "data" / "geo"
OUT = GEO_DIR / "settlements.geojson"

ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8,
         "IX": 9, "X": 10, "XI": 11, "XII": 12, "XIII": 13, "XIV": 14, "XV": 15,
         "XVI": 16, "XVII": 17, "XVIII": 18, "XIX": 19, "XX": 20, "XXI": 21,
         "XXII": 22, "XXIII": 23}


def place_points() -> dict[str, tuple[float, float]]:
    cache = GEO_DIR / "cities_overpass_cache.json"
    if not cache.exists():
        raise ParseError(f"{cache} is missing; run fetch_geo.py first")
    data = json.loads(cache.read_text(encoding="utf-8"))
    out: dict[str, tuple[float, float]] = {}
    for el in data.get("elements", []):
        name = el.get("tags", {}).get("name")
        if name and el.get("lat") is not None:
            out.setdefault(normalize_settlement(name), (el["lat"], el["lon"]))
    return out


def budapest_points() -> dict[str, tuple[float, float]]:
    """The centre of each kerület boundary, keyed the way KSH names them."""
    cache = GEO_DIR / "budapest_overpass_cache.json"
    if not cache.exists():
        return {}
    data = json.loads(cache.read_text(encoding="utf-8"))
    out: dict[str, tuple[float, float]] = {}
    for el in data.get("elements", []):
        name = el.get("tags", {}).get("name", "")
        bounds = el.get("bounds")
        match = re.match(r"^([IVX]+)\.", name)
        if not (match and bounds):
            continue
        number = ROMAN.get(match.group(1))
        if not number:
            continue
        key = normalize_settlement(f"Budapest {number:02d}. ker.")
        out[key] = ((bounds["minlat"] + bounds["maxlat"]) / 2,
                    (bounds["minlon"] + bounds["maxlon"]) / 2)
    return out


def build() -> dict:
    ksh = load_reference()
    if ksh is None:
        raise ParseError("the KSH gazetteer is missing")
    points = {**place_points(), **budapest_points()}

    features = []
    missing: list[str] = []
    for e in ksh.entries:
        if e["name"] == "Budapest" and not e["isDistrictOfCapital"]:
            continue
        point = points.get(normalize_settlement(e["name"]))
        if point is None:
            missing.append(e["name"])
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(point[1], 5),
                                                          round(point[0], 5)]},
            "properties": {
                "kshId": e["kshId"],
                "name": e["name"],
                "county": e["county"],
                "district": e["district"],
                "population": e["population"],
            },
        })
    if len(missing) > 20:
        raise ParseError(f"{len(missing)} settlements have no coordinate: "
                         f"{missing[:10]}")
    return {"type": "FeatureCollection", "features": features, "missing": missing}


def load() -> dict[str, tuple[float, float]]:
    """{KSH code: (lat, lon)} for the other modules."""
    if not OUT.exists():
        return {}
    data = json.loads(OUT.read_text(encoding="utf-8"))
    return {f["properties"]["kshId"]:
            (f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0])
            for f in data["features"]}


def main() -> None:
    out = build()
    missing = out.pop("missing")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}: {len(out['features'])} settlements"
          + (f", {len(missing)} without a coordinate: {missing}" if missing else ""))


if __name__ == "__main__":
    main()
