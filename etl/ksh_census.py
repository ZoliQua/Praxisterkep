"""How people live: education, work, digital skills, housing, households.

The 2022 census (source F2) answers far more than age, for every settlement,
járás and county, through the same dissemination API ksh_age.py reads:

    WBS003  population data by settlement   education, economic activity,
                                            digital activity, ten-year ages
    WBL003  occupied dwellings by settlement   comfort level
    WBH002  households by settlement           households of only 65+

Each measure is a share of two counts the census itself publishes:

  degree        a university or college degree (LISK5), per resident aged 20
                or over (total − under 10 − 10–19). Education is published for
                everyone aged 7+, so schoolchildren sit in the lowest bands and
                a share of "eight grades or less" would mostly measure how
                young a village is; a degree before twenty is all but unknown,
                which makes this one share clean.
  employed      employed (EMP) per resident aged 15+ (EMP + UNE + INACI + INACE)
  noDigital     no digital activity at all (DIGI0) per resident aged 6+
                (DIGI0 … DIGI3) — whether a phone consultation or an e-prescription
                can stand in for a surgery visit
  poorHousing   half-comfort, no comfort or emergency dwellings (KOMF_COMF3–5)
                per occupied dwelling (KOMF_TOTAL)
  elderlyOnly   households where everyone is 65+ (HO_65) per household
                (H1 … HGE6) — who has no one to drive them

Disclosure control: a settlement cell the census suppressed (OBS_STATUS "Q",
no value) leaves that one measure null for that settlement — with one
exception that is arithmetic, not estimation. The five comfort levels add up
to the occupied dwellings exactly, and the three poor ones are the small
cells that get suppressed; where full and plain comfort are published, the
poor ones are the total less those two. The identity is checked on every
area where all five are published before it is used anywhere. The járás and county values are never
summed from settlements: the census publishes its own (three-digit járás
codes, HUxxx counties), where a small cell does not vanish.

Licence: KSH, 2022. évi népszámlálás, CC BY 4.0.

Usage:
  python etl/ksh_census.py [--refresh]
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_ksh import load_reference

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "ksh"
OUT = ROOT / "data" / "census.json"
SCHEMA_VERSION = 1

API = "https://nepszamlalas2022.ksh.hu/api"
SOURCE_URL = "https://nepszamlalas2022.ksh.hu/adatbazis/"
CENSUS_YEAR = "2022"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Praxisterkep/1.0"}

# (dataflow, dimension, codes). The API truncates a large answer without
# saying so, so WBS003 is asked for in three parts and every part is parsed
# as JSON before anything is kept.
REQUESTS = [
    ("WBS003", "TEL_SZ_ADAT", ["NEME_KEV1", "Y_LT10", "Y10-19", "LISK5"]),
    ("WBS003", "TEL_SZ_ADAT", ["EMP", "UNE", "INACI", "INACE"]),
    ("WBS003", "TEL_SZ_ADAT", ["DIGI0", "DIGI1", "DIGI2", "DIGI3"]),
    ("WBL003", "INDICATORS2", ["KOMF_TOTAL", "KOMF_COMF1", "KOMF_COMF2", "KOMF_COMF3",
                               "KOMF_COMF4", "KOMF_COMF5"]),
    ("WBH002", "TEL_H_ADAT", ["H1", "H2", "H3", "H4", "H5", "HGE6", "HO_65"]),
]

# measure -> (numerator codes, denominator codes, denominator codes subtracted)
MEASURES = {
    "degree": (["LISK5"], ["NEME_KEV1"], ["Y_LT10", "Y10-19"]),
    "employed": (["EMP"], ["EMP", "UNE", "INACI", "INACE"], []),
    "noDigital": (["DIGI0"], ["DIGI0", "DIGI1", "DIGI2", "DIGI3"], []),
    "poorHousing": (["KOMF_COMF3", "KOMF_COMF4", "KOMF_COMF5"], ["KOMF_TOTAL"], []),
    "elderlyOnly": (["HO_65"], ["H1", "H2", "H3", "H4", "H5", "HGE6"], []),
}
DISTRICTS = 197
COUNTIES = 20
# the census's own "not assignable to a kerület" row: no járás of ours
UNASSIGNED = "Budapest kerületre nem bontható adatai"


def fetch(refresh: bool = False) -> tuple[str, list[dict], dict[str, str]]:
    """Observations of every request, and the geography names, archived."""
    version = requests.get(f"{API}/version", timeout=60, headers=HEADERS).json()["version"]
    target = RAW_DIR / f"census2022_living_{version}.json.gz"
    if target.exists() and not refresh:
        with gzip.open(target, "rt", encoding="utf-8") as fh:
            saved = json.load(fh)
        return version, saved["observations"], saved["geography"]
    rows: list[dict] = []
    for flow, dim, codes in REQUESTS:
        url = (f"{API}/dataflows/{flow}/{version}/d/"
               f"TIME_PERIOD:{CENSUS_YEAR},{dim}:{'+'.join(codes)},TERUL_GEO5:")
        resp = requests.get(url, timeout=300, headers=HEADERS)
        resp.raise_for_status()
        part = resp.json()  # a truncated answer fails here, loudly
        if len(part) < 3400 * len(codes) * 0.9:
            raise ParseError(f"{flow} {codes}: only {len(part)} observations")
        for r in part:
            rows.append({"flow": flow, "code": r[dim], "geo": r["TERUL_GEO5"],
                         "value": r.get("OBS_VALUE"), "status": r.get("OBS_STATUS")})
    structure = requests.get(f"{API}/structure/WBS003/{version}", timeout=120,
                             headers=HEADERS).json()["data"]
    geo_list = next(c for c in structure["codelists"] if c["id"] == "CL_TERUL_GEO5")
    geography = {c["id"]: c["name"] for c in geo_list["codes"]}
    target.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(target, "wt", encoding="utf-8") as fh:
        json.dump({"apiVersion": version, "observations": rows, "geography": geography},
                  fh, ensure_ascii=False)
    return version, rows, geography


def cells_by_geo(rows: list[dict]) -> dict[str, dict[str, int | None]]:
    out: dict[str, dict[str, int | None]] = {}
    for r in rows:
        value = r["value"]
        out.setdefault(r["geo"], {})[r["code"]] = None if value is None else int(value)
    return out


COMFORT = ["KOMF_COMF1", "KOMF_COMF2", "KOMF_COMF3", "KOMF_COMF4", "KOMF_COMF5"]


def recover_comfort(cells: dict[str, int | None]) -> dict[str, int | None]:
    """Poor dwellings as total − full − plain comfort, where the parts are hidden."""
    if all(cells.get(c) is not None for c in COMFORT + ["KOMF_TOTAL"]):
        if sum(cells[c] for c in COMFORT) != cells["KOMF_TOTAL"]:
            raise ParseError("comfort levels do not add up to the occupied dwellings")
        return cells
    total, full, plain = (cells.get(c) for c in ("KOMF_TOTAL", "KOMF_COMF1", "KOMF_COMF2"))
    if None in (total, full, plain):
        return cells
    out = dict(cells)
    # the three poor levels travel as one recovered count
    out["KOMF_COMF3"], out["KOMF_COMF4"], out["KOMF_COMF5"] = total - full - plain, 0, 0
    return out


def measures(cells: dict[str, int | None]) -> dict[str, float | None]:
    """The five shares of one area; a suppressed part leaves its share null."""
    cells = recover_comfort(cells)
    out: dict[str, float | None] = {}
    for key, (num, den, minus) in MEASURES.items():
        parts = [cells.get(c) for c in num + den + minus]
        if any(p is None for p in parts):
            out[key] = None
            continue
        n = sum(cells[c] for c in num)
        d = sum(cells[c] for c in den) - sum(cells[c] for c in minus)
        if d <= 0 or n > d:
            out[key] = None if d <= 0 else _fail(key, n, d)
            continue
        out[key] = round(n / d, 4)
    return out


def _fail(key: str, n: int, d: int):
    raise ParseError(f"{key}: numerator {n} exceeds denominator {d}")


def build(refresh: bool = False) -> dict:
    version, rows, geography = fetch(refresh)
    cells = cells_by_geo(rows)
    ksh = load_reference()
    if ksh is None:
        raise ParseError("the KSH gazetteer is missing; run the pipeline first")

    settlements: dict[str, dict] = {}
    for e in ksh.entries:
        if e["name"] == "Budapest" and not e["isDistrictOfCapital"]:
            continue  # the capital is a county here, below
        got = cells.get(e["kshId"])
        if got is None:
            continue
        settlements[e["kshId"]] = measures(got)
    if len(settlements) < 3150:
        raise ParseError(f"census measures for only {len(settlements)} settlements")

    districts: dict[str, dict] = {}
    counties: dict[str, dict] = {}
    for code, name in geography.items():
        if code not in cells:
            continue
        if len(code) == 3 and code.isdigit():
            if name == UNASSIGNED:
                continue
            districts[name.removesuffix(" járás")] = measures(cells[code])
        elif code.startswith("HU") and len(code) == 5:
            counties[name.removesuffix(" vármegye")] = measures(cells[code])
        elif code == "HU":
            country = measures(cells[code])
    out = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "KSH, 2022. évi népszámlálás",
        "sourceUrl": SOURCE_URL,
        "licence": "CC BY 4.0",
        "censusYear": int(CENSUS_YEAR),
        "apiVersion": version,
        "measures": list(MEASURES),
        "settlements": settlements,
        "districts": districts,
        "counties": counties,
        "country": country,
    }
    guard(out)
    return out


def guard(out: dict) -> None:
    if len(out["districts"]) != DISTRICTS:
        raise ParseError(f"{len(out['districts'])} járás in the census, expected {DISTRICTS}")
    if len(out["counties"]) != COUNTIES:
        raise ParseError(f"{len(out['counties'])} counties in the census, expected {COUNTIES}")
    for level in ("districts", "counties"):
        for name, m in out[level].items():
            missing = [k for k, v in m.items() if v is None]
            if missing:
                raise ParseError(f"{level} {name}: no census value for {missing}")
    country = out["country"]
    # broad sanity bounds for Hungary in 2022; a parser that read the wrong
    # code lands far outside them
    bounds = {"degree": (0.12, 0.35), "employed": (0.40, 0.65), "noDigital": (0.05, 0.40),
              "poorHousing": (0.01, 0.15), "elderlyOnly": (0.15, 0.40)}
    for key, (lo, hi) in bounds.items():
        v = country.get(key)
        if v is None or not lo <= v <= hi:
            raise ParseError(f"national {key} = {v}, outside {lo}–{hi}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true", help="re-download the census data")
    args = parser.parse_args()
    out = build(args.refresh)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    c = out["country"]
    print(f"wrote {OUT}: {len(out['settlements'])} settlements, {len(out['districts'])} járás")
    print("  national: " + ", ".join(f"{k} {v:.1%}" for k, v in c.items()))


if __name__ == "__main__":
    main()
