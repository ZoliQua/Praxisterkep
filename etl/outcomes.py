"""What a vacancy goes with: deaths, money, work, people leaving.

The site has always measured an input — whether a district has a doctor.
This module puts it next to what it might cost and where it is hardest to
fix, for every járás and county:

  mortality.json    deaths that care or prevention should have averted (M)
  territorial.json  income, births and deaths, people moving out (N)
  jobseekers.json   registered jobseekers (O)
  census.json       education, work, digital skills, housing, households (F2)
  traveltime.json   driving minutes to the nearest emergency department (J)
  grants.json       NEAK's settlement grants and what became of them (P)
  forecast.json     the vacancies expected a year from now

and adds the four cross-readings that need no new source at all, from the
settlement profiles already built: how long a vacancy lasts against how far
the next doctor is, against how old the village is, against whether a bus
goes there, and the contiguous care deserts.

Statistics, and what they are not
---------------------------------
Every association here is ecological — between places, not people — and
none of it is a cause. Poor, emptying járás have more deaths *and* more
empty districts, so a raw correlation between the two mostly measures
poverty. Two things are computed so the page can say more than that:

  * the partial correlation of vacancy with each outcome, income held
    constant (r_xy·z = (r_xy − r_xz r_yz) / √((1 − r_xz²)(1 − r_yz²)));
  * the same with income *and* education (the share of adults with a
    degree) held constant together — the second-order partial
    r_xy·zw = (r_xy·z − r_xw·z r_yw·z) / √((1 − r_xw·z²)(1 − r_yw·z²)),
    because a járás can be poor for reasons its schooling also explains;
  * a 3 × 3 grid — income tertile by vacancy tertile — with the median
    avoidable mortality in each cell, so a reader can see whether, among
    járás equally poor, those with more vacancies die more.

Correlations use the 174 járás outside the capital. TIMEA publishes the
capital as one place, so a kerület has no income of its own to correlate;
the 23 kerület are kept, with their own mortality, jobseeker and vacancy
figures, and the capital-wide values marked as such.

Nominal income is not compared across years: 2022–23 alone carried 15–25 %
inflation. Each járás's income is also given as a share of that year's
median járás, which removes the price level and leaves the standing.
"""
from __future__ import annotations

import json
import math
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "outcomes.json"
SCHEMA_VERSION = 1

# the years averaged for the noisy yearly rates: after the 2020–21 excess
# deaths, so a pandemic spike is not read as a local trait
SMOOTH_YEARS = ("2022", "2023", "2024", "2025")
INCOME_YEAR = "2024"
# how far back the jobseeker trend looks
TREND_MONTHS = 24


def read(name: str) -> dict:
    path = DATA / name
    if not path.exists():
        raise ParseError(f"{name} is missing; build it first")
    return json.loads(path.read_text(encoding="utf-8"))


def _mean(series: dict, years) -> float | None:
    vals = [series[y] for y in years if y in series and series[y] is not None]
    return round(sum(vals) / len(vals), 2) if len(vals) >= len(years) - 1 else None


def _latest(series: dict) -> tuple[str, float] | None:
    if not series:
        return None
    y = max(series)
    return y, series[y]


def _month_index(months: list[str], month: str) -> int:
    return months.index(month) if month in months else len(months) - 1


# ------------------------------------------------------------------ statistics

def pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / math.sqrt(sxx * syy)


def _ranks(vals: list[float]) -> list[float]:
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    ranks = [0.0] * len(vals)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def spearman(xs, ys) -> float | None:
    return pearson(_ranks(xs), _ranks(ys))


def p_value(r: float, n: int, controls: int = 0) -> float:
    """Two-sided p for a (partial) correlation, from Student's t."""
    from scipy import stats
    df = n - 2 - controls
    if df <= 0 or abs(r) >= 1:
        return 0.0
    t = r * math.sqrt(df / (1 - r * r))
    return float(2 * stats.t.sf(abs(t), df))


