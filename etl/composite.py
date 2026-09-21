"""The composite care-risk index: several kinds of trouble in one place.

Each analysis on the site answers one question — is there a doctor, how far
is the next surgery, how old is the population, how likely is the district
to go vacant. A settlement is in trouble when several of those point the
same way at once, and that is what no single chart shows.

The index is a weighted mean of seven components, each measured for the
settlement itself and each published beside the score, so a number can
always be taken apart:

    vacancy      the districts serving it have no contracted physician
    gpKm         distance to the nearest operating GP surgery
    dentalKm     distance to the nearest operating dental surgery
    outpatientKm distance to the nearest contracted outpatient site
    inpatientKm  distance to the nearest contracted hospital site
    ageing       65+ share of the population (KSH 2022 census)
    risk         vacancy risk of the districts that serve it
    deprivation  beneficiary status under 105/2015. (IV. 23.) Korm. r.

Distances are crow-flies kilometres from the settlement's centre, not travel
time, and every component is turned into a 0–1 rank percentile across the
country before weighting, so kilometres and shares can be added at all.

This is a comparison, not a verdict: a high index says several public
indicators point the same way, never that care is unavailable there
(CLAUDE.md rule 4). Settlements are ranked against each other, and a
component that has no data for a settlement is left out of its own mean
rather than guessed.

Usage:
  python etl/composite.py
"""
from __future__ import annotations

import collections
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import centroids
from parse_dental import ParseError
from parse_ksh import load_reference, normalize_settlement

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "composite.json"
SCHEMA_VERSION = 1

# the weights are deliberately round numbers and are published with the index
WEIGHTS = {
    "vacancy": 0.25,
    "gpKm": 0.15,
    "dentalKm": 0.10,
    "outpatientKm": 0.05,
    "inpatientKm": 0.10,
    "ageing": 0.15,
    "risk": 0.10,
    "deprivation": 0.10,
}
BANDS = [("kiemelt", 0.05), ("magas", 0.20), ("kozepes", 0.50), ("alacsony", 1.0)]
EARTH_KM = 6371.0088


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def nearest(lat: float, lon: float, points: list[tuple[float, float]]) -> float | None:
    if not points:
        return None
    return round(min(haversine(lat, lon, plat, plon) for plat, plon in points), 1)


def operating_points(kind: str, latest: dict, eeszt: dict, cache: dict) -> list:
    """Where a contracted physician of this branch actually works."""
    out = []
    for f in latest["kinds"][kind]["filledPraxes"]:
        geo = (eeszt.get("praxes", {}).get(f["id"]) or {}).get("g")
        if geo:
            out.append((geo[0], geo[1]))
            continue
        hit = cache.get(f"{f.get('postalCode', '')} {f.get('settlement', '')}, "
                        f"{f.get('address', '')}")
        if hit and hit.get("lat") is not None:
            out.append((hit["lat"], hit["lon"]))
    return out


def percentiles(values: list[float | None]) -> list[float | None]:
    """Rank percentile in [0, 1]; ties share the average rank, None stays None."""
    known = sorted(v for v in values if v is not None)
    if not known:
        return [None] * len(values)
    ranks: dict[float, float] = {}
    i = 0
    while i < len(known):
        j = i
        while j + 1 < len(known) and known[j + 1] == known[i]:
            j += 1
        ranks[known[i]] = (i + j) / 2 / max(len(known) - 1, 1)
        i = j + 1
    return [None if v is None else min(ranks[v], 1.0) for v in values]


