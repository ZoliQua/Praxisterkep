"""One record per settlement: everything the site knows about one place.

Twelve analyses answer twelve questions, each for the whole country. A
resident has one question — "and here?" — and no way to ask it. This module
turns the analyses inside out: for every settlement in the gazetteer it
collects what each of them says, into a record small enough to bake into a
static page.

Nothing is computed here. Every field is lifted from an analysis that
already guards its own numbers, so a settlement profile can never disagree
with the chart it came from; if an analysis did not rebuild, its fields are
absent rather than stale (the pipeline skips this step in that case).

Usage:
  python etl/settlements.py
"""
from __future__ import annotations

import json
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_ksh import load_reference, normalize_settlement

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "settlements.json"
# the full profiles stay build-side (3.8 MB); the app only needs to know
# which slug a settlement lives at, so that goes in a file it can load
SLUGS = DATA / "settlement_slugs.json"
SCHEMA_VERSION = 1


def slug(name: str) -> str:
    """"Budapest 03. ker." -> "budapest-03-ker"; unique per settlement."""
    text = unicodedata.normalize("NFKD", name.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return "-".join(part for part in
                    "".join(c if c.isalnum() else " " for c in text).split())


def resolve_slugs(entries: list[dict]) -> dict[str, str]:
    """{KSH code: slug}, with collisions settled by county.

    Hungarian has pairs like Komló and Kömlő that differ only in accents,
    and stripping accents makes them one word. The larger settlement keeps
    the plain slug and the others carry their county, so a link never
    silently points at a different village.
    """
    groups: dict[str, list[dict]] = {}
    for e in entries:
        groups.setdefault(slug(e["name"]), []).append(e)
    out: dict[str, str] = {}
    for base, group in groups.items():
        if len(group) == 1:
            out[group[0]["kshId"]] = base
            continue
        for rank, e in enumerate(sorted(group, key=lambda x: (-x["population"],
                                                              x["name"]))):
            candidate = base if rank == 0 else f"{base}-{slug(e['county'])}"
            while candidate in out.values():
                candidate = f"{candidate}-{e['kshId']}"
            out[e["kshId"]] = candidate
    return out


def read(name: str) -> dict | None:
    path = DATA / name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def build() -> dict:
    ksh = load_reference()
    if ksh is None:
        raise ParseError("the KSH gazetteer is missing")

    latest = read("latest.json")
    coverage = read("coverage.json")
    composite = read("composite.json")
    travel = read("traveltime.json")
    transit = read("transit.json")
    age = read("age.json")
    clusters = read("clusters.json")
    gyse = read("gyse.json")
    vedono = read("vedono.json")
    benefit = (read("kedvezmenyezett.json") or {}).get("settlements", {})
    if not (latest and coverage and composite):
        raise ParseError("the district, coverage or index data is missing")

    from kedvezmenyezett import county_key, normalize

    by_id = {
        "coverageDental": {s["kshId"]: s for s in coverage["kinds"]["dental"]["settlements"]},
        "coverageGp": {s["kshId"]: s for s in coverage["kinds"]["gp"]["settlements"]},
        "composite": {s["kshId"]: s for s in composite["settlements"]},
        "travel": {s["kshId"]: s for s in (travel or {}).get("settlements", [])},
        "transit": {s["kshId"]: s for s in (transit or {}).get("settlements", [])},
        "age": {s["kshId"]: s for s in (age or {}).get("settlements", [])},
    }
    # the index is a ranking, so the rank is worth more than the score
    ranked = sorted(composite["settlements"], key=lambda s: -s["index"])
    rank_of = {s["kshId"]: i + 1 for i, s in enumerate(ranked)}

    cluster_of: dict[str, dict] = {}
    for cluster in (clusters or {}).get("clusters", []):
        for member in cluster["members"]:
            cluster_of[member["kshId"]] = {
                "name": cluster["name"], "settlements": cluster["settlements"],
                "population": cluster["population"],
            }

    shops: dict[str, int] = {}
    for row in (gyse or {}).get("settlements", []):
        shops[normalize_settlement(row["settlement"])] = row["retail"]
    visitors: dict[str, dict] = {}
    for row in (vedono or {}).get("settlements", []):
        visitors[normalize_settlement(row["settlement"])] = row

    entries = [e for e in ksh.entries
               if not (e["name"] == "Budapest" and not e["isDistrictOfCapital"])]
    slugs = resolve_slugs(entries)

    rows: list[dict] = []
    for e in entries:
        key = e["kshId"]
        name_key = normalize_settlement(e["name"])
        record = {
            "kshId": key,
            "slug": slugs[e["kshId"]],
            "settlement": e["name"],
            "county": e["county"],
            "district": e["district"],
            "population": e["population"],
            "benefit": f"{county_key(e['county'])}|{normalize(e['name'])}" in benefit,
        }

        for branch, source in (("gp", "coverageGp"), ("dental", "coverageDental")):
            row = by_id[source].get(key)
            if row:
                record[branch] = {
                    "state": row["class"],
                    "filled": row["filled"],
                    "vacant": row["vacant"] + row["dissolved"],
                    "isSeat": row["isSeat"],
                }

        drive = by_id["travel"].get(key)
        if drive:
            record["travel"] = {
                layer: {"minutes": drive.get(f"{layer}Min"),
                        "km": drive.get(f"{layer}Km"),
                        "at": drive.get(f"{layer}At")}
                for layer in ("gp", "dental", "oncall", "ambulance",
                              "inpatient", "outpatient", "gyse")
                if drive.get(f"{layer}Min") is not None
            }

        bus = by_id["transit"].get(key)
        if bus and not bus.get("capital"):
            record["transit"] = {
                "departures": bus["departures"],
                "reachable": bus["reachable"],
                **{layer: {"direct": bus.get(f"{layer}Direct"),
                           "minutes": bus.get(f"{layer}Minutes"),
                           "target": bus.get(f"{layer}Target")}
                   for layer in ("gp", "oncall", "inpatient")},
            }

        ages = by_id["age"].get(key)
        if ages and not ages["suppressed"]:
            record["age"] = {
                "youngShare": ages["youngShare"], "oldShare": ages["oldShare"],
                "young": ages["youngNow"], "old": ages["oldNow"],
            }

        index = by_id["composite"].get(key)
        if index:
            record["index"] = {
                "value": index["index"],
                "band": index["band"],
                "rank": rank_of[key],
                "of": len(ranked),
                "parts": {k: v for k, v in index["parts"].items() if v is not None},
            }
        if key in cluster_of:
            record["cluster"] = cluster_of[key]
        if name_key in shops:
            record["gyse"] = shops[name_key]
        if name_key in visitors:
            record["vedono"] = {
                "territorial": visitors[name_key]["territorial"],
                "school": visitors[name_key]["school"],
            }

        rows.append(record)

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": latest.get("month", ""),
        "bands": composite.get("bands", []),
        "settlements": rows,
    }
    guard(out)
    return out


