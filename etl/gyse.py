"""Where you can actually get a walking frame: medical-aid retailers.

A prescription is only half the story. The other half is whether there is a
shop within reach that dispenses the thing — a walking frame, a hearing aid,
an insulin-pump set, an incontinence supply. For an eighty-year-old in a
village that distance is the whole question, and it is the same question
this site already asks about surgeries and hospitals.

Source: GYSE_FORGALMAZO in the EESZT master publication (source H), one row
per licensed activity at a premises, with its address, its operating licence
and the authority that issued it. Seven activities, and they are not the
same thing at all — buying a walking frame, having a shoe made and getting
a wheelchair repaired are different errands:

    GYS1  forgalmazás (önálló üzletben)        860 rows
    GYS2  forgalmazás (fióküzletben)           288
    GYS3  forgalmazás (egyedi gyártóműhellyel) 288
    GYS4  ortopéd cipészet                     274
    GYS5  fogtechnika                           17
    GYS6  kölcsönzés                            64
    GYS7  javítás                              355

"Retail" below means GYS1–GYS3: the places that actually dispense a device.
The others travel with the data and can be filtered, because a repair shop
is not a substitute for a supplier.

Premises are geocoded through the shared cache, and the distances themselves
are measured in traveltime.py alongside every other care point, so a shop is
compared on the same terms as a surgery.

What this is not: a list of what each shop stocks. The register licenses the
activity, not the product range, so "there is a shop in town" does not mean
"they have your size".

Usage:
  python etl/gyse.py
"""
from __future__ import annotations

import collections
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_eeszt import EesztError, latest_date, load, resolve
from geocode import load_cache
from parse_ksh import load_reference, normalize_settlement

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "gyse.json"
SCHEMA_VERSION = 1

KINDS = {
    "GYS1": "shop", "GYS2": "branch", "GYS3": "workshop",
    "GYS4": "orthopaedic", "GYS5": "dentaltech", "GYS6": "rental", "GYS7": "repair",
}
# the activities that dispense a device — the ones the distance question is about
RETAIL = ("shop", "branch", "workshop")


def county_key(name: str) -> str:
    out = re.sub(r"\s+(megye|vármegye)$", "", (name or "").strip())
    return "Budapest" if out.startswith("Budapest") else out


def settlement_key(name: str) -> str:
    name = (name or "").strip()
    return "Budapest" if name.startswith("Budapest") else name


def premises() -> list[tuple[str, str, str]]:
    """(postal, settlement, address) for the geocoder, before gyse.json exists."""
    gx, rows = load("gyse_forgalmazo", latest_date())
    return [(r[gx["IRSZ"]] or "", settlement_key(r[gx["TELEPULES"]]),
             r[gx["CIM"]] or "") for r in rows]


def build() -> dict:
    date = latest_date()
    gx, rows = load("gyse_forgalmazo", date)
    cache = load_cache()
    ksh = load_reference()

    sites: list[dict] = []
    for r in rows:
        settlement = settlement_key(r[gx["TELEPULES"]])
        # two rows leave the county empty; the gazetteer knows it from the name
        county = county_key(r[gx["MEGYE"]])
        if not county and ksh and settlement:
            county = (ksh.lookup(settlement) or {}).get("county", "")
        address = r[gx["CIM"]] or ""
        postal = r[gx["IRSZ"]] or ""
        geo = cache.get(f"{postal} {settlement}, {address}") if settlement else None
        code = r[gx["SZAKMA_KOD"]] or ""
        sites.append({
            "providerId": r[gx["EUSZOLG_AZONOSITO"]] or "",
            "provider": r[gx["KOZPONTITORZS_NEV"]] or "",
            "siteId": r[gx["TELEPHELY_AZONOSITO"]] or "",
            "unit": r[gx["SZERVEZETI_EGYSEG_KOD"]] or "",
            "county": county,
            "settlement": settlement,
            "postalCode": postal,
            "address": address,
            "kind": KINDS.get(code, "other"),
            "professionCode": code,
            "profession": r[gx["SZAKMA_NEV"]] or "",
            "authority": r[gx["ENGEDELYEZO_HATOSAG"]] or "",
            "lat": (geo or {}).get("lat"),
            "lon": (geo or {}).get("lon"),
            "geoApprox": bool((geo or {}).get("geoApprox")) if geo else None,
        })

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "asOf": resolve("gyse_forgalmazo", date),
        "stats": overall(sites, ksh),
        "counties": by_county(sites, ksh),
        "providers": by_provider(sites),
        "settlements": by_settlement(sites, ksh),
        "sites": sites,
    }
    guard(out)
    return out


