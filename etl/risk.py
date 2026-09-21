"""Which filled districts are most likely to lose their doctor.

The archive holds monthly snapshots since 2017 (dental) and 2019 (GP), and
every snapshot names the contracted physician of a filled district. That is
enough to measure what a vacancy actually follows from, and to rank today's
filled districts by the same yardstick.

The model is deliberately a transparent one — every row can state why it
scored what it did:

    monthly hazard = base hazard × the lift of each factor level

Factor lifts come from the archive itself (observed transitions ÷ exposure in
months), smoothed and capped so a thin cell cannot dominate. The published
number is the 12-month probability derived from that hazard, plus the factors
that pushed it up or down.

Snapshots whose registry is missing (filledPraxes empty) are skipped: there
the status of a district is unknown, not vacant.

Validation is a time split — the model is fitted on the early months and
scored against what happened later — and the result is published with the
model, not hidden.

Usage:
  python etl/risk.py
"""
from __future__ import annotations

import collections
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "risk.json"
SCHEMA_VERSION = 1

# a factor level with few observations is pulled towards the base rate, and no
# single factor may move the hazard by more than this
SMOOTHING_MONTHS = 400.0
LIFT_MIN, LIFT_MAX = 0.35, 3.0
HORIZON_MONTHS = 12
# the split that separates fitting from checking
VALIDATION_FROM = "2023-01"
NEIGHBOUR_KM = 10.0
BANDS = [("kiemelt", 0.05), ("magas", 0.20), ("kozepes", 0.50), ("alacsony", 1.0)]
# "Dr." as a word, so a settlement called Drégelypalánk is not a false alarm
NAME_MARKER_RE = re.compile(r"\bdr\b\.?", re.IGNORECASE)


class RiskError(Exception):
    pass


def months_between(a: str, b: str) -> int:
    return (int(b[:4]) - int(a[:4])) * 12 + (int(b[5:7]) - int(a[5:7]))


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


def load_history(kind: str) -> dict[str, dict]:
    """Month -> {fin: (status, physician)}, skipping months without a registry."""
    out: dict[str, dict] = {}
    for path in sorted((ROOT / "data").glob(f"20*/{kind}.json")):
        snap = json.loads(path.read_text(encoding="utf-8"))
        if not snap.get("filledPraxes"):
            continue
        state = {f["id"]: ("filled", f.get("doctor") or "") for f in snap["filledPraxes"]}
        for vacant in snap.get("praxes", []):
            state[vacant["id"]] = (vacant.get("status", "vacant"), "")
        out[path.parent.name] = state
    if len(out) < 8:
        raise RiskError(f"{kind}: only {len(out)} usable months in the archive")
    return out


def advance(info: dict[str, dict], history: dict[str, dict], month: str) -> None:
    """Fold one month into the running state — nothing later may be used."""
    for fid, (status, doctor) in history[month].items():
        entry = info.setdefault(fid, {"since": None, "doctor": "", "wasVacant": False,
                                      "changes": 0})
        if status != "filled":
            entry["wasVacant"] = True
            entry["since"] = None
            entry["doctor"] = ""
            continue
        if doctor and doctor != entry["doctor"]:
            if entry["doctor"]:
                entry["changes"] += 1
            entry["doctor"] = doctor
            entry["since"] = month
        elif entry["since"] is None:
            entry["since"] = month


def bucket_population(population: int | None) -> str:
    if not population:
        return "ismeretlen"
    if population < 1000:
        return "<1000"
    if population < 3000:
        return "1000-3000"
    if population < 10000:
        return "3000-10000"
    return "10000+"


def bucket_tenure(months: int | None) -> str:
    if months is None:
        return "ismeretlen"
    if months < 24:
        return "<2 év"
    if months < 60:
        return "2-5 év"
    if months < 120:
        return "5-10 év"
    return "10+ év"


