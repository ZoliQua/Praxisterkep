"""The járás level, between the county and the settlement.

A county is twenty rows and a settlement is one of 3177; the step in between
is the one people actually live in. A járás is where the district seat is,
where the on-call point is, and where "the next town with a dentist" usually
means. Hungary has 174 of them, and the capital's 23 kerület, which the KSH
gazetteer counts the same way — so 197 rows.

Same shape as county_profiles.py and the same rule: every number is read from
data/settlements.json and the branch-level sources, never recomputed, so a
járás page and a settlement page cannot disagree. What a járás adds over a
county is resolution: Zala has one vacancy rate, its nine járás have nine,
and they are not the same country.

The seat comes from the gazetteer's own column. Deriving it from the name
("Pápai" -> "Pápa") would be a guess, and five district seats — Dunaújváros,
Hódmezővásárhely, Nagykanizsa, Sopron, Érd — are not even ranked as district
seats in the city layer.

Usage:
  python etl/district_profiles.py
"""
from __future__ import annotations

import collections
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_ksh import load_reference, normalize_settlement
from settlements import slug

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "settlements.json"
OUT = ROOT / "data" / "districts.json"
SCHEMA_VERSION = 1

# the compact settlement row, in this order; the web side reads it by index
FIELDS = ("slug", "name", "population", "band", "gp", "dental",
          "gpMin", "dentalMin", "oncallMin", "inpatientMin", "bus")
# 174 járás + the capital's 23 kerület, as the gazetteer counts them
DISTRICTS = 197


def minutes(travel: dict, key: str) -> float | None:
    value = (travel or {}).get(key) or {}
    return value.get("minutes")


def row(p: dict) -> list:
    travel = p.get("travel") or {}
    transit = p.get("transit") or {}
    index = p.get("index") or {}
    return [
        p["slug"], p["settlement"], p["population"], index.get("band") or "",
        (p.get("gp") or {}).get("state") or "", (p.get("dental") or {}).get("state") or "",
        minutes(travel, "gp"), minutes(travel, "dental"),
        minutes(travel, "oncall"), minutes(travel, "inpatient"),
        bool((transit.get("gp") or {}).get("direct")),
    ]


