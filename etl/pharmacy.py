"""Where the nearest pharmacy is.

A prescription has to be filled somewhere, and in a village that distance
belongs on the same map as the surgery and the on-call point. Two registers
publish pharmacies:

  * NEAK's list of pharmacies it has a dispensing contract with — a clean
    workbook of postcode, settlement and street, republished monthly. That
    is what this module uses.
  * The statutory register behind OGYÉI's Gyógyszertár-kereső, which is
    richer (it gives the type — közforgalmú, fiók, kézi, intézeti — the
    phone number and the opening hours). It is NOT used here: the site's
    robots.txt disallows both the finder and the export endpoint, and its
    copyright notice forbids "a honlap tartalmának adatbázis-szerű
    feldolgozása". Those two lines are a request not to do what a monthly
    crawler would do, so the pipeline does not do it. Asking NNGYK for
    permission is the way in, not scraping around it.

The consequence is stated rather than hidden: this is the *contracted*
network, so a pharmacy without a NEAK contract is missing, and the list
carries no type — a fiókgyógyszertár open ninety minutes a day counts the
same as a full pharmacy.

The download URL carries its own date (gyogyszertarak_YYYYMMDD.xlsx1) and
there is no stable alias, so the landing page is read for the link. The
2024 edition had a different sheet name and six columns instead of four,
which is why the parser goes by position and not by sheet name.

Usage:
  python etl/pharmacy.py [--month 2026-09]
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_ksh import load_reference, normalize_settlement

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT = ROOT / "data" / "pharmacy.json"
SCHEMA_VERSION = 1
FILE = "pharmacies.xlsx"

LANDING = ("https://www.neak.gov.hu/felso_menu/lakossagnak/"
           "szerzodott_szolgaltatok/gyogyszertarak")
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Praxisterkep/1.0"}
LINK_RE = re.compile(r'pfile/file\?path=([^"&]*gyogyszertarak_\d{8}\.xlsx\d?)')
# "Budapest IX.ker." and "Baracs (Apátszállás)" both mean the parent settlement
PART_RE = re.compile(r"\s*\(.*?\)\s*$")
DISTRICT_RE = re.compile(r"\s+[IVX]+\.\s*ker\.?$", re.IGNORECASE)


def fold(name: str) -> str:
    """The list drops ő and ű inconsistently, so both sides are folded."""
    text = normalize_settlement(name)
    return text.replace("ő", "o").replace("ű", "u")


def settlement_key(name: str) -> str:
    text = PART_RE.sub("", (name or "").strip())
    text = DISTRICT_RE.sub("", text)
    return "Budapest" if text.startswith("Budapest") else text


def fetch(month: str) -> Path:
    """The dated workbook, archived under the month's raw directory."""
    target = RAW_DIR / month / FILE
    if target.exists():
        return target
    page = requests.get(LANDING, headers=HEADERS, timeout=60)
    page.raise_for_status()
    match = LINK_RE.search(page.text)
    if not match:
        raise ParseError(f"no dated pharmacy workbook linked on {LANDING}")
    url = f"https://www.neak.gov.hu/pfile/file?path={match.group(1)}&inline=true"
    resp = requests.get(url, headers=HEADERS, timeout=300)
    resp.raise_for_status()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(resp.content)
    print(f"  saved {target} ({len(resp.content)} bytes) from {match.group(1)}")
    return target


def parse(path: Path) -> list[dict]:
    """Row per pharmacy, from whichever column layout this edition uses."""
    frame = pd.read_excel(path, sheet_name=0, dtype=str).fillna("")
    columns = [str(c).strip() for c in frame.columns]
    # 2026: name, postcode, settlement, address. 2024: operator, name,
    # postcode, settlement, street, house number.
    def column(*candidates: str) -> str | None:
        for candidate in candidates:
            for c in columns:
                if c.lower().startswith(candidate):
                    return c
        return None

    name_col = column("patika")
    postal_col = column("irányító")
    settlement_col = column("település", "helység")
    address_col = column("cím", "utca")
    number_col = column("házszám")
    operator_col = column("működtet")
    if not (name_col and postal_col and settlement_col and address_col):
        raise ParseError(f"{path.name}: unexpected columns {columns}")

    rows = []
    for r in frame.to_dict("records"):
        settlement = settlement_key(str(r[settlement_col]))
        address = " ".join(part for part in
                           [str(r[address_col]).strip(),
                            str(r[number_col]).strip() if number_col else ""]
                           if part)
        if not settlement or not address:
            continue
        rows.append({
            "name": re.sub(r"\s+", " ", str(r[name_col])).strip(),
            "operator": str(r[operator_col]).strip() if operator_col else "",
            "postalCode": str(r[postal_col]).strip(),
            "settlement": settlement,
            "address": re.sub(r"\s+", " ", address),
        })
    if not rows:
        raise ParseError(f"{path.name}: no pharmacy rows")
    return rows


