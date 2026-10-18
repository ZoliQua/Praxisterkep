"""One record per settlement: everything the site knows about one place.

Twelve analyses answer twelve questions, each for the whole country. A
resident has one question — "and here?" — and no way to ask it. This module
turns the analyses inside out: for every settlement in the gazetteer it
collects what each of them says, into a record small enough to bake into a
static page.

Nothing is computed here. Every field is lifted from an analysis that
already guards its own numbers, so a settlement profile can never disagree
with the chart it came from; if an analysis did not rebuild, its fields are
absent rather than stale (the pipeline skips this step in that case).

Usage:
  python etl/settlements.py
"""
from __future__ import annotations

import collections
import json
import statistics
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_ksh import load_reference, normalize_settlement

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "settlements.json"
# the full profiles stay build-side (3.8 MB); the app only needs to know
# which slug a settlement lives at and how many people live there, so that
# goes in a file it can load. The settlement search reads it, which is how a
# village that appears on no NEAK list is findable at all.
SLUGS = DATA / "settlement_slugs.json"
SCHEMA_VERSION = 2


def slug(name: str) -> str:
    """"Budapest 03. ker." -> "budapest-03-ker"; unique per settlement."""
    text = unicodedata.normalize("NFKD", name.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return "-".join(part for part in
                    "".join(c if c.isalnum() else " " for c in text).split())


def resolve_slugs(entries: list[dict]) -> dict[str, str]:
    """{KSH code: slug}, with collisions settled by county.

    Hungarian has pairs like Komló and Kömlő that differ only in accents,
    and stripping accents makes them one word. The larger settlement keeps
    the plain slug and the others carry their county, so a link never
    silently points at a different village.
    """
    groups: dict[str, list[dict]] = {}
    for e in entries:
        groups.setdefault(slug(e["name"]), []).append(e)
    out: dict[str, str] = {}
    for base, group in groups.items():
        if len(group) == 1:
            out[group[0]["kshId"]] = base
            continue
        for rank, e in enumerate(sorted(group, key=lambda x: (-x["population"],
                                                              x["name"]))):
            candidate = base if rank == 0 else f"{base}-{slug(e['county'])}"
            while candidate in out.values():
                candidate = f"{candidate}-{e['kshId']}"
            out[e["kshId"]] = candidate
    return out


def read(name: str) -> dict | None:
    path = DATA / name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))



# --------------------------------------------------- how people live here
#
# Income, births and deaths, migration (KSH TIMEA), jobseekers (NFSZ) and the
# avoidable mortality of the járás (NNGYK). These files are optional inputs:
# a supplement must never block the monthly release, so a missing one leaves
# its part of the block out instead of failing the settlement pages, and each
# figure carries its own year or month so a stale one says so on the page.
LIVING_YEARS = ("2022", "2023", "2024", "2025")


def _mean(series: dict | None, years=LIVING_YEARS) -> float | None:
    vals = [series[y] for y in years if series and series.get(y) is not None]
    # one missing year is tolerated; a village with two is not averaged
    return round(sum(vals) / len(vals), 2) if len(vals) >= len(years) - 1 else None


def _last(series: dict | None) -> tuple[str, float] | tuple[None, None]:
    if not series:
        return None, None
    y = max(series)
    return y, series[y]


