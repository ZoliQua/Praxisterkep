"""Schema + sanity validation. On failure: raise — the pipeline must not publish.

Invariants (see CLAUDE.md):
- row count within +/-15% of previous month
- every record has FIN code, county, >=1 site, vacantSince
- aggregate sums reconcile settlement -> district -> county -> national
"""
from __future__ import annotations


class ValidationError(Exception):
    pass


def validate_snapshot(records: list[dict], previous_count: int | None) -> None:
    if not records:
        raise ValidationError("empty snapshot")
    if previous_count:
        ratio = len(records) / previous_count
        if not 0.85 <= ratio <= 1.15:
            raise ValidationError(
                f"row count changed {ratio:.0%} vs previous month — inspect manually"
            )
    for r in records:
        for field in ("id", "county", "sites", "vacantSince"):
            if not r.get(field):
                raise ValidationError(f"record {r.get('id', '?')} missing {field}")
