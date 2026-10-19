"""Registered jobseekers, per settlement, every month — from NFSZ.

A vacant GP district is harder to fill where there is no work: a doctor's
spouse needs a job too, and a shrinking, unemployed village is the last place
a young physician settles. So the labour market belongs on the same map.

The Nemzeti Foglalkoztatási Szolgálat publishes one workbook a month,
"NFSZ településsoros adatai", on

    https://nfsz.munka.hu/tart/stat_telepulessoros_adatok

The page itself is empty; it fills a list from a JSON endpoint
(/common/service/requestparser, name=statistics_filter_documents, id=11).
That list is what this module reads, so the month comes from NFSZ's own
title ("NFSZ településsoros adatai 2026. szeptember") and not from a file
name, which NFSZ spells three ways (T01202609, T01_202608, T01_2022_04).

Each workbook has one sheet per county plus the capital. A sheet lists every
settlement with

    Nyilvántartott össz. fő         registered jobseekers
    Foly.nyilv. hossz>365 nap       of whom continuously registered > 1 year
    Járadék / Segély tip. ell. fő   receiving insurance benefit / assistance
    FHT, RSZS fő                    on employment-substituting support
    Munkav. korú népes. fő          working-age population (15–64), KSH,
                                    1 January of the previous year
    Relatív mutató %                registered / working-age × 100

and closes with the county's own total. That total is the invariant: the
settlements must add up to it in every column, or the sheet is rejected.

Older months exist only as PDF. Those are not parsed — the series starts with
the first workbook and says so, rather than mixing two extraction methods.

Every workbook is archived as published in data/raw/nfsz/<YYYY-MM>.xlsx.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

import openpyxl
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_ksh import load_reference

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "jobseekers.json"
RAW = ROOT / "data" / "raw" / "nfsz"
SCHEMA_VERSION = 1

SITE = "https://nfsz.munka.hu"
PAGE = SITE + "/tart/stat_telepulessoros_adatok"
API = SITE + "/common/service/requestparser"
HEADERS = {"User-Agent": "Praxisterkep/1.0 (+https://github.com/ZoliQua/Praxisterkep)"}
MONTHS = {"január": 1, "február": 2, "március": 3, "április": 4, "május": 5,
          "június": 6, "július": 7, "augusztus": 8, "szeptember": 9,
          "október": 10, "november": 11, "december": 12}
# NFSZ has titled the same document "adatai" and "adatok", with stray spaces
# and suffixes ("2024. június2", "2023. december (excel)"); only the year and
# the month name are read. Before 2024 the series is quarterly.
TITLE = re.compile(r"településsoros adat(?:ai|ok)\s+(\d{4})\.\s*([a-záéíóöőúüű]+)", re.IGNORECASE)
# column -> key; positions are NFSZ's and are checked against the header text
COLUMNS = {3: ("registered", "Nyilvántar"), 4: ("longTerm", "365"),
           5: ("benefit", "Járadék"), 6: ("assistance", "Segély"),
           7: ("supported", "FHT"), 8: ("workingAge", "Munkav")}
MIN_MATCHED = 3150


def documents() -> list[dict]:
    resp = requests.post(API, data={"documentTitle": "", "dateFrom": "", "dateTo": "",
                                    "id": 11, "name": "statistics_filter_documents",
                                    "type": "all"}, headers=HEADERS, timeout=120)
    resp.raise_for_status()
    out = []
    for doc in resp.json():
        m = TITLE.search(doc.get("TITLE") or "")
        url = doc.get("DOC_URL_PUB") or ""
        if not m or not url.lower().endswith(".xlsx"):
            continue
        month = MONTHS.get(m.group(2).lower())
        if month is None:
            raise ParseError(f"unreadable month in NFSZ title: {doc['TITLE']}")
        out.append({"month": f"{m.group(1)}-{month:02d}", "url": SITE + url,
                    "title": doc["TITLE"]})
    if not out:
        raise ParseError("NFSZ lists no settlement workbooks")
    return sorted(out, key=lambda d: d["month"])


def fetch(docs: list[dict]) -> list[Path]:
    RAW.mkdir(parents=True, exist_ok=True)
    paths = []
    for doc in docs:
        path = RAW / f"{doc['month']}.xlsx"
        if not path.exists():
            resp = requests.get(doc["url"], headers=HEADERS, timeout=180)
            resp.raise_for_status()
            path.write_bytes(resp.content)
            print(f"  archived {path.name} ({len(resp.content) / 1e3:.0f} KB)")
        paths.append(path)
    return paths


# Csongrád megye became Csongrád-Csanád in 2020; the older workbooks use the
# old name for the same county and the same settlements.
COUNTY_RENAMED = {"Csongrád": "Csongrád-Csanád"}


def county_of(label: str) -> str:
    """'Baranya vármegye', 'Baranya megye', 'Szabolcs-Szatmár-Bereg vm.',
    'Főváros' -> the county name the rest of the project uses."""
    text = label.strip()
    if text == "Főváros":
        return "Budapest"
    text = re.sub(r"\s+(vármegye|megye|vm\.)$", "", text)
    return COUNTY_RENAMED.get(text, text)


def _int(v) -> int:
    if v is None or v == "":
        return 0
    return int(round(float(v)))


def parse_workbook(path: Path) -> dict[str, list[dict]]:
    """{county: [{'name': str, registered, longTerm, ...}]} with the sheet
    total checked against its settlements."""
    # not read_only: the 2019–2022 workbooks carry a wrong dimension tag, and
    # the fast reader then sees a single row where there are three hundred
    wb = openpyxl.load_workbook(path, data_only=True)
    out: dict[str, list[dict]] = {}
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))

        def is_header(r) -> bool:
            return bool(r) and len(r) > 3 and str(r[3] or "").startswith("Nyilvántar")

        heads = [i for i, r in enumerate(rows) if is_header(r)]
        if not heads:
            raise ParseError(f"{path.name}/{ws.title}: no column header")
        # the county is named in the header row itself; until 2023 the sheets
        # were called "Oldal1_1"… and only that cell said which county it was
        county = county_of(str(rows[heads[0]][0] or ws.title))
        for col, (_, word) in COLUMNS.items():
            if word not in str(rows[heads[0]][col] or ""):
                raise ParseError(f"{path.name}/{ws.title}: column {col} is "
                                 f"'{rows[heads[0]][col]}', expected '{word}…'")
        # layout: header, "települései", the settlements, the header again,
        # the county's total, then the footnotes
        end = heads[1] if len(heads) > 1 else len(rows)
        settlements = []
        for r in rows[heads[0] + 1:end]:
            if not r or not r[0] or str(r[0]).strip() == "települései":
                continue
            if not isinstance(r[3], (int, float)):
                raise ParseError(f"{path.name}/{ws.title}: non-numeric row {r[:4]}")
            settlements.append({"name": str(r[0]).strip(),
                                **{key: _int(r[col]) for col, (key, _) in COLUMNS.items()}})
        total = None
        for r in rows[end + 1:]:
            if r and r[0] and isinstance(r[3], (int, float)):
                total = {key: _int(r[col]) for col, (key, _) in COLUMNS.items()}
                break
        if total is None:
            raise ParseError(f"{path.name}/{ws.title}: no total row")
        for key in total:
            got = sum(s[key] for s in settlements)
            if got != total[key]:
                raise ParseError(f"{path.name}/{ws.title}: settlements add up to {got} "
                                 f"{key}, the sheet's total says {total[key]}")
        out[county] = settlements
    return out


def _gazetteer() -> list[dict]:
    """Every settlement and kerület, from the KSH gazetteer (source F) — not
    from settlements.json, which is built from this module's output."""
    ref = load_reference()
    if ref is None:
        raise ParseError("the KSH gazetteer is missing")
    return [e for e in ref.entries
            if not (e["name"] == "Budapest" and not e["isDistrictOfCapital"])]


