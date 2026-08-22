"""Parse the NEAK contracted-dental-services registry XLS (source C).

This is the denominator for vacancy rates. The sheet lists every contracted
service (filled and vacant) with provider, site and service-type columns —
and a physician-name column, which is dropped at parse time and must never
leave this module (CLAUDE.md rule 3: no personal names, ever).

Only Alapellátás rows with district-type services (adult/child/mixed/school)
are kept; on-call (Ügyelet), university and Szakellátás rows are excluded so
the denominator matches the population of the vacant lists.
"""
from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import pandas as pd

from parse_dental import TYPE_MAP, ParseError

COLUMNS = [
    "county", "provider_code", "provider", "postal", "settlement",
    "address", "level", "fin", "type", "doctor",
]


class RegistryEntry(TypedDict):
    id: str          # FIN code
    kind: str
    type: str        # adult | child | mixed | school
    county: str
    settlement: str
    postalCode: str


def parse(xls_path: Path) -> list[RegistryEntry]:
    df = pd.read_excel(xls_path, header=1)
    if len(df.columns) != len(COLUMNS):
        raise ParseError(
            f"registry column count changed: {len(df.columns)} != {len(COLUMNS)}"
        )
    df.columns = COLUMNS
    df = df.drop(columns=["doctor", "provider"])  # never let names past this point
    df = df[df["level"] == "Alapellátás"]
    df = df[df["type"].isin(TYPE_MAP)]
    # one service can appear on several rows (multiple surgeries); FIN is canonical
    df = df.drop_duplicates(subset="fin")
    entries: list[RegistryEntry] = []
    for r in df.itertuples():
        fin = str(r.fin).strip()
        if len(fin) != 9 or not fin.isdigit():
            raise ParseError(f"bad FIN code in registry: {r.fin!r}")
        entries.append(RegistryEntry(
            id=fin,
            kind="dental",
            type=TYPE_MAP[str(r.type).strip()],
            county=str(r.county).strip(),
            settlement=str(r.settlement).strip(),
            postalCode=str(r.postal).strip().removesuffix(".0"),
        ))
    if not entries:
        raise ParseError(f"no registry entries parsed from {xls_path.name}")
    return entries
