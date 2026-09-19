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
SCHEMA_VERSION = 3

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
    long_term_as_of: str | None = None,
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

    # a snapshot without a same-month registry (historical backfill) has no
    # denominator: totals and rates stay null rather than being guessed
    denominator_known = bool(registry)
    all_fins = set(reg_by_fin) | {r["id"] for r in dissolved}
    vacant_fins = {r["id"] for r in vacant}
    dissolved_fins = {r["id"] for r in dissolved}

    counties: dict[str, dict] = {}

    def county_entry(name: str) -> dict:
        return counties.setdefault(name, {
            "name": name, "total": 0 if denominator_known else None,
            "vacant": 0, "dissolved": 0,
            "populationVacant": 0, "populationDissolved": 0,
            "byType": defaultdict(lambda: {
                "total": 0 if denominator_known else None, "vacant": 0,
            }),
        })

    if denominator_known:
        for fin in sorted(all_fins):
            county = (
                reg_by_fin[fin]["county"]
                if fin in reg_by_fin
                else next(r for r in dissolved if r["id"] == fin)["county"]
            )
            c = county_entry(county)
            c["total"] += 1
            ptype = (reg_by_fin.get(fin) or {}).get("type")
            if ptype:
                c["byType"][ptype]["total"] += 1
                if fin in vacant_fins or fin in dissolved_fins:
                    c["byType"][ptype]["vacant"] += 1
    else:
        for r in vacant + dissolved:
            county_entry(r["county"])["byType"][r["type"]]["vacant"] += 1
    for r in vacant:
        c = county_entry(_county_of(r, reg_by_fin))
        c["vacant"] += 1
        c["populationVacant"] += r["population"] or 0
    for r in dissolved:
        c = county_entry(_county_of(r, reg_by_fin))
        c["dissolved"] += 1
        c["populationDissolved"] += r["population"] or 0
    for r in vacant + dissolved:
        if r.get("longTerm"):
            c = county_entry(_county_of(r, reg_by_fin))
            c["longTerm"] = c.get("longTerm", 0) + 1
    for c in counties.values():
        c.setdefault("longTerm", 0)

    county_list = []
    for c in sorted(counties.values(), key=lambda c: c["name"]):
        c["byType"] = {k: dict(v) for k, v in sorted(c["byType"].items())}
        c["vacancyRate"] = (
            round((c["vacant"] + c["dissolved"]) / c["total"], 4)
            if denominator_known else None
        )
        county_list.append(c)

    settlements = _build_settlement_index(vacant, dissolved, reg_by_fin,
                                          vacant_fins, dissolved_fins)
    _apply_ksh(settlements, county_list)

    national = {
        "totalDistricts": len(all_fins) if denominator_known else None,
        "vacant": len(vacant),
        "dissolved": len(dissolved),
        "vacancyRate": (
            round((len(vacant) + len(dissolved)) / len(all_fins), 4)
            if denominator_known else None
        ),
        "populationVacant": sum(r["population"] or 0 for r in vacant),
        "populationDissolved": sum(r["population"] or 0 for r in dissolved),
        "longTerm": sum(1 for r in vacant + dissolved if r.get("longTerm")),
        "byType": (
            _national_by_type(reg_by_fin, vacant_fins | dissolved_fins)
            if denominator_known
            else _praxes_by_type(vacant + dissolved)
        ),
    }
    _apply_ksh_national(national)

    filled = []
    for fin in sorted(set(reg_by_fin) - vacant_fins - dissolved_fins):
        e = reg_by_fin[fin]
        entry = {
            "id": fin,
            "type": e["type"],
            "county": e["county"],
            "settlement": e["settlement"],
            "postalCode": e.get("postalCode", ""),
            "address": e.get("address", ""),
        }
        if e.get("district"):
            entry["district"] = e["district"]
        if e.get("servedSettlements"):
            entry["servedSettlements"] = _served_names(e)
        # registry fields NEAK publishes about the contracted service; the
        # provider organisation and the physician are names, so they stay on
        # filled praxes only (CLAUDE.md rule 3, enforced by validate.py)
        for field in ("neakCode", "level", "provider"):
            if e.get(field):
                entry[field] = e[field]
        if e.get("doctor"):
            entry["doctor"] = e["doctor"]
        filled.append(entry)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": kind,
        "month": month,
        "disclaimer": "A NEAK adatai tájékoztató jellegűek.",
        "longTermAsOf": long_term_as_of,
        "sources": SOURCE_NAMES[kind],
        "national": national,
        "counties": county_list,
        "praxes": sorted(vacant + dissolved, key=_praxis_key),
        "filledPraxes": filled,
        "settlements": sorted(settlements, key=lambda s: s["name"]),
    }


def _apply_ksh(settlements: list[dict], county_list: list[dict]) -> None:
    """Attach KSH gazetteer data (resident population of the latest archived
    edition) to settlement entries and per-capita fields to counties. All
    fields stay absent/None when no gazetteer is archived — never guessed."""
    from parse_ksh import load_reference

    ref = load_reference()
    if ref is None:
        return
    for s in settlements:
        # settlement names are nationally unique in the gazetteer, and a
        # cross-county praxis can list a settlement under the praxis's county,
        # so the name alone is the join key
        hit = ref.lookup(s["name"])
        if hit:
            s["kshId"] = hit["kshId"]
            s["population"] = hit["population"]
    for c in county_list:
        pop = ref.county_population.get(c["name"])
        if not pop:
            continue
        c["populationTotal"] = pop
        c["populationShare"] = round(
            (c["populationVacant"] + c["populationDissolved"]) / pop, 4)
        c["praxesPer10k"] = (
            round(c["total"] * 10000 / pop, 2) if c["total"] else None)


