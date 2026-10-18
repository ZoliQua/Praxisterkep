"""Give every archived snapshot the gazetteer's settlement spellings.

The monthly snapshots were built by successive versions of the parsers, and
the older ones kept NEAK's spelling as it came: "Budapest XI. kerület" from
the GP registry, "Budapest 11" from the dental one, "Gyor" from the 2026
dental list. The current parsers fold every name onto the KSH gazetteer
(parse_dental.resolve_capital); this module brings the archive in line with
them without re-parsing anything, so nothing a snapshot gained at the time
it was built — OKFŐ long-term flags, tidied addresses — is lost.

What it touches, and only that:

  praxes[].sites[].settlement, praxes[].servedSettlements,
  filledPraxes[].settlement, filledPraxes[].servedSettlements,
  settlements[] — the per-settlement index, where one place spelt three ways
  was three entries: they are merged (filled counts added, FIN lists united,
  the dissolved flag or-ed) and given the gazetteer's kshId and population.

National and county aggregates do not depend on names and are left as they
are; validate_snapshot() is run on every rewritten month, and a month whose
index would lose or gain a district is refused.

Usage:
  python etl/respell_archive.py [--check]   # --check: report, write nothing
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError, resolve_capital
from parse_ksh import load_reference
from validate import validate_snapshot

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def _spell(name: str, postal: str = "") -> str:
    return resolve_capital(name, postal) if name else name


def _served(names) -> list[str] | None:
    if names is None:
        return None
    out: list[str] = []
    for n in names:
        m = _spell(n)
        if m not in out:
            out.append(m)
    return out


def respell(snapshot: dict, ref) -> int:
    """Rewrite one snapshot in place; returns how many names changed."""
    changed = 0

    def put(obj: dict, key: str, value) -> None:
        nonlocal changed
        if obj.get(key) != value:
            obj[key] = value
            changed += 1

    for p in snapshot.get("praxes", []):
        for site in p.get("sites", []):
            put(site, "settlement", _spell(site.get("settlement", ""), site.get("postalCode", "")))
        if p.get("servedSettlements") is not None:
            put(p, "servedSettlements", _served(p["servedSettlements"]))
    for p in snapshot.get("filledPraxes") or []:
        put(p, "settlement", _spell(p.get("settlement", ""), p.get("postalCode", "")))
        if p.get("servedSettlements") is not None:
            put(p, "servedSettlements", _served(p["servedSettlements"]))

    before = _index_totals(snapshot.get("settlements", []))
    merged: dict[tuple, dict] = {}
    for s in snapshot.get("settlements", []):
        name = _spell(s["name"])
        key = (name, s["county"])
        if name != s["name"]:
            changed += 1
        e = merged.get(key)
        if e is None:
            e = merged[key] = {**s, "name": name,
                               "vacantPraxisIds": list(s.get("vacantPraxisIds", [])),
                               "dissolvedPraxisIds": list(s.get("dissolvedPraxisIds", []))}
            continue
        e["filled"] += s.get("filled", 0)
        for k in ("vacantPraxisIds", "dissolvedPraxisIds"):
            e[k] += [f for f in s.get(k, []) if f not in e[k]]
        e["affectedByDissolved"] = e.get("affectedByDissolved") or s.get("affectedByDissolved")
    for e in merged.values():
        hit = ref.lookup(e["name"])
        if hit:
            e["kshId"], e["population"] = hit["kshId"], hit["population"]
    snapshot["settlements"] = list(merged.values())
    after = _index_totals(snapshot["settlements"])
    if after["fins"] != before["fins"] or after["filled"] != before["filled"]:
        raise ParseError(f"{snapshot['month']} {snapshot['kind']}: merging the index "
                         f"changed it ({before} -> {after})")
    return changed


def _index_totals(rows: list[dict]) -> dict:
    fins: set[str] = set()
    for r in rows:
        fins |= set(r.get("vacantPraxisIds", [])) | set(r.get("dissolvedPraxisIds", []))
    return {"fins": len(fins), "filled": sum(r.get("filled", 0) for r in rows)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="report only")
    args = parser.parse_args()
    ref = load_reference()
    if ref is None:
        raise ParseError("the KSH gazetteer is missing")
    names = {e["name"] for e in ref.entries}
    total = 0
    for f in sorted(DATA.glob("[0-9][0-9][0-9][0-9]-[0-9][0-9]/*.json")):
        if not re.fullmatch(r"(dental|gp)\.json", f.name):
            continue
        snap = json.loads(f.read_text(encoding="utf-8"))
        n = respell(snap, ref)
        validate_snapshot(snap)
        left = sorted({s["settlement"] for p in snap.get("praxes", []) for s in p["sites"]
                       if s["settlement"] and s["settlement"] not in names})
        total += n
        if n or left:
            print(f"  {f.parent.name}/{f.name}: {n} names respelt"
                  + (f", still unknown: {left}" if left else ""))
        if n and not args.check:
            f.write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")),
                         encoding="utf-8")
    print(f"{'would respell' if args.check else 'respelt'} {total} names")


if __name__ == "__main__":
    main()