def build(month: str | None = None) -> dict:
    month = month or sorted(p.name for p in RAW_DIR.iterdir()
                            if p.is_dir() and (p / FILE).exists())[-1]
    path = RAW_DIR / month / FILE
    if not path.exists():
        # unlike the NEAK registers, this workbook is linked from a landing
        # page rather than sitting in the monthly directory, so the month's
        # fetch does not bring it and the step fetches it here
        path = fetch(month)

    cache_path = ROOT / "etl" / "geocode_cache.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    ksh = load_reference()

    rows = parse(path)
    for r in rows:
        geo = cache.get(f"{r['postalCode']} {r['settlement']}, {r['address']}")
        r["lat"] = (geo or {}).get("lat")
        r["lon"] = (geo or {}).get("lon")
        r["geoApprox"] = bool((geo or {}).get("geoApprox")) if geo else None

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": month,
        "source": "NEAK szerződött gyógyszertárak",
        "stats": overall(rows, ksh),
        "counties": by_county(rows, ksh),
        "settlements": by_settlement(rows, ksh),
        "pharmacies": rows,
    }
    guard(out)
    return out


def overall(rows: list[dict], ksh) -> dict:
    hosted = {fold(r["settlement"]) for r in rows if r["settlement"]}
    total = len([e for e in (ksh.entries if ksh else [])
                 if not (e["name"] == "Budapest" and not e["isDistrictOfCapital"])])
    population = ksh.country_population if ksh else 0
    return {
        "pharmacies": len(rows),
        "settlements": len(hosted),
        "settlementsTotal": total,
        "geocoded": sum(1 for r in rows if r["lat"] is not None),
        "population": population,
        "residentsPerPharmacy": round(population / len(rows)) if rows else 0,
    }


def by_county(rows: list[dict], ksh) -> list[dict]:
    """The list carries no county, so the gazetteer supplies it."""
    counties: collections.Counter = collections.Counter()
    unknown = 0
    for r in rows:
        entry = ksh.lookup(r["settlement"]) if ksh else None
        if entry:
            counties[entry["county"]] += 1
        else:
            unknown += 1
    out = []
    for county, count in sorted(counties.items()):
        population = ksh.county_population.get(county, 0) if ksh else 0
        out.append({
            "county": county,
            "pharmacies": count,
            "population": population,
            "residentsPerPharmacy": round(population / count) if count else 0,
        })
    if unknown:
        print(f"  {unknown} pharmacies sit in a settlement the gazetteer does not know")
    return out


def by_settlement(rows: list[dict], ksh) -> list[dict]:
    if not ksh:
        return []
    hosted: collections.Counter = collections.Counter()
    for r in rows:
        hosted[fold(r["settlement"])] += 1
    out = []
    for e in ksh.entries:
        if e["name"] == "Budapest" and not e["isDistrictOfCapital"]:
            continue
        key = fold("Budapest" if e["isDistrictOfCapital"] else e["name"])
        out.append({
            "settlement": e["name"],
            "county": e["county"],
            "district": e["district"],
            "population": e["population"],
            "pharmacies": hosted.get(key, 0),
        })
    return sorted(out, key=lambda s: (-s["population"], s["settlement"]))


def guard(out: dict) -> None:
    st = out["stats"]
    rows = out["pharmacies"]
    if st["pharmacies"] < 2000:
        raise ParseError(f"only {st['pharmacies']} pharmacies — the list changed")
    if st["settlements"] < 1200:
        raise ParseError(f"only {st['settlements']} settlements host a pharmacy")
    if sum(c["pharmacies"] for c in out["counties"]) > st["pharmacies"]:
        raise ParseError("county counts exceed the pharmacy count")
    for r in rows:
        if not re.fullmatch(r"\d{4}", r["postalCode"]):
            raise ParseError(f"{r['name']}: {r['postalCode']!r} is not a postcode")
        if not r["settlement"] or not r["address"]:
            raise ParseError(f"{r['name']}: incomplete address")
    # the capital is written several ways in the source; if the fold stopped
    # working, Budapest would fall apart into fragments
    budapest = sum(1 for r in rows if r["settlement"] == "Budapest")
    if budapest < 300:
        raise ParseError(f"only {budapest} pharmacies in Budapest — the "
                         "settlement fold is broken")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", default=None)
    parser.add_argument("--fetch", action="store_true", help="download the workbook")
    args = parser.parse_args()
    month = args.month or __import__("datetime").date.today().strftime("%Y-%m")
    if args.fetch:
        fetch(month)
    out = build(args.month)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT}: {st['pharmacies']} contracted pharmacies in "
          f"{st['settlements']} of {st['settlementsTotal']} settlements")
    print(f"  {st['residentsPerPharmacy']} residents per pharmacy, "
          f"geocoded {st['geocoded']}")


if __name__ == "__main__":
    main()