def living_context(territorial: dict | None, jobs: dict | None,
                   mortality: dict | None, census: dict | None = None,
                   grants: dict | None = None, forecast: dict | None = None) -> dict:
    """What every settlement's block is compared with, computed once."""
    ctx: dict = {"territorial": territorial, "jobs": jobs, "mortality": mortality,
                 "census": census, "forecast": forecast}
    # the grants taken up in each settlement — place, year and outcome only,
    # never the winner (CLAUDE.md rule 3)
    ctx["grants"] = collections.defaultdict(list)
    for kind, k in ((grants or {}).get("kinds") or {}).items():
        for w in k["winners"]:
            ctx["grants"][w["kshId"]].append({
                "kind": kind, "programme": w["programme"], "year": w["year"],
                "contract": w["contract"], "status": w["status"]})
    if territorial:
        rural = [v for k, v in territorial["settlements"].items()]
        def med(key, fn):
            vals = sorted(x for x in (fn(r.get(key)) for r in rural) if x is not None)
            return statistics.median(vals) if vals else None
        ctx["median"] = {
            "income": med("incomePerResident", lambda s: (s or {}).get("2024")),
            "naturalChange": med("naturalChange", _mean),
            "migration": med("migration", _mean),
        }
        ctx["gpLoadYear"] = max((y for r in rural for y in (r.get("gpVisitsPerGp") or {})),
                                default=None)
    if jobs:
        nat = jobs["national"]
        ctx["jobsNational"] = round(100 * nat["registered"][-1] / nat["workingAge"][-1], 2)
    if mortality:
        vals = sorted(r["sha"]["avoidable"]["t"] for n, r in mortality["districts"].items()
                      if not n.startswith("Budapest") and r["sha"]["avoidable"]["t"] is not None)
        ctx["avoidableMedian"] = statistics.median(vals)
    return ctx


def living_block(ksh: str, district: str, county: str, ctx: dict) -> dict | None:
    out: dict = {}
    capital = county == "Budapest"
    terr, jobs, mort = ctx["territorial"], ctx["jobs"], ctx["mortality"]
    if terr:
        s = terr["capital"] if capital else terr["settlements"].get(ksh, {})
        d = terr["districts"].get("Budapest" if capital else district, {})
        c = terr["counties"].get(county, {})
        y, inc = _last(s.get("incomePerResident"))
        if inc is not None:
            out["income"] = {
                "value": inc, "year": y,
                "district": (d.get("incomePerResident") or {}).get(y),
                "county": (c.get("incomePerResident") or {}).get(y),
                "median": ctx["median"]["income"] if y == "2024" else None,
                "taxpayers": (s.get("taxpayersPer1000") or {}).get(y),
            }
        for key in ("naturalChange", "migration"):
            v = _mean(s.get(key))
            if v is not None:
                out[key] = {"value": v, "years": [LIVING_YEARS[0], LIVING_YEARS[-1]],
                            "district": _mean(d.get(key)), "county": _mean(c.get(key)),
                            "median": ctx["median"][key]}
        # a GP's yearly patient count, only when it is this year's and there
        # is a GP: a village whose surgery closed keeps a zero from the last
        # year it had one, and the capital's two KSH layers disagree (9 938
        # as a settlement, 20 249 as a járás), so a kerület gets neither
        y, load = _last(s.get("gpVisitsPerGp"))
        if load and not capital and y == ctx.get("gpLoadYear"):
            out["gpLoad"] = {"value": load, "year": y,
                             "district": (d.get("gpVisitsPerGp") or {}).get(y)}
        if capital and out:
            out["capitalWide"] = True
    if jobs and ksh in jobs["settlements"]:
        js = jobs["settlements"][ksh]
        dj = jobs["districts"].get(district)
        cj = jobs["counties"].get(county)
        rate = lambda r, i=-1: (round(100 * r["registered"][i] / r["workingAge"][i], 2)
                                if r and r["workingAge"][i] else None)
        reg, wap = js["registered"][-1], js["workingAge"][-1]
        out["jobseekers"] = {
            "month": jobs["latest"],
            "value": rate(js), "registered": reg, "workingAge": wap,
            "longShare": round(100 * js["longTerm"][-1] / reg, 1) if reg else None,
            "district": rate(dj), "county": rate(cj), "national": ctx.get("jobsNational"),
            # the whole series for the line on the page, as NFSZ sampled it
            "months": jobs["months"],
            "series": [round(100 * a / b, 2) if a is not None and b else None
                       for a, b in zip(js["registered"], js["workingAge"], strict=True)],
        }
    cen = ctx.get("census")
    if cen:
        mine = cen["settlements"].get(ksh) or {}
        d = cen["districts"].get(district) or {}
        c = cen["counties"].get(county) or {}
        block = {k: {"value": mine.get(k), "district": d.get(k), "county": c.get(k),
                     "country": cen["country"].get(k)}
                 for k in cen["measures"] if mine.get(k) is not None}
        if block:
            out["census"] = block
    if ctx["grants"].get(ksh):
        out["grants"] = sorted(ctx["grants"][ksh], key=lambda g: (g["year"], g["kind"]))
    fc = ctx.get("forecast")
    if fc:
        # the settlement itself, per branch: the chance that a district
        # serving it is vacant in a year, and how many are in the riskiest
        # tenth — said of the place, never of a named doctor's district
        here = {k: fc["kinds"][k].get("settlements", {}).get(ksh) for k in ("gp", "dental")}
        here = {k: v for k, v in here.items() if v}
        if here:
            out["forecastHere"] = here
        row = fc["kinds"]["gp"]["districts"].get(district)
        if row and row["districts"]:
            out["forecast"] = {k: row[k] for k in ("districts", "vacantNow", "vacantIn12",
                                                   "vacantIn12Band", "expectedNew",
                                                   "expectedRefills")}
    if mort and district in mort["districts"]:
        sha = mort["districts"][district]["sha"]
        out["avoidable"] = {"year": mort["year"], "district": sha["avoidable"]["t"],
                            "amenable": sha["amenable"]["t"],
                            "median": ctx.get("avoidableMedian")}
    return out or None

