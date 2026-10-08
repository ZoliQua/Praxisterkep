"""The county level, which the site never had.

Everything the analyses know is either national or per settlement: the
hierarchy jumped from the whole country straight to one of 3177 towns. A
county page needs the middle step, and it needs it small — data/settlements.json
is 3.9 MB because it carries every profile in full, which is the right file
for building 3177 static pages and the wrong one to hand a browser.

So this is the same data, sliced by county and cut to what a county page
shows: one aggregate row per county, and one compact row per settlement
(slug, name, population, index band, whether each branch has a doctor, the
driving minutes that matter, and whether a bus goes anywhere directly).

Every number here is read from data/settlements.json — nothing is recomputed,
so the county page and the settlement page cannot disagree.

Usage:
  python etl/county_profiles.py
"""
from __future__ import annotations

import collections
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from settlements import slug

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "settlements.json"
OUT = ROOT / "data" / "counties.json"
SCHEMA_VERSION = 1

# the compact settlement row, in this order; the web side reads it by index
FIELDS = ("slug", "name", "population", "band", "gp", "dental",
          "gpMin", "dentalMin", "oncallMin", "inpatientMin", "bus")
# Hungary has 19 counties and the capital
COUNTIES = 20


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
    population = sum(r[ix["population"]] for r in rows)
    def share(field: str, *states: str) -> int:
        return sum(1 for r in rows if r[ix[field]] in states)
    # the four states settlements.py assigns: a settlement may hold several
    # districts, so "partial" (one filled, one vacant) is its own answer
    return {
        "name": name,
        "slug": slug(name),
        "settlements": len(rows),
        "population": population,
        # a settlement counts as served when a contracted physician works there
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


def build() -> dict:
    if not SRC.exists():
        raise ParseError(f"{SRC} is missing — run settlements.py first")
    src = json.loads(SRC.read_text(encoding="utf-8"))
    profiles = src["settlements"]
    # the four headline numbers a county page leads with come from the
    # branch-level sources, not from counting settlements: a district is the
    # unit NEAK publishes, and an on-call point serves many settlements
    latest = read("latest.json")
    ages = read("age.json")
    emergency = read("emergency.json")
    churn = read("fluctuation.json")

    districts = {kind: {c["name"]: c for c in latest.get("kinds", {})
                        .get(kind, {}).get("counties", [])}
                 for kind in ("gp", "dental")}
    age_of = {c["name"]: c for c in ages.get("counties", [])}
    # the county field of an emergency point names its PROVIDER's seat, so
    # 203 of 213 on-call points would sit in Budapest. The premises say where
    # the point actually is, so the settlement decides.
    county_of_settlement = {p["settlement"]: p["county"] for p in profiles}

    def where(point: dict) -> str:
        name = point.get("settlement") or ""
        if name.startswith("Budapest"):
            return "Budapest"
        return county_of_settlement.get(name) or point.get("county") or ""

    oncall: collections.Counter = collections.Counter(
        where(p) for p in emergency.get("points", []) if p["group"] == "oncall")
    ambulance: collections.Counter = collections.Counter(
        where(p) for p in emergency.get("points", []) if p["group"] == "ambulance")
    fluct = {kind: {c["county"]: c for c in churn.get("kinds", {})
                    .get(kind, {}).get("counties", [])}
             for kind in ("gp", "dental")}

    by_county: dict[str, list[list]] = {}
    for p in profiles:
        by_county.setdefault(p["county"], []).append(row(p))

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": src.get("dataMonth", ""),
        "fields": list(FIELDS),
        "counties": [aggregate(name, rows) | extras(
            name, districts, age_of, oncall, ambulance, fluct)
            for name, rows in sorted(by_county.items())],
        "settlements": {name: rows for name, rows in sorted(by_county.items())},
    }
    guard(out)
    return out


def extras(name, districts, age_of, oncall, ambulance, fluct) -> dict:
    """The county-level facts that do not come from counting settlements."""
    age = age_of.get(name) or {}
    total = age.get("censusTotal")
    out = {
        "oncallPoints": oncall.get(name, 0),
        "ambulanceStations": ambulance.get(name, 0),
    }
    if total:
        # the census split the page draws as a pie; working age is what the
        # other two leave
        out["age"] = {
            "young": age.get("young"), "old": age.get("old"), "total": total,
            "working": total - (age.get("young") or 0) - (age.get("old") or 0),
        }
    for kind in ("gp", "dental"):
        row = districts.get(kind, {}).get(name)
        if row:
            out[f"{kind}Districts"] = {
                "total": row["total"], "vacant": row["vacant"],
                "dissolved": row["dissolved"], "longTerm": row.get("longTerm", 0),
                "rate": row.get("vacancyRate"),
            }
        churn_row = fluct.get(kind, {}).get(name)
        if churn_row:
            out[f"{kind}Churn"] = {
                "districts": churn_row["districts"],
                "recentChanges": churn_row["recentChanges"],
                "recentRate": churn_row["recentRate"],
                "medianTenureMonths": churn_row["medianTenureMonths"],
                "unchangedWholeWindow": churn_row["unchangedWholeWindow"],
            }
    return out


def guard(out: dict) -> None:
    if len(out["counties"]) != COUNTIES:
        raise ParseError(f"{len(out['counties'])} counties, expected {COUNTIES}")
    total = sum(c["settlements"] for c in out["counties"])
    rows = sum(len(r) for r in out["settlements"].values())
    if total != rows:
        raise ParseError(f"{total} settlements counted, {rows} rows written")
    if total < 3100:
        raise ParseError(f"only {total} settlements across the counties")
    slugs = {c["slug"] for c in out["counties"]}
    if len(slugs) != len(out["counties"]):
        raise ParseError("two counties share a slug")
    for c in out["counties"]:
        branches = (
            ("gp", c["gpFilled"] + c["gpPartial"] + c["gpVacantOnly"] + c["gpAbsent"]),
            ("dental", c["dentalFilled"] + c["dentalPartial"]
             + c["dentalVacantOnly"] + c["dentalAbsent"]))
        for branch, counted in branches:
            if counted != c["settlements"]:
                raise ParseError(f"{c['name']}: {branch} states cover {counted} of "
                                 f"{c['settlements']} settlements")
        if sum(c["bands"].values()) > c["settlements"]:
            raise ParseError(f"{c['name']}: more index bands than settlements")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    size = OUT.stat().st_size // 1024
    print(f"wrote {OUT}: {len(out['counties'])} counties, "
          f"{sum(c['settlements'] for c in out['counties'])} settlements ({size} KB)")


if __name__ == "__main__":
    main()
