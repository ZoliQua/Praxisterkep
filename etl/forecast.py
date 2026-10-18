"""How many districts will be vacant in twelve months.

Two analyses already on the site each answer half of the question:

  risk.json      the 12-month probability that a filled district loses its
                 doctor (a transparent hazard model, fitted on the archive)
  survival.json  how long a vacancy lasts (Kaplan–Meier, from the archive)

Put together they give a flow forecast, for the country, every county and
every járás:

  vacant in 12 months = vacant now − expected refills + expected new vacancies

  expected new       Σ pᵢ over the filled districts, pᵢ their 12-month risk
  expected refills   Σ (1 − S(eⱼ + 12) / S(eⱼ)) over the vacant ones, with eⱼ
                     the months the vacancy has lasted and S the survival
                     curve of its county (the national curve where the county
                     has fewer than MIN_COUNTY_SPELLS spells). A vacancy older
                     than the curve reaches is given no further chance of
                     refilling: a guess either way would be invented.

Per settlement the forecast is turned into one probability a reader can
hold: that in twelve months at least one district serving the settlement
has no contracted doctor,

  P = 1 − Π (1 − pᵢ) · Π qⱼ

over the filled districts i that serve it and the vacant ones j, with qⱼ
the chance the vacancy has filled by then. A GP district counts for every
settlement on its served list (a village's risk is its district's, wherever
the surgery sits); a dental one for its seat, the only place NEAK names. It
is said of the settlement, never of a named doctor's district, and the
count of serving districts in the country's riskiest tenth goes with it.

The band around each number treats the districts as independent coin flips
(variance Σ p(1 − p)); districts are not independent — a doctor who retires
from two districts empties both — so the band is narrower than the truth and
the page says so.

Back-test. The same arithmetic is run from the archived month nearest to a
year before the latest one and held against what the archive shows happened
next. It is not a clean out-of-sample test: the survival curve was fitted on
data that includes that year. It shows whether the forecast is of the right
size, and its error is published with it.

Usage:
  python etl/forecast.py
"""
from __future__ import annotations

import collections
import json
import math
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError
from parse_ksh import load_reference

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "forecast.json"
SCHEMA_VERSION = 1

HORIZON = 12
MIN_COUNTY_SPELLS = 60
Z90 = 1.645


def _bare(text: str) -> str:
    """"Gyor" and "Győr" are one town: NEAK's dental list drops ő and ű."""
    return "".join(ch for ch in unicodedata.normalize("NFD", text.casefold())
                   if unicodedata.category(ch) != "Mn")


def read(name: str) -> dict:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def month_index(month: str) -> int:
    y, m = map(int, month.split("-"))
    return y * 12 + m - 1


def survival_at(points: list[dict], month: int) -> float:
    """S(month); beyond the curve's end it stays at its last value."""
    if month <= 0:
        return 1.0
    if month >= len(points):
        return points[-1]["survival"]
    return points[month]["survival"]


def refill_chance(points: list[dict], elapsed: int, horizon: int = HORIZON) -> float:
    s_now = survival_at(points, elapsed)
    if s_now <= 0:
        return 0.0
    return max(0.0, 1.0 - survival_at(points, elapsed + horizon) / s_now)


def band(expected: float, variance: float) -> list[float]:
    half = Z90 * math.sqrt(variance)
    return [round(max(0.0, expected - half), 1), round(expected + half, 1)]


class Tally:
    """Expected flows for one area."""

    def __init__(self) -> None:
        self.filled = 0
        self.vacant = 0
        self.new = self.new_var = 0.0
        self.refill = self.refill_var = 0.0
        self.path_new = [0.0] * (HORIZON + 1)
        self.path_refill = [0.0] * (HORIZON + 1)

    def add_filled(self, p: float) -> None:
        self.filled += 1
        self.new += p
        self.new_var += p * (1 - p)
        # the same 12-month risk spread evenly over the months as a hazard
        for t in range(HORIZON + 1):
            self.path_new[t] += 1 - (1 - p) ** (t / HORIZON)

    def add_vacant(self, points: list[dict], elapsed: int) -> None:
        self.vacant += 1
        q = refill_chance(points, elapsed)
        self.refill += q
        self.refill_var += q * (1 - q)
        for t in range(HORIZON + 1):
            self.path_refill[t] += refill_chance(points, elapsed, t)

    def out(self) -> dict:
        expected = self.vacant - self.refill + self.new
        total = self.filled + self.vacant
        return {
            "districts": total,
            "vacantNow": self.vacant,
            "expectedNew": round(self.new, 1),
            "expectedNewBand": band(self.new, self.new_var),
            "expectedRefills": round(self.refill, 1),
            "expectedRefillsBand": band(self.refill, self.refill_var),
            "vacantIn12": round(expected, 1),
            "vacantIn12Band": band(expected, self.new_var + self.refill_var),
            "rateNow": round(self.vacant / total, 4) if total else None,
            "rateIn12": round(expected / total, 4) if total else None,
            "path": [round(self.vacant - r + n, 1)
                     for n, r in zip(self.path_new, self.path_refill, strict=True)],
        }


