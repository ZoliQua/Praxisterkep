"""How often does a district change hands?

A district that has had the same physician for seven years and one that has
had three in four are both "filled" on the map, and the site has so far said
the same thing about them. The archive knows better: 24 dental and 20 GP
monthly snapshots, each naming the contracted physician of every filled
district, so a change of name between two snapshots is a change of doctor.

What the counts mean, precisely:

  * a **change** is one FIN code whose named physician differs between two
    consecutive snapshots, both of which show it filled. A district that went
    vacant and came back with someone else is counted once, when it comes
    back — the vacancy itself is already on the map.
  * the rate is changes per 100 filled districts per year, so counties and
    branches can be compared although neither the archive's spacing nor the
    counties' size is even.
  * a district filled in the first snapshot we hold and still held by the
    same person is "unchanged for the whole window" — not "never changed",
    which the public record cannot support.

Names are compared loosely (tenure.doctor_key), because the registry spells
them unevenly across the years; a spelling fix must not look like a new
doctor.

Output: data/fluctuation.json — per county and per year, both branches.

Usage:
  python etl/fluctuation.py
"""
from __future__ import annotations

import collections
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import tenure
from parse_dental import ParseError

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fluctuation.json"
SCHEMA_VERSION = 1
KINDS = ("gp", "dental")
# the window the headline numbers use
RECENT_MONTHS = 12


def county_key(name: str) -> str:
    out = (name or "").replace(" megye", "").replace(" vármegye", "").strip()
    return "Budapest" if out.startswith("Budapest") else out


def changes(kind: str, all_months: list[str]) -> tuple[list[dict], list[str]]:
    """Every physician change we can see, with the month it became visible."""
    previous: dict[str, tuple[str, str]] = {}   # fin -> (doctor key, county)
    seen: list[str] = []
    found: list[dict] = []
    for month in all_months:
        snap = tenure.snapshot(month, kind)
        if snap is None:
            continue
        filled = snap.get("filledPraxes", [])
        # a month rebuilt from the vacancy list alone knows nothing about who
        # works where, and must not read as "everyone left"
        if not filled:
            continue
        seen.append(month)
        for f in filled:
            key = tenure.doctor_key(f.get("doctor", ""))
            county = county_key(f.get("county", ""))
            before = previous.get(f["id"])
            if before is not None and before[0] != key:
                found.append({"month": month, "fin": f["id"], "county": county})
            previous[f["id"]] = (key, county)
    return found, seen


def build() -> dict:
    all_months = tenure.months()
    spells = json.loads((ROOT / "data" / "tenure.json").read_text(encoding="utf-8"))
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    data_month = spells["dataMonth"]
    cutoff = recent_cutoff(data_month)

    out: dict = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": data_month,
        "recentMonths": RECENT_MONTHS,
        "kinds": {},
    }
    for kind in KINDS:
        found, seen = changes(kind, all_months)
        if len(seen) < 4:
            raise ParseError(f"{kind}: {len(seen)} usable snapshots is too few")

        county_of = {f["id"]: county_key(f.get("county", ""))
                     for f in latest["kinds"][kind].get("filledPraxes", [])}
        rows = spells["kinds"][kind]
        tenures: dict[str, list[int]] = collections.defaultdict(list)
        unchanged: collections.Counter = collections.Counter()
        districts: collections.Counter = collections.Counter()
        for fin, row in rows.items():
            county = county_of.get(fin, "")
            districts[county] += 1
            tenures[county].append(row["months"])
            if row["fromStart"]:
                unchanged[county] += 1

        recent = collections.Counter(c["county"] for c in found if c["month"] >= cutoff)
        total = collections.Counter(c["county"] for c in found)
        by_year = collections.Counter(c["month"][:4] for c in found)

        counties = []
        for county in sorted(districts):
            n = districts[county]
            counties.append({
                "county": county,
                "districts": n,
                "recentChanges": recent.get(county, 0),
                "changes": total.get(county, 0),
                # changes per 100 filled districts in the last year
                "recentRate": round(recent.get(county, 0) * 100 / n, 1) if n else None,
                "medianTenureMonths": int(statistics.median(tenures[county]))
                if tenures[county] else None,
                "unchangedWholeWindow": unchanged.get(county, 0),
            })

        out["kinds"][kind] = {
            "from": seen[0],
            "snapshots": len(seen),
            "changes": len(found),
            "recentChanges": sum(recent.values()),
            "districts": sum(districts.values()),
            "byYear": dict(sorted(by_year.items())),
            "counties": counties,
            # one row per change, so a settlement page can count its own
            "events": found,
        }
    guard(out)
    return out


def recent_cutoff(data_month: str) -> str:
    year, month = int(data_month[:4]), int(data_month[5:7])
    total = year * 12 + month - 1 - RECENT_MONTHS
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def guard(out: dict) -> None:
    for kind in KINDS:
        k = out["kinds"][kind]
        if k["districts"] < 1000:
            raise ParseError(f"{kind}: only {k['districts']} filled districts")
        counted = sum(c["districts"] for c in k["counties"])
        if counted != k["districts"]:
            raise ParseError(f"{kind}: {counted} districts in counties, "
                             f"{k['districts']} overall")
        if k["recentChanges"] > k["changes"]:
            raise ParseError(f"{kind}: more recent changes than changes")
        # a county cannot have changed more often than it has districts in
        # every single year of the window without something being wrong
        for c in k["counties"]:
            if c["recentChanges"] > c["districts"]:
                raise ParseError(f"{c['county']}: {c['recentChanges']} changes in "
                                 f"{c['districts']} districts in one year")
            if c["unchangedWholeWindow"] > c["districts"]:
                raise ParseError(f"{c['county']}: more unchanged than districts")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}:")
    for kind in KINDS:
        k = out["kinds"][kind]
        worst = max(k["counties"], key=lambda c: c["recentRate"] or 0)
        print(f"  {kind}: {k['changes']} physician changes over {k['snapshots']} "
              f"snapshots since {k['from']}, {k['recentChanges']} in the last "
              f"{RECENT_MONTHS} months")
        print(f"    most churn: {worst['county']} ({worst['recentChanges']} of "
              f"{worst['districts']} districts, {worst['recentRate']}%)")


if __name__ == "__main__":
    main()
