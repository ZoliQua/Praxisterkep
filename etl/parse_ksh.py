"""Parse the KSH Helységnévtár (gazetteer) workbook (source F).

One annual reference edition (data/raw/ksh/dgh_download_YYYY.xlsx, sheet
"Localities 01.01.YYYY.") supplies, per settlement: the 5-digit KSH code
(törzsszám — the same code family the NEAK GP registry uses for served
settlements), county, district (járás) and resident population.

Budapest appears both as one aggregate row (county empty) and as 23 kerület
rows (county "főváros"); both are kept — dental data speaks about Budapest
as a whole, GP data about kerületek — but country/county totals must count
Budapest only once (the aggregate row).

Population figures are the resident population on 1 January of the edition
year; they are applied to every archived month as the best available
denominator (documented in the methodology).
"""
from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

import pandas as pd

from parse_dental import ParseError

KSH_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "ksh"

ROMAN = {
    "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8,
    "IX": 9, "X": 10, "XI": 11, "XII": 12, "XIII": 13, "XIV": 14, "XV": 15,
    "XVI": 16, "XVII": 17, "XVIII": 18, "XIX": 19, "XX": 20, "XXI": 21,
    "XXII": 22, "XXIII": 23,
}


def normalize_settlement(name: str) -> str:
    """Accent-insensitive lookup key; Budapest kerület spellings unified
    ("Budapest XIV. kerület" == "Budapest 14. ker.")."""
    s = name.strip()
    # NEAK spellings vary: "Budapest XIV. kerület", "Budapest 14. ker.",
    # bare "Budapest 08" — all mean the same kerület
    m = re.match(r"^Budapest[ ,]*([IVX]+|\d{1,2})\.?(\s*ker.*)?$", s, re.IGNORECASE)
    if m:
        raw = m.group(1).upper()
        num = ROMAN.get(raw) if raw in ROMAN else int(raw)
        return f"budapest {num:02d} ker"
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(ch for ch in s if not unicodedata.combining(ch))


class KshRef:
    def __init__(self, entries: list[dict]):
        self.entries = entries
        self.by_key = {normalize_settlement(e["name"]): e for e in entries}
        # county populations: Budapest counted once, via its aggregate row
        self.county_population: dict[str, int] = {}
        for e in entries:
            if e["county"] == "Budapest" and e["isDistrictOfCapital"]:
                continue
            self.county_population[e["county"]] = (
                self.county_population.get(e["county"], 0) + e["population"]
            )
        self.country_population = sum(self.county_population.values())

    def lookup(self, name: str) -> dict | None:
        return self.by_key.get(normalize_settlement(name))


def parse(xlsx_path: Path) -> KshRef:
    df = pd.read_excel(xlsx_path, sheet_name=0, header=2, dtype=object)
    cols = list(df.columns)
    df = df.rename(columns={
        cols[0]: "name", cols[1]: "ksh", cols[3]: "county",
        cols[5]: "district", cols[10]: "pop",
    })
    entries: list[dict] = []
    for r in df[["name", "ksh", "county", "district", "pop"]].itertuples():
        if pd.isna(r.name) or pd.isna(r.ksh):
            continue
        name = str(r.name).strip()
        county = "" if pd.isna(r.county) else str(r.county).strip()
        is_ker = county == "főváros"
        if name == "Budapest" and not county:
            county = "Budapest"
        elif is_ker:
            county = "Budapest"
        if not county:
            continue
        entries.append({
            "name": name,
            "kshId": str(int(float(r.ksh))).zfill(5),
            "county": county,
            "district": "" if pd.isna(r.district) else str(r.district).strip(),
            "population": 0 if pd.isna(r.pop) else int(float(r.pop)),
            "isDistrictOfCapital": is_ker,
        })
    if len(entries) < 3000:
        raise ParseError(f"KSH gazetteer suspiciously small: {len(entries)} rows")
    return KshRef(entries)


@lru_cache(maxsize=1)
def load_reference() -> KshRef | None:
    """Latest available gazetteer edition, or None if none is archived."""
    if not KSH_DIR.exists():
        return None
    files = sorted(KSH_DIR.glob("*.xlsx"))
    if not files:
        return None
    return parse(files[-1])