def build() -> dict:
    ksh = load_reference()
    if ksh is None:
        raise ParseError("the KSH gazetteer is missing")

    latest = read("latest.json")
    coverage = read("coverage.json")
    composite = read("composite.json")
    travel = read("traveltime.json")
    transit = read("transit.json")
    age = read("age.json")
    clusters = read("clusters.json")
    gyse = read("gyse.json")
    vedono = read("vedono.json")
    pharmacy = read("pharmacy.json")
    tenure = read("tenure.json")
    ages = read("age.json")
    emergency = read("emergency.json")
    specialist = read("specialist.json")
    living = living_context(read("territorial.json"), read("jobseekers.json"),
                            read("mortality.json"), read("census.json"),
                            read("grants.json"), read("forecast.json"))
    # the coordinates of the surgeries that have a doctor, for the street-level
    # map; geocode_filled.py fills this cache
    coords = json.loads((ROOT / "etl" / "geocode_cache.json").read_text(encoding="utf-8"))
    benefit = (read("kedvezmenyezett.json") or {}).get("settlements", {})
    if not (latest and coverage and composite):
        raise ParseError("the district, coverage or index data is missing")

    from kedvezmenyezett import county_key, normalize

    by_id = {
        "coverageDental": {s["kshId"]: s for s in coverage["kinds"]["dental"]["settlements"]},
        "coverageGp": {s["kshId"]: s for s in coverage["kinds"]["gp"]["settlements"]},
        "composite": {s["kshId"]: s for s in composite["settlements"]},
        "travel": {s["kshId"]: s for s in (travel or {}).get("settlements", [])},
        "transit": {s["kshId"]: s for s in (transit or {}).get("settlements", [])},
        "age": {s["kshId"]: s for s in (age or {}).get("settlements", [])},
    }
    # the index is a ranking, so the rank is worth more than the score
    ranked = sorted(composite["settlements"], key=lambda s: -s["index"])
    rank_of = {s["kshId"]: i + 1 for i, s in enumerate(ranked)}

    cluster_of: dict[str, dict] = {}
    for cluster in (clusters or {}).get("clusters", []):
        for member in cluster["members"]:
            cluster_of[member["kshId"]] = {
                "name": cluster["name"], "settlements": cluster["settlements"],
                "population": cluster["population"],
            }

    # which districts serve this settlement and are not filled: the ids come
    # from the snapshot's own per-settlement index, the details from the
    # district records themselves
    vacancies: dict[str, list[dict]] = {}
    for kind in ("gp", "dental"):
        snap = latest["kinds"][kind]
        by_fin = {p["id"]: p for p in snap.get("praxes", [])}
        for row in snap.get("settlements", []):
            ids = list(row.get("vacantPraxisIds", [])) + list(row.get("dissolvedPraxisIds", []))
            for fin in ids:
                praxis = by_fin.get(fin)
                if praxis is None:
                    continue
                site = (praxis.get("sites") or [{}])[0]
                vacancies.setdefault(row["kshId"], []).append({
                    "kind": kind,
                    "fin": fin,
                    "type": praxis.get("type", ""),
                    "status": praxis.get("status", ""),
                    "since": praxis.get("vacantSince", ""),
                    "longTerm": bool(praxis.get("longTerm")),
                    "longTermSince": praxis.get("longTermSince", ""),
                    "seat": site.get("settlement", ""),
                    "population": praxis.get("population"),
                })
    for rows_ in vacancies.values():
        rows_.sort(key=lambda r: (r["kind"], r["since"] or "9999"))

    # every district that has a doctor today, by code: the year-on-year
    # comparison leans on it to tell a real change from an archive artefact
    filled_now = {f["id"]: {**f, "kind": kind}
                  for kind in ("gp", "dental")
                  for f in latest["kinds"][kind].get("filledPraxes", [])}

    # what the same settlement looked like a year ago, from the archive
    year_ago = archive_year_ago(latest.get("month", ""))
    recent_cutoff = month_back(latest.get("month", ""), 12)

    # the surgeries that actually stand in a settlement, with the physician
    # the public NEAK registry names (CLAUDE.md rule 3: filled districts only)
    surgeries: dict[str, list[dict]] = {}
    for kind in ("gp", "dental"):
        spells = (tenure or {}).get("kinds", {}).get(kind, {})
        for f in latest["kinds"][kind].get("filledPraxes", []):
            spell = spells.get(f["id"]) or {}
            geo = coords.get(f"{f.get('postalCode', '')} {f.get('settlement', '')}, "
                             f"{f.get('address', '')}") or {}
            surgeries.setdefault(normalize_settlement(f["settlement"]), []).append({
                "kind": kind,
                "fin": f["id"],
                # what the registry itself typed, where it differs from the
                # one spelling this site shows (etl/address.py)
                **({"addressRaw": f["addressRaw"]} if f.get("addressRaw") else {}),
                "lat": geo.get("lat"),
                "lon": geo.get("lon"),
                "geoApprox": bool(geo.get("geoApprox")) if geo.get("lat") else None,
                "type": f.get("type", ""),
                "doctor": f.get("doctor", ""),
                "provider": f.get("provider", ""),
                "postalCode": f.get("postalCode", ""),
                "address": f.get("address", ""),
                # how long this physician has held it, as far back as our own
                # archive reaches; fromStart means "or longer"
                "since": spell.get("since", ""),
                "months": spell.get("months"),
                "fromStart": bool(spell.get("fromStart")),
            })
    for rows_ in surgeries.values():
        rows_.sort(key=lambda r: (r["kind"], r["type"], r["doctor"]))

    chemists: dict[str, list[dict]] = {}
    for ph in (pharmacy or {}).get("pharmacies", []):
        chemists.setdefault(normalize_settlement(ph["settlement"]), []).append({
            "name": ph["name"],
            "postalCode": ph.get("postalCode", ""),
            "address": ph.get("address", ""),
            "lat": ph.get("lat"),
            "lon": ph.get("lon"),
            "geoApprox": ph.get("geoApprox"),
        })
    for rows_ in chemists.values():
        rows_.sort(key=lambda r: r["name"])

    # everything else that stands in the settlement and has a coordinate: the
    # on-call point, the ambulance station, the hospital, the outpatient clinic
    # and the medical-aid shop. One block, so a map can draw them together.
    places: dict[str, list[dict]] = {}

    def add_place(settlement: str, kind: str, name: str, address: str,
                  lat, lon, approx=None) -> None:
        if lat is None or lon is None or not settlement:
            return
        places.setdefault(normalize_settlement(settlement), []).append({
            "kind": kind, "name": name, "address": address,
            "lat": lat, "lon": lon, "geoApprox": bool(approx),
        })

    for point in (emergency or {}).get("points", []):
        add_place(point.get("settlement", ""), point["group"],
                  point.get("provider", ""), point.get("address", ""),
                  point.get("lat"), point.get("lon"), point.get("geoApprox"))
    for site in (specialist or {}).get("sites", []):
        add_place(site.get("settlement", ""), site.get("care", "specialist"),
                  site.get("institution", ""), site.get("address", ""),
                  site.get("lat"), site.get("lon"), site.get("geoApprox"))
    for site in (gyse or {}).get("sites", []):
        if site.get("kind") in ("shop", "branch", "workshop"):
            add_place(site.get("settlement", ""), "gyse", site.get("provider", ""),
                      site.get("address", ""), site.get("lat"), site.get("lon"),
                      site.get("geoApprox"))

    visitor_sites: dict[str, list[dict]] = {}
    for row in (vedono or {}).get("rows", []):
        if not row.get("settlement"):
            continue
        visitor_sites.setdefault(normalize_settlement(row["settlement"]), []).append({
            "branch": row.get("branch", ""),
            "provider": row.get("provider", ""),
            "postalCode": row.get("postalCode", ""),
            "address": row.get("address", ""),
        })
    for rows_ in visitor_sites.values():
        rows_.sort(key=lambda r: (r["branch"], r["address"]))

    shops: dict[str, int] = {}
    for row in (gyse or {}).get("settlements", []):
        shops[normalize_settlement(row["settlement"])] = row["retail"]
    visitors: dict[str, dict] = {}
    for row in (vedono or {}).get("settlements", []):
        visitors[normalize_settlement(row["settlement"])] = row

    entries = [e for e in ksh.entries
               if not (e["name"] == "Budapest" and not e["isDistrictOfCapital"])]
    slugs = resolve_slugs(entries)

    rows: list[dict] = []
    for e in entries:
        key = e["kshId"]
        name_key = normalize_settlement(e["name"])
        record = {
            "kshId": key,
            "slug": slugs[e["kshId"]],
            "settlement": e["name"],
            "county": e["county"],
            "district": e["district"],
            "population": e["population"],
            # hectares, from the gazetteer: the one size measure our sources
            # publish, and what a Budapest kerület is compared on
            "area": e.get("area") or 0,
            "benefit": f"{county_key(e['county'])}|{normalize(e['name'])}" in benefit,
        }

        for branch, source in (("gp", "coverageGp"), ("dental", "coverageDental")):
            row = by_id[source].get(key)
            if row:
                record[branch] = {
                    "state": row["class"],
                    "filled": row["filled"],
                    "vacant": row["vacant"] + row["dissolved"],
                    "isSeat": row["isSeat"],
                }

        drive = by_id["travel"].get(key)
        if drive:
            record["travel"] = {
                layer: {"minutes": drive.get(f"{layer}Min"),
                        "km": drive.get(f"{layer}Km"),
                        "at": drive.get(f"{layer}At")}
                for layer in ("gp", "dental", "oncall", "ambulance",
                              "inpatient", "outpatient", "gyse", "pharmacy", "sbo")
                if drive.get(f"{layer}Min") is not None
            }

        bus = by_id["transit"].get(key)
        if bus and not bus.get("capital"):
            record["transit"] = {
                "departures": bus["departures"],
                "reachable": bus["reachable"],
                **{layer: {"direct": bus.get(f"{layer}Direct"),
                           "minutes": bus.get(f"{layer}Minutes"),
                           "target": bus.get(f"{layer}Target")}
                   for layer in ("gp", "oncall", "inpatient")},
            }

        age_row = by_id["age"].get(key)
        if age_row and not age_row["suppressed"]:
            record["age"] = {
                "youngShare": age_row["youngShare"], "oldShare": age_row["oldShare"],
                "young": age_row["youngNow"], "old": age_row["oldNow"],
                # the census counts behind the shares, for the age split chart
                "censusYoung": age_row["young"], "censusWorking": age_row["working"],
                "censusOld": age_row["old"], "censusTotal": age_row["censusTotal"],
                # the pyramid: each band by sex, straight from the census
                "male": age_row.get("male"), "female": age_row.get("female"),
                "bySex": age_row.get("bySex"),
            }

        index = by_id["composite"].get(key)
        if index:
            record["index"] = {
                "value": index["index"],
                "band": index["band"],
                "rank": rank_of[key],
                "of": len(ranked),
                "parts": {k: v for k, v in index["parts"].items() if v is not None},
            }
        if key in cluster_of:
            record["cluster"] = cluster_of[key]
        if key in vacancies:
            record["vacant"] = vacancies[key]
        then = {}
        for kind, rows__ in year_ago["kinds"].items():
            now = record.get(kind)
            if now is None:
                continue
            was = set(rows__.get(key, []))
            is_now = {v["fin"] for v in vacancies.get(key, []) if v["kind"] == kind}
            by_fin = {v["fin"]: v for v in vacancies.get(key, [])}
            # The two sets differ for two reasons: something changed, or an
            # archived month's list was built differently from today's. Only
            # the changes the current snapshot can corroborate are reported —
            # a district "newly" vacant since 2004 is an archive artefact, not
            # news, and a district that merely left the list proves nothing
            # unless it is filled today.
            then[kind] = {
                "vacant": len(was), "vacantNow": len(is_now),
                "resolved": [
                    {"fin": fin, "doctor": filled_now[fin].get("doctor", ""),
                     "settlement": filled_now[fin].get("settlement", ""),
                     "type": filled_now[fin].get("type", "")}
                    for fin in sorted(was - is_now) if fin in filled_now
                ],
                "newlyVacant": [
                    {k: by_fin[fin][k] for k in ("fin", "type", "status",
                                                 "since", "seat")}
                    for fin in sorted(is_now - was)
                    if fin in by_fin and (by_fin[fin]["since"] or "") >= recent_cutoff
                ],
            }
        if then:
            # physicians who took over a district here inside the window
            fresh = sum(1 for r in surgeries.get(name_key, [])
                        if r["since"] and r["since"] >= recent_cutoff
                        and not r["fromStart"])
            # who started here inside the window, by name: the registry names
            # a physician of a filled district, and only of a filled one
            arrivals = [
                {k: r[k] for k in ("kind", "fin", "type", "doctor", "since")}
                for r in surgeries.get(name_key, [])
                if r["since"] and r["since"] >= recent_cutoff and not r["fromStart"]
            ]
            record["change"] = {"month": year_ago["month"], "kinds": then,
                                "newDoctors": fresh, "arrivals": arrivals}
        if name_key in surgeries:
            record["surgeries"] = surgeries[name_key]
        if name_key in chemists:
            record["pharmacies"] = chemists[name_key]
        if name_key in places:
            record["places"] = places[name_key]
        if name_key in shops:
            record["gyse"] = shops[name_key]
        if name_key in visitors:
            record["vedono"] = {
                "territorial": visitors[name_key]["territorial"],
                "school": visitors[name_key]["school"],
                "sites": visitor_sites.get(name_key, []),
            }

        block = living_block(key, e["district"], e["county"], living)
        if block:
            record["living"] = block

        rows.append(record)

    country = (ages or {}).get("country") or {}
    out = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": latest.get("month", ""),
        "bands": composite.get("bands", []),
        # the national age split, so a settlement page can say how its own
        # differs without loading the census file
        "national": {
            "age": {
                "young": country.get("young"),
                "old": country.get("old"),
                "total": country.get("censusTotal"),
                "working": (country.get("censusTotal") or 0)
                - (country.get("young") or 0) - (country.get("old") or 0),
                "male": country.get("male"),
                "female": country.get("female"),
                "bySex": country.get("bySex"),
            },
            # the country's jobseeker share, for the line on each page
            "jobseekers": (
                {"months": living["jobs"]["months"],
                 "series": [round(100 * a / b, 2) if b else None
                            for a, b in zip(living["jobs"]["national"]["registered"],
                                            living["jobs"]["national"]["workingAge"], strict=True)]}
                if living.get("jobs") else None),
        },
        "comparedWith": year_ago["month"],
        "settlements": rows,
    }
    guard(out)
    return out