def features_at(month: str, fid: str, static: dict, info: dict,
                neighbour: bool) -> dict:
    """The factor levels of one district as they stood in that month."""
    own = static.get(fid, {})
    entry = info.get(fid, {})
    since = entry.get("since")
    tenure = months_between(since, month) if since else None
    return {
        "tenure": bucket_tenure(tenure),
        "population": bucket_population(own.get("population")),
        "benefit": "igen" if own.get("benefit") else "nem",
        "soloProvider": "igen" if own.get("solo") else "nem",
        "neighbourVacant": "igen" if neighbour else "nem",
        "wasVacant": "igen" if entry.get("wasVacant") else "nem",
        "county": own.get("county") or "ismeretlen",
        "type": own.get("type") or "ismeretlen",
    }


def fit(pairs: list[dict]) -> dict:
    """Base hazard and the lift of every factor level, from exposure and events."""
    total_events = sum(p["event"] for p in pairs)
    total_months = sum(p["exposure"] for p in pairs)
    if not total_months:
        raise RiskError("no exposure to fit on")
    base = total_events / total_months
    lifts: dict[str, dict[str, float]] = {}
    counts: dict[str, dict[str, dict]] = {}
    factors = pairs[0]["features"].keys()
    for factor in factors:
        cells: dict[str, list[float]] = collections.defaultdict(lambda: [0.0, 0.0])
        for p in pairs:
            cell = cells[p["features"][factor]]
            cell[0] += p["event"]
            cell[1] += p["exposure"]
        lifts[factor] = {}
        counts[factor] = {}
        for level, (events, exposure) in cells.items():
            # smoothed towards the base rate: a thin cell barely moves
            hazard = (events + base * SMOOTHING_MONTHS) / (exposure + SMOOTHING_MONTHS)
            lift = max(LIFT_MIN, min(LIFT_MAX, hazard / base if base else 1.0))
            if level == "ismeretlen":
                lift = 1.0  # a missing value is not evidence of risk
            lifts[factor][level] = round(lift, 3)
            counts[factor][level] = {
                "events": int(events), "months": int(exposure),
                "rate12": round(1 - (1 - events / exposure) ** HORIZON_MONTHS, 4)
                if exposure else None,
            }
    return {"base": base, "lifts": lifts, "cells": counts}


def score(model: dict, features: dict) -> tuple[float, list[dict]]:
    hazard = model["base"]
    why: list[dict] = []
    for factor, level in features.items():
        lift = model["lifts"].get(factor, {}).get(level, 1.0)
        hazard *= lift
        why.append({"factor": factor, "level": level, "lift": lift})
    hazard = min(hazard, 0.9 / HORIZON_MONTHS)
    risk = 1 - (1 - hazard) ** HORIZON_MONTHS
    why.sort(key=lambda w: abs(math.log(w["lift"] or 1)), reverse=True)
    return risk, why


