"""What changed: the vacancy lists held against each other, month by month
and year by year.

The map shows one month. The archive holds forty of them, and between any
two the same FIN codes can be followed: which districts fell vacant, which
were filled, which went onto the dissolved list or left the registry
altogether. That is what the "Mi változott?" part of elemzo.html shows, for
both branches:

  * **month by month** inside the current year — every pair of consecutive
    archived months, starting from the last month of the previous year;
  * **year by year** — the last archived month of each year against the
    previous one, and the first of them against the latest.

What the counts mean, precisely:

  * a district is **vacant** when the month's vacancy list says so (status
    vacant or vacant_longterm) — the dissolved list is counted separately,
    exactly as on the map;
  * between two snapshots, vacantTo = vacantFrom − ended + newVacant, by FIN
    code. A district that fell vacant and was filled again between two
    snapshots is invisible: the archive is not evenly spaced, and the number
    of months each pair spans travels with it;
  * where a vacancy went (filled, dissolved list, left the registry) needs
    the later month's registry, and where a new one came from needs the
    earlier month's. Snapshots built from the vacancy list alone, and dental
    months archived before the dissolved list was parsed, cannot say: those
    districts are counted as unknown, never guessed;
  * physician changes in filled districts are copied from fluctuation.json
    where it covers exactly the same pair of months.

Names are not read: the lists carry FIN code, county, settlement and
population only.

Output: data/changes.json

Usage:
  python etl/changes.py
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import tenure
from fluctuation import county_key
from parse_dental import ParseError

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "changes.json"
FLUCTUATION = ROOT / "data" / "fluctuation.json"
SCHEMA_VERSION = 1
KINDS = ("gp", "dental")
TYPES = ("adult", "child", "mixed", "school")


def months_between(a: str, b: str) -> int:
    return (int(b[:4]) - int(a[:4])) * 12 + int(b[5:7]) - int(a[5:7])


def settlement_of(rec: dict) -> str:
    if rec.get("settlement"):
        return rec["settlement"]
    sites = rec.get("sites") or []
    return sites[0].get("settlement", "") if sites else ""


class Month:
    """One archived snapshot, reduced to what a comparison needs."""

    def __init__(self, month: str, snap: dict):
        self.month = month
        praxes = snap["praxes"]
        self.vacant = {p["id"]: p for p in praxes if p["status"].startswith("vacant")}
        self.dissolved = {p["id"]: p for p in praxes if p["status"] == "dissolved"}
        self.filled = {p["id"]: p for p in snap.get("filledPraxes") or []}
        nat = snap["national"]
        if nat["vacant"] != len(self.vacant):
            raise ParseError(f"{snap['kind']} {month}: national says {nat['vacant']} vacant, "
                             f"the list holds {len(self.vacant)}")
        # what this month can answer: a month rebuilt from the vacancy list
        # alone has no registry, and the dental dissolved list was not parsed
        # in every archived month (it has never really been empty)
        self.has_registry = bool(self.filled)
        self.has_dissolved = snap["kind"] == "gp" or bool(self.dissolved)
        self.total = nat.get("totalDistricts")
        self.population = nat.get("populationVacant")
        self.long_term = nat.get("longTerm")
        self.by_type = collections.Counter(p.get("type") for p in self.vacant.values())

    def known(self, fin: str) -> bool:
        return fin in self.vacant or fin in self.dissolved or fin in self.filled


def entry(fin: str, rec: dict, how: str) -> dict:
    return {"id": fin, "settlement": settlement_of(rec), "county": county_key(rec.get("county", "")),
            "population": rec.get("population"), "how": how}


def compare(a: Month, b: Month, doctor_changes: dict, with_lists: bool) -> dict:
    flows = collections.Counter()
    counties: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    new_list, ended_list = [], []

    for fin, rec in a.vacant.items():
        county = county_key(rec.get("county", ""))
        counties[county]["vacantFrom"] += 1
        if fin in b.vacant:
            flows["stillVacant"] += 1
            continue
        if fin in b.filled:
            how = "filled"
        elif fin in b.dissolved:
            how = "toDissolved"
        elif b.has_registry and b.has_dissolved:
            how = "leftRegistry"
        else:
            how = "unknownFate"
        flows["ended"] += 1
        flows[how] += 1
        counties[county]["ended"] += 1
        if with_lists:
            ended_list.append(entry(fin, rec, how))

    for fin, rec in b.vacant.items():
        county = county_key(rec.get("county", ""))
        counties[county]["vacantTo"] += 1
        if fin in a.vacant:
            continue
        if fin in a.filled:
            how = "fromFilled"
        elif fin in a.dissolved:
            how = "fromDissolved"
        elif a.has_registry and a.has_dissolved:
            how = "newDistrict"
        else:
            how = "unknownOrigin"
        flows["newVacant"] += 1
        flows[how] += 1
        counties[county]["newVacant"] += 1
        if with_lists:
            new_list.append(entry(fin, rec, how))

    out = {
        "from": a.month, "to": b.month, "months": months_between(a.month, b.month),
        "vacantFrom": len(a.vacant), "vacantTo": len(b.vacant),
        "populationFrom": a.population, "populationTo": b.population,
        "totalFrom": a.total, "totalTo": b.total,
        "longTermFrom": a.long_term, "longTermTo": b.long_term,
        "dissolvedFrom": len(a.dissolved) if a.has_dissolved else None,
        "dissolvedTo": len(b.dissolved) if b.has_dissolved else None,
        "known": {"registryFrom": a.has_registry, "registryTo": b.has_registry,
                  "dissolvedFrom": a.has_dissolved, "dissolvedTo": b.has_dissolved},
        "flows": {k: flows.get(k, 0) for k in (
            "stillVacant", "ended", "filled", "toDissolved", "leftRegistry", "unknownFate",
            "newVacant", "fromFilled", "fromDissolved", "newDistrict", "unknownOrigin")},
        "doctorChanges": doctor_changes.get((a.month, b.month)),
        "byType": {t: [a.by_type.get(t, 0), b.by_type.get(t, 0)] for t in TYPES
                   if a.by_type.get(t) or b.by_type.get(t)},
        "counties": [{"county": c, **{k: v.get(k, 0) for k in ("vacantFrom", "vacantTo", "newVacant", "ended")}}
                     for c, v in sorted(counties.items())],
    }
    if with_lists:
        key = lambda e: (-(e["population"] or 0), e["settlement"])
        out["newList"] = sorted(new_list, key=key)
        out["endedList"] = sorted(ended_list, key=key)
    return out


def build() -> dict:
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    data_month = latest["month"]
    year = data_month[:4]
    fluct = json.loads(FLUCTUATION.read_text(encoding="utf-8"))

    out: dict = {"schemaVersion": SCHEMA_VERSION, "dataMonth": data_month, "year": year, "kinds": {}}
    for kind in KINDS:
        held = [m for m in tenure.months() if m <= data_month]
        snaps = {m: Month(m, s) for m in held if (s := tenure.snapshot(m, kind)) is not None}
        months = sorted(snaps)
        if not months or months[-1] != data_month:
            raise ParseError(f"{kind}: the archive does not reach {data_month}")
        doctor_changes = {(i["from"], i["to"]): i["changes"]
                          for i in fluct["kinds"][kind]["intervals"]}

        # month by month: the current year, from the last month before it
        in_year = [m for m in months if m[:4] == year]
        before = [m for m in months if m[:4] < year]
        chain = before[-1:] + in_year
        monthly = [compare(snaps[x], snaps[y], doctor_changes, True)
                   for x, y in zip(chain, chain[1:])]

        # year by year: the last archived month of each year
        year_end: dict[str, str] = {}
        for m in months:
            year_end[m[:4]] = m
        ends = [year_end[y] for y in sorted(year_end)]
        yearly = [compare(snaps[x], snaps[y], doctor_changes, False)
                  for x, y in zip(ends, ends[1:])]
        span = compare(snaps[ends[0]], snaps[ends[-1]], doctor_changes, False)

        out["kinds"][kind] = {
            "months": months,
            "years": [{"year": y, "month": year_end[y], "partial": year_end[y][:4] == year
                       and year_end[y] != f"{year}-12",
                       "vacant": len(snaps[year_end[y]].vacant),
                       "total": snaps[year_end[y]].total,
                       "population": snaps[year_end[y]].population,
                       "longTerm": snaps[year_end[y]].long_term}
                      for y in sorted(year_end)],
            "monthly": monthly,
            "yearly": yearly,
            "span": span,
        }
    guard(out)
    return out


def guard(out: dict) -> None:
    for kind in KINDS:
        k = out["kinds"][kind]
        if not k["monthly"]:
            raise ParseError(f"{kind}: no month-to-month comparison in {out['year']}")
        for pair in k["monthly"] + k["yearly"] + [k["span"]]:
            f, where = pair["flows"], f"{kind} {pair['from']} -> {pair['to']}"
            if pair["months"] <= 0:
                raise ParseError(f"{where}: not a step forward")
            if pair["vacantFrom"] - f["ended"] + f["newVacant"] != pair["vacantTo"]:
                raise ParseError(f"{where}: the flows do not add up to the change")
            if f["stillVacant"] + f["ended"] != pair["vacantFrom"]:
                raise ParseError(f"{where}: still vacant + ended is not the start")
            if f["filled"] + f["toDissolved"] + f["leftRegistry"] + f["unknownFate"] != f["ended"]:
                raise ParseError(f"{where}: the ended districts do not add up")
            if f["fromFilled"] + f["fromDissolved"] + f["newDistrict"] + f["unknownOrigin"] != f["newVacant"]:
                raise ParseError(f"{where}: the new vacancies do not add up")
            for key, total in (("vacantFrom", pair["vacantFrom"]), ("vacantTo", pair["vacantTo"]),
                               ("newVacant", f["newVacant"]), ("ended", f["ended"])):
                if sum(c[key] for c in pair["counties"]) != total:
                    raise ParseError(f"{where}: counties do not add up to the country ({key})")
            if "newList" in pair and (len(pair["newList"]) != f["newVacant"]
                                      or len(pair["endedList"]) != f["ended"]):
                raise ParseError(f"{where}: the lists do not match the counts")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}:")
    for kind in KINDS:
        k = out["kinds"][kind]
        for p in k["monthly"]:
            f = p["flows"]
            print(f"  {kind} {p['from']} -> {p['to']}: {p['vacantFrom']} -> {p['vacantTo']} "
                  f"(+{f['newVacant']} / -{f['ended']}: filled {f['filled']}, "
                  f"dissolved {f['toDissolved']}, left {f['leftRegistry']}, unknown {f['unknownFate']})")


if __name__ == "__main__":
    main()