def month_back(month: str, back: int) -> str:
    if not month:
        return ""
    i = int(month[:4]) * 12 + int(month[5:7]) - 1 - back
    return f"{i // 12:04d}-{i % 12 + 1:02d}"


def archive_year_ago(month: str, back: int = 12, tolerance: int = 3) -> dict:
    """How many districts serving each settlement were vacant a year ago.

    Only the vacancy lists are compared, not the filled counts: the vacancy
    PDF was published (and backfilled) for every month we hold, while the
    registry behind "filled" is missing from several of them, and a month
    without a registry would read as "every doctor left".

    The archive is not evenly spaced, so each branch takes the nearest month
    it holds — and nothing at all if that is more than a quarter away,
    because "a year ago" would then be a different claim. A settlement that
    is absent from an archived month's index had no vacancy that month.
    """
    out: dict = {"month": "", "kinds": {}}
    if not month:
        return out
    target_i = int(month[:4]) * 12 + int(month[5:7]) - 1 - back
    target = f"{target_i // 12:04d}-{target_i % 12 + 1:02d}"
    picked = ""
    for kind in ("gp", "dental"):
        best, best_gap = None, tolerance + 1
        for path in sorted((ROOT / "data").glob(f"????-??/{kind}.json")):
            name = path.parent.name
            gap = abs((int(name[:4]) * 12 + int(name[5:7])) - (target_i + 1))
            if gap < best_gap:
                best, best_gap = path, gap
        if best is None:
            continue
        snap = json.loads(best.read_text(encoding="utf-8"))
        # the codes themselves, not just how many: a page can then say which
        # district went vacant and which one found a doctor
        out["kinds"][kind] = {
            row["kshId"]: sorted(set(row.get("vacantPraxisIds", []))
                                 | set(row.get("dissolvedPraxisIds", [])))
            for row in snap.get("settlements", []) if row.get("kshId")
        }
        picked = picked or best.parent.name
    out["month"] = picked or target
    return out


