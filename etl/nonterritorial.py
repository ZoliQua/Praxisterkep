"""GP practices without a district obligation (TEK nélküli), from the archive.

NEAK's GP registry (source C) lists two forms of practice: territorial (T),
the districts every other analysis counts, and TN — "területi ellátási
kötelezettség nélküli", a practice that takes the patients who register with
it but is responsible for no area. TN practices never appear on the vacancy
list, so parse_registry leaves them out of the denominator; this step counts
them, next to the districts, in every archived registry:

  * per archived month: districts (T) and TN practices by type, and how many
    TN practices the registry lists without a contracted physician;
  * for the latest month: where the TN practices are, by county and seat;
  * between the first and the latest archived registry, followed by code:
    start − left + new = end, and how many changed form (T ↔ TN). The same
    flows are summed over every pair of consecutive archived months, which
    also catches a practice that came and went between the two ends;
  * who runs them (parse_gp.operator_kind): state bodies, universities,
    companies, physicians as sole traders — now, among the practices that
    left (as of the last registry that listed them) and among the new ones;
  * whether a practice kept its physician between the first and the latest
    registry, for TN practices and for districts alike.

Only codes, forms, types, places and the provider's kind leave the parser.
Whether a physician stayed is decided on a one-way digest of the name,
compared with the same code's digest in the other month — never across codes,
and the digest is not written out.
The archive is not evenly spaced (no registry between 2024-01 and 2026-04),
and every number travels with the months it spans.

Output: data/nonterritorial.json

Usage:
  python etl/nonterritorial.py
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_gp import parse_registry_forms

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "nonterritorial.json"
SCHEMA_VERSION = 1
TYPES = ("adult", "child", "mixed")
OPERATORS = ("state", "university", "company", "sole", "other", "unknown")


def registry_files() -> dict[str, Path]:
    """One registry per archived month; the .xls NEAK publishes today wins
    over an .xlsx archived beside it in the same month."""
    found: dict[str, Path] = {}
    for month_dir in sorted(RAW.iterdir()):
        if not month_dir.is_dir():
            continue
        for name in ("gp_registry.xls", "gp_registry.xlsx"):
            if (month_dir / name).exists():
                found[month_dir.name] = month_dir / name
                break
    return found


def counts(rows: list[dict]) -> dict:
    by_type = collections.Counter(r["type"] for r in rows)
    return {"total": len(rows), "byType": {t: by_type.get(t, 0) for t in TYPES}}


def flows(a: dict[str, dict], b: dict[str, dict]) -> dict:
    """TN practices between two registries, by code."""
    tn_a = {k for k, v in a.items() if v["form"] == "TN"}
    tn_b = {k for k, v in b.items() if v["form"] == "TN"}
    return {
        "start": len(tn_a),
        "end": len(tn_b),
        "kept": len(tn_a & tn_b),
        "left": sum(1 for k in tn_a - tn_b if k not in b),
        "toTerritorial": sum(1 for k in tn_a - tn_b if k in b),
        "new": sum(1 for k in tn_b - tn_a if k not in a),
        "fromTerritorial": sum(1 for k in tn_b - tn_a if k in a),
    }


def build() -> dict:
    files = registry_files()
    if not files:
        raise ParseError("no archived GP registry found")
    snapshots = {m: {r["id"]: r for r in parse_registry_forms(p)} for m, p in files.items()}
    months = sorted(snapshots)

    series = []
    for m in months:
        rows = list(snapshots[m].values())
        t_rows = [r for r in rows if r["form"] == "T"]
        tn_rows = [r for r in rows if r["form"] == "TN"]
        series.append({
            "month": m,
            "territorial": counts(t_rows),
            "nonTerritorial": counts(tn_rows) | {
                "unnamed": sum(1 for r in tn_rows if not r["named"])},
        })

    last = snapshots[months[-1]]
    tn_last = [r for r in last.values() if r["form"] == "TN"]
    by_county = collections.Counter(r["county"] for r in tn_last)
    by_seat = collections.Counter((r["settlement"], r["county"]) for r in tn_last)

    span = flows(snapshots[months[0]], last) | {"from": months[0], "to": months[-1]}
    pairs = [flows(snapshots[a], snapshots[b]) | {"from": a, "to": b}
             for a, b in zip(months, months[1:])]
    summed = {k: sum(p[k] for p in pairs)
              for k in ("left", "new", "toTerritorial", "fromTerritorial")}

    # who runs them: now, the ones that left (as last listed), the new ones
    last_listed: dict[str, dict] = {}
    for m in months:
        for k, r in snapshots[m].items():
            if r["form"] == "TN":
                last_listed[k] = r
    first_tn = {k for k, r in snapshots[months[0]].items() if r["form"] == "TN"}
    now_tn = {k for k, r in last.items() if r["form"] == "TN"}
    operators = {
        "now": by_operator(last[k] for k in now_tn),
        "left": by_operator(r for k, r in last_listed.items() if k not in now_tn),
        "new": by_operator(last[k] for k in now_tn - first_tn),
    }
    first_seen: dict[str, str] = {}
    for m in months:
        for k, r in snapshots[m].items():
            if r["form"] == "TN":
                first_seen.setdefault(k, m)
    since_start = sum(1 for k in now_tn if first_seen[k] == months[0])

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "NEAK háziorvosi szolgálatok nyilvántartása (szervezeti egység ellátási formája: T / TN)",
        "months": series,
        "latest": {
            "month": months[-1],
            "byCounty": [{"county": c, "n": n} for c, n in sorted(by_county.items(), key=lambda x: (-x[1], x[0]))],
            "bySeat": [{"settlement": s, "county": c, "n": n}
                       for (s, c), n in sorted(by_seat.items(), key=lambda x: (-x[1], x[0]))],
        },
        "span": span,
        "pairs": {"count": len(pairs)} | summed,
        "pairList": [{k: p[k] for k in ("from", "to", "left", "new", "start", "end")} for p in pairs],
        "operators": operators,
        "sinceStart": since_start,
        "continuity": {form: continuity(snapshots[months[0]], last, form) for form in ("T", "TN")},
    }
    validate(out)
    return out


def by_operator(rows) -> dict[str, int]:
    c = collections.Counter(r["operator"] for r in rows)
    return {o: c.get(o, 0) for o in OPERATORS}


def continuity(a: dict[str, dict], b: dict[str, dict], form: str) -> dict:
    """Of the codes of one form at both ends with a named physician at both,
    how many name the same physician (by digest, same code only)."""
    both = [k for k, r in a.items() if r["form"] == form and k in b and b[k]["form"] == form
            and r["doctorKey"] and b[k]["doctorKey"]]
    return {"compared": len(both), "same": sum(1 for k in both if a[k]["doctorKey"] == b[k]["doctorKey"])}


def validate(out: dict) -> None:
    for s in out["months"]:
        for part in ("territorial", "nonTerritorial"):
            c = s[part]
            if sum(c["byType"].values()) != c["total"]:
                raise ParseError(f"{s['month']} {part}: types do not add up to the total")
    sp = out["span"]
    if sp["start"] - sp["left"] - sp["toTerritorial"] + sp["new"] + sp["fromTerritorial"] != sp["end"]:
        raise ParseError("TN span: start − left + new does not give the end")
    if sum(c["n"] for c in out["latest"]["byCounty"]) != out["months"][-1]["nonTerritorial"]["total"]:
        raise ParseError("TN by county does not add up to the latest total")
    if sum(out["operators"]["now"].values()) != out["months"][-1]["nonTerritorial"]["total"]:
        raise ParseError("TN operators do not add up to the latest total")
    if sum(out["operators"]["new"].values()) != sp["new"] + sp["fromTerritorial"]:
        raise ParseError("new TN operators do not match the span")
    blob = json.dumps(out, ensure_ascii=False)
    if "doctorKey" in blob or "Dr." in blob:
        raise ParseError("a physician name or digest reached the output")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    sp = out["span"]
    print(f"wrote {OUT}: {len(out['months'])} registries, TN {sp['start']} ({sp['from']}) -> "
          f"{sp['end']} ({sp['to']}), left {sp['left']}, new {sp['new']}, "
          f"form changes {sp['toTerritorial']}/{sp['fromTerritorial']}")


if __name__ == "__main__":
    main()