def curves_for(kind_survival: dict) -> tuple[list[dict], dict[str, list[dict]]]:
    overall = kind_survival["overall"]["points"]
    by_county = {c["key"]: c["points"] for c in kind_survival["byCounty"]
                 if c["spells"] >= MIN_COUNTY_SPELLS}
    return overall, by_county


def backtest(kind: str, kind_survival: dict, risk_kind: dict, latest: str) -> dict | None:
    """The refill and new-vacancy arithmetic run from the past, against the archive.

    The archive is not monthly-dense, so the test runs between two archived
    months 10–14 months apart (the latest such pair) and the horizon is that
    gap exactly, not a rounded year.
    """
    months = kind_survival["months"]
    pairs = [(a, b) for a in months for b in months
             if 10 <= month_index(b) - month_index(a) <= 14]
    if not pairs:
        return None
    ref, until = max(pairs, key=lambda p: (month_index(p[0]), -abs(month_index(p[1])
                                                                   - month_index(p[0]) - 12)))
    ref_i, end_i = month_index(ref), month_index(until)
    horizon = end_i - ref_i
    overall, by_county = curves_for(kind_survival)
    spells = kind_survival["spells"]
    open_at = [s for s in spells if month_index(s["start"]) <= ref_i
               and (s["end"] is None or month_index(s["end"]) > ref_i)]
    predicted_refill = sum(
        refill_chance(by_county.get(s["county"], overall),
                      ref_i - month_index(s["start"]), horizon)
        for s in open_at)
    actual_refill = sum(1 for s in open_at
                        if s["end"] is not None and month_index(s["end"]) <= end_i)
    # new vacancies: the model's base rate on today's filled districts as the
    # stock — the closest the archive comes to the filled stock back then
    started = sum(1 for s in spells if ref_i < month_index(s["start"]) <= end_i)
    base = 1 - (1 - risk_kind["baseHazard12"]) ** (horizon / HORIZON)
    predicted_new = len(risk_kind["rows"]) * base
    return {
        "from": ref, "to": until, "months": horizon,
        "openAtStart": len(open_at),
        "refillsPredicted": round(predicted_refill, 1), "refillsActual": actual_refill,
        "newPredicted": round(predicted_new, 1), "newActual": started,
        "note": "survival curve fitted on data that includes the test period",
    }


TOP_DECILE = 0.9


def settlement_forecast(kind: str, snapshot: dict, risk_kind: dict, open_spells: list[dict],
                        where: dict, by_county: dict, overall: list[dict], month: str,
                        ksh) -> dict[str, dict]:
    """{kshId: districts serving it, vacant now, P(≥1 vacant in 12 months), …}."""
    def ids(names) -> list[str]:
        out = []
        for n in names:
            hit = ksh.lookup(n) if n else None
            if hit and hit["kshId"] not in out:
                out.append(hit["kshId"])
        return out

    served: dict[str, list[str]] = {}
    for f in snapshot.get("filledPraxes") or []:
        names = (f.get("servedSettlements") or []) if kind == "gp" else []
        served[f["id"]] = ids(names or [f.get("settlement", "")])
    for p in snapshot.get("praxes", []):
        names = (p.get("servedSettlements") or []) if kind == "gp" else []
        served[p["id"]] = ids(names or [s.get("settlement", "") for s in p.get("sites", [])][:1])

    risks = sorted(r["risk"] for r in risk_kind["rows"])
    cut = risks[int(TOP_DECILE * (len(risks) - 1))] if risks else 1.0
    acc: dict[str, dict] = {}

    def slot(k: str) -> dict:
        return acc.setdefault(k, {"districts": 0, "vacantNow": 0, "expectedNew": 0.0,
                                  "expectedRefills": 0.0, "pNone": 1.0, "topDecile": 0})

    missing = 0
    for r in risk_kind["rows"]:
        places = served.get(r["fin"])
        if not places:
            missing += 1
            continue
        for k in places:
            a = slot(k)
            a["districts"] += 1
            a["expectedNew"] += r["risk"]
            a["pNone"] *= 1 - r["risk"]
            a["topDecile"] += r["risk"] >= cut
    for sp in open_spells:
        places = served.get(sp["fin"])
        if not places:
            missing += 1
            continue
        county, _settlement = where[sp["fin"]]
        q = refill_chance(by_county.get(county, overall),
                          month_index(month) - month_index(sp["start"]))
        for k in places:
            a = slot(k)
            a["districts"] += 1
            a["vacantNow"] += 1
            a["expectedRefills"] += q
            a["pNone"] *= q
    if missing > (len(risk_kind["rows"]) + len(open_spells)) * 0.01:
        raise ParseError(f"{kind}: {missing} districts serve no settlement we can place")
    return {k: {"districts": a["districts"], "vacantNow": a["vacantNow"],
                "vacantIn12": round(a["vacantNow"] - a["expectedRefills"] + a["expectedNew"], 2),
                "expectedNew": round(a["expectedNew"], 2),
                "expectedRefills": round(a["expectedRefills"], 2),
                "pAnyVacant": round(1 - a["pNone"], 3), "topDecile": a["topDecile"]}
            for k, a in sorted(acc.items())}