def guard(out: dict) -> None:
    rows = out["settlements"]
    if len(rows) < 3000:
        raise ParseError(f"only {len(rows)} settlement profiles")
    if len({r["slug"] for r in rows}) != len(rows):
        raise ParseError("the slugs are not unique")
    missing_index = [r for r in rows if "index" not in r]
    if len(missing_index) > 5:
        raise ParseError(f"{len(missing_index)} settlements have no index")
    for r in rows:
        if not r["settlement"] or not r["county"]:
            raise ParseError(f"{r['kshId']}: incomplete profile")
        index = r.get("index")
        if index and not 1 <= index["rank"] <= index["of"]:
            raise ParseError(f"{r['settlement']}: rank out of range")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    rows = out["settlements"]
    SLUGS.write_text(json.dumps({
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": out["dataMonth"],
        "settlements": [[r["settlement"], r["county"], r["slug"],
                         r.get("population", 0)] for r in rows],
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    withs = lambda k: sum(1 for r in rows if k in r)  # noqa: E731
    print(f"wrote {OUT}: {len(rows)} settlement profiles")
    print(f"  with driving times: {withs('travel')}, with bus data: {withs('transit')}, "
          f"with age: {withs('age')}, in a care desert: {withs('cluster')}")
    print(f"  wrote {SLUGS} ({SLUGS.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