def guard(out: dict) -> None:
    rows = out["settlements"]
    if len(rows) < 3000:
        raise ParseError(f"only {len(rows)} settlement profiles")
    if len({r["slug"] for r in rows}) != len(rows):
        raise ParseError("the slugs are not unique")
    missing_index = [r for r in rows if "index" not in r]
    if len(missing_index) > 5:
        raise ParseError(f"{len(missing_index)} settlements have no index")
    for r in rows:
        if not r["settlement"] or not r["county"]:
            raise ParseError(f"{r['kshId']}: incomplete profile")
        index = r.get("index")
        if index and not 1 <= index["rank"] <= index["of"]:
            raise ParseError(f"{r['settlement']}: rank out of range")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    rows = out["settlements"]
    SLUGS.write_text(json.dumps({
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": out["dataMonth"],
        "settlements": [[r["settlement"], r["county"], r["slug"]] for r in rows],
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    withs = lambda k: sum(1 for r in rows if k in r)  # noqa: E731
    print(f"wrote {OUT}: {len(rows)} settlement profiles")
    print(f"  with driving times: {withs('travel')}, with bus data: {withs('transit')}, "
          f"with age: {withs('age')}, in a care desert: {withs('cluster')}")
    print(f"  wrote {SLUGS} ({SLUGS.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
