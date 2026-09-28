"""Since when has a district worked under its current arrangement?

The financing register that links a FIN code to an organisational unit is
not versioned — it only ever shows today. The licence register is: the same
REST endpoint takes a `snapshotDate` in milliseconds and answers with the
register as it stood that day, back to about 2024.

The first thing that was worth learning from those snapshots is what they
do *not* show. Comparing 2024-01 with 2026-07: of the 81 600 organisational
units present in both, exactly **2** changed provider. The churn is in the
units themselves — 19 048 disappeared and 15 511 appeared. So a unit belongs
to its provider for good, and a change of operator shows up as a *new unit*,
not as a new provider on the old one. Since the FIN -> unit link has no
history, the question "who operated this district in 2024" cannot be
answered from public data, and this module does not pretend otherwise.

What the snapshots do answer, district by district: **since when the unit it
works under today has existed**. A unit that first appears in the 2025-07
snapshot means the current arrangement is at most that old — which is as
close to "when did this district change hands" as the published record
allows. Units already present in the first snapshot are reported as "before
2024-01", not as a date.

Two properties of the snapshot mode, verified rather than assumed:

  * It returns the edit history of each licence rather than one row per
    licence: in a sample page, 347 licence ids arrived as 500 rows, and the
    duplicates differed only in the spelling of the premises address. So
    rows are folded per unit.
  * The provider behind a unit was unambiguous in every snapshot (0 of
    ~100 000), and the guard fails if that stops being true.

Snapshots are archived as digests under data/raw/eeszt/history/, not as
full registers — 150k rows a date would be 25 MB of duplicated text.

Usage:
  python etl/eeszt_history.py --fetch      # download the missing snapshots
  python etl/eeszt_history.py              # build from what is archived
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import gzip
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_eeszt import EesztError, latest_date, load

ROOT = Path(__file__).resolve().parent.parent
HISTORY_DIR = ROOT / "data" / "raw" / "eeszt" / "history"
OUT = ROOT / "data" / "licence_history.json"
SCHEMA_VERSION = 1

BASE = ("https://www.eeszt.gov.hu/torzspublikacio-portlet/rest/"
        "torzsvizualizacio/getEntity")
ENTITY = "EUSZOLG_ENGEDELY_PUBLIKUS.EUSZOLG_ENGEDELY_PUBLIKUS.M"
HEADERS = {"User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/128.0 Safari/537.36")}
# the window the register answers for: earlier dates come back empty, and the
# list extends itself every half year so the timeline keeps growing without
# anyone editing it
FIRST_YEAR = 2024
SNAPSHOT_DAYS = ((1, 15), (7, 15))
# the snapshot queries are heavy server-side, and the cost is per request
# rather than per row: 500 rows take 3.9 s, 5000 take 8.0 s, so a snapshot
# drops from three quarters of an hour to five minutes
PAGE = 5000


def snapshot_dates(today: dt.date | None = None) -> list[str]:
    today = today or dt.date.today()
    out = []
    for year in range(FIRST_YEAR, today.year + 1):
        for month, day in SNAPSHOT_DAYS:
            date = dt.date(year, month, day)
            if date < today:
                out.append(date.isoformat())
    return out


def epoch_ms(date: str) -> int:
    day = dt.date.fromisoformat(date)
    return int(dt.datetime(day.year, day.month, day.day,
                           tzinfo=dt.UTC).timestamp() * 1000)


def digest_path(date: str) -> Path:
    return HISTORY_DIR / f"engedely_{date}.json.gz"


def fetch_snapshot(date: str, sleep: float = 0.5) -> dict:
    """The unit -> provider map on that date, archived as a digest."""
    target = digest_path(date)
    if target.exists():
        with gzip.open(target, "rt", encoding="utf-8") as fh:
            return json.load(fh)

    print(f"  fetching {date}…", flush=True)
    units: dict[str, dict] = {}
    licences: dict[str, str] = {}
    ambiguous: set[str] = set()
    page, total, seen = 0, None, 0
    while True:
        resp = requests.get(BASE, params={
            "entityId": ENTITY, "page": page, "size": PAGE,
            "snapshotDate": epoch_ms(date),
        }, headers=HEADERS, timeout=180)
        resp.raise_for_status()
        data = resp.json()
        names = [f["fieldName"] for f in data["fieldNames"]]
        ix = {n: i for i, n in enumerate(names)}
        rows = [r["fields"] for r in data["entityRows"]]
        if total is None:
            total = data["totalRowCount"]
            if not total:
                raise EesztError(f"{date}: the register answers with no rows")
        for r in rows:
            unit = r[ix["SZERVEZETI_EGYSEG_KOD"]]
            provider = r[ix["EUSZOLG_AZONOSITO"]]
            licences[r[ix["ENGEDELY_AZONOSITO"]]] = unit
            if not unit:
                continue
            known = units.get(unit)
            if known is None:
                units[unit] = {
                    "provider": provider,
                    "settlement": r[ix["TELEPHELY_TELEPULES"]] or "",
                    "professions": [r[ix["SZAKMA_KOD"]] or ""],
                }
            else:
                if known["provider"] != provider:
                    ambiguous.add(unit)
                if r[ix["SZAKMA_KOD"]] not in known["professions"]:
                    known["professions"].append(r[ix["SZAKMA_KOD"]] or "")
        seen += len(rows)
        page += 1
        print(f"    {date}: {seen}/{total}", flush=True)
        if seen >= total or not rows:
            break
        time.sleep(sleep)

    out = {
        "date": date,
        "rows": total,
        "licences": len(licences),
        "units": units,
        "ambiguous": sorted(ambiguous),
    }
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(target, "wt", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False)
    print(f"    {date}: {total} rows folded into {len(units)} units, "
          f"{len(ambiguous)} ambiguous", flush=True)
    return out


def build(fetch: bool = False) -> dict:
    snapshots = []
    for date in snapshot_dates():
        if digest_path(date).exists() or fetch:
            try:
                snapshots.append(fetch_snapshot(date))
            except Exception as exc:  # noqa: BLE001 — one bad date must not sink the rest
                print(f"    WARNING {date}: {exc}")
    if len(snapshots) < 2:
        raise EesztError("fewer than two snapshots archived — run with --fetch")

    # today closes the timeline, from the register we already download
    date = latest_date()
    lx, rows = load("euszolg_engedely", date)
    today: dict[str, dict] = {}
    for r in rows:
        unit = r[lx["SZERVEZETI_EGYSEG_KOD"]]
        if unit and unit not in today:
            today[unit] = {"provider": r[lx["EUSZOLG_AZONOSITO"]],
                           "settlement": r[lx["TELEPHELY_TELEPULES"]] or ""}
    snapshots.append({"date": date, "units": today, "rows": len(rows),
                      "licences": len(rows), "ambiguous": []})
    dates = [s["date"] for s in snapshots]

    # when each unit first shows up; the earliest snapshot means "at least
    # this old", not "created then"
    first_seen: dict[str, str] = {}
    for snap in snapshots:
        for unit in snap["units"]:
            first_seen.setdefault(unit, snap["date"])

    # which praxis uses which unit — today's link, the only one published
    fx, fin = load("neak_finszolg", date)
    provider_name: dict[str, str] = {}
    providers_path = ROOT / "data" / "providers.json"
    if providers_path.exists():
        for p in json.loads(providers_path.read_text(encoding="utf-8"))["providers"]:
            if p.get("euszolgId"):
                provider_name[p["euszolgId"]] = (p.get("officialName")
                                                 or p.get("neakName") or "")

    districts: list[dict] = []
    for r in fin:
        unit = r[fx["NNGYK9_KOD"]]
        if not unit or unit not in first_seen:
            continue
        since = first_seen[unit]
        index = dates.index(since)
        districts.append({
            "fin": r[fx["FINKOD"]],
            "type": r[fx["TIP"]],
            "county": county_key(r[fx["MEGYE"]]),
            "institution": r[fx["INEV"]] or "",
            "unit": unit,
            "provider": today.get(unit, {}).get("provider", ""),
            "providerName": provider_name.get(
                today.get(unit, {}).get("provider", ""), ""),
            "settlement": today.get(unit, {}).get("settlement", ""),
            # the unit was already there in the first snapshot: older than
            # the window, and no date can be put on it
            "olderThanWindow": index == 0,
            "firstSeen": since,
            "appearedAfter": dates[index - 1] if index else "",
        })

    # how many units the register gains and loses between two dates — the
    # churn the provider comparison could not see
    churn = []
    for before, after in zip(snapshots, snapshots[1:]):
        gone = set(before["units"]) - set(after["units"])
        new = set(after["units"]) - set(before["units"])
        churn.append({"from": before["date"], "to": after["date"],
                      "left": len(gone), "arrived": len(new),
                      "carried": len(set(before["units"]) & set(after["units"]))})

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "snapshots": [{"date": s["date"], "rows": s["rows"],
                       "units": len(s["units"]), "licences": s["licences"],
                       "ambiguous": len(s["ambiguous"])} for s in snapshots],
        "churn": churn,
        "stats": summarise(districts, snapshots, churn),
        # only the services whose unit appeared inside the window are written
        # out: the other 29 000 carry no date, so a row for each of them would
        # be 9 MB of "before 2024-01"
        "districts": [d for d in districts if not d["olderThanWindow"]],
    }
    guard(out)
    return out


def county_key(name: str) -> str:
    out = (name or "").replace(" megye", "").replace(" vármegye", "").strip()
    return "Budapest" if out.startswith("Budapest") else out


def summarise(districts: list[dict], snapshots: list[dict],
              churn: list[dict]) -> dict:
    fresh = [d for d in districts if not d["olderThanWindow"]]
    by_type: collections.Counter = collections.Counter(d["type"] for d in fresh)
    by_date: collections.Counter = collections.Counter(d["firstSeen"] for d in fresh)
    return {
        "from": snapshots[0]["date"],
        "to": snapshots[-1]["date"],
        "snapshots": len(snapshots),
        "districtsFollowed": len(districts),
        "unitsOlderThanWindow": sum(1 for d in districts if d["olderThanWindow"]),
        "unitsNewerThanWindow": len(fresh),
        "newByType": dict(by_type.most_common()),
        "newByDate": dict(sorted(by_date.items())),
        "unitsLeft": sum(c["left"] for c in churn),
        "unitsArrived": sum(c["arrived"] for c in churn),
    }


def guard(out: dict) -> None:
    snapshots = out["snapshots"]
    if len(snapshots) < 3:
        raise EesztError("a timeline needs at least three points")
    for snap in snapshots:
        if snap["units"] < 20000:
            raise EesztError(f"{snap['date']}: only {snap['units']} units — "
                             "the snapshot looks truncated")
        # the whole fold rests on one provider per unit at a given date
        if snap["ambiguous"] > snap["units"] * 0.02:
            raise EesztError(f"{snap['date']}: {snap['ambiguous']} units name more "
                             "than one provider; the fold is no longer safe")
    dates = [s["date"] for s in snapshots]
    if dates != sorted(dates):
        raise EesztError("the snapshots are not in date order")

    st = out["stats"]
    if st["districtsFollowed"] < 20000:
        raise EesztError(f"only {st['districtsFollowed']} services followed")
    if st["unitsOlderThanWindow"] + st["unitsNewerThanWindow"] != st["districtsFollowed"]:
        raise EesztError("old and new units do not add up to the services")
    if len(out["districts"]) != st["unitsNewerThanWindow"]:
        raise EesztError("the published rows do not match the counted ones")
    for d in out["districts"]:
        if d["olderThanWindow"] or d["firstSeen"] == dates[0]:
            raise EesztError(f"{d['fin']}: a row without a date was published")
        if d["firstSeen"] not in dates:
            raise EesztError(f"{d['fin']}: {d['firstSeen']} is not a snapshot date")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true",
                        help="download the snapshots that are not archived yet")
    args = parser.parse_args()
    out = build(fetch=args.fetch)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT}: {st['districtsFollowed']} services followed between "
          f"{st['from']} and {st['to']}")
    print(f"  working under a unit that did not exist at the start: "
          f"{st['unitsNewerThanWindow']} ("
          + ", ".join(f"{k}: {v}" for k, v in st["newByType"].items()) + ")")
    print(f"  units the register lost: {st['unitsLeft']}, gained: {st['unitsArrived']}")


if __name__ == "__main__":
    main()
