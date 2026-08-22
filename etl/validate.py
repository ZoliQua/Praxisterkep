"""Schema + sanity validation. On failure: raise — the pipeline must not publish.

Invariants (see CLAUDE.md):
- statement month inside the PDF matches the requested month (URLs are unversioned)
- row count within +/-15% of previous month
- every vacant/dissolved record has FIN code, county, >=1 site, vacantSince
- aggregate sums reconcile county -> national
- no personal-name field survives into the output
"""
from __future__ import annotations

import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
FIN_RE = re.compile(r"^\d{9}$")
MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


class ValidationError(Exception):
    pass


def previous_month_count(month: str, kind: str = "dental") -> int | None:
    """Vacant+dissolved count from the newest archived month before `month`."""
    older = sorted(
        d.name for d in DATA_DIR.iterdir()
        if d.is_dir() and MONTH_RE.match(d.name) and d.name < month
        and (d / f"{kind}.json").exists()
    )
    if not older:
        return None
    snap = json.loads(
        (DATA_DIR / older[-1] / f"{kind}.json").read_text(encoding="utf-8")
    )
    return snap["national"]["vacant"] + snap["national"]["dissolved"]


def validate_statement_month(statement_month: str, requested_month: str) -> None:
    if statement_month != requested_month:
        raise ValidationError(
            f"source file covers {statement_month}, but {requested_month} was "
            "requested — NEAK URLs are unversioned, refusing to publish"
        )


def validate_records(records: list[dict], previous_count: int | None) -> None:
    if not records:
        raise ValidationError("empty snapshot")
    if previous_count:
        ratio = len(records) / previous_count
        if not 0.85 <= ratio <= 1.15:
            raise ValidationError(
                f"row count changed {ratio:.0%} vs previous month ({previous_count} "
                f"-> {len(records)}) — inspect manually before publishing"
            )
    seen: set[str] = set()
    for r in records:
        rid = r.get("id", "?")
        if not FIN_RE.match(r.get("id") or ""):
            raise ValidationError(f"record {rid}: bad FIN code")
        if rid in seen:
            raise ValidationError(f"record {rid}: duplicate FIN code")
        seen.add(rid)
        for field in ("county", "sites", "vacantSince"):
            if not r.get(field):
                raise ValidationError(f"record {rid} missing {field}")
        if not MONTH_RE.match(r["vacantSince"]):
            raise ValidationError(f"record {rid}: bad vacantSince {r['vacantSince']!r}")
        if r.get("status") not in ("vacant", "dissolved"):
            raise ValidationError(f"record {rid}: bad status {r.get('status')!r}")


def validate_snapshot(snapshot: dict) -> None:
    nat = snapshot["national"]
    counties = snapshot["counties"]
    checks = [
        ("total", sum(c["total"] for c in counties), nat["totalDistricts"]),
        ("vacant", sum(c["vacant"] for c in counties), nat["vacant"]),
        ("dissolved", sum(c["dissolved"] for c in counties), nat["dissolved"]),
        ("populationVacant", sum(c["populationVacant"] for c in counties),
         nat["populationVacant"]),
        ("populationDissolved", sum(c["populationDissolved"] for c in counties),
         nat["populationDissolved"]),
    ]
    for name, county_sum, national in checks:
        if county_sum != national:
            raise ValidationError(
                f"aggregate mismatch for {name}: counties sum {county_sum} "
                f"!= national {national}"
            )
    praxis_count = len(snapshot["praxes"])
    if praxis_count != nat["vacant"] + nat["dissolved"]:
        raise ValidationError(
            f"praxis list length {praxis_count} != vacant+dissolved "
            f"{nat['vacant'] + nat['dissolved']}"
        )
    _assert_no_name_fields(snapshot)


def _assert_no_name_fields(obj, path="$") -> None:
    banned = {"doctor", "physician", "orvos", "name_of_doctor"}
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower() in banned:
                raise ValidationError(f"personal-name field {k!r} at {path}")
            _assert_no_name_fields(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _assert_no_name_fields(v, f"{path}[{i}]")