def median_of(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return round(statistics.median(present), 1) if present else None


def aggregate(name: str, rows: list[list]) -> dict:
    ix = {f: i for i, f in enumerate(FIELDS)}

    def share(field: str, *states: str) -> int:
        return sum(1 for r in rows if r[ix[field]] in states)

    return {
        "name": name,
        "slug": slug(name),
        "settlements": len(rows),
        "population": sum(r[ix["population"]] for r in rows),
        "gpFilled": share("gp", "filled"),
        "gpPartial": share("gp", "partial"),
        "gpVacantOnly": share("gp", "vacantOnly"),
        "gpAbsent": share("gp", "absent", ""),
        "dentalFilled": share("dental", "filled"),
        "dentalPartial": share("dental", "partial"),
        "dentalVacantOnly": share("dental", "vacantOnly"),
        "dentalAbsent": share("dental", "absent", ""),
        "bands": {b: sum(1 for r in rows if r[ix["band"]] == b)
                  for b in ("kiemelt", "magas", "kozepes", "alacsony")},
        "medianGpMinutes": median_of([r[ix["gpMin"]] for r in rows]),
        "medianDentalMinutes": median_of([r[ix["dentalMin"]] for r in rows]),
        "medianOncallMinutes": median_of([r[ix["oncallMin"]] for r in rows]),
        "medianInpatientMinutes": median_of([r[ix["inpatientMin"]] for r in rows]),
        "withoutDirectBus": sum(1 for r in rows if not r[ix["bus"]]),
    }


def read(name: str) -> dict:
    path = ROOT / "data" / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def seat_of_district() -> dict[str, str]:
    """{járás: its seat}, from the gazetteer's own column."""
    ref = load_reference()
    if ref is None:
        return {}
    out: dict[str, str] = {}
    for entry in ref.entries:
        if entry.get("district") and entry.get("districtSeat"):
            out.setdefault(entry["district"], entry["districtSeat"])
    return out


def district_of_praxis(praxis: dict, district_of: dict[str, str]) -> str:
    """Which járás a district belongs to: the one its surgery stands in.

    The dental registry carries no járás column at all and the dissolved list
    carries it for none of its rows, so the settlement decides for both
    branches — the same mapping the settlement pages use, which is why the
    two cannot disagree.
    """
    name = praxis.get("settlement")
    if not name:
        sites = praxis.get("sites") or []
        name = sites[0].get("settlement") if sites else None
    return district_of.get(normalize_settlement(name or ""), "")


def district_counts(latest: dict, district_of: dict[str, str],
                    unplaced: dict[str, int] | None = None) -> dict[str, dict]:
    """Per járás, per branch: how many districts there are and how many are not filled.

    A few dozen dental services name the capital without a kerület, and no
    mapping can invent one: they are counted apart rather than scattered.
    """
    out: dict[str, dict] = {}
    unplaced = {} if unplaced is None else unplaced

    def bucket(kind: str, name: str) -> dict:
        return out.setdefault(name, {}).setdefault(
            kind, {"total": 0, "vacant": 0, "dissolved": 0, "longTerm": 0})

    for kind in ("gp", "dental"):
        snapshot = latest.get("kinds", {}).get(kind, {})
        for praxis in snapshot.get("filledPraxes", []):
            name = district_of_praxis(praxis, district_of)
            if name:
                bucket(kind, name)["total"] += 1
            else:
                unplaced[kind] = unplaced.get(kind, 0) + 1
        for praxis in snapshot.get("praxes", []):
            name = district_of_praxis(praxis, district_of)
            if not name:
                unplaced[kind] = unplaced.get(kind, 0) + 1
                continue
            cell = bucket(kind, name)
            cell["total"] += 1
            cell["dissolved" if praxis["status"] == "dissolved" else "vacant"] += 1
            if praxis.get("longTerm"):
                cell["longTerm"] += 1
    for name, kinds in out.items():
        for cell in kinds.values():
            cell["rate"] = (round((cell["vacant"] + cell["dissolved"]) / cell["total"], 4)
                            if cell["total"] else None)
    return out


def build() -> dict:
    if not SRC.exists():
        raise ParseError(f"{SRC} is missing — run settlements.py first")
    src = json.loads(SRC.read_text(encoding="utf-8"))
    profiles = src["settlements"]
    latest = read("latest.json")
    emergency = read("emergency.json")
    development = read("district_development.json")
    benefit = read("kedvezmenyezett.json")

    seats = seat_of_district()
    district_of = {normalize_settlement(p["settlement"]): p["district"]
                   for p in profiles}
    county_of = {}
    for p in profiles:
        county_of.setdefault(p["district"], p["county"])
    slug_of = {p["settlement"]: p["slug"] for p in profiles}

    unplaced: dict[str, int] = {}
    counts = district_counts(latest, district_of, unplaced)

    # the census split, summed from the settlements that the census covers
    ages: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for p in profiles:
        age = p.get("age") or {}
        total = age.get("total")
        if not total:
            continue
        cell = ages[p["district"]]
        cell["total"] += total
        cell["young"] += age.get("young") or 0
        cell["old"] += age.get("old") or 0

    # where the on-call points and the ambulance stations actually are
    points: dict[str, list[dict]] = {}
    for point in emergency.get("points", []):
        if point["group"] not in ("oncall", "ambulance"):
            continue
        name = point.get("settlement") or ""
        where = district_of.get(normalize_settlement(name))
        if not where:
            continue
        points.setdefault(where, []).append({
            "group": point["group"],
            "settlement": name,
            "slug": slug_of.get(name, ""),
            "provider": point.get("provider", ""),
        })
    for rows in points.values():
        rows.sort(key=lambda r: (r["group"], r["settlement"]))

    pharmacies: collections.Counter = collections.Counter()
    for p in profiles:
        pharmacies[p["district"]] += len(p.get("pharmacies") or [])

    # How many of a járás's settlements the state itself classes as lagging
    # behind (105/2015. Korm. rendelet). The decree's complex indicator says
    # how the járás as a whole stands; this says how much of it is in that
    # position, which is not the same question in a járás with one town and
    # thirty villages.
    from kedvezmenyezett import county_key, normalize as benefit_key
    flags = {}
    for entry in (benefit.get("settlements") or {}).values():
        flags[f'{county_key(entry["c"])}|{benefit_key(entry["n"])}'] = entry
    lagging: dict[str, collections.Counter] = collections.defaultdict(
        collections.Counter)
    for p in profiles:
        cell = lagging[p["district"]]
        entry = flags.get(f'{county_key(p["county"])}|{benefit_key(p["settlement"])}')
        cell["settlements"] += 1
        if not entry:
            continue
        cell["socio"] += 1 if entry.get("s") else 0
        cell["unemployment"] += 1 if entry.get("u") else 0
        cell["temporary"] += 1 if entry.get("t") else 0
        if entry.get("s") or entry.get("u") or entry.get("t"):
            cell["any"] += 1
            cell["population"] += p["population"]

    # the composite index of a járás is the median of its settlements'
    by_district: dict[str, list[list]] = {}
    index_scores: dict[str, list[float]] = collections.defaultdict(list)
    for p in profiles:
        by_district.setdefault(p["district"], []).append(row(p))
        score = (p.get("index") or {}).get("value")
        if score is not None:
            index_scores[p["district"]].append(score)

    districts = []
    for name, rows in sorted(by_district.items()):
        out = aggregate(name, rows)
        out["county"] = county_of.get(name, "")
        seat = seats.get(name, "")
        out["seat"] = seat
        out["seatSlug"] = slug_of.get(seat, "")
        out["isCapital"] = name.startswith("Budapest")
        for kind in ("gp", "dental"):
            cell = (counts.get(name) or {}).get(kind)
            if cell:
                out[f"{kind}Districts"] = cell
        age = ages.get(name)
        if age and age["total"]:
            out["age"] = {
                "young": age["young"], "old": age["old"], "total": age["total"],
                "working": age["total"] - age["young"] - age["old"],
            }
        out["oncallPoints"] = sum(1 for r in points.get(name, [])
                                  if r["group"] == "oncall")
        out["ambulanceStations"] = sum(1 for r in points.get(name, [])
                                       if r["group"] == "ambulance")
        out["emergency"] = points.get(name, [])
        out["pharmacies"] = pharmacies.get(name, 0)
        scores = index_scores.get(name) or []
        out["medianIndex"] = round(statistics.median(scores), 1) if scores else None
        # the state's own measure of how developed the járás is
        dev = (development.get("districts") or {}).get(name)
        if dev:
            out["development"] = dev
        cell = lagging.get(name)
        if cell and cell["settlements"]:
            out["lagging"] = {
                "settlements": cell["any"],
                "socio": cell["socio"],
                "unemployment": cell["unemployment"],
                "temporary": cell["temporary"],
                "population": cell["population"],
                "share": round(cell["any"] / cell["settlements"], 4),
                "populationShare": (round(cell["population"] / out["population"], 4)
                                    if out["population"] else None),
            }
        districts.append(out)

    result = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": src.get("dataMonth", ""),
        # what the development figures are, and as of when: the decree is a
        # standing classification from 2014, not a reading of today
        "development": {
            "source": development.get("source", ""),
            "sourceUrl": development.get("sourceUrl", ""),
            "measuredYear": development.get("measuredYear"),
            "beneficiaryBelow": development.get("beneficiaryBelow"),
            "benefitSource": benefit.get("source", ""),
            "benefitUrl": benefit.get("sourceUrl", ""),
        } if development else {},
        "fields": list(FIELDS),
        "districts": districts,
        # services the registry puts in "Budapest" with no kerület: they are
        # real, and they are in none of the 197 rows above
        "unplaced": unplaced,
        "settlements": {name: rows for name, rows in sorted(by_district.items())},
    }
    guard(result)
    return result


