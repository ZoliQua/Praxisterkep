"""How far the nearest operating surgery is from a district without a doctor.

A vacancy on its own says nothing about what a resident can actually reach:
an empty district whose neighbouring surgery is two kilometres away is a very
different situation from one where the nearest contracted physician is
twenty-five kilometres off. This module measures that distance for every
vacant and dissolved district:

    subject    = a district with no contracted physician (vacant / dissolved)
                 at its NEAK surgery address (geocoded)
    operating  = a FILLED district of the same branch, at its EESZT licensed
                 premises, or at its NEAK surgery address when the EESZT
                 match failed
    distance   = great-circle kilometres to the nearest operating surgery

This is an accessibility proxy, never a claim that the district is unserved
(CLAUDE.md rule 4): substitution is invisible in the published data, and the
crow-flies distance is not travel time. The output says so, and the UI repeats
it.

Usage:
  python etl/access.py
"""
from __future__ import annotations

import json
import math
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "access.json"
SCHEMA_VERSION = 1

# the bands the UI colours and counts by (upper bound in km, None = above)
BANDS: list[tuple[str, float | None]] = [
    ("0-5", 5.0), ("5-10", 10.0), ("10-20", 20.0), ("20+", None),
]
EARTH_KM = 6371.0088


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def band_of(km: float) -> str:
    for key, upper in BANDS:
        if upper is None or km < upper:
            return key
    return BANDS[-1][0]


def build() -> dict:
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    eeszt_path = ROOT / "data" / "eeszt.json"
    eeszt = json.loads(eeszt_path.read_text(encoding="utf-8")) if eeszt_path.exists() else {"praxes": {}}
    cache = json.loads((ROOT / "etl" / "geocode_cache.json").read_text(encoding="utf-8"))
    eeszt_geo = eeszt.get("praxes", {})

    districts: list[dict] = []
    stats: dict[str, dict] = {}

    for kind in ("dental", "gp"):
        snap = latest["kinds"][kind]
        # where care is actually contracted: the filled districts
        operating: list[tuple[float, float, str, str]] = []
        no_geo = 0
        for f in snap["filledPraxes"]:
            entry = eeszt_geo.get(f["id"]) or {}
            geo = entry.get("g")
            if geo:
                operating.append((geo[0], geo[1], f["id"], f.get("settlement", "")))
                continue
            hit = cache.get(f"{f.get('postalCode', '')} {f.get('settlement', '')}, "
                            f"{f.get('address', '')}")
            if hit:
                operating.append((hit["lat"], hit["lon"], f["id"], f.get("settlement", "")))
            else:
                no_geo += 1

        counts: dict[str, int] = {key: 0 for key, _ in BANDS}
        population: dict[str, int] = {key: 0 for key, _ in BANDS}
        distances: list[float] = []
        missing = 0

        for p in snap["praxes"]:
            site = (p.get("sites") or [{}])[0]
            lat, lon = site.get("lat"), site.get("lon")
            if lat is None or lon is None or not operating:
                missing += 1
                continue
            best_km = math.inf
            best = ("", "")
            for olat, olon, oid, osett in operating:
                km = haversine(lat, lon, olat, olon)
                if km < best_km:
                    best_km, best = km, (oid, osett)
            km = round(best_km, 1)  # band from the published value, not the raw one
            band = band_of(km)
            counts[band] += 1
            population[band] += p.get("population") or 0
            distances.append(km)
            districts.append({
                "id": p["id"],
                "kind": kind,
                "status": p.get("status", "vacant"),
                "settlement": site.get("settlement", ""),
                "county": p.get("county", ""),
                "type": p.get("type", ""),
                "population": p.get("population"),
                "km": km,
                "band": band,
                "nearestId": best[0],
                "nearestSettlement": best[1],
                "sameSettlement": (site.get("settlement", "") or "?") == best[1],
                "geoApprox": bool(site.get("geoApprox")),
                "lat": lat,
                "lon": lon,
            })

        stats[kind] = {
            "subjects": len(snap["praxes"]),
            "measured": len(distances),
            "missingGeo": missing,
            "operating": len(operating),
            "operatingWithoutGeo": no_geo,
            "counts": counts,
            "population": population,
            "medianKm": round(statistics.median(distances), 1) if distances else None,
            "maxKm": round(max(distances), 1) if distances else None,
            "sameSettlement": sum(1 for d in districts
                                  if d["kind"] == kind and d["sameSettlement"]),
        }

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "asOf": eeszt.get("asOf", ""),
        "dataMonth": latest.get("month", ""),
        "bands": [{"key": k, "maxKm": u} for k, u in BANDS],
        "stats": stats,
        "districts": districts,
    }
    guard(out, latest)
    return out


def guard(out: dict, latest: dict) -> None:
    """Every measured district must be accounted for, and stay name-free."""
    allowed = {"id", "kind", "status", "settlement", "county", "type", "population",
               "km", "band", "nearestId", "nearestSettlement", "sameSettlement",
               "geoApprox", "lat", "lon"}
    for d in out["districts"]:
        unknown = set(d) - allowed
        if unknown:
            raise ValueError(f"{d['id']}: unexpected fields {sorted(unknown)}")
        if d["status"] == "filled":
            raise ValueError(f"{d['id']}: a filled district is not a subject here")
        if not 0 <= d["km"] <= 300:
            raise ValueError(f"{d['id']}: implausible distance {d['km']} km")
        if d["band"] != band_of(d["km"]):
            raise ValueError(f"{d['id']}: band {d['band']} does not match {d['km']} km")
    for kind, st in out["stats"].items():
        total = len(latest["kinds"][kind]["praxes"])
        if st["measured"] + st["missingGeo"] != total:
            raise ValueError(
                f"{kind}: {st['measured']} measured + {st['missingGeo']} without "
                f"coordinates != {total} districts")
        if sum(st["counts"].values()) != st["measured"]:
            raise ValueError(f"{kind}: band counts do not add up to the measured set")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}: {len(out['districts'])} districts without a doctor")
    for kind, st in out["stats"].items():
        bands = " ".join(f"{k}={v}" for k, v in st["counts"].items())
        print(f"  {kind}: median {st['medianKm']} km, max {st['maxKm']} km | {bands} "
              f"| operating {st['operating']} (no coords: {st['operatingWithoutGeo']})")


if __name__ == "__main__":
    main()
