"""On-call and emergency points: what stands around a district with no doctor.

CLAUDE.md rule 4 says vacant is not the same as unserved, and the site has
so far only been able to say the first half of that. The second half is in
data we already download every month: the EESZT financing register lists the
services that are not districts either, among them

    USZ   központi ügyelet        213 services, 202 with licensed premises
    MENT  mentés                  264 services, 263 with licensed premises
    BET   betegszállítás           58
    MV    művese (dialysis)        68

So the question "how far is the nearest on-call surgery / ambulance station"
can be answered for every settlement and for every district that has no
contracted physician — which is exactly what turns "vacant" into something a
resident can weigh.

Distances are crow-flies kilometres, as everywhere else on the site, and they
are a proxy: an on-call point 20 km away is not the same as no care, and a
short distance does not prove that care arrives. The output says so.

Usage:
  python etl/emergency.py
"""
from __future__ import annotations

import collections
import json
import math
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import centroids
from build_eeszt import EesztError, load, latest_date
from geocode import load_cache
from parse_ksh import load_reference

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "emergency.json"
SCHEMA_VERSION = 1

# TIP in the financing register -> the professions that make the service the
# thing we are measuring (a mentés unit also holds event-cover licences)
GROUPS = {
    "oncall": ("USZ", {"4601"}),
    "ambulance": ("MENT", {"6200", "6201"}),
    "transport": ("BET", {"6206"}),
    "dialysis": ("MV", {"0110", "0105"}),
}
# the groups a distance is computed for; the other two are listed, not measured
MEASURED = ("oncall", "ambulance")
BANDS: list[tuple[str, float | None]] = [
    ("0-10", 10.0), ("10-20", 20.0), ("20-30", 30.0), ("30+", None),
]
EARTH_KM = 6371.0088


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def band_of(km: float) -> str:
    for key, upper in BANDS:
        if upper is None or km < upper:
            return key
    return BANDS[-1][0]


def nearest(lat: float, lon: float, points: list[dict]) -> tuple[float | None, str]:
    best_km, best = math.inf, ""
    for p in points:
        km = haversine(lat, lon, p["lat"], p["lon"])
        if km < best_km:
            best_km, best = km, p["settlement"]
    if best_km is math.inf:
        return None, ""
    return round(best_km, 1), best


def county_key(name: str) -> str:
    out = (name or "").replace(" megye", "").replace(" vármegye", "").strip()
    return "Budapest" if out.startswith("Budapest") else out


def premises() -> list[tuple[str, str, str]]:
    """(postal, settlement, address) of every on-call and emergency point.

    The geocoder needs these before emergency.json can be built, so it reads
    them from the registers rather than from the output file.
    """
    date = latest_date()
    fx, fin = load("neak_finszolg", date)
    ex, eng = load("euszolg_engedely", date)
    lic_by_unit: dict[str, list] = collections.defaultdict(list)
    for r in eng:
        lic_by_unit[r[ex["SZERVEZETI_EGYSEG_KOD"]]].append(r)
    out: list[tuple[str, str, str]] = []
    for _group, (tip, professions) in GROUPS.items():
        for r in fin:
            if r[fx["TIP"]] != tip:
                continue
            for lic in lic_by_unit.get(r[fx["NNGYK9_KOD"]] or "", []):
                if (lic[ex["SZAKMA_KOD"]] or "") in professions:
                    out.append((lic[ex["TELEPHELY_IRSZAM"]] or "",
                                lic[ex["TELEPHELY_TELEPULES"]] or "",
                                lic[ex["TELEPHELY_CIM"]] or ""))
                    break
    return out


