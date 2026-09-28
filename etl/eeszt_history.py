"""Who operated a district, and when it changed hands.

The financing register that links a FIN code to an organisational unit is
not versioned — it only ever shows today. The licence register is: the same
REST endpoint takes a `snapshotDate` in milliseconds and answers with the
register as it stood that day, back to about 2024. That is enough to ask a
question the site could not ask before — how often a district changes the
company operating it, and when.

Two things the snapshot mode does that have to be handled, both verified
rather than assumed:

  * It returns the edit history of each licence rather than one row per
    licence: in a sample page, 347 licence ids arrived as 500 rows, and the
    duplicates differed only in the spelling of the premises address
    ("Rókus  utca 10. " against "Rókus utca 10. alapell ajtó"). So rows are
    folded per licence id.
  * The provider behind an organisational unit was unambiguous in every
    sampled unit, and the guard below fails if that stops being true.

What is compared is therefore the unit -> provider mapping at each date.
Because the FIN -> unit link is not versioned, a district is followed
through the unit it uses *today*: a change of unit before the snapshot
window is invisible, and the output says so.

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
# the window the register answers for; earlier dates come back empty
DATES = ["2024-01-15", "2024-07-15", "2025-01-15", "2025-07-15",
         "2026-01-15", "2026-07-15"]
# the snapshot queries are heavy server-side, and the cost is per request
# rather than per row: 500 rows take 3.9 s, 5000 take 8.0 s, so a snapshot
# drops from three quarters of an hour to five minutes
PAGE = 5000


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
    for date in DATES:
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

    # which praxis uses which unit — today's link, the only one published
    fx, fin = load("neak_finszolg", date)
    praxis_of_unit: dict[str, list[dict]] = collections.defaultdict(list)
    for r in fin:
        unit = r[fx["NNGYK9_KOD"]]
        if unit:
            praxis_of_unit[unit].append({
                "fin": r[fx["FINKOD"]], "type": r[fx["TIP"]],
                "county": r[fx["MEGYE"]], "institution": r[fx["INEV"]] or "",
            })

    providers_path = ROOT / "data" / "providers.json"
    provider_name: dict[str, str] = {}
    if providers_path.exists():
        for p in json.loads(providers_path.read_text(encoding="utf-8"))["providers"]:
            if p.get("euszolgId"):
                provider_name[p["euszolgId"]] = (p.get("officialName")
                                                 or p.get("neakName") or "")

    changes: list[dict] = []
    for unit, praxes in praxis_of_unit.items():
        seen: list[tuple[str, str]] = []
        for snap in snapshots:
            entry = snap["units"].get(unit)
            if not entry:
                continue
            if not seen or seen[-1][1] != entry["provider"]:
                seen.append((snap["date"], entry["provider"]))
        if len(seen) < 2:
            continue
        for (before_date, before), (after_date, after) in zip(seen, seen[1:]):
            changes.append({
                "unit": unit,
                "from": before,
                "fromName": provider_name.get(before, ""),
                "to": after,
                "toName": provider_name.get(after, ""),
                "between": [before_date, after_date],
                "praxes": praxes,
            })

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "snapshots": [{"date": s["date"], "rows": s["rows"],
                       "units": len(s["units"]), "licences": s["licences"],
                       "ambiguous": len(s["ambiguous"])} for s in snapshots],
        "stats": summarise(changes, snapshots, praxis_of_unit),
        "changes": sorted(changes, key=lambda c: c["between"][1]),
    }
    guard(out)
    return out


def summarise(changes: list[dict], snapshots: list[dict],
              praxis_of_unit: dict[str, list[dict]]) -> dict:
    by_type: collections.Counter = collections.Counter()
    districts = set()
    for change in changes:
        for praxis in change["praxes"]:
            by_type[praxis["type"]] += 1
            districts.add(praxis["fin"])
    return {
        "from": snapshots[0]["date"],
        "to": snapshots[-1]["date"],
        "snapshots": len(snapshots),
        "unitsFollowed": len(praxis_of_unit),
        "changes": len(changes),
        "unitsChanged": len({c["unit"] for c in changes}),
        "districtsAffected": len(districts),
        "byType": dict(by_type.most_common()),
    }


def guard(out: dict) -> None:
    snapshots = out["snapshots"]
    if len(snapshots) < 3:
        raise EesztError("a timeline needs at least three points")
    for snap in snapshots:
        if snap["units"] < 20000:
            raise EesztError(f"{snap['date']}: only {snap['units']} units — "
                             "the snapshot looks truncated")
        # the whole method rests on one provider per unit at a given date
        if snap["ambiguous"] > snap["units"] * 0.02:
            raise EesztError(f"{snap['date']}: {snap['ambiguous']} units name more "
                             "than one provider; the fold is no longer safe")
    dates = [s["date"] for s in snapshots]
    if dates != sorted(dates):
        raise EesztError("the snapshots are not in date order")
    for change in out["changes"]:
        if change["from"] == change["to"]:
            raise EesztError(f"{change['unit']}: a change with no change")
        if not change["praxes"]:
            raise EesztError(f"{change['unit']}: a change with no district")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true",
                        help="download the snapshots that are not archived yet")
    args = parser.parse_args()
    out = build(fetch=args.fetch)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT}: {st['changes']} operator changes on "
          f"{st['unitsChanged']} units between {st['from']} and {st['to']}")
    print(f"  districts affected: {st['districtsAffected']} "
          + ", ".join(f"{k}: {v}" for k, v in st["byType"].items()))


if __name__ == "__main__":
    main()
