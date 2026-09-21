"""Health-visitor (védőnői) districts from the EESZT master publication.

Neither NEAK nor OKFŐ publishes a health-visitor list the way it publishes
the vacant GP and dental districts: the NEAK download directory has no
védőnői file, and OKFŐ's long-term-vacancy pages cover physicians only.
What is public is the EESZT master publication (source H), and it carries
the whole branch:

    NEAK_FINSZOLG             TIP = "VNO" — every financed health-visitor
                              service with its FIN code, county, operator
                              and organisational unit
    EUSZOLG_ENGEDELY_PUBLIKUS profession 7901 (területi védőnői ellátás) and
                              7902 (iskolai védőnői ellátás) — the operating
                              licence with the premises address

So the vacancy question cannot be asked here — nothing public says whether a
health-visitor district has a health visitor. What can be asked, and is
asked below: how many services exist, who operates them since the 2023 state
takeover, where their premises are, how many residents fall on one service,
and which settlements have no health-visitor premises at all.

The output never carries a health visitor's name. The licence register puts
them in the unit name of some records ("Tevékenységet végzi ... védőnő
(reg. szám: ...)"); that field is dropped here and a guard fails the build if
a name marker survives anywhere (CLAUDE.md rule 3: names only for the
contracted physician of a filled district, as NEAK itself publishes them).

Usage:
  python etl/vedono.py
"""
from __future__ import annotations

import collections
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_eeszt import EesztError, load, latest_date
from geocode import load_cache
from parse_ksh import load_reference, normalize_settlement


def load_age() -> tuple[dict, dict, int]:
    """Census 0-14 counts per county and nationally, or empty if unavailable."""
    path = ROOT / "data" / "age.json"
    if not path.exists():
        return {}, {}, 0
    data = json.loads(path.read_text(encoding="utf-8"))
    by_county = {c["name"]: c for c in data["counties"]}
    return by_county, data["country"], data["country"].get("youngNow") or 0

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "vedono.json"
SCHEMA_VERSION = 1

# FINNEV tells the two branches apart; the licence profession confirms it
TERRITORIAL_NAME = "Körzeti védőnő"
SCHOOL_NAME = "Iskolavédőnő"
PROFESSIONS = {"7901": "territorial", "7902": "school"}

# one territorial service is meant to serve this many residents (49/2004.
# (V. 21.) ESZCSM r.: a district is built around ~250 children under 7 plus
# the expectant mothers, which is roughly 2500 residents) — used only as a
# reference line in the UI, never as a judgement
REFERENCE_RESIDENTS = 2500

NAME_MARKER_RE = re.compile(r"(reg\.\s*sz|Tevékenységet\s+végzi|\bvédőnő\s+\()",
                            re.IGNORECASE)


def county_key(name: str) -> str:
    """"Baranya megye" / "Baranya vármegye" -> "Baranya"; Budapest stays."""
    out = re.sub(r"\s+(megye|vármegye)$", "", (name or "").strip())
    return "Budapest" if out.startswith("Budapest") else out


def build() -> dict:
    date = latest_date()
    fx, fin = load("neak_finszolg", date)
    ex, eng = load("euszolg_engedely", date)
    ksh = load_reference()
    cache = load_cache()

    lic_by_unit: dict[str, list] = collections.defaultdict(list)
    for r in eng:
        if (r[ex["SZAKMA_KOD"]] or "") in PROFESSIONS:
            lic_by_unit[r[ex["SZERVEZETI_EGYSEG_KOD"]]].append(r)

    rows: list[dict] = []
    for r in fin:
        if r[fx["TIP"]] != "VNO":
            continue
        unit = r[fx["NNGYK9_KOD"]] or ""
        finnev = r[fx["FINNEV"]] or ""
        branch = "school" if finnev == SCHOOL_NAME else "territorial"
        want = "7902" if branch == "school" else "7901"
        licences = lic_by_unit.get(unit, [])
        # prefer the licence of this branch, fall back to any health-visitor one
        lic = next((x for x in licences if x[ex["SZAKMA_KOD"]] == want), None) \
            or (licences[0] if licences else None)
        settlement = (lic[ex["TELEPHELY_TELEPULES"]] if lic else "") or ""
        address = (lic[ex["TELEPHELY_CIM"]] if lic else "") or ""
        postal = (lic[ex["TELEPHELY_IRSZAM"]] if lic else "") or ""
        ref = ksh.lookup(settlement) if (ksh and settlement) else None
        geo = cache.get(f"{postal} {settlement}, {address}") if settlement else None
        rows.append({
            "fin": r[fx["FINKOD"]],
            "branch": branch,
            "county": county_key(r[fx["MEGYE"]]),
            "neakCode": r[fx["INTKOD"]],
            "provider": r[fx["INEV"]] or "",
            "unit": unit,
            "licenceId": (lic[ex["ENGEDELY_AZONOSITO"]] if lic else "") or "",
            "profession": (lic[ex["SZAKMA_KOD"]] if lic else "") or "",
            "publicFunded": bool(lic and lic[ex["KOZFINANSZIROZOTT"]] == "I"),
            "settlement": settlement,
            "postalCode": postal,
            "district": (ref or {}).get("district", ""),
            "address": address,
            "lat": (geo or {}).get("lat"),
            "lon": (geo or {}).get("lon"),
            "geoApprox": bool((geo or {}).get("geoApprox")) if geo else None,
        })

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "asOf": date,
        "referenceResidents": REFERENCE_RESIDENTS,
        "stats": overall(rows, ksh),
        "counties": by_county(rows, ksh),
        "providers": by_provider(rows),
        "settlements": by_settlement(rows, ksh),
        "rows": rows,
    }
    guard(out)
    return out


