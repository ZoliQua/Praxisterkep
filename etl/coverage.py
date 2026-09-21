"""Settlement coverage — the question asked at settlement level, not at the seat.

Every vacancy figure on the site is counted where the district's surgery is.
That is how NEAK publishes it, and it is the honest way to count districts —
but it is not the way a resident experiences it. A GP district seated in the
small town next door may serve eight villages; when it goes vacant, the seat
appears once in the statistics and the eight villages appear nowhere.

This module turns the picture around and classifies every settlement in the
country:

    filled      at least one district with a contracted physician serves it
    partial     a filled district serves it, and a vacant one does too
    vacantOnly  every district serving it is vacant or dissolved
    absent      no district in the registry names it

The two branches can be asked different questions, and the output says so:

  * GP — the registry lists the settlements each district serves, so
    "serves" is read from the source.
  * Dental — the registry publishes only the surgery's own settlement, so
    for dental "absent" means "no dental surgery in the settlement", which
    is a weaker statement. It is kept separate and labelled.

None of this is a claim that a settlement is unserved (CLAUDE.md rule 4):
substitution is invisible in the published data. What is published here is
which settlements depend on a district that currently has no physician.

Usage:
  python etl/coverage.py
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_ksh import load_reference, normalize_settlement

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "coverage.json"
SCHEMA_VERSION = 1

CLASSES = ("filled", "partial", "vacantOnly", "absent")


def build() -> dict:
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    ksh = load_reference()
    if ksh is None:
        raise ParseError("the KSH gazetteer is missing")
    age_path = ROOT / "data" / "age.json"
    age = {a["kshId"]: a for a in json.loads(
        age_path.read_text(encoding="utf-8"))["settlements"]} if age_path.exists() else {}

    kinds: dict[str, dict] = {}
    for kind in ("dental", "gp"):
        snap = latest["kinds"][kind]
        by_key = {normalize_settlement(s["name"]): s for s in snap["settlements"]}

        # the seat view: the settlements a vacant district's surgery sits in
        seats: set[str] = set()
        for p in snap.get("praxes", []):
            for site in p.get("sites", []):
                if site.get("settlement"):
                    seats.add(normalize_settlement(site["settlement"]))

        rows: list[dict] = []
        for e in ksh.entries:
            if e["name"] == "Budapest" and not e["isDistrictOfCapital"]:
                continue  # the capital travels as its 23 districts
            s = by_key.get(normalize_settlement(e["name"]))
            filled = (s or {}).get("filled", 0)
            vacant = len((s or {}).get("vacantPraxisIds", []))
            dissolved = len((s or {}).get("dissolvedPraxisIds", []))
            if s is None:
                cls = "absent"
            elif filled and (vacant or dissolved):
                cls = "partial"
            elif filled:
                cls = "filled"
            else:
                cls = "vacantOnly"
            a = age.get(e["kshId"], {})
            rows.append({
                "kshId": e["kshId"],
                "settlement": e["name"],
                "county": e["county"],
                "district": e["district"],
                "population": e["population"],
                "filled": filled,
                "vacant": vacant,
                "dissolved": dissolved,
                "class": cls,
                "isSeat": normalize_settlement(e["name"]) in seats,
                "youngShare": a.get("youngShare"),
                "oldShare": a.get("oldShare"),
                "old": a.get("oldNow"),
            })

        kinds[kind] = {
            "servedListPublished": kind == "gp",
            "stats": summarise(rows, seats),
            "counties": by_county(rows),
            "settlements": rows,
        }

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": latest.get("month", ""),
        "kinds": kinds,
    }
    guard(out)
    return out


def summarise(rows: list[dict], seats: set[str]) -> dict:
    counts = collections.Counter(r["class"] for r in rows)
    population = collections.Counter()
    for r in rows:
        population[r["class"]] += r["population"]
    affected = [r for r in rows if r["class"] in ("partial", "vacantOnly")]
    seat_rows = [r for r in rows if r["isSeat"]]
    return {
        "settlements": len(rows),
        "population": sum(r["population"] for r in rows),
        "byClass": {c: counts.get(c, 0) for c in CLASSES},
        "populationByClass": {c: population.get(c, 0) for c in CLASSES},
        # what the seat view sees against what the settlement view sees
        "seatSettlements": len(seat_rows),
        "seatPopulation": sum(r["population"] for r in seat_rows),
        "affectedSettlements": len(affected),
        "affectedPopulation": sum(r["population"] for r in affected),
        "affectedOld": sum(r["old"] or 0 for r in affected),
        "vacantOnlyOld": sum(r["old"] or 0 for r in rows if r["class"] == "vacantOnly"),
    }


def by_county(rows: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        groups[r["county"]].append(r)
    out = []
    for county, list_ in sorted(groups.items()):
        counts = collections.Counter(r["class"] for r in list_)
        affected = [r for r in list_ if r["class"] in ("partial", "vacantOnly")]
        out.append({
            "county": county,
            "settlements": len(list_),
            "population": sum(r["population"] for r in list_),
            **{c: counts.get(c, 0) for c in CLASSES},
            "affectedSettlements": len(affected),
            "affectedPopulation": sum(r["population"] for r in affected),
            "affectedShare": (sum(r["population"] for r in affected)
                              / sum(r["population"] for r in list_)
                              if list_ else 0.0),
        })
    return sorted(out, key=lambda c: -c["affectedShare"])


def guard(out: dict) -> None:
    for kind, k in out["kinds"].items():
        st = k["stats"]
        if st["settlements"] < 3000:
            raise ParseError(f"{kind}: only {st['settlements']} settlements classified")
        if sum(st["byClass"].values()) != st["settlements"]:
            raise ParseError(f"{kind}: the classes do not add up to the settlements")
        if sum(st["populationByClass"].values()) != st["population"]:
            raise ParseError(f"{kind}: the class populations do not add up")
        if sum(c["settlements"] for c in k["counties"]) != st["settlements"]:
            raise ParseError(f"{kind}: county counts do not add up")
        for r in k["settlements"]:
            if r["class"] not in CLASSES:
                raise ParseError(f"{kind}: unknown class {r['class']!r}")
            if r["class"] == "filled" and (r["vacant"] or r["dissolved"]):
                raise ParseError(f"{kind}: {r['settlement']} is filled and vacant at once")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}")
    for kind, k in out["kinds"].items():
        st = k["stats"]
        print(f"  {kind}: {st['byClass']['filled']} filled, "
              f"{st['byClass']['partial']} partial, "
              f"{st['byClass']['vacantOnly']} vacant-only, "
              f"{st['byClass']['absent']} absent")
        print(f"    seat view: {st['seatSettlements']} settlements "
              f"({st['seatPopulation']:,} residents) — settlement view: "
              f"{st['affectedSettlements']} ({st['affectedPopulation']:,})")


if __name__ == "__main__":
    main()
