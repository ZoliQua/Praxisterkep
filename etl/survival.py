"""How long a vacancy lasts: Kaplan–Meier survival from the monthly archive.

"How many districts are vacant" is a stock; it says nothing about whether a
vacancy is a few months of handover or a decade of nobody coming. The
archive answers that directly: every month since 2017 (dental) and 2019 (GP)
names the districts without a contracted physician, so every vacancy spell
can be followed until it is filled again.

The estimator is Kaplan–Meier, because the alternative — averaging the
lengths of the spells that ended — throws away exactly the worst cases. A
spell that is still open in the last snapshot is right-censored: it is known
to have lasted at least this long, and it leaves the risk set without
counting as a filled district.

    S(t) = Π (1 − dᵢ / nᵢ) for every month i ≤ t

with dᵢ the spells refilled in month i and nᵢ those still vacant entering it.
S(t) reads as "the share of vacancies still open after t months".

Two honesty rules the data forces:

  * The archive is not monthly-dense (gaps of up to 14 months), so a spell's
    start and end are known to the nearest archived month, not to the day.
    Durations are therefore measured between archived months and the gap
    structure is published with the curves.
  * A spell that begins in the first archived month is left-truncated — it
    was already running, and its true length is unknown. Those spells are
    counted from the first month they are seen, and their number is
    published so the reader can discount them.

Strata: branch, county, settlement size, beneficiary status and district
type, each with its own curve and median.

Usage:
  python etl/survival.py
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from risk import RiskError, load_history, months_between

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "survival.json"
SCHEMA_VERSION = 1

# curves are cut here; longer spells still count, they just stop being drawn
MAX_MONTHS = 120
POPULATION_BANDS = [("<1000", 1000), ("1000-3000", 3000), ("3000-10000", 10000),
                    ("10000+", None)]


def population_band(population: int | None) -> str:
    if not population:
        return "ismeretlen"
    for name, upper in POPULATION_BANDS:
        if upper is None or population < upper:
            return name
    return POPULATION_BANDS[-1][0]


def spells(kind: str) -> tuple[list[dict], list[str]]:
    """Every vacancy spell in the archive: (fin, start, end or None, months)."""
    history = load_history(kind)
    months = sorted(history)
    open_spell: dict[str, dict] = {}
    done: list[dict] = []
    for index, month in enumerate(months):
        state = history[month]
        for fid, (status, _doctor) in state.items():
            if status == "filled":
                spell = open_spell.pop(fid, None)
                if spell:
                    spell["end"] = month
                    spell["months"] = months_between(spell["start"], month)
                    spell["censored"] = False
                    done.append(spell)
            elif fid not in open_spell:
                open_spell[fid] = {
                    "fin": fid, "start": month, "end": None, "months": 0,
                    "censored": True, "status": status,
                    # a spell already running in the first archived month has
                    # an unknown true start
                    "truncated": index == 0,
                }
    last = months[-1]
    for spell in open_spell.values():
        spell["months"] = months_between(spell["start"], last)
        done.append(spell)
    return done, months


def attach(kind: str, rows: list[dict]) -> None:
    """Give every spell the attributes its curve can be split by."""
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    from kedvezmenyezett import county_key, normalize

    benefit_path = ROOT / "data" / "kedvezmenyezett.json"
    benefit = (json.loads(benefit_path.read_text(encoding="utf-8"))["settlements"]
               if benefit_path.exists() else {})

    snap = latest["kinds"][kind]
    meta: dict[str, dict] = {}
    for p in snap.get("praxes", []):
        site = (p.get("sites") or [{}])[0]
        meta[p["id"]] = {
            "county": p.get("county", ""),
            "settlement": site.get("settlement", ""),
            "type": p.get("type", ""),
            "population": p.get("population"),
        }
    for f in snap.get("filledPraxes", []):
        meta.setdefault(f["id"], {
            "county": f.get("county", ""),
            "settlement": f.get("settlement", ""),
            "type": f.get("type", ""),
            "population": None,
        })
    for r in rows:
        m = meta.get(r["fin"], {})
        r["county"] = m.get("county", "")
        r["settlement"] = m.get("settlement", "")
        r["type"] = m.get("type", "")
        r["population"] = m.get("population")
        r["populationBand"] = population_band(m.get("population"))
        key = f"{county_key(r['county'])}|{normalize(r['settlement'])}"
        r["benefit"] = key in benefit


def curve(rows: list[dict]) -> dict:
    """Kaplan–Meier estimate over the spells handed in."""
    events = collections.Counter(r["months"] for r in rows if not r["censored"])
    censored = collections.Counter(r["months"] for r in rows if r["censored"])
    at_risk = len(rows)
    survival = 1.0
    points = [{"month": 0, "survival": 1.0, "atRisk": at_risk, "refilled": 0}]
    for month in range(1, MAX_MONTHS + 1):
        if at_risk <= 0:
            break
        refilled = events.get(month, 0)
        if refilled:
            survival *= 1 - refilled / at_risk
        points.append({"month": month, "survival": round(survival, 5),
                       "atRisk": at_risk, "refilled": refilled})
        at_risk -= refilled + censored.get(month, 0)
    return {
        "spells": len(rows),
        "refilled": sum(events.values()),
        "stillOpen": sum(1 for r in rows if r["censored"]),
        "truncated": sum(1 for r in rows if r.get("truncated")),
        "median": median_of(points),
        "survival12": at_month(points, 12),
        "survival24": at_month(points, 24),
        "survival60": at_month(points, 60),
        "points": points,
    }


def median_of(points: list[dict]) -> int | None:
    """The first month where the survival estimate drops to 0.5 or below."""
    for p in points:
        if p["survival"] <= 0.5:
            return p["month"]
    return None


def at_month(points: list[dict], month: int) -> float | None:
    last = None
    for p in points:
        if p["month"] > month:
            break
        last = p["survival"]
    return last


def strata(rows: list[dict], key: str, labels: list[str] | None = None) -> list[dict]:
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        groups[str(r.get(key))].append(r)
    out = []
    for name, list_ in groups.items():
        if len(list_) < 15:
            continue  # a curve drawn from a handful of spells says nothing
        c = curve(list_)
        c["key"] = name
        out.append(c)
    order = {name: i for i, name in enumerate(labels or [])}
    return sorted(out, key=lambda c: (order.get(c["key"], 99), -c["spells"]))


def build() -> dict:
    kinds: dict[str, dict] = {}
    for kind in ("dental", "gp"):
        try:
            rows, months = spells(kind)
        except RiskError as exc:
            raise RiskError(f"{kind}: {exc}") from exc
        attach(kind, rows)
        gaps = [months_between(a, b) for a, b in zip(months, months[1:])]
        kinds[kind] = {
            "months": months,
            "gapMonths": {"min": min(gaps), "max": max(gaps),
                          "median": sorted(gaps)[len(gaps) // 2]},
            "overall": curve(rows),
            "byCounty": strata(rows, "county"),
            "byPopulation": strata(rows, "populationBand",
                                   [b[0] for b in POPULATION_BANDS] + ["ismeretlen"]),
            "byType": strata(rows, "type"),
            "byBenefit": strata(rows, "benefit", ["True", "False"]),
            "spells": [{k: r[k] for k in ("fin", "start", "end", "months", "censored",
                                          "county", "settlement", "type", "population",
                                          "benefit", "truncated")} for r in rows],
        }
    out = {
        "schemaVersion": SCHEMA_VERSION,
        "maxMonths": MAX_MONTHS,
        "kinds": kinds,
    }
    guard(out)
    return out


def guard(out: dict) -> None:
    for kind, k in out["kinds"].items():
        overall = k["overall"]
        if overall["spells"] < 100:
            raise RiskError(f"{kind}: only {overall['spells']} vacancy spells")
        if overall["refilled"] + overall["stillOpen"] != overall["spells"]:
            raise RiskError(f"{kind}: refilled and open spells do not add up")
        last = overall["points"][-1]["survival"]
        if not 0.0 <= last <= 1.0:
            raise RiskError(f"{kind}: survival estimate out of range")
        for point in overall["points"]:
            if point["atRisk"] < 0:
                raise RiskError(f"{kind}: negative risk set at month {point['month']}")
        # every spell must belong to exactly one of the two outcomes
        for spell in k["spells"]:
            if spell["censored"] != (spell["end"] is None):
                raise RiskError(f"{kind}: {spell['fin']} is censored and refilled at once")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}")
    for kind, k in out["kinds"].items():
        o = k["overall"]
        median = f"{o['median']} months" if o["median"] else "not reached"
        print(f"  {kind}: {o['spells']} spells ({o['refilled']} refilled, "
              f"{o['stillOpen']} still open), median {median}, "
              f"still vacant after 12 months: {o['survival12']:.0%}")


if __name__ == "__main__":
    main()