def build() -> dict:
    data_dir = ROOT / "data"
    latest = json.loads((data_dir / "latest.json").read_text(encoding="utf-8"))
    coverage = json.loads((data_dir / "coverage.json").read_text(encoding="utf-8"))
    eeszt_path = data_dir / "eeszt.json"
    eeszt = json.loads(eeszt_path.read_text(encoding="utf-8")) if eeszt_path.exists() else {}
    cache = json.loads((ROOT / "etl" / "geocode_cache.json").read_text(encoding="utf-8"))
    age = {a["kshId"]: a for a in json.loads(
        (data_dir / "age.json").read_text(encoding="utf-8"))["settlements"]}
    risk = json.loads((data_dir / "risk.json").read_text(encoding="utf-8"))
    specialist = json.loads((data_dir / "specialist.json").read_text(encoding="utf-8"))
    benefit = json.loads((data_dir / "kedvezmenyezett.json").read_text(encoding="utf-8"))["settlements"]
    from kedvezmenyezett import county_key, normalize

    points = centroids.load()
    if not points:
        raise ParseError("run etl/centroids.py first — no settlement coordinates")
    ksh = load_reference()

    gp_points = operating_points("gp", latest, eeszt, cache)
    dental_points = operating_points("dental", latest, eeszt, cache)
    inpatient = [(s["lat"], s["lon"]) for s in specialist["sites"]
                 if s["care"] == "inpatient" and s["lat"] is not None]
    outpatient = [(s["lat"], s["lon"]) for s in specialist["sites"]
                  if s["care"] == "outpatient" and s["lat"] is not None]

    # the mean vacancy risk of the districts seated in a settlement
    risk_by_settlement: dict[str, list[float]] = collections.defaultdict(list)
    for kind in ("dental", "gp"):
        for r in risk["kinds"][kind]["rows"]:
            risk_by_settlement[normalize_settlement(r["settlement"])].append(r["risk"])

    cover = {kind: {s["kshId"]: s for s in coverage["kinds"][kind]["settlements"]}
             for kind in ("dental", "gp")}

    rows: list[dict] = []
    for e in ksh.entries:
        if e["name"] == "Budapest" and not e["isDistrictOfCapital"]:
            continue
        point = points.get(e["kshId"])
        if point is None:
            continue
        lat, lon = point
        gp_cover = cover["gp"].get(e["kshId"], {})
        dental_cover = cover["dental"].get(e["kshId"], {})
        a = age.get(e["kshId"], {})
        key = f"{county_key(e['county'])}|{normalize(e['name'])}"
        risks = risk_by_settlement.get(normalize_settlement(e["name"]), [])
        rows.append({
            "kshId": e["kshId"],
            "settlement": e["name"],
            "county": e["county"],
            "district": e["district"],
            "population": e["population"],
            "lat": lat,
            "lon": lon,
            "gpClass": gp_cover.get("class", "absent"),
            "dentalClass": dental_cover.get("class", "absent"),
            "raw": {
                "vacancy": vacancy_score(gp_cover.get("class"), dental_cover.get("class")),
                "gpKm": nearest(lat, lon, gp_points),
                "dentalKm": nearest(lat, lon, dental_points),
                "outpatientKm": nearest(lat, lon, outpatient),
                "inpatientKm": nearest(lat, lon, inpatient),
                "ageing": a.get("oldShare"),
                "risk": (sum(risks) / len(risks)) if risks else None,
                "deprivation": 1.0 if key in benefit else 0.0,
            },
        })

    # every component becomes a rank percentile over the whole country
    scores: dict[str, list[float | None]] = {}
    for name in WEIGHTS:
        scores[name] = percentiles([r["raw"][name] for r in rows])
    for i, r in enumerate(rows):
        parts = {name: scores[name][i] for name in WEIGHTS}
        weight = sum(WEIGHTS[n] for n, v in parts.items() if v is not None)
        total = sum(WEIGHTS[n] * v for n, v in parts.items() if v is not None)
        r["parts"] = {n: (None if v is None else round(v, 4)) for n, v in parts.items()}
        r["missing"] = sorted(n for n, v in parts.items() if v is None)
        r["index"] = round(100 * total / weight, 1) if weight else 0.0

    rows.sort(key=lambda r: -r["index"])
    cut = {}
    for name, share in BANDS:
        cut[name] = rows[min(int(len(rows) * share), len(rows) - 1)]["index"]
    for r in rows:
        r["band"] = next(name for name, _ in BANDS if r["index"] >= cut[name]) \
            if r["index"] >= cut["alacsony"] else "alacsony"

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": latest.get("month", ""),
        "weights": WEIGHTS,
        "bands": [b[0] for b in BANDS],
        "thresholds": {k: round(v, 1) for k, v in cut.items()},
        "stats": overall(rows),
        "counties": by_county(rows),
        "settlements": rows,
    }
    guard(out)
    return out


def vacancy_score(gp_class: str | None, dental_class: str | None) -> float:
    """How badly the settlement's own districts are staffed, 0–1."""
    weight = {"vacantOnly": 1.0, "partial": 0.5, "filled": 0.0, "absent": 0.25,
              None: 0.25}
    # the dental registry publishes seats only, so its "absent" is weaker
    return max(weight.get(gp_class, 0.25), weight.get(dental_class, 0.25) * 0.8)


def overall(rows: list[dict]) -> dict:
    bands = collections.Counter(r["band"] for r in rows)
    top = [r for r in rows if r["band"] in ("kiemelt", "magas")]
    return {
        "settlements": len(rows),
        "population": sum(r["population"] for r in rows),
        "byBand": dict(bands),
        "populationByBand": {
            band: sum(r["population"] for r in rows if r["band"] == band)
            for band in bands},
        "atRiskSettlements": len(top),
        "atRiskPopulation": sum(r["population"] for r in top),
        "meanIndex": round(sum(r["index"] for r in rows) / len(rows), 1) if rows else 0,
    }


def by_county(rows: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        groups[r["county"]].append(r)
    out = []
    for county, list_ in groups.items():
        top = [r for r in list_ if r["band"] in ("kiemelt", "magas")]
        out.append({
            "county": county,
            "settlements": len(list_),
            "population": sum(r["population"] for r in list_),
            "atRisk": len(top),
            "atRiskPopulation": sum(r["population"] for r in top),
            "share": len(top) / len(list_) if list_ else 0.0,
            "meanIndex": round(sum(r["index"] for r in list_) / len(list_), 1),
        })
    return sorted(out, key=lambda c: -c["meanIndex"])


def guard(out: dict) -> None:
    rows = out["settlements"]
    if len(rows) < 3000:
        raise ParseError(f"only {len(rows)} settlements scored")
    if abs(sum(WEIGHTS.values()) - 1.0) > 1e-9:
        raise ParseError("the component weights do not sum to 1")
    if sum(out["stats"]["byBand"].values()) != len(rows):
        raise ParseError("the bands do not add up to the settlements")
    for r in rows:
        if not 0 <= r["index"] <= 100:
            raise ParseError(f"{r['settlement']}: index out of range")
        if set(r["parts"]) != set(WEIGHTS):
            raise ParseError(f"{r['settlement']}: component set does not match the weights")
        for name, value in r["parts"].items():
            if value is not None and not 0 <= value <= 1:
                raise ParseError(f"{r['settlement']}: {name} percentile out of range")
    # the ranking must be monotone: a higher index can never sit in a lower band
    order = {b: i for i, b in enumerate(out["bands"])}
    for a, b in zip(rows, rows[1:]):
        if order[a["band"]] > order[b["band"]]:
            raise ParseError("bands are not monotone in the index")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT}: {st['settlements']} settlements, mean index {st['meanIndex']}")
    print(f"  top two bands: {st['atRiskSettlements']} settlements, "
          f"{st['atRiskPopulation']:,} residents")
    for r in out["settlements"][:5]:
        print(f"  {r['index']:5.1f} {r['settlement']} ({r['county']})")


if __name__ == "__main__":
    main()