def overall(sites: list[dict], ksh) -> dict:
    kinds = collections.Counter(s["kind"] for s in sites)
    hosted = {normalize_settlement(s["settlement"]) for s in sites if s["settlement"]}
    total = len([e for e in (ksh.entries if ksh else [])
                 if not (e["name"] == "Budapest" and not e["isDistrictOfCapital"])])
    population = ksh.country_population if ksh else 0
    return {
        "sites": len(sites),
        # a premises may hold more than one licensed activity, so rows and
        # premises are not the same number
        "premises": len({s["siteId"] for s in sites if s["siteId"]}),
        "providers": len({s["providerId"] for s in sites if s["providerId"]}),
        "settlements": len(hosted),
        "settlementsTotal": total,
        "counties": len({s["county"] for s in sites}),
        "geocoded": sum(1 for s in sites if s["lat"] is not None),
        **{k: kinds.get(k, 0) for k in list(KINDS.values()) + ["other"]},
        "retail": sum(kinds.get(k, 0) for k in RETAIL),
        "retailPremises": len({s["siteId"] for s in sites if s["kind"] in RETAIL}),
        "retailSettlements": len({normalize_settlement(s["settlement"])
                                  for s in sites if s["kind"] in RETAIL and s["settlement"]}),
        "population": population,
        "residentsPerSite": round(population / len(sites)) if sites else 0,
    }


def by_county(sites: list[dict], ksh) -> list[dict]:
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for s in sites:
        groups[s["county"]].append(s)
    out = []
    for county, list_ in sorted(groups.items()):
        population = (ksh.county_population.get(county, 0) if ksh else 0)
        out.append({
            "county": county,
            "sites": len(list_),
            "retail": sum(1 for s in list_ if s["kind"] in RETAIL),
            "providers": len({s["providerId"] for s in list_ if s["providerId"]}),
            "settlements": len({normalize_settlement(s["settlement"])
                                for s in list_ if s["settlement"]}),
            "population": population,
            "residentsPerSite": round(population / len(list_)) if list_ else 0,
        })
    return out


def by_provider(sites: list[dict]) -> list[dict]:
    groups: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    for s in sites:
        groups[(s["providerId"], s["provider"])].append(s)
    out = [{
        "providerId": pid,
        "provider": name,
        "sites": len(list_),
        "counties": sorted({s["county"] for s in list_}),
        "settlements": len({normalize_settlement(s["settlement"])
                            for s in list_ if s["settlement"]}),
    } for (pid, name), list_ in groups.items()]
    return sorted(out, key=lambda p: -p["sites"])


def by_settlement(sites: list[dict], ksh) -> list[dict]:
    """Every settlement with the shops it hosts — and the ones hosting none."""
    if not ksh:
        return []
    hosted: dict[str, list[dict]] = collections.defaultdict(list)
    for s in sites:
        if s["settlement"]:
            hosted[normalize_settlement(s["settlement"])].append(s)
    out = []
    for e in ksh.entries:
        if e["name"] == "Budapest" and not e["isDistrictOfCapital"]:
            continue
        # the capital's shops are registered on "Budapest", not on a district
        key = normalize_settlement("Budapest" if e["isDistrictOfCapital"] else e["name"])
        list_ = hosted.get(key, [])
        out.append({
            "settlement": e["name"],
            "county": e["county"],
            "district": e["district"],
            "population": e["population"],
            "sites": len(list_),
            "retail": sum(1 for s in list_ if s["kind"] in RETAIL),
            "providers": len({s["providerId"] for s in list_ if s["providerId"]}),
        })
    return sorted(out, key=lambda s: (-s["population"], s["settlement"]))


def guard(out: dict) -> None:
    st = out["stats"]
    sites = out["sites"]
    if st["sites"] < 1500:
        raise EesztError(f"only {st['sites']} retail premises — the register changed?")
    if sum(st[k] for k in list(KINDS.values()) + ["other"]) != st["sites"]:
        raise EesztError("the licensed activities do not add up")
    if st["retail"] > st["sites"]:
        raise EesztError("more retail rows than rows")
    if sum(c["sites"] for c in out["counties"]) != st["sites"]:
        raise EesztError("county counts do not add up to the premises count")
    if sum(p["sites"] for p in out["providers"]) != st["sites"]:
        raise EesztError("provider counts do not add up to the premises count")
    allowed = {"providerId", "provider", "siteId", "unit", "county", "settlement",
               "postalCode", "address", "kind", "professionCode", "profession",
               "authority", "lat", "lon", "geoApprox"}
    for s in sites:
        unknown = set(s) - allowed
        if unknown:
            raise EesztError(f"{s['siteId']}: unexpected fields {sorted(unknown)}")
        if not s["county"] or not s["settlement"]:
            raise EesztError(f"{s['siteId']}: incomplete location")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT}: {st['sites']} licensed activities at {st['premises']} "
          f"premises of {st['providers']} providers")
    print(f"  dispensing (GYS1-3): {st['retail']} rows at {st['retailPremises']} "
          f"premises in {st['retailSettlements']} settlements")
    print(f"  repair {st['repair']}, orthopaedic shoemaking {st['orthopaedic']}, "
          f"rental {st['rental']}, dental technology {st['dentaltech']}")
    print(f"  geocoded {st['geocoded']} of {st['sites']}")


if __name__ == "__main__":
    main()