def overall(rows: list[dict], ksh) -> dict:
    _, _, young = load_age()
    territorial = [r for r in rows if r["branch"] == "territorial"]
    school = [r for r in rows if r["branch"] == "school"]
    covered = {normalize_settlement(r["settlement"]) for r in rows if r["settlement"]}
    population = ksh.country_population if ksh else 0
    return {
        "services": len(rows),
        "territorial": len(territorial),
        "school": len(school),
        "withLicence": sum(1 for r in rows if r["licenceId"]),
        "withoutLicence": sum(1 for r in rows if not r["licenceId"]),
        "publicFunded": sum(1 for r in rows if r["publicFunded"]),
        "geocoded": sum(1 for r in rows if r["lat"] is not None),
        "providers": len({r["provider"] for r in rows if r["provider"]}),
        "settlementsWithPremises": len(covered),
        "settlementsTotal": len(ksh.entries) if ksh else 0,
        "population": population,
        "residentsPerTerritorial": round(population / len(territorial)) if territorial else 0,
        # the district is built around children, so the census 0-14 count is
        # the denominator that actually matters
        "young": young,
        "youngPerTerritorial": round(young / len(territorial)) if (territorial and young) else 0,
    }


def by_county(rows: list[dict], ksh) -> list[dict]:
    ages, _, _ = load_age()
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        groups[r["county"]].append(r)
    out = []
    for county, list_ in sorted(groups.items()):
        territorial = sum(1 for r in list_ if r["branch"] == "territorial")
        population = (ksh.county_population.get(county, 0) if ksh else 0)
        out.append({
            "county": county,
            "services": len(list_),
            "territorial": territorial,
            "school": len(list_) - territorial,
            "settlements": len({normalize_settlement(r["settlement"])
                                for r in list_ if r["settlement"]}),
            "providers": len({r["provider"] for r in list_ if r["provider"]}),
            "population": population,
            "residentsPerTerritorial": round(population / territorial) if territorial else 0,
            "young": (ages.get(county) or {}).get("youngNow") or 0,
            "youngPerTerritorial": (
                round(((ages.get(county) or {}).get("youngNow") or 0) / territorial)
                if territorial else 0),
        })
    return out


def by_provider(rows: list[dict]) -> list[dict]:
    groups: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    for r in rows:
        groups[(r["neakCode"], r["provider"])].append(r)
    out = [{
        "neakCode": code,
        "provider": name,
        "services": len(list_),
        "territorial": sum(1 for r in list_ if r["branch"] == "territorial"),
        "school": sum(1 for r in list_ if r["branch"] == "school"),
        "counties": sorted({r["county"] for r in list_}),
        "settlements": len({normalize_settlement(r["settlement"])
                            for r in list_ if r["settlement"]}),
    } for (code, name), list_ in groups.items()]
    return sorted(out, key=lambda x: -x["services"])


def by_settlement(rows: list[dict], ksh) -> list[dict]:
    """Every KSH settlement with the health-visitor premises it hosts.

    A district may serve more than the settlement its office sits in, exactly
    like a GP district; "no premises" therefore means "no health-visitor
    office here", never "no health visitor comes here" (CLAUDE.md rule 4).
    """
    if not ksh:
        return []
    hosted: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        if r["settlement"]:
            hosted[normalize_settlement(r["settlement"])].append(r)
    out = []
    for e in ksh.entries:
        if e["name"] == "Budapest" and e["county"] == "Budapest":
            continue  # the 23 districts carry the capital's rows
        list_ = hosted.get(normalize_settlement(e["name"]), [])
        out.append({
            "settlement": e["name"],
            "county": e["county"],
            "district": e["district"],
            "population": e["population"],
            "services": len(list_),
            "territorial": sum(1 for r in list_ if r["branch"] == "territorial"),
            "school": sum(1 for r in list_ if r["branch"] == "school"),
        })
    return sorted(out, key=lambda x: (-x["population"], x["settlement"]))


def guard(out: dict) -> None:
    st = out["stats"]
    if st["territorial"] + st["school"] != st["services"]:
        raise EesztError("the two branches do not add up to the service count")
    if st["services"] < 4000:
        raise EesztError(f"suspiciously few health-visitor services: {st['services']}")
    if st["withLicence"] + st["withoutLicence"] != st["services"]:
        raise EesztError("licence counts do not add up")
    if sum(c["services"] for c in out["counties"]) != st["services"]:
        raise EesztError("county counts do not add up to the national count")
    if sum(p["services"] for p in out["providers"]) != st["services"]:
        raise EesztError("provider counts do not add up to the national count")
    allowed = {"fin", "branch", "county", "neakCode", "provider", "unit",
               "licenceId", "profession", "publicFunded", "settlement",
               "postalCode", "district", "address", "lat", "lon", "geoApprox"}
    seen: set[str] = set()
    for r in out["rows"]:
        unknown = set(r) - allowed
        if unknown:
            raise EesztError(f"{r['fin']}: unexpected fields {sorted(unknown)}")
        if r["fin"] in seen:
            raise EesztError(f"duplicate service {r['fin']}")
        seen.add(r["fin"])
    # no health visitor's name may leave the pipeline
    text = json.dumps(out, ensure_ascii=False)
    hit = NAME_MARKER_RE.search(text)
    if hit:
        raise EesztError(f"a personal-name marker reached the output: {hit.group(0)!r}")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT}: {st['services']} health-visitor services "
          f"({st['territorial']} territorial, {st['school']} school)")
    print(f"  operators: {st['providers']}, premises in {st['settlementsWithPremises']} "
          f"of {st['settlementsTotal']} settlements, geocoded: {st['geocoded']}")
    print(f"  residents per territorial service: {st['residentsPerTerritorial']}")


if __name__ == "__main__":
    main()
