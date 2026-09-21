"""Contracted specialist-care institutions (source I), inpatient and outpatient.

NEAK publishes both lists in the same download directory the district
registries come from:

    Fekvobeteg-szakellato_intezmenyek_xlsx   sheet "Fekvő"  — hospitals,
        one row per department (Osztálykód) and profession
    Jarobeteg-szakellato_intezmenyek_xlsx    sheet "Járó"   — outpatient
        clinics, one row per consulting room (Rendelő azonosító)

Both sheets carry a title in row 1 and the header in row 2. The PDF twins
render the same data, except that the outpatient PDF stops 84 rows before
the end of its own sheet, so the workbooks are the only complete source and
the only ones archived.

The nine-character department / consulting-room id is a NEAK FIN code and
joins straight to NEAK_FINSZOLG (TIP = FEK / JAR), and the four-character
institution code is INTKOD — the same keys the district pipeline already
uses. Nothing here touches the district universe: these FIN codes do not
appear among the primary-care districts, so the specialist lists can never
move a vacancy rate.

Usage:
  python etl/specialist.py [--month 2026-09]
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_ksh import load_reference, normalize_settlement

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT = ROOT / "data" / "specialist.json"
SCHEMA_VERSION = 1

FILES = {
    "inpatient": ("inpatient_specialist.xlsx", "Fekvő", "Osztálykód",
                  "Osztály megnevezése",
                  "Fekvőbeteg-szakellátó intézmény neve"),
    "outpatient": ("outpatient_specialist.xlsx", "Járó", "Rendelő azonosító",
                   "Rendelő megnevezése",
                   "Járóbeteg-szakellátó intézmény neve"),
}
# profession codes are four digits, except the outpatient "Q" gondozó codes
# (Q08, Q19 …) and the inpatient chronic-care ones ending in C (010C, 180C)
PROFESSION_RE = re.compile(r"^(\d{3}[0-9C]|Q\d{2})$")
FIN_RE = re.compile(r"^[0-9A-Z]{9}$")
INT_RE = re.compile(r"^[0-9A-Z]{4}$")
# the baselines the ±15% row-count guard measures against (2026-09)
BASELINE = {"inpatient": 2909, "outpatient": 12931}


def county_key(name: str) -> str:
    out = re.sub(r"\s+(megye|vármegye)$", "", (name or "").strip())
    return "Budapest" if out.startswith("Budapest") else out


def settlement_key(name: str) -> str:
    """"Budapest VIII. kerület" -> "Budapest"; other names unchanged."""
    name = (name or "").strip()
    return "Budapest" if name.startswith("Budapest") else name


def parse(path: Path, care: str) -> list[dict]:
    _, sheet, id_col, unit_col, name_col = FILES[care]
    df = pd.read_excel(path, sheet_name=sheet, header=1, dtype=str)
    df = df.map(lambda v: v.strip() if isinstance(v, str) else v)
    needed = ["Megye", "Megye megnevezése", "NEAK kód", name_col,
              "Székhely irányítószáma", "Székhely városa",
              "Székhely címe", id_col, unit_col, "Szakmakód",
              "Szakma megnevezése", "Telephely irányítószáma",
              "Telephely városa", "Telephely címe"]
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise ParseError(f"{path.name}: missing columns {missing}")

    rows: list[dict] = []
    for record in df.to_dict("records"):
        get = lambda col: ("" if pd.isna(record.get(col)) else str(record[col]))  # noqa: E731
        fin = get(id_col)
        if not fin:
            continue
        rows.append({
            "care": care,
            "fin": fin,
            "neakCode": get("NEAK kód"),
            "institution": get(name_col),
            "county": county_key(get("Megye megnevezése")),
            "unit": get(unit_col),
            "professionCode": get("Szakmakód"),
            "profession": get("Szakma megnevezése").strip(),
            "settlement": settlement_key(get("Telephely városa")),
            "siteName": get("Telephely városa"),
            "postalCode": get("Telephely irányítószáma"),
            "address": get("Telephely címe"),
            "seatSettlement": get("Székhely városa"),
            "seatAddress": get("Székhely címe"),
        })
    if not rows:
        raise ParseError(f"{path.name}: no data rows")
    return rows


def latest_month() -> str:
    months = sorted(p.name for p in RAW_DIR.iterdir()
                    if p.is_dir() and re.fullmatch(r"\d{4}-\d{2}", p.name)
                    and (p / FILES["inpatient"][0]).exists())
    if not months:
        raise ParseError("no archived month holds the specialist workbooks")
    return months[-1]


def build(month: str | None = None) -> dict:
    month = month or latest_month()
    raw = RAW_DIR / month
    ksh = load_reference()
    cache_path = ROOT / "etl" / "geocode_cache.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

    rows: list[dict] = []
    for care in FILES:
        rows.extend(parse(raw / FILES[care][0], care))

    for r in rows:
        geo = cache.get(f"{r['postalCode']} {r['siteName']}, {r['address']}") \
            or cache.get(f"{r['postalCode']} {r['settlement']}, {r['address']}")
        r["lat"] = (geo or {}).get("lat")
        r["lon"] = (geo or {}).get("lon")
        r["geoApprox"] = bool((geo or {}).get("geoApprox")) if geo else None
        r.pop("siteName")

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": month,
        "stats": {care: care_stats([r for r in rows if r["care"] == care], ksh)
                  for care in FILES},
        "counties": by_county(rows, ksh),
        "professions": by_profession(rows),
        "institutions": by_institution(rows),
        "sites": by_site(rows),
        "rows": rows,
    }
    guard(out)
    return out


def care_stats(rows: list[dict], ksh) -> dict:
    population = ksh.country_population if ksh else 0
    institutions = {r["neakCode"] for r in rows}
    sites = {(r["neakCode"], r["postalCode"], r["settlement"], r["address"]) for r in rows}
    return {
        "rows": len(rows),
        "institutions": len(institutions),
        "units": len({r["fin"] for r in rows}),
        "professions": len({r["professionCode"] for r in rows}),
        "sites": len(sites),
        "settlements": len({normalize_settlement(r["settlement"]) for r in rows}),
        "counties": len({r["county"] for r in rows}),
        "geocoded": sum(1 for r in rows if r["lat"] is not None),
        "population": population,
        "residentsPerInstitution": round(population / len(institutions)) if institutions else 0,
    }


def by_county(rows: list[dict], ksh) -> list[dict]:
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        groups[r["county"]].append(r)
    out = []
    for county, list_ in sorted(groups.items()):
        inp = [r for r in list_ if r["care"] == "inpatient"]
        outp = [r for r in list_ if r["care"] == "outpatient"]
        population = (ksh.county_population.get(county, 0) if ksh else 0)
        professions = {r["professionCode"] for r in list_}
        out.append({
            "county": county,
            "population": population,
            "inpatientInstitutions": len({r["neakCode"] for r in inp}),
            "inpatientDepartments": len({r["fin"] for r in inp}),
            "outpatientInstitutions": len({r["neakCode"] for r in outp}),
            "outpatientRooms": len({r["fin"] for r in outp}),
            "professions": len(professions),
            "inpatientProfessions": len({r["professionCode"] for r in inp}),
            "outpatientProfessions": len({r["professionCode"] for r in outp}),
            "settlements": len({normalize_settlement(r["settlement"]) for r in list_}),
            "residentsPerOutpatientRoom": (
                round(population / len({r["fin"] for r in outp})) if outp else 0),
        })
    return out


def by_profession(rows: list[dict]) -> list[dict]:
    groups: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    for r in rows:
        # the two lists spell the same profession differently (Title vs lower
        # case), so the code is the key and the longer label wins
        groups[(r["care"], r["professionCode"])].append(r)
    out = []
    for (care, code), list_ in groups.items():
        name = max((r["profession"] for r in list_), key=len)
        counties = sorted({r["county"] for r in list_})
        out.append({
            "care": care,
            "code": code,
            "profession": name,
            "units": len({r["fin"] for r in list_}),
            "institutions": len({r["neakCode"] for r in list_}),
            "counties": len(counties),
            "countyList": counties,
            "settlements": len({normalize_settlement(r["settlement"]) for r in list_}),
        })
    return sorted(out, key=lambda x: (-x["units"], x["profession"]))


def by_institution(rows: list[dict]) -> list[dict]:
    groups: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    for r in rows:
        groups[(r["care"], r["neakCode"])].append(r)
    out = []
    for (care, code), list_ in groups.items():
        out.append({
            "care": care,
            "neakCode": code,
            "institution": max((r["institution"] for r in list_), key=len),
            "county": list_[0]["county"],
            "seatSettlement": list_[0]["seatSettlement"],
            "seatAddress": list_[0]["seatAddress"],
            "units": len({r["fin"] for r in list_}),
            "professions": len({r["professionCode"] for r in list_}),
            "sites": len({(r["postalCode"], r["settlement"], r["address"]) for r in list_}),
            "settlements": len({normalize_settlement(r["settlement"]) for r in list_}),
        })
    return sorted(out, key=lambda x: (-x["units"], x["institution"]))


def by_site(rows: list[dict]) -> list[dict]:
    groups: dict[tuple, list[dict]] = collections.defaultdict(list)
    for r in rows:
        groups[(r["care"], r["neakCode"], r["postalCode"], r["settlement"],
                r["address"])].append(r)
    out = []
    for (care, code, postal, settlement, address), list_ in groups.items():
        first = list_[0]
        out.append({
            "care": care,
            "neakCode": code,
            "institution": first["institution"],
            "county": first["county"],
            "settlement": settlement,
            "postalCode": postal,
            "address": address,
            "units": len({r["fin"] for r in list_}),
            "professions": len({r["professionCode"] for r in list_}),
            "lat": first["lat"],
            "lon": first["lon"],
            "geoApprox": first["geoApprox"],
        })
    return sorted(out, key=lambda x: (-x["units"], x["institution"]))


def guard(out: dict) -> None:
    for care, st in out["stats"].items():
        base = BASELINE[care]
        if not 0.85 * base <= st["rows"] <= 1.15 * base:
            raise ParseError(
                f"{care}: row count {st['rows']} is outside ±15% of {base}")
    inp_ids = {r["fin"] for r in out["rows"] if r["care"] == "outpatient"}
    if len(inp_ids) != out["stats"]["outpatient"]["rows"]:
        raise ParseError("the outpatient consulting-room id is not unique any more")
    seen: set[tuple] = set()
    for r in out["rows"]:
        if not FIN_RE.fullmatch(r["fin"]):
            raise ParseError(f"not a FIN code: {r['fin']!r}")
        if not INT_RE.fullmatch(r["neakCode"]):
            raise ParseError(f"not an institution code: {r['neakCode']!r}")
        if not PROFESSION_RE.fullmatch(r["professionCode"]):
            raise ParseError(f"not a profession code: {r['professionCode']!r}")
        if not r["county"] or not r["settlement"] or not r["address"]:
            raise ParseError(f"{r['fin']}: incomplete site")
        key = (r["care"], r["fin"], r["professionCode"])
        if key in seen:
            raise ParseError(f"duplicate row {key}")
        seen.add(key)
    for group, keyname in (("counties", "county"), ("professions", "code"),
                           ("institutions", "neakCode"), ("sites", "settlement")):
        if not out[group]:
            raise ParseError(f"{group} came out empty")
    total = sum(st["rows"] for st in out["stats"].values())
    if total != len(out["rows"]):
        raise ParseError("the per-care row counts do not add up")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", default=None)
    args = parser.parse_args()
    out = build(args.month)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT} ({out['dataMonth']})")
    for care, st in out["stats"].items():
        print(f"  {care}: {st['rows']} rows, {st['institutions']} institutions, "
              f"{st['units']} units, {st['professions']} professions, "
              f"{st['sites']} sites (geocoded {st['geocoded']})")


if __name__ == "__main__":
    main()
