"""Parse NEAK vacant-dental PDFs into normalized records.

Two source layouts (both validated against 2026-08 samples):

A  (dental_vacant.pdf) — 19 columns:
   county code | county | FIN | type | population | vacant-since |
   site1: postal, settlement, address, SZ-flag, district |
   site2: postal, settlement, address, district |
   site3: postal, settlement, address, district

A' (dental_vacant_dissolved.pdf) — 9 columns:
   county code | county | FIN | HQ postal | HQ settlement | HQ address |
   served settlements (comma list) | population | vacant-since

"SZ" flag means the address is the maintainer's headquarters, not a surgery.
The NEAK URL is unversioned (always serves the current month), so the month
printed inside the PDF is extracted and must match the requested month.
"""
from __future__ import annotations

import math
import re
from datetime import datetime
from pathlib import Path
from typing import TypedDict

import pdfplumber

FIN_RE = re.compile(r"^\d{9}$")
DATE_RE = re.compile(r"^(\d{4})\.(\d{2})\.\d{2}\.?$")

TYPE_MAP = {
    "Felnőtt": "adult",
    "Gyermek": "child",
    "Vegyes": "mixed",
    "Iskolai": "school",
    "Iskolai, ifjúsági": "school",
}

HU_MONTHS = {
    "január": 1, "február": 2, "március": 3, "április": 4,
    "május": 5, "június": 6, "július": 7, "augusztus": 8,
    "szeptember": 9, "október": 10, "november": 11, "december": 12,
}


class Site(TypedDict, total=False):
    postalCode: str
    settlement: str
    address: str
    district: str      # járás
    isHeadquarters: bool
    lat: float
    lon: float
    geoApprox: bool


class VacantPraxis(TypedDict, total=False):
    id: str            # NEAK FIN code
    kind: str          # "dental"
    type: str          # adult | child | mixed | school
    status: str        # vacant | dissolved
    county: str
    countyCode: str
    sites: list[Site]
    servedSettlements: list[str]
    vacantSince: str   # YYYY-MM
    population: int | None


class ParseError(Exception):
    pass


def _cell(value) -> str:
    """Normalize a raw cell (PDF string or XLSX-native type) to text."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y.%m.%d")
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        if value.is_integer():
            return str(int(value))
    return str(value)


def _clean(cell) -> str:
    return re.sub(r"\s+", " ", _cell(cell)).strip()


def _parse_date(raw) -> str:
    m = DATE_RE.match(_clean(raw))
    if not m:
        raise ParseError(f"unparseable vacant-since date: {raw!r}")
    return f"{m.group(1)}-{m.group(2)}"


def _parse_population(raw) -> int | None:
    digits = re.sub(r"\D", "", _cell(raw))
    return int(digits) if digits else None


def extract_statement_month(pdf_path: Path) -> str:
    """Return the YYYY-MM the PDF says it covers (e.g. '2026. augusztus')."""
    with pdfplumber.open(pdf_path) as pdf:
        text = pdf.pages[0].extract_text() or ""
    m = re.search(r"(\d{4})\.\s*([a-záéíóöőúüű]+)", text, re.IGNORECASE)
    if m and m.group(2).lower() in HU_MONTHS:
        return f"{m.group(1)}-{HU_MONTHS[m.group(2).lower()]:02d}"
    raise ParseError(f"statement month not found in {pdf_path.name}")


def _iter_rows(pdf_path: Path):
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                yield from table


def parse_vacant(pdf_path: Path) -> list[VacantPraxis]:
    """Parse source A (vacant dental services) from the monthly PDF."""
    return _rows_to_vacant(list(_iter_rows(pdf_path)), pdf_path.name)


def parse_vacant_xlsx(xlsx_path: Path) -> list[VacantPraxis]:
    """Parse a historical vacant-dental XLSX (2017-2021 era, same 19 columns)."""
    import pandas as pd

    df = pd.read_excel(xlsx_path, header=None, dtype=object)
    if len(df.columns) != 19:
        raise ParseError(
            f"{xlsx_path.name}: expected 19 columns, got {len(df.columns)}"
        )
    return _rows_to_vacant(df.values.tolist(), xlsx_path.name)


def _rows_to_vacant(rows: list[list], source_name: str) -> list[VacantPraxis]:
    records: list[VacantPraxis] = []
    for row in rows:
        if len(row) < 11 or not FIN_RE.match(_clean(row[2])):
            continue  # header / layout rows
        if len(row) != 19:
            raise ParseError(f"unexpected column count {len(row)} for FIN {row[2]}")
        type_hu = _clean(row[3])
        if type_hu not in TYPE_MAP:
            raise ParseError(f"unknown service type {type_hu!r} for FIN {row[2]}")
        sites: list[Site] = []
        # site1 has a dedicated SZ column; site2/site3 do not
        site_specs = [(6, 7, 8, 9, 10), (11, 12, 13, None, 14), (15, 16, 17, None, 18)]
        for postal_i, settl_i, addr_i, sz_i, distr_i in site_specs:
            settlement = _clean(row[settl_i])
            if not settlement:
                continue
            address = _clean(row[addr_i])
            is_hq = bool(sz_i is not None and _clean(row[sz_i]) == "SZ")
            if address.endswith(" SZ"):  # flag embedded in address (site2/3)
                address, is_hq = address[:-3].rstrip(), True
            sites.append(Site(
                postalCode=_clean(row[postal_i]),
                settlement=settlement,
                address=address,
                district=_clean(row[distr_i]),
                isHeadquarters=is_hq,
            ))
        records.append(VacantPraxis(
            id=_clean(row[2]),
            kind="dental",
            type=TYPE_MAP[type_hu],
            status="vacant",
            county=_clean(row[1]),
            countyCode=_clean(row[0]),
            sites=sites,
            vacantSince=_parse_date(row[5]),
            population=_parse_population(row[4]),
        ))
    if not records:
        raise ParseError(f"no records parsed from {source_name}")
    return records


def parse_dissolved(pdf_path: Path) -> list[VacantPraxis]:
    """Parse source A' (vacant dental services with terminated contract)."""
    records: list[VacantPraxis] = []
    for row in _iter_rows(pdf_path):
        if len(row) < 9 or not FIN_RE.match(_clean(row[2])):
            continue
        if len(row) != 9:
            raise ParseError(f"unexpected column count {len(row)} for FIN {row[2]}")
        served = [s for s in (_clean(p) for p in re.split(r"[,;]", row[6] or "")) if s]
        records.append(VacantPraxis(
            id=_clean(row[2]),
            kind="dental",
            type="mixed",  # list carries no type column; the registry overrides
            status="dissolved",
            county=_clean(row[1]),
            countyCode=_clean(row[0]),
            sites=[Site(
                postalCode=_clean(row[3]),
                settlement=_clean(row[4]),
                address=_clean(row[5]),
                district="",
                isHeadquarters=True,
            )],
            servedSettlements=served,
            vacantSince=_parse_date(row[8]),
            population=_parse_population(row[7]),
        ))
    if not records:
        raise ParseError(f"no records parsed from {pdf_path.name}")
    return records
