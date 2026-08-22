"""Build monthly JSON snapshots consumed by the web app.

Inputs: parsed vacant list (A), dissolved list (A'), registry (C), geocode cache.
Outputs:
  data/YYYY-MM/dental.json  — full monthly snapshot (praxes + aggregates)
  data/latest.json          — copy of the newest monthly snapshot
  data/timeseries.json      — one aggregate entry per archived month

Terminology guard (CLAUDE.md rule 4): "vacant" (betöltetlen) never implies
"unserved" (ellátatlan) — substitution service is not visible in these sources,
so the output only ever speaks of vacancy, and the UI copy must do the same.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SCHEMA_VERSION = 1


def _praxis_key(p: dict) -> tuple:
    return (p["county"], p["id"])


def attach_geocodes(records: list[dict], cache: dict) -> None:
    for r in records:
        for s in r["sites"]:
            key = f"{s['postalCode']} {s['settlement']}, {s['address']}"
            hit = cache.get(key)
            if hit:
                s["lat"], s["lon"] = hit["lat"], hit["lon"]
                s["geoApprox"] = hit.get("geoApprox", False)


def build_snapshot(
    month: str,
    vacant: list[dict],
    dissolved: list[dict],
    registry: list[dict],
) -> dict:
    reg_by_fin = {e["id"]: e for e in registry}
    # dissolved services fall out of the contract registry; their type comes
    # from the registry when still listed, else stays as parsed
    for r in dissolved:
        if r["id"] in reg_by_fin:
            r["type"] = reg_by_fin[r["id"]]["type"]

    all_fins = set(reg_by_fin) | {r["id"] for r in dissolved}
    vacant_fins = {r["id"] for r in vacant}
    dissolved_fins = {r["id"] for r in dissolved}

    counties: dict[str, dict] = {}
    for fin in sorted(all_fins):
        county = (
            reg_by_fin[fin]["county"]
            if fin in reg_by_fin
            else next(r for r in dissolved if r["id"] == fin)["county"]
        )
        c = counties.setdefault(county, {
            "name": county, "total": 0, "vacant": 0, "dissolved": 0,
            "populationVacant": 0, "populationDissolved": 0,
            "byType": defaultdict(lambda: {"total": 0, "vacant": 0}),
        })
        c["total"] += 1
        ptype = (reg_by_fin.get(fin) or {}).get("type")
        if ptype:
            c["byType"][ptype]["total"] += 1
            if fin in vacant_fins or fin in dissolved_fins:
                c["byType"][ptype]["vacant"] += 1
    for r in vacant:
        counties[_county_of(r, reg_by_fin)]["vacant"] += 1
        counties[_county_of(r, reg_by_fin)]["populationVacant"] += r["population"] or 0
    for r in dissolved:
        counties[_county_of(r, reg_by_fin)]["dissolved"] += 1
        counties[_county_of(r, reg_by_fin)]["populationDissolved"] += r["population"] or 0

    county_list = []
    for c in sorted(counties.values(), key=lambda c: c["name"]):
        c["byType"] = {k: dict(v) for k, v in sorted(c["byType"].items())}
        c["vacancyRate"] = round((c["vacant"] + c["dissolved"]) / c["total"], 4)
        county_list.append(c)

    # settlement index for the search feature
    settlements: dict[tuple, dict] = {}

    def _settlement(name: str, county: str) -> dict:
        return settlements.setdefault((name, county), {
            "name": name, "county": county,
            "filled": 0, "vacantPraxisIds": [], "dissolvedPraxisIds": [],
            "affectedByDissolved": False,
        })

    filled_fins = set(reg_by_fin) - vacant_fins - dissolved_fins
    for fin in filled_fins:
        e = reg_by_fin[fin]
        _settlement(e["settlement"], e["county"])["filled"] += 1
    for r in vacant:
        for s in r["sites"]:
            if not s["isHeadquarters"] or len(r["sites"]) == 1:
                entry = _settlement(s["settlement"], r["county"])
                if r["id"] not in entry["vacantPraxisIds"]:
                    entry["vacantPraxisIds"].append(r["id"])
    for r in dissolved:
        for name in r.get("servedSettlements", []):
            entry = _settlement(name, r["county"])
            entry["affectedByDissolved"] = True
            if r["id"] not in entry["dissolvedPraxisIds"]:
                entry["dissolvedPraxisIds"].append(r["id"])

    national = {
        "totalDistricts": len(all_fins),
        "vacant": len(vacant),
        "dissolved": len(dissolved),
        "vacancyRate": round((len(vacant) + len(dissolved)) / len(all_fins), 4),
        "populationVacant": sum(r["population"] or 0 for r in vacant),
        "populationDissolved": sum(r["population"] or 0 for r in dissolved),
        "byType": _national_by_type(reg_by_fin, vacant_fins | dissolved_fins),
    }

    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "dental",
        "month": month,
        "disclaimer": "A NEAK adatai tájékoztató jellegűek.",
        "sources": [
            "NEAK Betöltetlen fogorvosi szolgálatok (PDF)",
            "NEAK Betöltetlen (megszűnt) fogorvosi szolgálatok (PDF)",
            "NEAK Fogorvosi rendelők / szerződött szolgáltatók (XLS)",
        ],
        "national": national,
        "counties": county_list,
        "praxes": sorted(vacant + dissolved, key=_praxis_key),
        "settlements": sorted(settlements.values(), key=lambda s: s["name"]),
    }


def _county_of(record: dict, reg_by_fin: dict) -> str:
    # registry county naming is canonical when the FIN is listed there
    return (reg_by_fin.get(record["id"]) or record)["county"]


def _national_by_type(reg_by_fin: dict, vacant_all: set) -> dict:
    out: dict[str, dict] = {}
    for e in reg_by_fin.values():
        t = out.setdefault(e["type"], {"total": 0, "vacant": 0})
        t["total"] += 1
        if e["id"] in vacant_all:
            t["vacant"] += 1
    return dict(sorted(out.items()))


def write_outputs(snapshot: dict) -> list[Path]:
    month = snapshot["month"]
    month_dir = DATA_DIR / month
    month_dir.mkdir(parents=True, exist_ok=True)
    month_file = month_dir / "dental.json"
    _dump(month_file, snapshot)
    _dump(DATA_DIR / "latest.json", snapshot)
    ts_file = DATA_DIR / "timeseries.json"
    ts = json.loads(ts_file.read_text(encoding="utf-8")) if ts_file.exists() else {
        "kind": "dental", "months": [],
    }
    entry = {
        "month": month,
        "totalDistricts": snapshot["national"]["totalDistricts"],
        "vacant": snapshot["national"]["vacant"],
        "dissolved": snapshot["national"]["dissolved"],
        "populationVacant": snapshot["national"]["populationVacant"],
        "populationDissolved": snapshot["national"]["populationDissolved"],
        "byCounty": {
            c["name"]: {"vacant": c["vacant"], "dissolved": c["dissolved"]}
            for c in snapshot["counties"]
        },
    }
    ts["months"] = [m for m in ts["months"] if m["month"] != month] + [entry]
    ts["months"].sort(key=lambda m: m["month"])
    _dump(ts_file, ts)
    return [month_file, DATA_DIR / "latest.json", ts_file]


def _dump(path: Path, obj: dict) -> None:
    path.write_text(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
