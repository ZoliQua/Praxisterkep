"""Settlement-level age composition from the KSH 2022 census (source F).

The Helységnévtár the pipeline already uses gives the resident population of
every settlement but says nothing about its age. The census dissemination
API does, for every settlement and Budapest district, keyed by the same
five-digit KSH code (törzsszám):

    https://nepszamlalas2022.ksh.hu/api/version            -> {"version":"V67"}
    https://nepszamlalas2022.ksh.hu/api/dataflows/WBS003/<version>/d/
        TIME_PERIOD:2022,TEL_SZ_ADAT:<codes>,TERUL_GEO5:

The trailing empty geography selector returns the whole country in one
request. Ages come split by sex (MY_/FY_ prefixes), so the three groups are
summed: 0–14, 15–64, 65+. NEME_KEV1 is the settlement total and is used as
the control sum.

Two rules the census forces on us:

  * Disclosure control. Small settlements have suppressed cells
    (OBS_STATUS = "Q", OBS_VALUE = null). Where exactly one group is
    missing it is recovered as total − the other two; where more than one
    is missing the settlement is published with ages = null and
    ageSuppressed = true. Nothing is interpolated (CLAUDE.md rule 2).
  * The census is a 2022 headcount, the pipeline's denominator is the
    2025 Helységnévtár. So what this module publishes per settlement is
    the age *shares* from 2022 plus the counts they imply for the current
    resident population, flagged as derived. The raw census counts travel
    with them so the derivation stays checkable.

Budapest: code 13578 is "kerületre nem bontható" in the census (no 2022
data), so the capital is summed from its 23 district codes.

Licence: KSH, 2022. évi népszámlálás, CC BY 4.0 — the UI credits it.

Usage:
  python etl/ksh_age.py [--refresh]
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
OUT = ROOT / "data" / "age.json"
SCHEMA_VERSION = 1

API = "https://nepszamlalas2022.ksh.hu/api"
DATAFLOW = "WBS003"
CENSUS_YEAR = "2022"
CODES = ["NEME_KEV1", "MY_LT15", "MY15-64", "MY_GE65",
         "FY_LT15", "FY15-64", "FY_GE65"]
GROUPS = {
    "young": ("MY_LT15", "FY_LT15"),        # 0–14
    "working": ("MY15-64", "FY15-64"),      # 15–64
    "old": ("MY_GE65", "FY_GE65"),          # 65+
}
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Praxisterkep/1.0"}
# the census publishes the capital only as its districts
BUDAPEST_CODE = "13578"


def fetch(refresh: bool = False) -> tuple[str, list[dict]]:
    """The census observations, archived under data/raw/ksh/ as gzipped JSON."""
    version = requests.get(f"{API}/version", timeout=60, headers=HEADERS).json()["version"]
    target = RAW_DIR / f"census2022_{version}.json.gz"
    if target.exists() and not refresh:
        with gzip.open(target, "rt", encoding="utf-8") as fh:
            return version, json.load(fh)
    url = (f"{API}/dataflows/{DATAFLOW}/{version}/d/"
           f"TIME_PERIOD:{CENSUS_YEAR},TEL_SZ_ADAT:{'+'.join(CODES)},TERUL_GEO5:")
    resp = requests.get(url, timeout=180, headers=HEADERS)
    resp.raise_for_status()
    rows = resp.json()
    if len(rows) < 15000:
        raise ParseError(f"census response suspiciously small: {len(rows)} observations")
    target.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(target, "wt", encoding="utf-8") as fh:
        json.dump(rows, fh, ensure_ascii=False)
    return version, rows


def observations(rows: list[dict]) -> dict[str, dict[str, int | None]]:
    """{KSH code: {indicator: value or None}} for the settlement-level codes."""
    out: dict[str, dict[str, int | None]] = {}
    for r in rows:
        code = r.get("TERUL_GEO5") or ""
        if len(code) != 5 or code.startswith("HU") or not code.isdigit():
            continue  # járás and NUTS aggregates travel in the same response
        value = r.get("OBS_VALUE")
        out.setdefault(code, {})[r["TEL_SZ_ADAT"]] = (
            None if value is None else int(value))
    return out


def compose(cells: dict[str, int | None]) -> dict:
    """The three age groups of one settlement, with suppression handled."""
    total = cells.get("NEME_KEV1")
    groups: dict[str, int | None] = {}
    for name, (male, female) in GROUPS.items():
        m, f = cells.get(male), cells.get(female)
        groups[name] = None if (m is None or f is None) else m + f
    missing = [k for k, v in groups.items() if v is None]
    recovered = False
    if len(missing) == 1 and total is not None:
        known = sum(v for k, v in groups.items() if v is not None)
        groups[missing[0]] = max(total - known, 0)
        recovered = True
        missing = []
    if missing or total is None:
        return {"censusTotal": total, "young": None, "working": None, "old": None,
                "suppressed": True, "recovered": False}
    if sum(groups.values()) != total:  # type: ignore[arg-type]
        raise ParseError("age groups do not sum to the census total")
    return {"censusTotal": total, **groups, "suppressed": False, "recovered": recovered}


def build(refresh: bool = False) -> dict:
    version, raw = fetch(refresh)
    cells = observations(raw)
    ksh = load_reference()
    if ksh is None:
        raise ParseError("the KSH gazetteer is missing; run the pipeline first")

    settlements: list[dict] = []
    for e in ksh.entries:
        if e["name"] == "Budapest" and not e["isDistrictOfCapital"]:
            continue  # summed from its districts below
        got = cells.get(e["kshId"])
        if got is None:
            continue
        comp = compose(got)
        settlements.append(entry(e, comp))

    # Budapest as a whole: the census has no row for it
    districts = [s for s in settlements if s["county"] == "Budapest"]
    capital = next((e for e in ksh.entries
                    if e["name"] == "Budapest" and not e["isDistrictOfCapital"]), None)
    if capital and districts and all(not d["suppressed"] for d in districts):
        settlements.append(entry(capital, {
            "censusTotal": sum(d["censusTotal"] for d in districts),
            "young": sum(d["young"] for d in districts),
            "working": sum(d["working"] for d in districts),
            "old": sum(d["old"] for d in districts),
            "suppressed": False, "recovered": False,
        }))

    counties = aggregate(settlements, key=lambda s: s["county"])
    country = aggregate(settlements, key=lambda _: "country")["country"]

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "KSH, 2022. évi népszámlálás",
        "sourceUrl": "https://nepszamlalas2022.ksh.hu/",
        "licence": "CC BY 4.0",
        "censusYear": int(CENSUS_YEAR),
        "apiVersion": version,
        "populationYear": 2025,
        "settlements": settlements,
        "counties": [counties[c] for c in sorted(counties)],
        "country": country,
    }
    guard(out)
    return out


def entry(e: dict, comp: dict) -> dict:
    """One settlement: census counts, shares, and the derived current counts."""
    population = e["population"]
    total = comp["censusTotal"] or 0
    shares = {k: (comp[k] / total if (total and comp[k] is not None) else None)
              for k in GROUPS}
    return {
        "kshId": e["kshId"],
        "settlement": e["name"],
        "county": e["county"],
        "district": e["district"],
        "isDistrictOfCapital": e["isDistrictOfCapital"],
        "population": population,
        "censusTotal": comp["censusTotal"],
        "young": comp["young"],
        "working": comp["working"],
        "old": comp["old"],
        "youngShare": shares["young"],
        "oldShare": shares["old"],
        # the 2022 shares carried onto the 2025 resident population
        "youngNow": None if shares["young"] is None else round(shares["young"] * population),
        "oldNow": None if shares["old"] is None else round(shares["old"] * population),
        "suppressed": comp["suppressed"],
        "recovered": comp["recovered"],
    }


def aggregate(settlements: list[dict], key) -> dict[str, dict]:
    """County (or national) totals; Budapest counted once, via its districts."""
    groups: dict[str, list[dict]] = {}
    for s in settlements:
        if s["settlement"] == "Budapest" and not s["isDistrictOfCapital"]:
            continue  # the 23 districts already carry the capital
        groups.setdefault(key(s), []).append(s)
    out: dict[str, dict] = {}
    for name, list_ in groups.items():
        usable = [s for s in list_ if not s["suppressed"]]
        census = sum(s["censusTotal"] or 0 for s in usable)
        young = sum(s["young"] or 0 for s in usable)
        old = sum(s["old"] or 0 for s in usable)
        population = sum(s["population"] for s in list_)
        out[name] = {
            "name": name,
            "settlements": len(list_),
            "suppressed": len(list_) - len(usable),
            "population": population,
            "censusTotal": census,
            "young": young,
            "old": old,
            "youngShare": young / census if census else None,
            "oldShare": old / census if census else None,
            "youngNow": round((young / census) * population) if census else None,
            "oldNow": round((old / census) * population) if census else None,
        }
    return out


def guard(out: dict) -> None:
    settlements = out["settlements"]
    if len(settlements) < 3000:
        raise ParseError(f"only {len(settlements)} settlements carry age data")
    suppressed = sum(1 for s in settlements if s["suppressed"])
    if suppressed > 100:
        raise ParseError(f"{suppressed} settlements are suppressed; the census "
                         "response looks wrong")
    for s in settlements:
        if s["suppressed"]:
            continue
        if s["young"] + s["working"] + s["old"] != s["censusTotal"]:
            raise ParseError(f"{s['settlement']}: age groups do not sum to the total")
        if not 0 <= s["youngShare"] <= 1 or not 0 <= s["oldShare"] <= 1:
            raise ParseError(f"{s['settlement']}: impossible age share")
    if len(out["counties"]) != 20:
        raise ParseError(f"{len(out['counties'])} counties instead of 20")
    country = out["country"]
    if not 0.10 <= country["youngShare"] <= 0.20:
        raise ParseError(f"national 0-14 share out of range: {country['youngShare']}")
    if not 0.15 <= country["oldShare"] <= 0.30:
        raise ParseError(f"national 65+ share out of range: {country['oldShare']}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true",
                        help="re-download even if the census archive exists")
    args = parser.parse_args()
    out = build(args.refresh)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    c = out["country"]
    print(f"wrote {OUT}: {len(out['settlements'])} settlements "
          f"({sum(1 for s in out['settlements'] if s['suppressed'])} suppressed, "
          f"{sum(1 for s in out['settlements'] if s['recovered'])} recovered)")
    print(f"  national: 0-14 {c['youngShare']:.1%}, 65+ {c['oldShare']:.1%} "
          f"(census {c['censusTotal']:,}, current population {c['population']:,})")


if __name__ == "__main__":
    main()
