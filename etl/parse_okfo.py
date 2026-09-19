"""Parse the OKFŐ long-term-vacancy pages (source E).

The lists live as HTML tables on alapellatas.okfo.gov.hu (no downloadable
file, no FIN codes). Columns: county | service type | postal code |
settlement | vacancy start | long-term-vacancy start, with an
"Aktuális: YYYY. <month> D." as-of stamp on the page.

Long-term vacancy is the legal category of 313/2011. (XII. 23.) Korm. r.:
at least six months since the financing contract ended. Rows are matched to
NEAK praxes by (settlement, type, vacancy-start month) — the vacancy start
printed by OKFŐ equals NEAK's "betöltetlenség kezdete".

The fetched HTML is archived under data/raw/YYYY-MM/okfo_<kind>.html.
"""
from __future__ import annotations

import io
import re
from pathlib import Path

import pandas as pd
import requests

from parse_dental import HU_MONTHS, ParseError, TYPE_MAP, _clean, canonical_county
from parse_gp import GP_TYPE_MAP
from parse_ksh import normalize_settlement

URLS = {
    "dental": "https://alapellatas.okfo.gov.hu/tajekoztato-a-tartosan-betoltetlen-fogorvosi-korzetekrol/",
    "gp": "https://alapellatas.okfo.gov.hu/tajekoztato-a-tartosan-betoltetlen-haziorvosi-korzetekrol/",
}
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Praxisterkep/1.0"}
RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
# dotted ("2014.04.01.") in the current markup, dashed ("2014-04-01")
# in the 2024-era pages recovered from the Wayback Machine
DATE_RE = re.compile(r"^(\d{4})[.-](\d{2})[.-]\d{2}\.?$")


def fetch(month: str, kind: str) -> Path:
    """Download the page into the month's raw archive (kept if it exists)."""
    target = RAW_DIR / month / f"okfo_{kind}.html"
    if target.exists():
        return target
    resp = requests.get(URLS[kind], timeout=60, headers=HEADERS)
    resp.raise_for_status()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(resp.content)
    return target


def extract_as_of(html: str) -> str:
    """The page's "Aktuális: …" stamp as YYYY-MM. Two generations exist:
    month-name ("2026. szeptember 1.") and numeric ("2022. 06. 01." /
    "2023.11.01.", used until late 2024)."""
    m = re.search(
        r"Aktu[áa]lis:?\s*(\d{4})\.\s*([a-záéíóöőúüű]+)", html, re.IGNORECASE)
    if m and m.group(2).lower() in HU_MONTHS:
        return f"{m.group(1)}-{HU_MONTHS[m.group(2).lower()]:02d}"
    m = re.search(r"Aktu[áa]lis:?\s*(\d{4})\.\s*(\d{1,2})\.", html, re.IGNORECASE)
    if m and 1 <= int(m.group(2)) <= 12:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    raise ParseError("OKFŐ as-of stamp not found")


def _month(raw: str) -> str:
    m = DATE_RE.match(_clean(raw))
    if not m:
        raise ParseError(f"unparseable OKFŐ date: {raw!r}")
    return f"{m.group(1)}-{m.group(2)}"


def parse(html_path: Path, kind: str) -> tuple[str, list[dict]]:
    """Returns (as_of_month, rows). Row: {county, type, postalCode,
    settlement, vacantSince, longTermSince}."""
    html = html_path.read_text(encoding="utf-8", errors="ignore")
    as_of = extract_as_of(html)
    tables = pd.read_html(io.StringIO(html))
    if not tables:
        raise ParseError(f"no table found in {html_path.name}")
    type_map = TYPE_MAP if kind == "dental" else GP_TYPE_MAP
    rows: list[dict] = []
    broken = 0
    for r in tables[0].itertuples(index=False):
        cells = [_clean(c) for c in r]
        if len(cells) < 6 or not DATE_RE.match(cells[4]):
            continue  # header / stamp rows
        # capitalization varies between page generations ("Vegyes"/"vegyes")
        type_raw = cells[1] if cells[1] in type_map else cells[1].capitalize()
        if type_raw not in type_map:
            raise ParseError(f"unknown OKFŐ service type {cells[1]!r}")
        try:
            rows.append({
                "county": canonical_county(cells[0]),
                "type": type_map[type_raw],
                "postalCode": cells[2],
                "settlement": cells[3],
                "vacantSince": _month(cells[4]),
                "longTermSince": _month(cells[5]),
            })
        except ParseError as exc:
            # the source page contains the odd typo (e.g. "204.11.01");
            # skip the row, but never silently accept a broken table
            broken += 1
            print(f"  WARNING skipped OKFŐ row: {exc}")
    if broken > 5:
        raise ParseError(f"{broken} unparseable rows in {html_path.name}")
    if not rows:
        raise ParseError(f"no rows parsed from {html_path.name}")
    return as_of, rows


def apply_longterm(praxes: list[dict], rows: list[dict]) -> tuple[int, int]:
    """Flag praxes that appear on the OKFŐ list. Match key: any surgery
    settlement + service type + vacancy-start month. Returns
    (matched praxes, unmatched OKFŐ rows)."""
    index: dict[tuple, list[dict]] = {}
    for p in praxes:
        for site in p["sites"]:
            key = (normalize_settlement(site["settlement"]), p["type"], p["vacantSince"])
            index.setdefault(key, []).append(p)
    matched_praxes: set[int] = set()
    unmatched = 0
    for row in rows:
        key = (normalize_settlement(row["settlement"]), row["type"], row["vacantSince"])
        hits = index.get(key, [])
        if not hits:
            unmatched += 1
            continue
        for p in hits:
            p["longTerm"] = True
            p["longTermSince"] = row["longTermSince"]
            matched_praxes.add(id(p))
    return len(matched_praxes), unmatched
