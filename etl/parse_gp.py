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

The registry's physician column carries a BETÖLTETLEN marker for vacant
praxes; real names are kept only for filled praxes (as NEAK publishes them on
its own public search). The vacant PDF stays the authoritative status source;
vacant/dissolved records never carry a name (CLAUDE.md rule 3).

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
    canonical_county,
    resolve_capital,
)

GP_TYPE_MAP = {"F": "adult", "G": "child", "V": "mixed"}

_SERVED_ITEM = re.compile(r"^(\d{5})\s+(.+)$")


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
                # the GP list names the kerület today; the dental one does not
                # for every row, and the same slip can appear here next month
                settlement=resolve_capital(_clean(row[4]), _clean(row[3])),
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

    Columns are located by header name, so all format generations parse with
    the same code (2019: 12 columns, 2021-: 13 columns). The physician and
    provider columns are kept for filled praxes only (build.py attaches them
    to filledPraxes); the phone column is never read.

    Only territorial (form == 'T') praxes are kept: TN praxes have no district
    obligation and never appear on the vacant list, so including them would
    dilute the vacancy rate.
    """

    from parse_dental import _cell
    from parse_registry import attach_provider, clean_doctor, locate_columns

    header_map = {
        "county": ("megye", "vármegye"),
        "hsz": ("hsz kód",),
        "type": ("szolgálat típusa", "egység típusa"),
        "form": ("ellátási formája",),
        "postal": ("irányítószám",),
        "settlement": ("székhelye",),
        "address": ("rendelő címe",),
        "served": ("ellátandó települések",),
        "district": ("járás neve",),
        "doctor": ("háziorvos neve", "szolgálat orvosa"),
    }
    optional_map = {
        "neakCode": ("neak kód",),
        "provider": ("szolgáltató neve",),
    }
    df = pd.read_excel(xls_path, header=None, dtype=object)
    header_idx = next(
        (i for i, row in enumerate(df.head(5).values.tolist())
         if any("HSZ" in _clean(c) for c in row)),
        None,
    )
    if header_idx is None:
        raise ParseError(f"{xls_path.name}: GP registry header row not found")
    header_row = df.iloc[header_idx].tolist()
    cols = locate_columns(header_row, header_map, optional_map, "GP registry")

    entries: list[dict] = []
    seen: set[str] = set()
    for row in df.iloc[header_idx + 1:].values.tolist():
        hsz = _clean(row[cols["hsz"]]).removesuffix(".0").zfill(9)
        if not hsz.isdigit() or len(hsz) != 9 or _clean(row[cols["hsz"]]) == "":
            continue
        if _clean(row[cols["form"]]) == "TN":
            continue
        type_letter = _clean(row[cols["type"]])
        if type_letter not in GP_TYPE_MAP:
            raise ParseError(f"unknown GP type {type_letter!r} for HSZ {hsz}")
        if hsz in seen:
            continue
        seen.add(hsz)
        served = []
        for item in re.split(r"[;,]", _cell(row[cols["served"]])):
            m = _SERVED_ITEM.match(_clean(item))
            if m:
                # the served list spells the capital its own way again
                served.append({"kshId": m.group(1),
                               "name": resolve_capital(m.group(2))})
        entry = {
            "id": hsz,
            "kind": "gp",
            "type": GP_TYPE_MAP[type_letter],
            "county": canonical_county(_cell(row[cols["county"]])),
            "settlement": resolve_capital(_clean(row[cols["settlement"]]),
                                          _clean(row[cols["postal"]])),
            "postalCode": _clean(row[cols["postal"]]).removesuffix(".0"),
            "address": _clean(row[cols["address"]]),
            "district": _clean(row[cols["district"]]).removesuffix(" járás"),
            "servedSettlements": served,
            "doctor": clean_doctor(row[cols["doctor"]]),
        }
        attach_provider(entry, row, cols)
        entries.append(entry)
    if not entries:
        raise ParseError(f"no registry entries parsed from {xls_path.name}")
    return entries


_STATE_BODY = re.compile(
    r"rendőr|\b(?:v?m?rfk|brfk|orfk|szszbmrfk)\b|terrorelhárítási|nemzeti védelmi"
    r"|\bbvop\b|büntetés-végrehajt|\bnav\b|adó- és vámhivatal|katasztrófavédelm|honvéd", re.I)
_COMPANY = re.compile(r"\b(?:kft|bt|zrt|nyrt|kkt)\b\.?|nonprofit|társaság", re.I)


def operator_kind(provider: str) -> str:
    """The kind of organisation behind a practice, from the provider's name.

    state (police, national security, prison service, tax authority, armed
    forces), university, company, a physician as sole trader, or unknown when
    the registry of that month has no provider column. Only the kind leaves
    this function: a sole trader's provider name is the physician's own.
    """
    name = provider.strip()
    if not name or name.lower() == "nan":
        return "unknown"
    if _STATE_BODY.search(name):
        return "state"
    if "egyetem" in name.lower():
        return "university"
    if _COMPANY.search(name):
        return "company"
    if re.match(r"(?i)^dr\.?\s", name) or re.search(r"(?i)\bdr\.", name):
        return "sole"
    return "other"


def parse_registry_forms(xls_path: Path) -> list[dict]:
    """Every row of a GP registry with its form: territorial (T) and not (TN).

    parse_registry keeps the T rows only, because they are the districts; this
    reads both, for nonterritorial.py, which counts the practices that carry
    no district obligation. Only code, form, type, county, settlement, the
    provider's kind (operator_kind) and whether the registry names a contracted
    physician are returned — never a name. To tell whether a practice kept its
    physician, the name is reduced to a one-way digest (doctorKey) that is only
    ever compared with the same code's digest in another month. An unknown form
    or type is a hard error.
    """
    import hashlib

    from parse_dental import _cell
    from parse_registry import clean_doctor, locate_columns

    header_map = {
        "county": ("megye", "vármegye"),
        "hsz": ("hsz kód",),
        "type": ("szolgálat típusa", "egység típusa"),
        "form": ("ellátási formája",),
        "postal": ("irányítószám",),
        "settlement": ("székhelye",),
        "doctor": ("háziorvos neve", "szolgálat orvosa"),
    }
    df = pd.read_excel(xls_path, header=None, dtype=object)
    header_idx = next(
        (i for i, row in enumerate(df.head(5).values.tolist())
         if any("HSZ" in _clean(c) for c in row)),
        None,
    )
    if header_idx is None:
        raise ParseError(f"{xls_path.name}: GP registry header row not found")
    cols = locate_columns(df.iloc[header_idx].tolist(), header_map,
                          {"provider": ("szolgáltató neve",)}, "GP registry")

    rows: list[dict] = []
    seen: set[str] = set()
    for row in df.iloc[header_idx + 1:].values.tolist():
        raw = _clean(row[cols["hsz"]])
        hsz = raw.removesuffix(".0").zfill(9)
        if not raw or not hsz.isdigit() or len(hsz) != 9 or hsz in seen:
            continue
        form = _clean(row[cols["form"]])
        if form not in ("T", "TN"):
            raise ParseError(f"unknown GP form {form!r} for HSZ {hsz}")
        type_letter = _clean(row[cols["type"]])
        if type_letter not in GP_TYPE_MAP:
            raise ParseError(f"unknown GP type {type_letter!r} for HSZ {hsz}")
        seen.add(hsz)
        rows.append({
            "id": hsz,
            "form": form,
            "type": GP_TYPE_MAP[type_letter],
            "county": canonical_county(_cell(row[cols["county"]])),
            "settlement": resolve_capital(_clean(row[cols["settlement"]]),
                                          _clean(row[cols["postal"]])),
            "named": (doctor := clean_doctor(row[cols["doctor"]])) is not None,
            "doctorKey": hashlib.sha256(" ".join(doctor.casefold().split()).encode()).hexdigest()[:16]
            if doctor else None,
            "operator": operator_kind(_clean(row[cols["provider"]])) if "provider" in cols else "unknown",
        })
    if not rows:
        raise ParseError(f"no registry rows parsed from {xls_path.name}")
    return rows


def parse_vacant_xlsx(xlsx_path: Path) -> list[VacantPraxis]:
    """Parse a vacant-GP XLSX.

    Two generations:
    - 2019-2021 (9 columns): county | HSZ | type | postal | settlement |
      address | served settlements ("KSH name" items, ';'-separated) |
      population | since — richer than the PDF (served-settlement list).
    - 2025- (8 columns): the modern PDF layout as a spreadsheet, without the
      served column; HSZ arrives as a number (leading zero lost).
    """

    from parse_dental import _cell

    df = pd.read_excel(xlsx_path, header=None, dtype=object)
    ncols = len(df.columns)
    if ncols not in (8, 9):
        raise ParseError(
            f"{xlsx_path.name}: expected 8 or 9 columns, got {ncols}"
        )
    served_col = 6 if ncols == 9 else None
    pop_col, since_col = (7, 8) if ncols == 9 else (6, 7)
    records: list[VacantPraxis] = []
    for row in df.values.tolist():
        hsz = _clean(row[1]).removesuffix(".0").zfill(9)
        if not FIN_RE.match(hsz) or _clean(row[1]) == "":
            continue
        type_letter = _clean(row[2])
        if type_letter not in GP_TYPE_MAP:
            raise ParseError(f"unknown GP service type {type_letter!r} for HSZ {hsz}")
        served = []
        if served_col is not None:
            for item in re.split(r"[;,]", _cell(row[served_col])):
                m = _SERVED_ITEM.match(_clean(item))
                if m:
                    served.append(resolve_capital(m.group(2)))
        rec = VacantPraxis(
            id=hsz,
            kind="gp",
            type=GP_TYPE_MAP[type_letter],
            status="vacant",
            county=canonical_county(row[0]),
            countyCode="",
            sites=[Site(
                postalCode=_clean(row[3]),
                settlement=resolve_capital(_clean(row[4]), _clean(row[3])),
                address=_clean(row[5]),
                district="",
                isHeadquarters=False,
            )],
            vacantSince=_parse_date(row[since_col]),
            population=_parse_population(row[pop_col]),
        )
        if served:
            rec["servedSettlements"] = served
        records.append(rec)
    if not records:
        raise ParseError(f"no records parsed from {xlsx_path.name}")
    return records
