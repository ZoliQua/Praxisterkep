"""Parse NEAK GP (háziorvosi) sources into normalized records.

B  (gp_vacant.pdf) — 8 columns:
   county (uppercase) | HSZ code | type letter (F/G/V) |
   postal | settlement | address | population | vacant-since
   Single site per row, no county code, no district column, no SZ flag.
   There is no dissolved (megszűnt) list for GP services.

C' (gp_registry.xls) — 13 columns, one row per praxis:
   county | HSZ | type | care form (T/TN) | provider code | provider name |
   postal | settlement | address | phone | served settlements (KSH code+name
   pairs) | district (járás) name | physician name

The registry's physician column (which also carries a BETÖLTETLEN marker) is
dropped at parse time — the vacant PDF is the authoritative status source and
names must never leave this module (CLAUDE.md rule 3).

County names in the GP files are uppercase and partially accent-deficient
(NOGRÁD, HAJDU-BIHAR); they are normalized to the canonical forms used by the
dental sources and counties.geojson.
"""
from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from parse_dental import (
    FIN_RE,
    ParseError,
    Site,
    VacantPraxis,
    _clean,
    _iter_rows,
    _parse_date,
    _parse_population,
)

GP_TYPE_MAP = {"F": "adult", "G": "child", "V": "mixed"}

COUNTY_CANONICAL = {
    "BARANYA": "Baranya",
    "BÁCS-KISKUN": "Bács-Kiskun",
    "BÉKÉS": "Békés",
    "BORSOD-ABAUJ-ZEMPLÉN": "Borsod-Abaúj-Zemplén",
    "BORSOD-ABAÚJ-ZEMPLÉN": "Borsod-Abaúj-Zemplén",
    "BUDAPEST": "Budapest",
    "CSONGRÁD-CSANÁD": "Csongrád-Csanád",
    "FEJÉR": "Fejér",
    "GYŐR-MOSON-SOPRON": "Győr-Moson-Sopron",
    "HAJDU-BIHAR": "Hajdú-Bihar",
    "HAJDÚ-BIHAR": "Hajdú-Bihar",
    "HEVES": "Heves",
    "JÁSZ-NAGYKUN-SZOLNOK": "Jász-Nagykun-Szolnok",
    "KOMÁROM-ESZTERGOM": "Komárom-Esztergom",
    "NOGRÁD": "Nógrád",
    "NÓGRÁD": "Nógrád",
    "PEST": "Pest",
    "SOMOGY": "Somogy",
    "SZABOLCS-SZATMÁR-BEREG": "Szabolcs-Szatmár-Bereg",
    "TOLNA": "Tolna",
    "VAS": "Vas",
    "VESZPRÉM": "Veszprém",
    "ZALA": "Zala",
}

REGISTRY_COLUMNS = [
    "county", "hsz", "type", "form", "provider_code", "provider",
    "postal", "settlement", "address", "phone", "served", "district", "doctor",
]

_SERVED_ITEM = re.compile(r"^(\d{5})\s+(.+)$")


def canonical_county(raw: str) -> str:
    name = _clean(raw).upper()
    if name not in COUNTY_CANONICAL:
        raise ParseError(f"unknown county name {raw!r}")
    return COUNTY_CANONICAL[name]


def parse_vacant(pdf_path: Path) -> list[VacantPraxis]:
    """Parse source B (vacant GP services)."""
    records: list[VacantPraxis] = []
    for row in _iter_rows(pdf_path):
        if len(row) < 3 or not row[1] or not FIN_RE.match(_clean(row[1])):
            continue
        if len(row) != 8:
            raise ParseError(f"unexpected column count {len(row)} for HSZ {row[1]}")
        type_letter = _clean(row[2])
        if type_letter not in GP_TYPE_MAP:
            raise ParseError(f"unknown GP service type {type_letter!r} for HSZ {row[1]}")
        records.append(VacantPraxis(
            id=_clean(row[1]),
            kind="gp",
            type=GP_TYPE_MAP[type_letter],
            status="vacant",
            county=canonical_county(row[0]),
            countyCode="",  # the GP list carries no county code column
            sites=[Site(
                postalCode=_clean(row[3]),
                settlement=_clean(row[4]),
                address=_clean(row[5]),
                district="",  # filled from the registry during build
                isHeadquarters=False,
            )],
            vacantSince=_parse_date(row[7]),
            population=_parse_population(row[6]),
        ))
    if not records:
        raise ParseError(f"no records parsed from {pdf_path.name}")
    return records


def parse_registry(xls_path: Path) -> list[dict]:
    """Parse source C' (contracted GP registry) — the denominator.

    Only territorial (form == 'T') praxes are kept: TN praxes have no district
    obligation and never appear on the vacant list, so including them would
    dilute the vacancy rate.
    """
    df = pd.read_excel(xls_path, header=0)
    if len(df.columns) != len(REGISTRY_COLUMNS):
        raise ParseError(
            f"GP registry column count changed: {len(df.columns)} != {len(REGISTRY_COLUMNS)}"
        )
    df.columns = REGISTRY_COLUMNS
    df = df.drop(columns=["doctor", "provider", "phone"])  # names stop here
    entries: list[dict] = []
    for r in df.itertuples():
        hsz = str(r.hsz).removesuffix(".0").strip().zfill(9)
        if not hsz.isdigit() or len(hsz) != 9:
            raise ParseError(f"bad HSZ code in GP registry: {r.hsz!r}")
        if str(r.form).strip() == "TN":
            continue
        type_letter = str(r.type).strip()
        if type_letter not in GP_TYPE_MAP:
            raise ParseError(f"unknown GP type {type_letter!r} for HSZ {hsz}")
        served = []
        for item in str(r.served or "").split(","):
            m = _SERVED_ITEM.match(_clean(item))
            if m:
                served.append({"kshId": m.group(1), "name": m.group(2)})
        entries.append({
            "id": hsz,
            "kind": "gp",
            "type": GP_TYPE_MAP[type_letter],
            "county": canonical_county(str(r.county)),
            "settlement": _clean(str(r.settlement)),
            "postalCode": _clean(str(r.postal)).removesuffix(".0"),
            "district": _clean(str(r.district)).removesuffix(" járás"),
            "servedSettlements": served,
        })
    if not entries:
        raise ParseError(f"no registry entries parsed from {xls_path.name}")
    return entries
