"""Parse NEAK 'Betoltetlen fogorvosi szolgalatok' PDF into normalized records.

Expected columns (subject to change — validate!):
  FIN code | county | site address(es) | vacant-since | population | type
"""
from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import pdfplumber


class VacantPraxis(TypedDict):
    id: str            # NEAK FIN code
    kind: str          # "dental"
    type: str          # adult | child | mixed | school
    county: str
    sites: list[dict]  # {address, postal_code, settlement, district}
    vacantSince: str   # YYYY-MM
    population: int | None


def parse(pdf_path: Path) -> list[VacantPraxis]:
    records: list[VacantPraxis] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    rec = _parse_row(row)
                    if rec:
                        records.append(rec)
    return records


def _parse_row(row: list[str | None]) -> VacantPraxis | None:
    # TODO: implement against a real sample PDF (etl/tests/fixtures/).
    # Skip header rows; map service-type strings to the type enum;
    # normalize dates to YYYY-MM; split multi-site cells.
    raise NotImplementedError
