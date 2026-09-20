"""Build data/dental_extra.json — the dental services outside the district map.

The district pipeline counts Alapellátás rows of district-type services; this
builder takes everything else the NEAK registry contains (source C) and joins
it to the same EESZT master data (source H) the district supplement uses:

    oncall      Alapellátás / Ügyelet — one registry row per physician on the
                duty roster, so a service usually has many rows
    university  Alapellátás / Egyetemi alapellátás
    specialist  every Szakellátás row (szájsebészet, fogszabályozás, röntgen,
                parodontológia, egyetemi és a fogyatékkal élők szakellátása)

Join chain, identical to build_eeszt.py but with the profession set that
belongs to the service type (Röntgen -> 1306, Fogszabályozás -> 1302, …):

    registry unit code -> NEAK_FINSZOLG.FINKOD (TIP = FOG)
      -> NNGYK9_KOD == EUSZOLG_ENGEDELY_PUBLIKUS.SZERVEZETI_EGYSEG_KOD
      -> licence of the service's own profession -> premises + coordinates

Name policy (CLAUDE.md rule 3): the contracted physicians NEAK publishes for
these services are kept, but the provider organisation, its NEAK code and the
EESZT provider id are carried only for services that name a physician — on a
service with none they would identify whoever stands in. guard() enforces it.

Usage:
  python etl/build_dental_extra.py [--month YYYY-MM]
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_eeszt import EesztError, load, latest_date, same_place
from parse_dental import _clean
from parse_registry import UNIT_CODE_RE, parse_extra

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "dental_extra.json"
SCHEMA_VERSION = 1

TIP = "FOG"
# every dental profession code starts with 13
DENTAL_PREFIX = "13"
# the EESZT profession a NEAK service type is licensed under; a type missing
# from the map falls back to "any dental profession" and is counted
PROFESSION_BY_TYPE = {
    "Ügyelet": {"1300"},
    "Egyetemi alapellátás": {"1300"},
    "Szájsebészet": {"1301"},
    "Fogszabályozás": {"1302"},
    "Parodontológia": {"1303"},
    "Gyermek szakellátás": {"1304"},
    "Röntgen": {"1306"},
    "Fogyatékkal élő gyermekek szakellátása": {"1300", "1304"},
    "Fogyatékkal élő felnőttek szakellátása": {"1300"},
    # a university clinic holds licences across the whole dental spectrum
    "Egyetemi szakellátás": None,
}
GROUPS = ("oncall", "university", "specialist")
HUNGARY = (45.7, 48.65, 16.0, 23.0)  # lat min/max, lon min/max


def _site_key(postal: str, settlement: str, address: str) -> str:
    return f"{postal} {settlement}, {address}"


def build(month: str, date: str) -> dict:
    registry = ROOT / "data" / "raw" / month / "dental_registry.xls"
    if not registry.exists():
        raise EesztError(f"no dental registry archived for {month}")
    rows = parse_extra(registry)

    fx, fin = load("neak_finszolg", date)
    ex, eng = load("euszolg_engedely", date)
    px, prov = load("euszolg", date)

    fin_rows: dict[str, list] = collections.defaultdict(list)
    for r in fin:
        fin_rows[r[fx["FINKOD"]]].append(r)
    lic_by_unit: dict[str, list] = collections.defaultdict(list)
    for r in eng:
        lic_by_unit[r[ex["SZERVEZETI_EGYSEG_KOD"]]].append(r)
    tax_by_provider = {r[px["EUSZOLG_AZONOSITO"]]: (r[px["ADOSZAM"]] or "")[:8] for r in prov}
    geocache = json.loads((ROOT / "etl" / "geocode_cache.json").read_text(encoding="utf-8"))

    professions: dict[str, str] = {}
    on_call: list[str] = []

    def on_call_idx(text: str | None) -> int:
        text = text or ""
        if text not in on_call:
            on_call.append(text)
        return on_call.index(text)

    # one service per registry unit code; the rows of a service differ only in
    # the physician (duty rosters) and, for a handful, in the site
    by_id: dict[str, list[dict]] = collections.OrderedDict()
    for r in rows:
        by_id.setdefault(r["id"], []).append(r)

    services: list[dict] = []
    unmatched: dict[str, list] = {}
    unmatched_details: dict[str, list] = {}
    stats: dict[str, collections.Counter] = {g: collections.Counter() for g in GROUPS}
    types: dict[str, str] = {}

    for code, group_rows in by_id.items():
        first = group_rows[0]
        group, unit_type = first["group"], first["unitType"]
        types[unit_type] = group
        st = stats[group]
        st["services"] += 1
        st["rows"] += len(group_rows)
        st[f"type:{unit_type}"] += 1

        sites: list[dict] = []
        for r in group_rows:
            site = {"postalCode": r["postalCode"], "settlement": r["settlement"],
                    "address": r["address"]}
            if site not in sites:
                sites.append(site)
        doctors = sorted({r["doctor"] for r in group_rows if r["doctor"]})
        entry: dict = {
            "id": code,
            "group": group,
            "level": first["level"],
            "unitType": unit_type,
            "county": first["county"],
            "settlement": sites[0]["settlement"],
            "postalCode": sites[0]["postalCode"],
            "address": sites[0]["address"],
            "rows": len(group_rows),
        }
        if len(sites) > 1:
            entry["sites"] = sites
        if doctors:
            entry["doctors"] = doctors
            st["named"] += 1
            # provider identity follows the physician (see module docstring)
            for field in ("neakCode", "provider"):
                value = next((r.get(field) for r in group_rows if r.get(field)), None)
                if value:
                    entry[field] = value
        else:
            st["unnamed"] += 1

        def locate(postal: str, settlement: str, address: str, source: str) -> bool:
            """Attach coordinates from the shared cache (no network here)."""
            hit = geocache.get(_site_key(postal, settlement, address))
            if not hit:
                return False
            entry["geo"] = {"lat": hit["lat"], "lon": hit["lon"],
                            "approx": bool(hit.get("geoApprox")), "from": source}
            st["geo"] += 1
            return True

        cands = [r for r in fin_rows.get(code, []) if r[fx["TIP"]] == TIP]
        if not cands:
            other = sorted({r[fx["TIP"]] for r in fin_rows.get(code, [])})
            reason = ["otherTip", ", ".join(other)] if other else ["noFin", ""]
            unmatched[code] = reason
            st[reason[0]] += 1
            # no EESZT record at all, but the registry gives the surgery address
            locate(entry["postalCode"], entry["settlement"], entry["address"], "registry")
            services.append(entry)
            continue
        st["fin"] += 1

        units = sorted({c[fx["NNGYK9_KOD"]] for c in cands})
        wanted = PROFESSION_BY_TYPE.get(unit_type, "missing")
        if wanted == "missing":
            st["typeFallback"] += 1
            print(f"      WARNING: unknown service type {unit_type!r} — "
                  f"matching against any dental profession")
            wanted = None
        unit_lics = [x for u in units for x in lic_by_unit.get(u, [])]
        lics = [x for x in unit_lics
                if (x[ex["SZAKMA_KOD"]] or "").startswith(DENTAL_PREFIX)
                and (wanted is None or x[ex["SZAKMA_KOD"]] in wanted)]
        places = {(x[ex["TELEPHELY_TELEPULES"]] or "",
                   re.sub(r"\W+", "", (x[ex["TELEPHELY_CIM"]] or "").lower())[:12])
                  for x in lics}

        reason: list | None = None
        detail_lics: list = []
        if lics and len(units) > 1 and len(places) > 1:
            reason = ["ambiguous", f"{len(units)}|{len(places)}"]
            detail_lics, lics = lics, []
        elif not lics:
            if unit_lics:
                detail_lics = unit_lics
                other_prof = sorted({x[ex["SZAKMA_NEV"]] for x in unit_lics})
                reason = ["otherProfession", "; ".join(other_prof[:3])
                          + ("; …" if len(other_prof) > 3 else "")]
            else:
                reason = ["noUnitLicence", ", ".join(units)]

        if lics:
            st["licence"] += 1
            matching = [x for x in lics
                        if any(same_place(s["settlement"], x[ex["TELEPHELY_TELEPULES"]] or "")
                               for s in sites)]
            pool = matching or lics
            best = next((x for x in pool if x[ex["TELEPHELY_TELEPULES"]]
                         and x[ex["TELEPHELY_CIM"]]), pool[0])
            fin_tax = (cands[0][fx["ADOIGSZ_8"]] or "")[:8]
            provider_match = bool(fin_tax) and fin_tax == tax_by_provider.get(
                best[ex["EUSZOLG_AZONOSITO"]], "")
            professions[best[ex["SZAKMA_KOD"]]] = best[ex["SZAKMA_NEV"]]
            entry["licence"] = {
                "postalCode": best[ex["TELEPHELY_IRSZAM"]] or "",
                "settlement": best[ex["TELEPHELY_TELEPULES"]] or "",
                "address": best[ex["TELEPHELY_CIM"]] or "",
                "profession": best[ex["SZAKMA_KOD"]] or "",
                "settlementMatch": bool(matching),
                "providerMatch": provider_match,
                "publicFunded": best[ex["KOZFINANSZIROZOTT"]] == "I",
                "onCall": on_call_idx(best[ex["UGYELET_KESZENLET"]]),
                "licenceCount": len(lics),
            }
            entry["trace"] = {
                "units": ",".join(units),
                "licenceId": best[ex["ENGEDELY_AZONOSITO"]] or "",
                "providerId": (best[ex["EUSZOLG_AZONOSITO"]] or "") if doctors else "",
            }
            st["settlementMatch" if matching else "settlementMismatch"] += 1
            st["providerMatch" if provider_match else "providerMismatch"] += 1
            located = locate(best[ex["TELEPHELY_IRSZAM"]] or "",
                             best[ex["TELEPHELY_TELEPULES"]] or "",
                             best[ex["TELEPHELY_CIM"]] or "", "licence")
        else:
            st[reason[0]] += 1
            unmatched[code] = reason
            entry["trace"] = {"units": ",".join(units), "licenceId": "", "providerId": ""}
            if detail_lics:
                out_rows = []
                for x in detail_lics:
                    professions[x[ex["SZAKMA_KOD"]]] = x[ex["SZAKMA_NEV"]]
                    out_rows.append([
                        x[ex["ENGEDELY_AZONOSITO"]] or "",
                        x[ex["SZERVEZETI_EGYSEG_KOD"]] or "",
                        x[ex["TELEPHELY_IRSZAM"]] or "",
                        x[ex["TELEPHELY_TELEPULES"]] or "",
                        x[ex["TELEPHELY_CIM"]] or "",
                        x[ex["SZAKMA_KOD"]] or "",
                        1 if x[ex["KOZFINANSZIROZOTT"]] == "I" else 0,
                        on_call_idx(x[ex["UGYELET_KESZENLET"]]),
                    ])
                unmatched_details[code] = out_rows
            located = False

        # the registry's own surgery address is the fallback location
        if not located:
            locate(entry["postalCode"], entry["settlement"], entry["address"], "registry")
        services.append(entry)

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "asOf": date,
        "dataMonth": month,
        "source": f"data/raw/{month}/dental_registry.xls",
        "eesztSources": {name: f"data/raw/eeszt/{name}_{date}.jsonl.gz" for name in
                         ("neak_finszolg", "euszolg", "euszolg_engedely")},
        "types": types,
        "professions": professions,
        "onCall": on_call,
        "stats": {g: dict(sorted(s.items())) for g, s in stats.items()},
        "services": services,
        "unmatched": unmatched,
        "unmatchedDetails": unmatched_details,
    }
    guard(out, len(rows))
    return out


def guard(out: dict, row_count: int) -> None:
    """Hard checks — a violation must stop the build, never ship."""
    services = out["services"]
    if len(services) != len({s["id"] for s in services}):
        raise EesztError("duplicate service id")
    if sum(s["rows"] for s in services) != row_count:
        raise EesztError(
            f"row count mismatch: {sum(s['rows'] for s in services)} != {row_count}")
    for g, st in out["stats"].items():
        matched = st.get("licence", 0)
        n_unmatched = sum(1 for s in services
                          if s["group"] == g and s["id"] in out["unmatched"])
        if matched + n_unmatched != st["services"]:
            raise EesztError(
                f"{g}: {matched} matched + {n_unmatched} unmatched "
                f"!= {st['services']} services")
    allowed = {"id", "group", "level", "unitType", "county", "settlement",
               "postalCode", "address", "rows", "sites", "doctors", "neakCode",
               "provider", "licence", "trace", "geo"}
    for s in services:
        if not UNIT_CODE_RE.match(s["id"]):
            raise EesztError(f"bad unit code {s['id']!r}")
        unknown = set(s) - allowed
        if unknown:
            raise EesztError(f"{s['id']}: unexpected fields {sorted(unknown)}")
        if not s["county"] or not s["settlement"]:
            raise EesztError(f"{s['id']}: missing county/settlement")
        named = bool(s.get("doctors"))
        if not named and (s.get("provider") or s.get("neakCode")
                          or s.get("trace", {}).get("providerId")):
            raise EesztError(f"{s['id']}: provider identity without a named physician")
        if any(not _clean(d) for d in s.get("doctors", [])):
            raise EesztError(f"{s['id']}: empty physician name")
        geo = s.get("geo")
        if geo and not (HUNGARY[0] <= geo["lat"] <= HUNGARY[1]
                        and HUNGARY[2] <= geo["lon"] <= HUNGARY[3]):
            raise EesztError(f"{s['id']}: coordinates outside Hungary")
    for code, reason in out["unmatched"].items():
        if reason[0] not in {"noFin", "otherTip", "noUnitLicence", "ambiguous",
                             "otherProfession"}:
            raise EesztError(f"{code}: unknown unmatched reason {reason[0]!r}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", default=None)
    args = parser.parse_args()
    month = args.month or sorted(
        p.parent.name for p in (ROOT / "data" / "raw").glob("*/dental_registry.xls"))[-1]
    out = build(month, latest_date())
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    total = sum(st["services"] for st in out["stats"].values())
    print(f"wrote {OUT}: {total} services ({out['dataMonth']}, EESZT {out['asOf']})")
    for g, st in out["stats"].items():
        print(f"  {g}: {st['services']} services, {st['rows']} rows, "
              f"licence {st.get('licence', 0)}, located {st.get('geo', 0)}")


if __name__ == "__main__":
    main()