def _matcher() -> dict[tuple[str, str], str]:
    """(county, casefolded name) -> kshId. NFSZ writes names in capitals;
    casefold is exact for Hungarian (Ő -> ő) so nothing fuzzier is needed."""
    return {(e["county"], e["name"].casefold()): e["kshId"] for e in _gazetteer()}


def _key(name: str) -> str:
    # "BUDAPEST 01. KER." -> "budapest 01. ker."; everything else is casefold
    return re.sub(r"\s+", " ", name).casefold()


def build(offline: bool = False) -> dict:
    if offline:
        paths = sorted(RAW.glob("*.xlsx"))
        docs = [{"month": p.stem} for p in paths]
    else:
        docs = documents()
        paths = fetch(docs)
    if not paths:
        raise ParseError("no NFSZ workbooks archived")
    match = _matcher()
    meta = _gazetteer()
    district_of = {e["kshId"]: e["district"] for e in meta}
    county_of_id = {e["kshId"]: e["county"] for e in meta}

    months = [d["month"] for d in docs]
    keys = [k for k, _ in COLUMNS.values()]
    per: dict[str, dict[str, list]] = {}
    unmatched: dict[str, set] = {}
    for i, path in enumerate(paths):
        book = parse_workbook(path)
        for county, rows in book.items():
            for row in rows:
                ksh = match.get((county, _key(row["name"])))
                if ksh is None:
                    unmatched.setdefault(months[i], set()).add(f"{county}: {row['name']}")
                    continue
                series = per.setdefault(ksh, {k: [None] * len(paths) for k in keys})
                for k in keys:
                    series[k][i] = row[k]
    latest = months[-1]
    missing_latest = sorted(unmatched.get(latest, ()))
    if len(per) < MIN_MATCHED:
        raise ParseError(f"only {len(per)} settlements matched; unmatched in "
                         f"{latest}: {missing_latest[:12]}")

    def rollup(group_of) -> dict[str, dict[str, list]]:
        out: dict[str, dict[str, list]] = {}
        for ksh, series in per.items():
            g = group_of(ksh)
            agg = out.setdefault(g, {k: [0] * len(paths) for k in keys})
            for k in keys:
                for i, v in enumerate(series[k]):
                    if v is not None:
                        agg[k][i] += v
        return out

    national = rollup(lambda _: "HU")["HU"]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "NFSZ településsoros adatai",
        "sourceUrl": PAGE,
        "fetched": date.today().isoformat(),
        "definition": ("Nyilvántartott álláskeresők a tartózkodási helyük szerint, "
                       "a hónap 20-i állapot szerint; munkavállalási korú népesség: "
                       "15–64 évesek, KSH, az előző év január 1."),
        "months": months,
        "latest": latest,
        "counts": {"settlements": len(per), "months": len(months),
                   "unmatchedLatest": len(missing_latest)},
        "unmatchedLatest": missing_latest,
        "national": national,
        "counties": rollup(lambda k: county_of_id[k]),
        "districts": rollup(lambda k: district_of[k]),
        "settlements": per,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--offline", action="store_true",
                    help="parse the archived workbooks without asking NFSZ")
    out = build(ap.parse_args().offline)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    c = out["counts"]
    print(f"wrote {OUT}: {c['settlements']} settlements, {c['months']} months "
          f"({out['months'][0]}–{out['latest']}), {c['unmatchedLatest']} unmatched")


if __name__ == "__main__":
    main()