def partial(rxy: float, rxz: float, ryz: float) -> float | None:
    den = math.sqrt(max(0.0, (1 - rxz ** 2) * (1 - ryz ** 2)))
    return None if den == 0 else (rxy - rxz * ryz) / den


def partial2(rxy: float, rxz: float, ryz: float,
             rxw: float, ryw: float, rzw: float) -> float | None:
    """r_xy·zw: the first-order partials on z, then partialled on w."""
    a = partial(rxy, rxz, ryz)      # r_xy·z
    b = partial(rxw, rxz, rzw)      # r_xw·z
    c = partial(ryw, ryz, rzw)      # r_yw·z
    if None in (a, b, c):
        return None
    return partial(a, b, c)


def fit(xs, ys) -> dict:
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx if sxx else 0.0
    return {"slope": round(slope, 4), "intercept": round(my - slope * mx, 4)}


def tertiles(vals: list[float]) -> tuple[float, float]:
    q = statistics.quantiles(vals, n=3, method="inclusive")
    return q[0], q[1]


# --------------------------------------------------------------------- tables

def district_rows() -> list[dict]:
    districts = read("districts.json")["districts"]
    mortality = read("mortality.json")
    territorial = read("territorial.json")
    jobs = read("jobseekers.json")

    census = read("census.json")["districts"]
    travel = read("traveltime.json")["settlements"]
    forecast = read("forecast.json")["kinds"]["gp"]["districts"]
    grants = read("grants.json")["kinds"]
    sbo = _district_sbo(travel)
    granted = _district_grants(grants)

    mort = mortality["districts"]
    terr = territorial["districts"]
    jd = jobs["districts"]
    months = jobs["months"]
    i_now = len(months) - 1
    i_then = _month_index(months, _shift(months[-1], -TREND_MONTHS))

    # income relative to the median járás of the same year (inflation-free)
    years = sorted({y for r in terr.values() for y in r.get("incomePerResident", {})})
    median_income = {}
    for y in years:
        vals = [r["incomePerResident"][y] for n, r in terr.items()
                if n != "Budapest" and y in r.get("incomePerResident", {})]
        median_income[y] = statistics.median(vals) if vals else None

    rows = []
    for d in districts:
        name, cap = d["name"], d["isCapital"]
        m = mort.get(name)
        if m is None:
            raise ParseError(f"no mortality for járás {name}")
        t = terr.get("Budapest" if cap else name)
        if t is None:
            raise ParseError(f"no TIMEA row for járás {name}")
        j = jd.get(name)
        if j is None:
            raise ParseError(f"no jobseeker row for járás {name}")
        cen = census.get(name)
        if cen is None:
            raise ParseError(f"no census row for járás {name}")
        fc = forecast.get(name) or {}
        sha, shh = m["sha"], m["shh"]
        gp, dental = d.get("gpDistricts") or {}, d.get("dentalDistricts") or {}
        wap_now, reg_now = j["workingAge"][i_now], j["registered"][i_now]
        reg_then, wap_then = j["registered"][i_then], j["workingAge"][i_then]
        inc = t.get("incomePerResident", {})
        row = {
            "name": name, "slug": d["slug"], "county": d["county"], "capital": cap,
            "population": d["population"],
            # vacancy, from this project's own data
            "gpRate": gp.get("rate"),
            "gpLongTerm": round(gp["longTerm"] / gp["total"], 4) if gp.get("total") else None,
            "gpVacant": gp.get("vacant"), "gpTotal": gp.get("total"),
            "dentalRate": dental.get("rate"),
            "gpMinutes": d.get("medianGpMinutes"),
            "noBusShare": (round(d["withoutDirectBus"] / d["settlements"], 4)
                           if d.get("settlements") else None),
            "development": (d.get("development") or {}).get("complex"),
            # mortality (NNGYK, SHA per 100 000 and SHH, both sexes)
            "avoidable": sha["avoidable"]["t"],
            "amenable": sha["amenable"]["t"],
            "treatable": sha["treatable"]["t"],
            "preventable": sha["preventable"]["t"],
            "both": sha["both"]["t"],
            "allCause": sha["all"]["t"],
            "avoidableMen": sha["avoidable"]["m"], "avoidableWomen": sha["avoidable"]["f"],
            "shh": {k: v["t"] for k, v in shh.items()},
            # income, births, migration (KSH TIMEA; capital-wide for a kerület)
            "income": inc.get(INCOME_YEAR),
            "incomeIndex": (round(100 * inc[INCOME_YEAR] / median_income[INCOME_YEAR], 1)
                            if inc.get(INCOME_YEAR) and median_income.get(INCOME_YEAR) else None),
            "incomeIndex2012": (round(100 * inc["2012"] / median_income["2012"], 1)
                                if inc.get("2012") and median_income.get("2012") else None),
            "taxpayers": (t.get("taxpayersPer1000") or {}).get(INCOME_YEAR),
            "naturalChange": _mean(t.get("naturalChange", {}), SMOOTH_YEARS),
            "migration": _mean(t.get("migration", {}), SMOOTH_YEARS),
            "diabetes": (_latest(t.get("diabetesRegistered", {})) or (None, None))[1],
            "hypertension": (_latest(t.get("hypertensionRegistered", {})) or (None, None))[1],
            "ischaemic": (_latest(t.get("ischaemicRegistered", {})) or (None, None))[1],
            "gpLoad": (_latest(t.get("gpVisitsPerGp", {})) or (None, None))[1],
            "ageing": (_latest(t.get("ageingIndex", {})) or (None, None))[1],
            # jobseekers (NFSZ), counted per kerület too
            "jobseekers": round(100 * reg_now / wap_now, 2) if wap_now else None,
            "jobseekersLongShare": (round(100 * j["longTerm"][i_now] / reg_now, 1)
                                    if reg_now else None),
            "jobseekersTrend": (round(100 * reg_now / wap_now - 100 * reg_then / wap_then, 2)
                                if wap_now and wap_then else None),
            # the census, per kerület too (the census has its own kerület level)
            **{k: cen[k] for k in CENSUS},
            # the nearest emergency department, by road
            "sboMinutes": sbo.get(name, {}).get("median"),
            "sboBeyond30": sbo.get(name, {}).get("beyond30"),
            # the forecast, a year from now (GP)
            "gpRateIn12": fc.get("rateIn12"),
            "gpVacantIn12": fc.get("vacantIn12"),
            "gpExpectedNew": fc.get("expectedNew"),
            # settlement grants taken up here
            "grants": granted.get(name, {"gp": 0, "dental": 0, "practice": 0}),
            "capitalWide": cap,
        }
        rows.append(row)
    if len(rows) != 197:
        raise ParseError(f"{len(rows)} járás rows, expected 197")
    return rows


