"""Build monthly JSON snapshots consumed by the web app.

Inputs per kind: parsed vacant list, dissolved list (dental only — GP has no
published dissolved list), registry (denominator), geocode cache.
Outputs:
  data/YYYY-MM/{kind}.json  — full monthly snapshot (praxes + aggregates)
  data/latest.json          — {"month", "kinds": {kind: snapshot}}
  data/timeseries.json      — {"kinds": {kind: [monthly aggregate entries]}}

Terminology guard (CLAUDE.md rule 4): "vacant" (betöltetlen) never implies
"unserved" (ellátatlan) — substitution service is not visible in these sources,
so the output only ever speaks of vacancy, and the UI copy must do the same.

Settlement indexing: the GP registry lists every praxis's served settlements
(with KSH codes), so GP settlement entries are coverage-based (a settlement
belongs to every praxis that serves it). The dental registry only gives the
surgery seat, so dental entries are seat-based, except dissolved districts
whose served-settlement lists are published.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SCHEMA_VERSION = 2

SOURCE_NAMES = {
    "dental": [
        "NEAK Betöltetlen fogorvosi szolgálatok (PDF)",
        "NEAK Betöltetlen (megszűnt) fogorvosi szolgálatok (PDF)",
        "NEAK Fogorvosi rendelők / szerződött szolgáltatók (XLS)",
    ],
    "gp": [
        "NEAK Betöltetlen háziorvosi szolgálatok (PDF)",
        "NEAK Háziorvosi szolgálatok / szerződött szolgáltatók (XLS)",
    ],
}


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


def _served_names(entry: dict) -> list[str]:
    return [s["name"] for s in entry.get("servedSettlements", [])]


def build_snapshot(
    month: str,
    kind: str,
    vacant: list[dict],
    dissolved: list[dict],
    registry: list[dict],
) -> dict:
    reg_by_fin = {e["id"]: e for e in registry}
    # enrich from the registry where the vacant lists are thinner
    for r in vacant + dissolved:
        reg = reg_by_fin.get(r["id"])
        if not reg:
            continue
        if r["status"] == "dissolved":
            # the dissolved list carries no type column; the registry does
            r["type"] = reg["type"]
        if reg.get("district"):
            for s in r["sites"]:
                if not s["district"]:
                    s["district"] = reg["district"]
        if reg.get("servedSettlements") and not r.get("servedSettlements"):
            r["servedSettlements"] = _served_names(reg)

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

    settlements = _build_settlement_index(vacant, dissolved, reg_by_fin,
                                          vacant_fins, dissolved_fins)

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
        "kind": kind,
        "month": month,
        "disclaimer": "A NEAK adatai tájékoztató jellegűek.",
        "sources": SOURCE_NAMES[kind],
        "national": national,
        "counties": county_list,
        "praxes": sorted(vacant + dissolved, key=_praxis_key),
        "settlements": sorted(settlements, key=lambda s: s["name"]),
    }


def _build_settlement_index(vacant, dissolved, reg_by_fin,
                            vacant_fins, dissolved_fins) -> list[dict]:
    settlements: dict[tuple, dict] = {}

    def entry(name: str, county: str) -> dict:
        return settlements.setdefault((name, county), {
            "name": name, "county": county,
            "filled": 0, "vacantPraxisIds": [], "dissolvedPraxisIds": [],
            "affectedByDissolved": False,
        })

    filled_fins = set(reg_by_fin) - vacant_fins - dissolved_fins
    for fin in filled_fins:
        e = reg_by_fin[fin]
        # coverage-based when the registry lists served settlements (GP),
        # seat-based otherwise (dental)
        for name in _served_names(e) or [e["settlement"]]:
            entry(name, e["county"])["filled"] += 1
    for r in vacant:
        names = r.get("servedSettlements") or [
            s["settlement"] for s in r["sites"]
            if not s["isHeadquarters"] or len(r["sites"]) == 1
        ]
        for name in names:
            e = entry(name, r["county"])
            if r["id"] not in e["vacantPraxisIds"]:
                e["vacantPraxisIds"].append(r["id"])
    for r in dissolved:
        for name in r.get("servedSettlements", []):
            e = entry(name, r["county"])
            e["affectedByDissolved"] = True
            if r["id"] not in e["dissolvedPraxisIds"]:
                e["dissolvedPraxisIds"].append(r["id"])
    return list(settlements.values())


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


def timeseries_entry(snapshot: dict) -> dict:
    return {
        "month": snapshot["month"],
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


def write_outputs(snapshots: dict[str, dict], month: str) -> list[Path]:
    """Write per-kind month files plus the combined latest and timeseries."""
    written: list[Path] = []
    month_dir = DATA_DIR / month
    month_dir.mkdir(parents=True, exist_ok=True)
    for kind, snap in snapshots.items():
        path = month_dir / f"{kind}.json"
        _dump(path, snap)
        written.append(path)

    # a partial (single-kind) run must not drop the other kind from latest.json
    latest_path = DATA_DIR / "latest.json"
    kinds: dict[str, dict] = {}
    if latest_path.exists():
        old = json.loads(latest_path.read_text(encoding="utf-8"))
        if old.get("month") == month and "kinds" in old:
            kinds = old["kinds"]
    kinds.update(snapshots)
    _dump(latest_path, {"month": month, "kinds": kinds})
    written.append(DATA_DIR / "latest.json")

    ts_file = DATA_DIR / "timeseries.json"
    ts = _load_timeseries(ts_file)
    for kind, snap in snapshots.items():
        months = [m for m in ts["kinds"].get(kind, []) if m["month"] != month]
        months.append(timeseries_entry(snap))
        months.sort(key=lambda m: m["month"])
        ts["kinds"][kind] = months
    _dump(ts_file, ts)
    written.append(ts_file)
    return written


def _load_timeseries(path: Path) -> dict:
    if not path.exists():
        return {"kinds": {}}
    old = json.loads(path.read_text(encoding="utf-8"))
    if "kinds" in old:
        return old
    # migrate schema v1 ({"kind": ..., "months": [...]})
    return {"kinds": {old["kind"]: old["months"]}}


def _dump(path: Path, obj: dict) -> None:
    path.write_text(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