def build() -> dict:
    date = latest_date()
    fx, fin = load("neak_finszolg", date)
    ex, eng = load("euszolg_engedely", date)
    cache = load_cache()
    ksh = load_reference()
    coords = centroids.load()
    if not coords:
        raise EesztError("run etl/centroids.py first — no settlement coordinates")

    lic_by_unit: dict[str, list] = collections.defaultdict(list)
    for r in eng:
        lic_by_unit[r[ex["SZERVEZETI_EGYSEG_KOD"]]].append(r)

    points: list[dict] = []
    for group, (tip, professions) in GROUPS.items():
        for r in fin:
            if r[fx["TIP"]] != tip:
                continue
            unit = r[fx["NNGYK9_KOD"]] or ""
            wanted = [l for l in lic_by_unit.get(unit, [])
                      if (l[ex["SZAKMA_KOD"]] or "") in professions]
            lic = wanted[0] if wanted else None
            settlement = (lic[ex["TELEPHELY_TELEPULES"]] if lic else "") or ""
            address = (lic[ex["TELEPHELY_CIM"]] if lic else "") or ""
            postal = (lic[ex["TELEPHELY_IRSZAM"]] if lic else "") or ""
            geo = cache.get(f"{postal} {settlement}, {address}") if settlement else None
            points.append({
                "group": group,
                "fin": r[fx["FINKOD"]],
                "county": county_key(r[fx["MEGYE"]]),
                "provider": r[fx["INEV"]] or "",
                "neakCode": r[fx["INTKOD"]],
                "unit": unit,
                "licenceId": (lic[ex["ENGEDELY_AZONOSITO"]] if lic else "") or "",
                "profession": (lic[ex["SZAKMA_KOD"]] if lic else "") or "",
                "settlement": settlement,
                "postalCode": postal,
                "address": address,
                "lat": (geo or {}).get("lat"),
                "lon": (geo or {}).get("lon"),
                "geoApprox": bool((geo or {}).get("geoApprox")) if geo else None,
            })

    located = {g: [p for p in points if p["group"] == g and p["lat"] is not None]
               for g in GROUPS}

    settlements = settlement_distances(coords, ksh, located)
    districts = district_distances(located)

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "asOf": date,
        "bands": [b[0] for b in BANDS],
        "groups": {g: group_stats(points, located, g) for g in GROUPS},
        "stats": overall(settlements, districts),
        "counties": by_county(settlements),
        "points": points,
        "settlements": settlements,
        "districts": districts,
    }
    guard(out)
    return out


def settlement_distances(coords: dict, ksh, located: dict) -> list[dict]:
    rows = []
    for e in (ksh.entries if ksh else []):
        if e["name"] == "Budapest" and not e["isDistrictOfCapital"]:
            continue
        point = coords.get(e["kshId"])
        if point is None:
            continue
        row = {
            "kshId": e["kshId"],
            "settlement": e["name"],
            "county": e["county"],
            "district": e["district"],
            "population": e["population"],
            "lat": point[0],
            "lon": point[1],
        }
        for group in MEASURED:
            km, where = nearest(point[0], point[1], located[group])
            row[f"{group}Km"] = km
            row[f"{group}At"] = where
            row[f"{group}Band"] = band_of(km) if km is not None else ""
        rows.append(row)
    return rows


def district_distances(located: dict) -> list[dict]:
    """Every district with no contracted physician, and what stands near it."""
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    rows = []
    for kind in ("dental", "gp"):
        for p in latest["kinds"][kind].get("praxes", []):
            site = (p.get("sites") or [{}])[0]
            lat, lon = site.get("lat"), site.get("lon")
            if lat is None or lon is None:
                continue
            row = {
                "id": p["id"],
                "kind": kind,
                "status": p.get("status", "vacant"),
                "settlement": site.get("settlement", ""),
                "county": p.get("county", ""),
                "type": p.get("type", ""),
                "population": p.get("population"),
                "longTerm": bool(p.get("longTerm")),
            }
            for group in MEASURED:
                km, where = nearest(lat, lon, located[group])
                row[f"{group}Km"] = km
                row[f"{group}At"] = where
                row[f"{group}Band"] = band_of(km) if km is not None else ""
            rows.append(row)
    return rows