def build() -> dict:
    risk = read("risk.json")
    survival = read("survival.json")
    latest = read("latest.json")
    ksh = load_reference()
    if ksh is None:
        raise ParseError("the KSH gazetteer is missing; run the pipeline first")
    district_of = {(e["county"], e["name"]): e["district"] for e in ksh.entries}
    by_bare: dict[str, set[str]] = collections.defaultdict(set)
    by_bare_county: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    for e in ksh.entries:
        by_bare[_bare(e["name"])].add(e["district"])
        by_bare_county[(e["county"], _bare(e["name"]))].add(e["district"])

    out_kinds = {}
    for kind in ("gp", "dental"):
        risk_kind = risk["kinds"][kind]
        surv_kind = survival["kinds"][kind]
        overall, by_county = curves_for(surv_kind)
        snapshot = latest["kinds"][kind]
        month = snapshot["month"]
        # where a vacant district is: from this month's list, not from the
        # spell, which carries the spelling of the month it was first seen
        where = {p["id"]: (p["county"], ((p.get("sites") or [{}])[0]).get("settlement", ""))
                 for p in snapshot["praxes"]}
        vacant_now = set(where)

        national = Tally()
        counties: dict[str, Tally] = collections.defaultdict(Tally)
        districts: dict[str, Tally] = collections.defaultdict(Tally)
        unplaced = 0

        def place(county: str, settlement: str) -> str | None:
            hit = district_of.get((county, settlement))
            if hit:
                return hit
            # the source's misspelling, or the right town under the wrong
            # county — only where the folded name leaves a single járás
            for options in (by_bare_county.get((county, _bare(settlement))),
                            by_bare.get(_bare(settlement))):
                if options and len(options) == 1:
                    return next(iter(options))
            return None

        for r in risk_kind["rows"]:
            p = r["risk"]
            for t in (national, counties[r["county"]]):
                t.add_filled(p)
            d = place(r["county"], r["settlement"])
            if d:
                districts[d].add_filled(p)
            else:
                unplaced += 1
        open_spells = [s for s in surv_kind["spells"]
                       if s["end"] is None and s["fin"] in vacant_now]
        if len(open_spells) != len(vacant_now):
            raise ParseError(f"{kind}: {len(open_spells)} open vacancy spells for "
                             f"{len(vacant_now)} vacant districts")
        for s in open_spells:
            county, settlement = where[s["fin"]]
            curve = by_county.get(county, overall)
            elapsed = month_index(month) - month_index(s["start"])
            for t in (national, counties[county]):
                t.add_vacant(curve, elapsed)
            d = place(county, settlement)
            if d:
                districts[d].add_vacant(curve, elapsed)
            else:
                unplaced += 1
        if unplaced > (len(risk_kind["rows"]) + len(open_spells)) * 0.01:
            raise ParseError(f"{kind}: {unplaced} districts could not be placed in a járás")

        settlements = settlement_forecast(kind, snapshot, risk_kind, open_spells, where,
                                          by_county, overall, month, ksh)

        out_kinds[kind] = {
            "month": month,
            "national": national.out(),
            "counties": {c: t.out() for c, t in sorted(counties.items())},
            "districts": {d: t.out() for d, t in sorted(districts.items())},
            "settlements": settlements,
            "countyCurves": sorted(by_county),
            "backtest": backtest(kind, surv_kind, risk_kind, month),
            "riskValidation": risk_kind.get("validation"),
        }
    out = {"schemaVersion": SCHEMA_VERSION, "horizonMonths": HORIZON, "kinds": out_kinds}
    guard(out)
    return out


def guard(out: dict) -> None:
    for kind, k in out["kinds"].items():
        n = k["national"]
        if not 0 <= n["vacantIn12"] <= n["districts"]:
            raise ParseError(f"{kind}: forecast {n['vacantIn12']} outside 0..{n['districts']}")
        counties = sum(c["vacantNow"] for c in k["counties"].values())
        if counties != n["vacantNow"]:
            raise ParseError(f"{kind}: counties hold {counties} vacancies, "
                             f"the country {n['vacantNow']}")
        if len(k["counties"]) != 20:
            raise ParseError(f"{kind}: {len(k['counties'])} counties in the forecast")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}")
    for kind, k in out["kinds"].items():
        n = k["national"]
        print(f"  {kind}: {n['vacantNow']} vacant now -> {n['vacantIn12']} "
              f"{n['vacantIn12Band']} in 12 months "
              f"(+{n['expectedNew']} new, −{n['expectedRefills']} refilled)")
        print(f"    back-test: {k['backtest']}")


if __name__ == "__main__":
    main()
