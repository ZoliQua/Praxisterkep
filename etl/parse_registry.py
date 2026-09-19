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

# present from the 2022 format generation on; absent columns are simply
# left out of the output (never guessed)
OPTIONAL_HEADER_MAP = {
    "neakCode": ("neak kód",),
    "provider": ("szolgáltató neve",),
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
    level: str       # "Alapellátás" (the only level kept)
    neakCode: str    # NEAK provider code, e.g. "0278"
    provider: str    # contracted provider (organisation), filled praxes only
    doctor: str | None  # contracted physician (filled praxes only)


def locate_columns(header_row: list, required: dict, optional: dict | None = None,
                   label: str = "registry") -> dict[str, int]:
    """Column index per canonical field, located by header substring.

    A missing required column is a hard error; a missing optional one is
    absent from the result (older format generations lack some columns).
    """
    cols: dict[str, int] = {}
    for field, needles in {**required, **(optional or {})}.items():
        for i, cell in enumerate(header_row):
            name = _clean(cell).lower()
            if name and any(n in name for n in needles) and i not in cols.values():
                cols[field] = i
                break
        else:
            if field in required:
                raise ParseError(f"{label}: column {field!r} not found in header")
    return cols


def _locate_columns(header_row: list) -> dict[str, int]:
    return locate_columns(header_row, HEADER_MAP, OPTIONAL_HEADER_MAP,
                          "dental registry")


def attach_provider(entry: dict, row: list, cols: dict) -> None:
    """Copy the provider columns onto an entry that has a contracted physician.

    A provider organisation is often named after a person ("Dr. Balatonyi
    BT"), and on a district with no contracted physician it would identify
    the substitute — so neither the name nor the NEAK code is carried unless
    the registry names the contracted physician (CLAUDE.md rule 3).
    """
    if not entry.get("doctor"):
        return
    for field in ("neakCode", "provider"):
        if field in cols:
            value = _clean(row[cols[field]]).removesuffix(".0")
            if value:
                entry[field] = value


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
        entry = RegistryEntry(
            id=fin,
            kind="dental",
            type=TYPE_MAP[type_hu],
            county=canonical_county(row[cols["county"]]),
            settlement=_clean(row[cols["settlement"]]),
            postalCode=_clean(row[cols["postal"]]).removesuffix(".0"),
            address=_clean(row[cols["address"]]),
            level=_clean(row[cols["level"]]),
            doctor=clean_doctor(row[cols["doctor"]]),
        )
        attach_provider(entry, row, cols)
        entries.append(entry)
    if not entries:
        raise ParseError(f"no registry entries parsed from {xls_path.name}")
    return entries