def validate(pairs: list[dict], model: dict) -> dict:
    """Out-of-sample check: does the ranking actually find the vacancies?"""
    scored = []
    for p in pairs:
        risk, _ = score(model, p["features"])
        scored.append((risk, p["event"], p["exposure"]))
    if not scored or not any(e for _, e, _ in scored):
        return {"pairs": len(scored), "events": 0}
    scored.sort(key=lambda x: -x[0])
    events = sum(e for _, e, _ in scored)
    exposure = sum(x for _, _, x in scored)
    top = scored[: max(1, len(scored) // 10)]
    top_events = sum(e for _, e, _ in top)
    top_exposure = sum(x for _, _, x in top)
    base_rate = events / exposure
    top_rate = top_events / top_exposure if top_exposure else 0
    # AUC over pairs: how often a district that went vacant scored higher
    positives = [s for s, e, _ in scored if e]
    negatives = [s for s, e, _ in scored if not e]
    wins = ties = 0
    for p_score in positives:
        for n_score in negatives:
            if p_score > n_score:
                wins += 1
            elif p_score == n_score:
                ties += 1
    total = len(positives) * len(negatives)
    return {
        "pairs": len(scored),
        "events": events,
        "baseRate12": round(1 - (1 - base_rate) ** HORIZON_MONTHS, 4),
        "topDecileRate12": round(1 - (1 - top_rate) ** HORIZON_MONTHS, 4),
        "lift": round(top_rate / base_rate, 2) if base_rate else None,
        "auc": round((wins + ties / 2) / total, 3) if total else None,
    }


def build() -> dict:
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    eeszt = json.loads((ROOT / "data" / "eeszt.json").read_text(encoding="utf-8"))
    benefit_path = ROOT / "data" / "kedvezmenyezett.json"
    benefit = json.loads(benefit_path.read_text(encoding="utf-8"))["settlements"] \
        if benefit_path.exists() else {}
    prov_path = ROOT / "data" / "providers.json"
    providers = json.loads(prov_path.read_text(encoding="utf-8"))["providers"] \
        if prov_path.exists() else []
    portfolio = {p["neakCode"]: p["total"] for p in providers}

    sys.path.insert(0, str(ROOT / "etl"))
    from kedvezmenyezett import county_key, normalize

    out_kinds: dict[str, dict] = {}
    for kind in ("dental", "gp"):
        history = load_history(kind)
        months = sorted(history)
        snap = latest["kinds"][kind]

        population = {s["name"]: s.get("population") for s in snap["settlements"]}
        portfolio_of = lambda code: portfolio.get(code or "", 1) <= 1  # noqa: E731

        # every district we ever saw, with the attributes of its settlement
        static: dict[str, dict] = {}
        for f in snap["filledPraxes"]:
            key = f"{county_key(f.get('county', ''))}|{normalize(f.get('settlement', ''))}"
            static[f["id"]] = {
                "population": population.get(f.get("settlement", "")),
                "benefit": key in benefit,
                "solo": portfolio_of(f.get("neakCode")),
                "county": f.get("county", ""),
                "type": f.get("type", ""),
                "settlement": f.get("settlement", ""),
            }
        for path in sorted((ROOT / "data").glob(f"20*/{kind}.json")):
            older = json.loads(path.read_text(encoding="utf-8"))
            for f in older.get("filledPraxes", []):
                if f["id"] in static:
                    continue
                key = f"{county_key(f.get('county', ''))}|{normalize(f.get('settlement', ''))}"
                static[f["id"]] = {
                    "population": population.get(f.get("settlement", "")),
                    "benefit": key in benefit,
                    "solo": True,  # unknown portfolio for a district long gone
                    "county": f.get("county", ""),
                    "type": f.get("type", ""),
                    "settlement": f.get("settlement", ""),
                }

        # where the vacancies stood in each month, for the neighbour factor
        vacant_by_month: dict[str, list[tuple[float, float]]] = {}
        for path in sorted((ROOT / "data").glob(f"20*/{kind}.json")):
            month = path.parent.name
            if month not in history:
                continue
            older = json.loads(path.read_text(encoding="utf-8"))
            points = []
            for v in older.get("praxes", []):
                site = (v.get("sites") or [{}])[0]
                if site.get("lat") and site.get("lon"):
                    points.append((site["lat"], site["lon"]))
            vacant_by_month[month] = points
        coords = {fid: (entry["g"][0], entry["g"][1])
                  for fid, entry in eeszt["praxes"].items() if entry.get("g")}

        def neighbour_at(fid: str, month: str) -> bool:
            point = coords.get(fid)
            if not point:
                return False
            return any(haversine(point[0], point[1], la, lo) <= NEIGHBOUR_KM
                       for la, lo in vacant_by_month.get(month, ()))

        # replay the archive: the state of month `a` knows nothing after it
        info: dict[str, dict] = {}
        pairs: list[dict] = []
        for index, month in enumerate(months):
            advance(info, history, month)
            if index + 1 >= len(months):
                break
            nxt_month = months[index + 1]
            gap = months_between(month, nxt_month)
            if gap <= 0 or gap > 18:
                continue  # too long a gap to attribute an event to this state
            for fid, (status, _) in history[month].items():
                if status != "filled" or fid not in static:
                    continue
                nxt = history[nxt_month].get(fid)
                if not nxt:
                    continue
                pairs.append({
                    "month": month,
                    "event": 1 if nxt[0] != "filled" else 0,
                    "exposure": gap,
                    "features": features_at(month, fid, static, info,
                                            neighbour_at(fid, month)),
                })
        if not pairs:
            raise RiskError(f"{kind}: no usable transition pairs")

        train = [p for p in pairs if p["month"] < VALIDATION_FROM]
        test = [p for p in pairs if p["month"] >= VALIDATION_FROM]
        check = validate(test, fit(train)) if train and test else {"pairs": 0, "events": 0}
        model = fit(pairs)  # the published model uses every month

        # today's districts, scored with the state as it stands now
        now = months[-1]
        rows = []
        for f in snap["filledPraxes"]:
            fid = f["id"]
            entry = info.get(fid, {})
            feats = features_at(now, fid, static, info, neighbour_at(fid, now))
            risk, why = score(model, feats)
            since = entry.get("since")
            rows.append({
                "fin": fid,
                "settlement": f.get("settlement", ""),
                "county": f.get("county", ""),
                "type": f.get("type", ""),
                "risk": round(risk, 4),
                "tenureMonths": months_between(since, now) if since else None,
                "tenureFrom": since,
                "changes": entry.get("changes", 0),
                "wasVacant": bool(entry.get("wasVacant")),
                "population": static[fid]["population"],
                "benefit": static[fid]["benefit"],
                "solo": static[fid]["solo"],
                "neighbourVacant": neighbour_at(fid, now),
                "why": why[:3],
            })
        rows.sort(key=lambda r: -r["risk"])
        for index, row in enumerate(rows):
            share = (index + 1) / len(rows)
            row["band"] = next(name for name, limit in BANDS if share <= limit)

        out_kinds[kind] = {
            "months": months,
            "trainPairs": len(train),
            "testPairs": len(test),
            "baseHazard12": round(1 - (1 - model["base"]) ** HORIZON_MONTHS, 4),
            "validation": check,
            "lifts": model["lifts"],
            "cells": model["cells"],
            "rows": rows,
        }

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": latest.get("month", ""),
        "horizonMonths": HORIZON_MONTHS,
        "validationFrom": VALIDATION_FROM,
        "bands": [name for name, _ in BANDS],
        "kinds": out_kinds,
    }
    guard(out)
    return out


def guard(out: dict) -> None:
    allowed = {"fin", "settlement", "county", "type", "risk", "tenureMonths",
               "tenureFrom", "changes", "wasVacant", "population", "benefit",
               "solo", "neighbourVacant", "why", "band"}
    for kind, data in out["kinds"].items():
        if not data["rows"]:
            raise RiskError(f"{kind}: no districts scored")
        seen = set()
        for row in data["rows"]:
            unknown = set(row) - allowed
            if unknown:
                raise RiskError(f"{row['fin']}: unexpected fields {sorted(unknown)}")
            if row["fin"] in seen:
                raise RiskError(f"duplicate district {row['fin']}")
            seen.add(row["fin"])
            if not 0 <= row["risk"] <= 1:
                raise RiskError(f"{row['fin']}: risk out of range")
            if row["band"] not in out["bands"]:
                raise RiskError(f"{row['fin']}: unknown band {row['band']!r}")
            # a physician's name must never leave the ETL
            for value in row.values():
                if isinstance(value, str) and NAME_MARKER_RE.search(value):
                    raise RiskError(f"{row['fin']}: a name leaked into the output")
        ranks = [r["risk"] for r in data["rows"]]
        if ranks != sorted(ranks, reverse=True):
            raise RiskError(f"{kind}: rows are not ranked")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}")
    for kind, data in out["kinds"].items():
        v = data["validation"]
        print(f"  {kind}: {len(data['rows'])} districts scored on {len(data['months'])} "
              f"months, base 12-month risk {data['baseHazard12']:.1%}")
        if v.get("events"):
            print(f"    check on {out['validationFrom']}+: {v['events']} vacancies, "
                  f"top decile {v['topDecileRate12']:.1%} vs base {v['baseRate12']:.1%} "
                  f"(lift {v['lift']}×, AUC {v['auc']})")


if __name__ == "__main__":
    main()
