"""Parse the NEAK contracted-dental-services registry XLS/XLSX (source C).

This is the denominator for vacancy rates. The sheet lists every contracted
service (filled and vacant) with provider, site and service-type columns.
The physician-name column is kept ONLY for filled praxes (the contracted
physician's name as published by NEAK on its own public search) — vacancy
markers and substitutes are never treated as names (CLAUDE.md rule 3).

Columns are located by header name, so all format generations parse with the
same code (2019-2021: 9 columns without provider code; 2022-: 10 columns).

Only Alapellátás rows with district-type services (adult/child/mixed/school)
are kept; on-call (Ügyelet), university and Szakellátás rows are excluded so
the denominator matches the population of the vacant lists.
"""
from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import pandas as pd

from parse_dental import TYPE_MAP, ParseError, _clean, canonical_county

# header substrings (case-insensitive) -> canonical field
HEADER_MAP = {
    "county": ("megye", "vármegye"),
    "fin": ("fin kód",),
    "type": ("egység típusa",),
    "level": ("ellátási szint",),
    "settlement": ("székhelye",),
    "postal": ("irányítószám",),
    "address": ("rendelő címe",),
    "doctor": ("orvos neve",),
}

NOT_A_NAME = {"", "betöltetlen"}


def clean_doctor(raw) -> str | None:
    """A physician name, or None for empty cells and vacancy markers."""
    name = _clean(raw)
    return name if name.lower() not in NOT_A_NAME else None


class RegistryEntry(TypedDict, total=False):
    id: str          # FIN code
    kind: str
    type: str        # adult | child | mixed | school
    county: str
    settlement: str
    postalCode: str
    address: str
    doctor: str | None  # contracted physician (filled praxes only)


def _locate_columns(header_row: list) -> dict[str, int]:
    cols: dict[str, int] = {}
    for field, needles in HEADER_MAP.items():
        for i, cell in enumerate(header_row):
            name = _clean(cell).lower()
            if name and any(n in name for n in needles) and i not in cols.values():
                cols[field] = i
                break
        else:
            raise ParseError(f"dental registry: column {field!r} not found in header")
    return cols


def parse(xls_path: Path) -> list[RegistryEntry]:
    df = pd.read_excel(xls_path, header=None, dtype=object)
    # the header row is the one containing the FIN column label
    header_idx = next(
        (i for i, row in enumerate(df.head(5).values.tolist())
         if any("FIN" in _clean(c) for c in row)),
        None,
    )
    if header_idx is None:
        raise ParseError(f"{xls_path.name}: registry header row not found")
    cols = _locate_columns(df.iloc[header_idx].tolist())

    entries: list[RegistryEntry] = []
    seen: set[str] = set()
    for row in df.iloc[header_idx + 1:].values.tolist():
        fin = _clean(row[cols["fin"]])
        if len(fin) != 9 or not fin.isdigit():
            continue  # blank/footer rows
        if _clean(row[cols["level"]]) != "Alapellátás":
            continue
        type_hu = _clean(row[cols["type"]])
        if type_hu not in TYPE_MAP:
            continue  # Ügyelet, Egyetemi, Szájsebészet, ...
        if fin in seen:
            continue  # one service can appear on several rows
        seen.add(fin)
        entries.append(RegistryEntry(
            id=fin,
            kind="dental",
            type=TYPE_MAP[type_hu],
            county=canonical_county(row[cols["county"]]),
            settlement=_clean(row[cols["settlement"]]),
            postalCode=_clean(row[cols["postal"]]).removesuffix(".0"),
            address=_clean(row[cols["address"]]),
            doctor=clean_doctor(row[cols["doctor"]]),
        ))
    if not entries:
        raise ParseError(f"no registry entries parsed from {xls_path.name}")
    return entries
