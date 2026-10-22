"""Income, births and deaths, migration — per settlement, from KSH.

The 2014 development decree (source L) says how a járás stood twelve years
ago. What a reader wants to know is how a place stands now: how much its
people earn, whether it is losing more people to the grave than it gains in
the cradle, and whether the living are leaving. KSH publishes all three per
settlement, every year, in its own map application TIMEA:

    https://map.ksh.hu/timea/

TIMEA is an ArcGIS Web AppBuilder page over a public map service. Its layers
carry, for every area, `ELEM_KOD | M_KOD | VON_IDO | VALUE` — area code,
indicator code, year, value — and can be queried directly:

    https://map.ksh.hu/arcgis/rest/services/ksh_map/MapServer/<layer>/query

    layer 2  TELEP_FC  settlements (the capital as one: KSH code 1357)
    layer 3  JARAS_FC  the 174 járás + Budapest as one ("999")
    layer 4  MEGYE_FC  the 20 counties
    table 8  INDIKATOR1  the indicator catalogue: name, unit, years per level

The settlement code is the KSH törzsszám without its check digit, i.e. the
first four digits of the five-digit `kshId` this project already keys every
settlement by. That is an exact key, so no settlement is matched by name.

Which indicators, and why (names are KSH's own, from INDIKATOR1):

  TYWQ002  SZJA-alapot képező jövedelem egy állandó lakosra    income per resident
  TYWQ003  ... egy adófizetőre                                 per taxpayer
  TYWQ001  ezer lakosra jutó adózók                           how many earn at all
  TYWB201  természetes szaporodás/fogyás ezer lakosra         births minus deaths
  TYWB001  élveszületés ezer lakosra
  TYWB101  halálozás ezer lakosra
  TYWC001  összes belföldi vándorlási különbözet ezer lakosra arrivals minus departures
  TYWJ001  egy háziorvosra jutó évi betegforgalom             a GP's yearly workload
  TYWJ107  nyugdíjban ... részesülők aránya a népességben
  TYWA001  népsűrűség
  TYWJ011–013  GP-registered diabetes / hypertension / ischaemic
           heart disease per 10 000 of the same age           járás and county only
  TYWA201  öregedési index                                     járás and county only
  TYWJ106  foglalkoztatást helyettesítő támogatás ezer 18–65 évesre

Every value is a rate. Rates cannot be averaged up a level, so the higher
levels come from KSH's own higher layers, never from our arithmetic. There is
no national layer; comparisons use the county value and the median of the 174
járás, the same yardstick districts.json already uses.

Each query's raw JSON response is archived gzipped in data/raw/ksh_timea/
with the date and the hash of its content. A monthly run fetches again and
writes a new archive only when KSH's numbers actually changed, so the git
history records each yearly update once instead of a copy every month.

Usage:
  python etl/ksh_timea.py
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_ksh import load_reference

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "territorial.json"
RAW = ROOT / "data" / "raw" / "ksh_timea"
SCHEMA_VERSION = 1

SERVICE = "https://map.ksh.hu/arcgis/rest/services/ksh_map/MapServer"
APP = "https://map.ksh.hu/timea/"
HEADERS = {"User-Agent": "Praxisterkep/1.0 (+https://github.com/ZoliQua/Praxisterkep)"}

LAYERS = {
    "settlement": (2, "TELEP_NEV"),
    "district": (3, "JARAS_NEV"),
    "county": (4, "MEGYE_NEV"),
}
# code -> (our key, levels it is published at)
INDICATORS = {
    "TYWQ002": ("incomePerResident", ("settlement", "district", "county")),
    "TYWQ003": ("incomePerTaxpayer", ("settlement", "district", "county")),
    "TYWQ001": ("taxpayersPer1000", ("settlement", "district", "county")),
    "TYWB201": ("naturalChange", ("settlement", "district", "county")),
    "TYWB001": ("births", ("settlement", "district", "county")),
    "TYWB101": ("deaths", ("settlement", "district", "county")),
    "TYWC001": ("migration", ("settlement", "district", "county")),
    "TYWJ001": ("gpVisitsPerGp", ("settlement", "district", "county")),
    "TYWJ107": ("pensionersShare", ("settlement", "district", "county")),
    "TYWA001": ("density", ("settlement", "district", "county")),
    "TYWJ011": ("diabetesRegistered", ("district", "county")),
    "TYWJ012": ("hypertensionRegistered", ("district", "county")),
    "TYWJ013": ("ischaemicRegistered", ("district", "county")),
    "TYWA201": ("ageingIndex", ("district", "county")),
    "TYWJ106": ("publicWorkPer1000", ("district", "county")),
}
CAPITAL_CODE = "1357"      # Budapest as one settlement
CAPITAL_DISTRICT = "999"   # and as one járás
# KSH's settlement layer is the 2025 settlement map: 3154 + the capital
MIN_SETTLEMENTS = 3100
DISTRICTS = 175
COUNTIES = 20


def _query(layer: int, where: str, fields: str) -> dict:
    # no orderByFields: sorting a 40 000-row answer server-side is what made
    # the service time out; the parser does not care about the order
    resp = requests.get(f"{SERVICE}/{layer}/query", params={
        "where": where, "outFields": fields, "returnGeometry": "false", "f": "json"},
        headers=HEADERS, timeout=300)
    resp.raise_for_status()
    doc = resp.json()
    if "error" in doc:
        raise ParseError(f"TIMEA layer {layer}: {doc['error']}")
    if doc.get("exceededTransferLimit"):
        # a truncated answer would silently drop settlements; never accept one
        raise ParseError(f"TIMEA layer {layer} truncated the answer for {where}")
    return doc


def fetch() -> dict[str, bytes]:
    """Every raw response this module reads, by archive file name."""
    out: dict[str, bytes] = {}
    catalogue = requests.get(f"{SERVICE}/8/query", params={
        "where": "1=1", "outFields": "*", "returnGeometry": "false", "f": "json"},
        headers=HEADERS, timeout=120)
    catalogue.raise_for_status()
    out["INDIKATOR1.json"] = catalogue.content
    years = {r["attributes"]["MUTATO_KOD"]: r["attributes"]
             for r in json.loads(catalogue.content)["features"]}
    level_field = {"settlement": "TELEP", "district": "JARAS", "county": "MEGYE"}
    for code, (_, levels) in INDICATORS.items():
        for level in levels:
            layer, name_field = LAYERS[level]
            fields = f"ELEM_KOD,{name_field},M_KOD,VON_IDO,VALUE"
            if level == "settlement":
                fields += ",JARAS_NEV,MEGYE_NEV"
            # one year per request keeps each answer near 3 000 rows; the
            # catalogue says which years exist at this level
            published = (years.get(code, {}).get(level_field[level]) or "").split(",")
            merged = {"features": []}
            for year in [y for y in published if y]:
                doc = _query(layer, f"M_KOD='{code}' AND VON_IDO='{year}'", fields)
                merged["features"].extend(doc["features"])
                merged.setdefault("fields", doc.get("fields"))
            if not merged["features"]:
                raise ParseError(f"TIMEA returned nothing for {code} at {level}")
            out[f"{code}_{level}.json"] = json.dumps(
                merged, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
            print(f"  {code} {level}: {len(merged['features'])} rows")
    return out


def _digest(files: dict[str, bytes]) -> str:
    h = hashlib.sha256()
    for name in sorted(files):
        h.update(name.encode()); h.update(hashlib.sha256(files[name]).digest())
    return h.hexdigest()


def archive(files: dict[str, bytes]) -> Path:
    """Keep the responses, but only once per distinct content."""
    digest = _digest(files)
    for existing in sorted(RAW.glob("*/manifest.json"), reverse=True):
        if json.loads(existing.read_text(encoding="utf-8")).get("sha256") == digest:
            return existing.parent
    folder = RAW / date.today().isoformat()
    folder.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        (folder / (name + ".gz")).write_bytes(gzip.compress(content, 9))
    (folder / "manifest.json").write_text(json.dumps({
        "source": APP, "service": SERVICE, "fetched": date.today().isoformat(),
        "sha256": digest, "files": sorted(f + ".gz" for f in files),
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return folder


def read_archive(folder: Path) -> dict[str, bytes]:
    return {p.name[:-3]: gzip.decompress(p.read_bytes()) for p in folder.glob("*.json.gz")}


def parse(files: dict[str, bytes], ksh_ids: dict[str, str]) -> dict:
    """{'indicators': {...}, 'settlements': {kshId: {key: {year: v}}}, ...}

    `ksh_ids` maps the four-digit KSH stem to our five-digit kshId.
    """
    catalogue = {f["attributes"]["MUTATO_KOD"]: f["attributes"]
                 for f in json.loads(files["INDIKATOR1.json"])["features"]}
    indicators = {}
    for code, (key, levels) in INDICATORS.items():
        meta = catalogue.get(code)
        if meta is None:
            raise ParseError(f"KSH no longer lists indicator {code}")
        indicators[key] = {"code": code, "label": meta["MUTATO_MEGNEV"].strip(),
                           "unit": meta["MERTEKEGYSEG"], "levels": list(levels)}

    settlements: dict[str, dict] = {}
    districts: dict[str, dict] = {}
    counties: dict[str, dict] = {}
    capital: dict[str, dict] = {}
    unmatched: set[str] = set()
    for code, (key, levels) in INDICATORS.items():
        for level in levels:
            doc = json.loads(files[f"{code}_{level}.json"])
            name_field = LAYERS[level][1]
            for feat in doc["features"]:
                a = feat["attributes"]
                if a["VALUE"] is None:
                    continue
                year, value = str(a["VON_IDO"]), round(float(a["VALUE"]), 2)
                if level == "settlement":
                    stem = str(a["ELEM_KOD"]).zfill(4)
                    if stem == CAPITAL_CODE:
                        capital.setdefault(key, {})[year] = value
                        continue
                    ksh = ksh_ids.get(stem)
                    if ksh is None:
                        unmatched.add(f"{stem} {a.get(name_field)}")
                        continue
                    settlements.setdefault(ksh, {}).setdefault(key, {})[year] = value
                elif level == "district":
                    name = "Budapest" if str(a["ELEM_KOD"]) == CAPITAL_DISTRICT else a[name_field]
                    districts.setdefault(name, {}).setdefault(key, {})[year] = value
                else:
                    counties.setdefault(a[name_field], {}).setdefault(key, {})[year] = value

    if len(settlements) < MIN_SETTLEMENTS:
        raise ParseError(f"only {len(settlements)} settlements matched, expected "
                         f"at least {MIN_SETTLEMENTS}; unmatched: {sorted(unmatched)[:10]}")
    if len(districts) != DISTRICTS or len(counties) != COUNTIES:
        raise ParseError(f"{len(districts)} járás / {len(counties)} counties, "
                         f"expected {DISTRICTS} / {COUNTIES}")
    withhold_copies(indicators, {"settlement": settlements, "district": districts,
                                 "county": counties})
    return {"indicators": indicators, "settlements": settlements,
            "districts": districts, "counties": counties, "capital": capital,
            "unmatched": sorted(unmatched)}


def _series(rows: dict[str, dict], key: str) -> dict[tuple[str, str], float]:
    return {(area, year): v for area, by_key in rows.items()
            for year, v in by_key.get(key, {}).items()}


def withhold_copies(indicators: dict, levels: dict[str, dict[str, dict]],
                    min_values: int = 20) -> list[str]:
    """Keep out an indicator whose every value is another one's.

    KSH's service has answered for TYWJ013 (GP-registered ischaemic heart
    disease, I20–I25) with the figures of TYWJ012 (hypertension, I10–I15) at
    every járás, county and year (checked 2026-10-20, live and in the
    archive). Two different diagnoses cannot agree to the hundredth in 1225
    cells, and a third of adults registered with ischaemic heart disease is
    not a number any register holds. Publishing it would print a copy under
    another name, so the later code of an identical pair is withheld: its
    values are dropped at every level and the indicator says why. Nothing is
    estimated in its place, and the next run brings it back by itself once
    KSH's answer differs.
    """
    withheld = []
    keys = sorted(indicators, key=lambda k: indicators[k]["code"])
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            if b in withheld or "withheld" in indicators[b]:
                continue
            shared = [lvl for lvl in indicators[a]["levels"] if lvl in indicators[b]["levels"]]
            pairs = [(_series(levels[lvl], a), _series(levels[lvl], b)) for lvl in shared]
            cells = sum(len(sb) for _, sb in pairs)
            if not shared or cells < min_values:
                continue
            if all(sa.keys() == sb.keys() and all(sa[k] == sb[k] for k in sb) for sa, sb in pairs):
                indicators[b]["withheld"] = {
                    "sameAs": indicators[a]["code"],
                    "reason": f"KSH answers {indicators[b]['code']} with the figures of "
                              f"{indicators[a]['code']} in every cell ({cells}); a source fault, "
                              "not published until the answer differs"}
                for lvl in indicators[b]["levels"]:
                    for by_key in levels[lvl].values():
                        by_key.pop(b, None)
                withheld.append(b)
                print(f"  WARNING {indicators[b]['code']} withheld: identical to "
                      f"{indicators[a]['code']} in all {cells} values")
    return withheld


def _ksh_stems() -> dict[str, str]:
    """Four-digit KSH stem -> our five-digit kshId, from the gazetteer itself.

    Read from the gazetteer (source F) rather than settlements.json: the
    settlement profiles are built from this module's output, so reading them
    here would make each depend on the other.
    """
    ref = load_reference()
    if ref is None:
        raise ParseError("the KSH gazetteer is missing")
    stems: dict[str, str] = {}
    for e in ref.entries:
        if e["county"] == "Budapest":
            continue  # the capital is one settlement in TIMEA, kept apart
        stem = e["kshId"][:4]
        if stem in stems:
            raise ParseError(f"two settlements share the KSH stem {stem}")
        stems[stem] = e["kshId"]
    return stems


def build(offline: bool = False) -> dict:
    if offline:
        archives = sorted(RAW.glob("*/manifest.json"))
        if not archives:
            raise ParseError("no TIMEA archive to read offline")
        folder = archives[-1].parent
        files = read_archive(folder)
    else:
        files = fetch()
        folder = archive(files)
    parsed = parse(files, _ksh_stems())
    years = sorted({y for s in parsed["settlements"].values()
                    for series in s.values() for y in series})
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "KSH TIMEA — Területi statisztikai adatok",
        "sourceUrl": APP,
        "archive": folder.relative_to(ROOT).as_posix(),
        "fetched": json.loads((folder / "manifest.json").read_text(encoding="utf-8"))["fetched"],
        "years": [years[0], years[-1]] if years else [],
        "counts": {"settlements": len(parsed["settlements"]),
                   "districts": len(parsed["districts"]),
                   "counties": len(parsed["counties"]),
                   "unmatched": len(parsed["unmatched"])},
        **parsed,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--offline", action="store_true",
                    help="parse the latest archive instead of querying KSH")
    out = build(ap.parse_args().offline)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    c = out["counts"]
    print(f"wrote {OUT}: {c['settlements']} settlements, {c['districts']} járás, "
          f"{c['counties']} counties, {c['unmatched']} unmatched; years {out['years']}")


if __name__ == "__main__":
    main()
