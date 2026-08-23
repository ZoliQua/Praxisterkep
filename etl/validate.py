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
    """Vacant count from the newest archived month before `month`.

    Vacant-only on purpose: the dissolved list is not published every month,
    so including it would trip the ratio guard whenever availability changes.
    """
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
    return snap["national"]["vacant"]


def validate_statement_month(statement_month: str, requested_month: str) -> None:
    if statement_month != requested_month:
        raise ValidationError(
            f"source file covers {statement_month}, but {requested_month} was "
            "requested — NEAK URLs are unversioned, refusing to publish"
        )


def validate_records(records: list[dict], previous_count: int | None,
                     vacant_count: int | None = None) -> None:
    """Schema checks on all records; the row-count ratio compares vacant-only
    counts when `vacant_count` is given (see previous_month_count)."""
    if not records:
        raise ValidationError("empty snapshot")
    if previous_count:
        ratio = (vacant_count if vacant_count is not None else len(records)) / previous_count
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
        ("vacant", sum(c["vacant"] for c in counties), nat["vacant"]),
        ("dissolved", sum(c["dissolved"] for c in counties), nat["dissolved"]),
        ("populationVacant", sum(c["populationVacant"] for c in counties),
         nat["populationVacant"]),
        ("populationDissolved", sum(c["populationDissolved"] for c in counties),
         nat["populationDissolved"]),
    ]
    if nat["totalDistricts"] is not None:
        checks.append((
            "total", sum(c["total"] for c in counties), nat["totalDistricts"],
        ))
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
    # per-county praxis counts must match the aggregates (frontend derives
    # duration-filtered rankings from the praxis list)
    per_county: dict[str, int] = {}
    for p in snapshot["praxes"]:
        per_county[p["county"]] = per_county.get(p["county"], 0) + 1
    for c in counties:
        if per_county.get(c["name"], 0) != c["vacant"] + c["dissolved"]:
            raise ValidationError(
                f"county {c['name']}: praxis count {per_county.get(c['name'], 0)} "
                f"!= aggregate {c['vacant'] + c['dissolved']}"
            )
    # names are allowed ONLY on filled praxes (NEAK-published contracted
    # physician); vacant/dissolved records and everything else stay name-free
    guarded = {k: v for k, v in snapshot.items() if k != "filledPraxes"}
    _assert_no_name_fields(guarded)
    for f in snapshot.get("filledPraxes", []):
        doc = f.get("doctor")
        if doc is not None and (not doc or doc.strip().lower() == "betöltetlen"):
            raise ValidationError(f"filled praxis {f['id']}: bad doctor value {doc!r}")


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