def group_stats(points: list[dict], located: dict, group: str) -> dict:
    all_ = [p for p in points if p["group"] == group]
    return {
        "services": len(all_),
        "located": len(located[group]),
        "sites": len({(p["postalCode"], p["settlement"], p["address"])
                      for p in all_ if p["settlement"]}),
        "settlements": len({p["settlement"] for p in all_ if p["settlement"]}),
        "providers": len({p["provider"] for p in all_ if p["provider"]}),
        "counties": len({p["county"] for p in all_}),
    }


def overall(settlements: list[dict], districts: list[dict]) -> dict:
    out: dict = {"settlements": len(settlements), "districts": len(districts)}
    for group in MEASURED:
        km = [s[f"{group}Km"] for s in settlements if s[f"{group}Km"] is not None]
        counts = collections.Counter(s[f"{group}Band"] for s in settlements)
        population = collections.Counter()
        for s in settlements:
            population[s[f"{group}Band"]] += s["population"]
        beyond = sum(s["population"] for s in settlements
                     if (s[f"{group}Km"] or 0) >= 20)
        dkm = [d[f"{group}Km"] for d in districts if d[f"{group}Km"] is not None]
        out[group] = {
            "medianKm": round(statistics.median(km), 1) if km else None,
            "meanKm": round(statistics.fmean(km), 1) if km else None,
            "maxKm": round(max(km), 1) if km else None,
            "counts": dict(counts),
            "population": dict(population),
            "populationBeyond20": beyond,
            "districtMedianKm": round(statistics.median(dkm), 1) if dkm else None,
            "districtsBeyond20": sum(1 for v in dkm if v >= 20),
        }
    return out


def by_county(settlements: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for s in settlements:
        groups[s["county"]].append(s)
    out = []
    for county, list_ in groups.items():
        row = {
            "county": county,
            "settlements": len(list_),
            "population": sum(s["population"] for s in list_),
        }
        for group in MEASURED:
            km = [s[f"{group}Km"] for s in list_ if s[f"{group}Km"] is not None]
            row[f"{group}MedianKm"] = round(statistics.median(km), 1) if km else None
            row[f"{group}MaxKm"] = round(max(km), 1) if km else None
            row[f"{group}Beyond20"] = sum(
                s["population"] for s in list_ if (s[f"{group}Km"] or 0) >= 20)
        out.append(row)
    return sorted(out, key=lambda c: -(c["oncallMedianKm"] or 0))


def guard(out: dict) -> None:
    for group, st in out["groups"].items():
        if st["services"] == 0:
            raise EesztError(f"{group}: no services found — the register changed?")
        if group in MEASURED and st["located"] < 0.8 * st["services"]:
            raise EesztError(
                f"{group}: only {st['located']} of {st['services']} points are located")
    if len(out["settlements"]) < 3000:
        raise EesztError(f"only {len(out['settlements'])} settlements measured")
    for group in MEASURED:
        stats = out["stats"][group]
        if stats["medianKm"] is None or not 0 < stats["medianKm"] < 60:
            raise EesztError(f"{group}: implausible median distance {stats['medianKm']}")
        if sum(stats["counts"].values()) != len(out["settlements"]):
            raise EesztError(f"{group}: distance bands do not add up")
    for row in out["settlements"]:
        for group in MEASURED:
            km = row[f"{group}Km"]
            if km is not None and not 0 <= km <= 400:
                raise EesztError(f"{row['settlement']}: {group} distance out of range")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}")
    for group, st in out["groups"].items():
        print(f"  {group}: {st['services']} services, {st['located']} located, "
              f"{st['sites']} sites in {st['settlements']} settlements")
    for group in MEASURED:
        s = out["stats"][group]
        print(f"  {group}: median {s['medianKm']} km, max {s['maxKm']} km, "
              f"{s['populationBeyond20']:,} residents beyond 20 km; "
              f"districts without a physician: median {s['districtMedianKm']} km, "
              f"{s['districtsBeyond20']} beyond 20 km")


if __name__ == "__main__":
    main()