def guard(out: dict) -> None:
    if len(out["districts"]) != DISTRICTS:
        raise ParseError(f"{len(out['districts'])} districts, expected {DISTRICTS}")
    counted = sum(d["settlements"] for d in out["districts"])
    rows = sum(len(r) for r in out["settlements"].values())
    if counted != rows:
        raise ParseError(f"{counted} settlements counted, {rows} rows written")
    if counted < 3100:
        raise ParseError(f"only {counted} settlements across the districts")
    slugs = {d["slug"] for d in out["districts"]}
    if len(slugs) != len(out["districts"]):
        raise ParseError("two districts share a slug")
    for d in out["districts"]:
        if not d["seat"]:
            raise ParseError(f"{d['name']}: no seat in the gazetteer")
        if not d["county"]:
            raise ParseError(f"{d['name']}: no county")
        for branch in ("gp", "dental"):
            counted = (d[f"{branch}Filled"] + d[f"{branch}Partial"]
                       + d[f"{branch}VacantOnly"] + d[f"{branch}Absent"])
            if counted != d["settlements"]:
                raise ParseError(f"{d['name']}: {branch} states cover {counted} of "
                                 f"{d['settlements']} settlements")
    # every district of the country lands in exactly one járás
    for kind in ("gp", "dental"):
        placed = sum((d.get(f"{kind}Districts") or {}).get("total", 0)
                     for d in out["districts"])
        if placed < 2000:
            raise ParseError(f"only {placed} {kind} districts placed in a járás")
    for kind, n in out["unplaced"].items():
        if n > 120:
            raise ParseError(f"{n} {kind} districts could not be placed in a járás")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    total = sum(d["settlements"] for d in out["districts"])
    print(f"wrote {OUT}: {len(out['districts'])} districts, {total} settlements "
          f"({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