CENSUS = ("degree", "employed", "noDigital", "poorHousing", "elderlyOnly")


def _district_sbo(travel: list[dict]) -> dict[str, dict]:
    """Median settlement minutes to an emergency department, and the share of
    residents 30 minutes or more away, per járás."""
    groups: dict[str, list[dict]] = {}
    for r in travel:
        if r.get("sboMin") is not None:
            groups.setdefault(r["district"], []).append(r)
    out = {}
    for name, rows in groups.items():
        pop = sum(r["population"] for r in rows)
        out[name] = {
            "median": round(statistics.median(r["sboMin"] for r in rows), 1),
            "beyond30": round(sum(r["population"] for r in rows if r["sboMin"] >= 30) / pop, 4)
            if pop else None,
        }
    return out


def _district_grants(kinds: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for kind, k in kinds.items():
        for w in k["winners"]:
            if not w["contract"]:
                continue
            d = out.setdefault(w["district"], {"gp": 0, "dental": 0, "practice": 0})
            d["practice" if w["programme"] == "practice" else kind] += 1
    return out


def _shift(month: str, delta: int) -> str:
    y, m = map(int, month.split("-"))
    k = y * 12 + (m - 1) + delta
    return f"{k // 12}-{k % 12 + 1:02d}"


# the pairs the page reads; x is always something about care, y an outcome
# or a circumstance
CARE = ("gpRate", "gpLongTerm", "dentalRate", "gpMinutes", "sboMinutes")
OUTCOMES = ("avoidable", "amenable", "treatable", "preventable", "both", "allCause",
            "income", "taxpayers", "jobseekers", "naturalChange", "migration",
            "diabetes", "hypertension", "ischaemic", "gpLoad", "ageing", "development",
            "degree", "employed", "noDigital", "poorHousing", "elderlyOnly")


def correlations(rows: list[dict]) -> dict:
    rural = [r for r in rows if not r["capital"]]
    keys = CARE + OUTCOMES
    matrix = []
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            pts = [(r[a], r[b]) for r in rural if r[a] is not None and r[b] is not None]
            if len(pts) < 20:
                continue
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            r = pearson(xs, ys)
            if r is None:
                continue
            matrix.append({"x": a, "y": b, "n": len(pts), "r": round(r, 3),
                           "rho": round(spearman(xs, ys), 3),
                           "p": float(f"{p_value(r, len(pts)):.2g}"), **fit(xs, ys)})

    # vacancy against each outcome, with income and with development held still
    partials = []
    by_pair = {(m["x"], m["y"]): m for m in matrix}

    def r_of(a, b):
        m = by_pair.get((a, b)) or by_pair.get((b, a))
        return m["r"] if m else None

    for control in ("income", "development"):
        for x in CARE:
            for y in OUTCOMES:
                if y in (control,) or y == x:
                    continue
                rxy, rxz, ryz = r_of(x, y), r_of(x, control), r_of(y, control)
                if None in (rxy, rxz, ryz):
                    continue
                pr = partial(rxy, rxz, ryz)
                n = min(by_pair.get((x, y), by_pair.get((y, x), {"n": 0}))["n"],
                        by_pair.get((x, control), by_pair.get((control, x), {"n": 0}))["n"])
                if pr is None:
                    continue
                partials.append({"x": x, "y": y, "control": control, "n": n,
                                 "r": round(rxy, 3), "partial": round(pr, 3),
                                 "p": float(f"{p_value(pr, n, controls=1):.2g}")})
    # income and education held still together
    for x in CARE:
        for y in OUTCOMES:
            if y in ("income", "degree"):
                continue
            rs = [r_of(*pair) for pair in ((x, y), (x, "income"), (y, "income"),
                                           (x, "degree"), (y, "degree"), ("income", "degree"))]
            if None in rs:
                continue
            pr = partial2(*rs)
            if pr is None:
                continue
            n = by_pair.get((x, y), by_pair.get((y, x), {"n": 0}))["n"]
            partials.append({"x": x, "y": y, "control": "incomeDegree", "n": n,
                             "r": round(rs[0], 3), "partial": round(pr, 3),
                             "p": float(f"{p_value(pr, n, controls=2):.2g}")})
    return {"population": "174 járás outside the capital", "pairs": matrix,
            "partials": partials}


def grid(rows: list[dict], outcome: str = "avoidable") -> dict:
    """Income tertile × vacancy tertile -> median outcome."""
    rural = [r for r in rows if not r["capital"] and None not in
             (r["income"], r["gpRate"], r[outcome])]
    i1, i2 = tertiles([r["income"] for r in rural])
    v1, v2 = tertiles([r["gpRate"] for r in rural])

    def band(v, a, b):
        return 0 if v <= a else (1 if v <= b else 2)

    cells = [[[] for _ in range(3)] for _ in range(3)]
    for r in rural:
        cells[band(r["income"], i1, i2)][band(r["gpRate"], v1, v2)].append(r)
    return {
        "outcome": outcome,
        "incomeCuts": [round(i1), round(i2)],
        "vacancyCuts": [round(v1, 4), round(v2, 4)],
        # rows: income low -> high; columns: vacancy low -> high
        "cells": [[{"n": len(c), "median": (round(statistics.median(x[outcome] for x in c), 1)
                                           if c else None),
                    "districts": [x["slug"] for x in c]}
                   for c in row] for row in cells],
    }


def county_rows() -> list[dict]:
    counties = read("counties.json")["counties"]
    mort = read("mortality.json")["counties"]
    terr = read("territorial.json")["counties"]
    jobs = read("jobseekers.json")
    census = read("census.json")["counties"]
    travel = {c["county"]: c for c in read("traveltime.json")["counties"]}
    forecast = read("forecast.json")["kinds"]
    i_now = len(jobs["months"]) - 1
    out = []
    for c in counties:
        name = c["name"]
        m, t, j = mort.get(name), terr.get(name), jobs["counties"].get(name)
        if m is None or t is None or j is None:
            raise ParseError(f"county {name} is missing from one of the outcome sources")
        sha = m["sha"]
        out.append({
            "name": name, "slug": c.get("slug"),
            "avoidable": sha["avoidable"]["t"], "amenable": sha["amenable"]["t"],
            "allCause": sha["all"]["t"],
            "income": t.get("incomePerResident", {}).get(INCOME_YEAR),
            "naturalChange": _mean(t.get("naturalChange", {}), SMOOTH_YEARS),
            "migration": _mean(t.get("migration", {}), SMOOTH_YEARS),
            "jobseekers": round(100 * j["registered"][i_now] / j["workingAge"][i_now], 2),
            **{k: census[name][k] for k in CENSUS},
            "sboMinutes": travel[name]["sboMedianMin"],
            "sboBeyond30": round(travel[name]["sboBeyond30"] / travel[name]["population"], 4),
            "gpRateNow": forecast["gp"]["counties"][name]["rateNow"],
            "gpRateIn12": forecast["gp"]["counties"][name]["rateIn12"],
            "dentalRateIn12": forecast["dental"]["counties"][name]["rateIn12"],
        })
    return out


def series() -> dict:
    """Time series for the trend charts: counties plus the median járás."""
    terr = read("territorial.json")
    jobs = read("jobseekers.json")
    out = {}
    for key in ("incomePerResident", "naturalChange", "migration", "births", "deaths"):
        years = sorted({y for r in terr["counties"].values() for y in r.get(key, {})})
        out[key] = {
            "years": years,
            "counties": {n: [r.get(key, {}).get(y) for y in years]
                         for n, r in sorted(terr["counties"].items())},
            "medianDistrict": [
                round(statistics.median(v), 2) if (v := [r[key][y] for n, r in terr["districts"].items()
                                                         if n != "Budapest" and y in r.get(key, {})]) else None
                for y in years],
        }
    # per járás, for the line on each járás page: income as a share of the
    # median járás (inflation-free), and the two population balances
    inc = out["incomePerResident"]
    out["byDistrict"] = {
        "incomeYears": inc["years"],
        "incomeIndex": {
            n: [round(100 * r["incomePerResident"][y] / m, 1)
                if y in r.get("incomePerResident", {}) and m else None
                for y, m in zip(inc["years"], inc["medianDistrict"])]
            for n, r in sorted(terr["districts"].items())},
        "popYears": out["migration"]["years"],
        "migration": {n: [r.get("migration", {}).get(y) for y in out["migration"]["years"]]
                      for n, r in sorted(terr["districts"].items())},
        "naturalChange": {n: [r.get("naturalChange", {}).get(y) for y in out["migration"]["years"]]
                          for n, r in sorted(terr["districts"].items())},
        "jobseekers": {n: [round(100 * a / b, 2) if b else None
                           for a, b in zip(r["registered"], r["workingAge"])]
                       for n, r in sorted(jobs["districts"].items())},
    }
    nat = jobs["national"]
    out["jobseekers"] = {
        "months": jobs["months"],
        "national": [round(100 * a / b, 3) if b else None
                     for a, b in zip(nat["registered"], nat["workingAge"])],
        "nationalCount": nat["registered"],
        "nationalLong": nat["longTerm"],
        "counties": {n: [round(100 * a / b, 3) if b else None
                         for a, b in zip(r["registered"], r["workingAge"])]
                     for n, r in sorted(jobs["counties"].items())},
    }
    return out


# ------------------------------------------------------- the four cross-cuts

def cross_readings(data_month: str) -> dict:
    """How long, how far, how old, how reachable — from the settlement
    profiles alone."""
    rows = read("settlements.json")["settlements"]

    def months_since(since: str) -> int | None:
        if not since or len(since) < 7:
            return None
        y, m = map(int, since[:7].split("-"))
        Y, M = map(int, data_month.split("-"))
        return (Y - y) * 12 + (M - m)

    points = []      # one per settlement served by a vacant GP district
    for r in rows:
        gpv = [v for v in r.get("vacant", []) if v["kind"] == "gp" and v.get("since")]
        if not gpv:
            continue
        longest = max((months_since(v["since"]) or 0) for v in gpv)
        travel = (r.get("travel") or {}).get("gp") or {}
        transit = ((r.get("transit") or {}).get("gp") or {})
        age = r.get("age") or {}
        points.append({
            "slug": r["slug"], "name": r["settlement"], "county": r["county"],
            "population": r["population"], "state": r["gp"]["state"],
            "months": longest,
            "minutes": travel.get("minutes"),
            "bus": transit.get("direct"),
            "busMinutes": transit.get("minutes"),
            "old": age.get("oldShare"),
        })

    # age: every settlement, banded by the share aged 65+, against how often
    # it has no doctor of its own at all
    banded: dict[int, list] = {}
    for r in rows:
        share = (r.get("age") or {}).get("oldShare")
        if share is None:
            continue
        banded.setdefault(min(int(share * 100) // 5 * 5, 40), []).append(r)
    age_bands = [{
        "from": b, "to": b + 5, "settlements": len(v),
        "population": sum(x["population"] for x in v),
        "vacantOnly": sum(1 for x in v if x["gp"]["state"] == "vacantOnly"),
        "partial": sum(1 for x in v if x["gp"]["state"] == "partial"),
    } for b, v in sorted(banded.items())]

    # buses: of the settlements whose only GP district is vacant, which have
    # no direct bus to the nearest doctor
    only = [p for p in points if p["state"] == "vacantOnly"]
    stranded = [p for p in only if p["bus"] is False]

    clusters = read("clusters.json")
    return {
        "dataMonth": data_month,
        "durationTravel": points,
        "ageBands": age_bands,
        "bus": {
            "vacantOnly": len(only),
            "vacantOnlyPopulation": sum(p["population"] for p in only),
            "noDirectBus": len(stranded),
            "noDirectBusPopulation": sum(p["population"] for p in stranded),
            "stranded": sorted(({k: p[k] for k in ("slug", "name", "county", "population",
                                                    "months", "minutes")} for p in stranded),
                               key=lambda p: -p["population"])[:40],
        },
        "deserts": {k: clusters.get(k) for k in ("stats", "kinds") if k in clusters},
    }


# ------------------------------------------- emergency, grants, forecast

def emergency(rows: list[dict]) -> dict:
    """The nearest emergency department: who is far, and who is far *and*
    has no GP of their own."""
    travel = read("traveltime.json")
    profiles = {r["kshId"]: r for r in read("settlements.json")["settlements"]}
    far = []
    for t in travel["settlements"]:
        p = profiles.get(t["kshId"])
        if t.get("sboMin") is None or p is None:
            continue
        far.append({"slug": p["slug"], "name": t["settlement"], "county": t["county"],
                    "population": t["population"], "minutes": t["sboMin"],
                    "at": t.get("sboAt"), "gpState": p["gp"]["state"]})
    double = [f for f in far if f["minutes"] >= 30 and f["gpState"] == "vacantOnly"]
    stats = travel["stats"]["sbo"]
    return {
        "points": stats["points"],
        "medianMin": stats["medianMin"], "maxMin": stats["maxMin"],
        "population": stats["population"], "bands": travel["bands"],
        "beyond30": stats["populationBeyond30"],
        "settlements": [{k: f[k] for k in ("slug", "minutes", "population", "gpState")}
                        for f in far],
        "farthest": sorted(far, key=lambda f: -f["minutes"])[:25],
        "doubly": {"settlements": len(double),
                   "population": sum(f["population"] for f in double),
                   "list": sorted(double, key=lambda f: -f["population"])[:30]},
    }


def grants_summary() -> dict:
    g = read("grants.json")
    geo = {f["properties"]["kshId"]: f["geometry"]["coordinates"]
           for f in read("geo/settlements.geojson")["features"]}
    out = {"sourceUrl": g["sourceUrl"], "kinds": {}}
    for kind, k in g["kinds"].items():
        points = []
        for w in k["winners"]:
            lon, lat = geo.get(w["kshId"], (None, None))
            points.append({"year": w["year"], "programme": w["programme"],
                           "settlement": w["settlement"], "county": w["county"],
                           "district": w["district"], "contract": w["contract"],
                           "status": w["status"], "matchedBy": w["matchedBy"],
                           "vacantSince": w["vacantSince"], "lat": lat, "lon": lon})
        out["kinds"][kind] = {key: k[key] for key in ("latestMonth", "years", "byProgrammeYear",
                                                      "byCounty", "total", "comparison")}
        out["kinds"][kind]["winners"] = points
    return out


def forecast_summary() -> dict:
    f = read("forecast.json")
    keep = ("districts", "vacantNow", "expectedNew", "expectedRefills", "vacantIn12",
            "vacantIn12Band", "rateNow", "rateIn12")
    return {"horizonMonths": f["horizonMonths"], "kinds": {
        kind: {
            "month": k["month"], "national": k["national"],
            "counties": {n: {**{x: c[x] for x in keep}, "path": c["path"]}
                         for n, c in k["counties"].items()},
            "districts": {n: {x: d[x] for x in keep} for n, d in k["districts"].items()},
            "backtest": k["backtest"], "riskValidation": k["riskValidation"],
        } for kind, k in f["kinds"].items()}}


def build() -> dict:
    latest = read("latest.json")
    data_month = latest.get("month") or latest["kinds"]["gp"]["month"]
    rows = district_rows()
    mortality = read("mortality.json")
    territorial = read("territorial.json")
    jobs = read("jobseekers.json")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": data_month,
        "sources": {
            "mortality": {"year": mortality["year"], "url": mortality["sourceUrl"]},
            "territorial": {"years": territorial["years"], "incomeYear": INCOME_YEAR,
                            "url": territorial["sourceUrl"]},
            "jobseekers": {"latest": jobs["latest"], "first": jobs["months"][0],
                           "url": jobs["sourceUrl"]},
            "census": {"year": 2022, "url": read("census.json")["sourceUrl"]},
        },
        "smoothYears": list(SMOOTH_YEARS),
        "districts": rows,
        "counties": county_rows(),
        "correlations": correlations(rows),
        "grid": {"avoidable": grid(rows, "avoidable"), "amenable": grid(rows, "amenable")},
        "series": series(),
        "cross": cross_readings(data_month),
        "emergency": emergency(rows),
        "grants": grants_summary(),
        "forecast": forecast_summary(),
        "census": {"year": 2022, "country": read("census.json")["country"]},
    }


if __name__ == "__main__":
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}: {len(out['districts'])} járás, "
          f"{len(out['correlations']['pairs'])} pairs")