def _apply_ksh_national(national: dict) -> None:
    from parse_ksh import load_reference

    ref = load_reference()
    if ref is None:
        return
    pop = ref.country_population
    national["populationTotal"] = pop
    national["populationShare"] = round(
        (national["populationVacant"] + national["populationDissolved"]) / pop, 4)
    national["praxesPer10k"] = (
        round(national["totalDistricts"] * 10000 / pop, 2)
        if national["totalDistricts"] else None)


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
    # the vacant/dissolved list's own county column is the district's official
    # assignment; the registry county (surgery seat) can differ across county
    # borders, so it is only a fallback for records without one
    return record.get("county") or reg_by_fin[record["id"]]["county"]


def _praxes_by_type(praxes: list[dict]) -> dict:
    out: dict[str, dict] = {}
    for p in praxes:
        t = out.setdefault(p["type"], {"total": None, "vacant": 0})
        t["vacant"] += 1
    return dict(sorted(out.items()))


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


# ---------------------------------------------------------------------------
# History aggregation: one compact file for the statistics page, computed
# from every archived monthly snapshot (data/YYYY-MM/{kind}.json).

DURATION_BUCKETS = [("0-11", 0, 11), ("12-35", 12, 35), ("36-119", 36, 119), ("120+", 120, 10**6)]


def _months_between(since: str, until: str) -> int:
    sy, sm = map(int, since.split("-"))
    uy, um = map(int, until.split("-"))
    return (uy - sy) * 12 + (um - sm)


def _median(values: list[int]) -> int | None:
    if not values:
        return None
    values = sorted(values)
    mid = len(values) // 2
    if len(values) % 2:
        return values[mid]
    return round((values[mid - 1] + values[mid]) / 2)


def history_entry(snapshot: dict, previous: dict | None) -> dict:
    """One month's row in history.json. `previous` is the snapshot of the
    previous ARCHIVED month (may be more than one calendar month earlier —
    the flow numbers always name the month they compare against)."""
    month = snapshot["month"]
    vacant = [p for p in snapshot["praxes"] if p["status"] == "vacant"]
    durations = [
        _months_between(p["vacantSince"], month)
        for p in vacant if p.get("vacantSince")
    ]
    buckets = {name: 0 for name, _, _ in DURATION_BUCKETS}
    for d in durations:
        for name, lo, hi in DURATION_BUCKETS:
            if lo <= d <= hi:
                buckets[name] += 1
                break
    flow = None
    if previous is not None:
        prev_ids = {p["id"] for p in previous["praxes"] if p["status"] == "vacant"}
        cur_ids = {p["id"] for p in vacant}
        flow = {
            "sincePrevMonth": previous["month"],
            "entered": len(cur_ids - prev_ids),
            "left": len(prev_ids - cur_ids),
        }
    nat = snapshot["national"]
    return {
        "month": month,
        "totalDistricts": nat["totalDistricts"],
        "vacant": nat["vacant"],
        "dissolved": nat["dissolved"],
        "vacancyRate": nat["vacancyRate"],
        "populationVacant": nat["populationVacant"],
        "populationDissolved": nat["populationDissolved"],
        "medianVacancyMonths": _median(durations),
        "durationBuckets": buckets,
        "byType": nat["byType"],
        "byCounty": {
            c["name"]: {
                "vacant": c["vacant"], "dissolved": c["dissolved"],
                "populationVacant": c["populationVacant"], "total": c["total"],
            }
            for c in snapshot["counties"]
        },
        "flow": flow,
    }


def _iter_month_snapshots(kind: str):
    import re as _re
    for d in sorted(DATA_DIR.iterdir()):
        if d.is_dir() and _re.match(r"^\d{4}-\d{2}$", d.name):
            f = d / f"{kind}.json"
            if f.exists():
                yield json.loads(f.read_text(encoding="utf-8"))


def build_history() -> Path:
    """Regenerate data/history.json from every archived monthly snapshot."""
    out: dict = {"schemaVersion": 2, "kinds": {}}
    for kind in ("dental", "gp"):
        entries = []
        snapshots = list(_iter_month_snapshots(kind))
        previous = None
        for snap in snapshots:
            entries.append(history_entry(snap, previous))
            previous = snap
        if entries:
            out["kinds"][kind] = {
                "months": entries,
                "persistence": _persistence(snapshots),
            }
    path = DATA_DIR / "history.json"
    _dump(path, out)
    return path


def _persistence(snapshots: list[dict]) -> dict | None:
    """Of the districts vacant in the first archived month, how many are
    still vacant in the latest one? (Same FIN on both vacant lists.)"""
    if len(snapshots) < 2:
        return None
    first, last = snapshots[0], snapshots[-1]
    first_ids = {p["id"] for p in first["praxes"] if p["status"] == "vacant"}
    last_ids = {p["id"] for p in last["praxes"] if p["status"] == "vacant"}
    return {
        "firstMonth": first["month"],
        "lastMonth": last["month"],
        "firstVacant": len(first_ids),
        "stillVacant": len(first_ids & last_ids),
    }


def rebuild_timeseries() -> Path:
    """Regenerate data/timeseries.json from every archived monthly snapshot."""
    ts = {"kinds": {}}
    for kind in ("dental", "gp"):
        months = [timeseries_entry(snap) for snap in _iter_month_snapshots(kind)]
        if months:
            ts["kinds"][kind] = months
    path = DATA_DIR / "timeseries.json"
    _dump(path, ts)
    return path
