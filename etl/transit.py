"""Can you get there by bus? Scheduled public transport to where care is.

Driving time (traveltime.py) answers the question for a household with a
car. In the villages this site keeps pointing at, that is exactly the
assumption one cannot make: the people most likely to need a GP are the
least likely to drive to one. So this module asks the other question — is
there a scheduled bus at all, how many departures are there on an ordinary
weekday, and does any of them go, without a change, to the settlement where
the nearest surgery, on-call point or hospital is.

Source: the national Volánbusz GTFS feed (MÁV Személyszállítási Zrt., via
KTI, CC0), rebuilt daily, ~100 MB, downloaded into data/raw/gtfs/ and not
committed. It carries 61 agencies: the intercity coach network plus the
sixty town networks Volánbusz runs under contract.

What it does not carry: trains. MÁV-START publishes its GTFS only on
request through a registration form, so rail is missing from this picture,
and the copy says so. It shows: Nagymaros and Budakalász come out with no
departures at all, and both are served by rail. Budapest's own network (BKK)
is a separate feed and is not loaded either, so the capital's 23 districts
are left out of these figures rather than reported as unserved.

Three things the feed forces:

  * calendar.txt is a decoy. Every one of its 580 rows has all seven
    weekdays set to 0; the running days live in calendar_dates.txt as
    additive exceptions. A parser that reads calendar.txt alone finds no
    service at all.
  * Stops are named "<Settlement>, <local name>", which is how a stop is
    matched to a settlement — on the first comma only, because
    "Abaújlak, Szanticska, bejárati út" is a hamlet of Abaújlak. Stops
    without a prefix fall back to the nearest settlement centre.
  * Stops come as parent stations and platforms; departures are counted per
    trip, not per platform, or every bus is counted three times.

"No direct bus" is not "unreachable": a change in the district seat may well
work, and this module does not model changes. It measures direct service,
which is the thing an elderly patient can actually use.

Usage:
  python etl/transit.py [--fetch]
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import io
import json
import math
import statistics
import sys
import zipfile
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

import centroids
from parse_dental import ParseError
from parse_ksh import load_reference, normalize_settlement

ROOT = Path(__file__).resolve().parent.parent
GTFS_DIR = ROOT / "data" / "raw" / "gtfs"
OUT = ROOT / "data" / "transit.json"
SCHEMA_VERSION = 1

FEED_URL = "https://gtfs.kti.hu/public-gtfs/volanbusz_gtfs.zip"
FEED_NAME = "volanbusz_gtfs.zip"
HEADERS = {"User-Agent": "Praxisterkep/1.0 (+https://github.com/ZoliQua/OEP-Alapellatas)"}
# a stop without a settlement prefix is attached to the nearest centre, but
# only if it is genuinely close to one
MAX_STOP_KM = 6.0
# the layers of traveltime.json whose destination settlement we test against
TARGETS = ("gp", "oncall", "inpatient")
EARTH_KM = 6371.0088


def fetch(force: bool = False) -> Path:
    GTFS_DIR.mkdir(parents=True, exist_ok=True)
    target = GTFS_DIR / FEED_NAME
    if target.exists() and not force:
        return target
    print(f"downloading {FEED_NAME} (about 100 MB)…")
    with requests.get(FEED_URL, headers=HEADERS, timeout=1800, stream=True) as resp:
        resp.raise_for_status()
        with target.open("wb") as fh:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                fh.write(chunk)
    return target


def read(zf: zipfile.ZipFile, name: str, **kwargs) -> pd.DataFrame:
    with zf.open(name) as fh:
        return pd.read_csv(io.TextIOWrapper(fh, encoding="utf-8"), **kwargs)


def reference_day(calendar_dates: pd.DataFrame) -> int:
    """An ordinary Wednesday inside the feed's validity window.

    Wednesday avoids both the weekend and the Monday/Friday school-transport
    peaks, and the second one in the window avoids the first days of a new
    timetable period.
    """
    days = sorted(calendar_dates["date"].unique())
    wednesdays = [d for d in days
                  if dt.date(d // 10000, d // 100 % 100, d % 100).weekday() == 2]
    if not wednesdays:
        raise ParseError("the feed has no Wednesday in its validity window")
    return wednesdays[min(1, len(wednesdays) - 1)]


def settlement_of_stops(stops: pd.DataFrame, ksh, coords: dict) -> dict[str, str]:
    """{stop_id: KSH settlement name}; the prefix first, geography after."""
    by_key = {}
    for e in ksh.entries:
        by_key.setdefault(normalize_settlement(e["name"]), e["name"])
    # Budapest's districts are separate KSH entries but one settlement here
    by_key.setdefault(normalize_settlement("Budapest"), "Budapest")

    out: dict[str, str] = {}
    unmatched: list[tuple[str, float, float]] = []
    for stop_id, name, lat, lon in zip(stops["stop_id"], stops["stop_name"],
                                       stops["stop_lat"], stops["stop_lon"]):
        prefix = str(name).split(",")[0].strip()
        hit = by_key.get(normalize_settlement(prefix))
        if hit:
            out[stop_id] = hit
        elif pd.notna(lat) and pd.notna(lon):
            unmatched.append((stop_id, float(lat), float(lon)))

    if unmatched:
        names = [e["name"] for e in ksh.entries if e["kshId"] in coords]
        lats = [coords[e["kshId"]][0] for e in ksh.entries if e["kshId"] in coords]
        lons = [coords[e["kshId"]][1] for e in ksh.entries if e["kshId"] in coords]
        for stop_id, lat, lon in unmatched:
            best_km, best = math.inf, ""
            for name, slat, slon in zip(names, lats, lons):
                km = haversine(lat, lon, slat, slon)
                if km < best_km:
                    best_km, best = km, name
            if best_km <= MAX_STOP_KM:
                out[stop_id] = best
    print(f"  {len(out)} of {len(stops)} stops attached to a settlement "
          f"({len(unmatched)} needed the map)")
    return out


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def seconds(value: str) -> int:
    """GTFS times pass 24:00:00 for trips running past midnight."""
    try:
        h, m, s = str(value).split(":")
        return int(h) * 3600 + int(m) * 60 + int(s)
    except (ValueError, AttributeError):
        return -1


def build(path: Path) -> dict:
    ksh = load_reference()
    coords = centroids.load()
    if ksh is None or not coords:
        raise ParseError("the gazetteer or the settlement centres are missing")

    travel_path = ROOT / "data" / "traveltime.json"
    if not travel_path.exists():
        raise ParseError("run etl/traveltime.py first — the targets come from it")
    travel = json.loads(travel_path.read_text(encoding="utf-8"))
    # the layer labels come from NEAK spellings ("őrbottyán"), so every
    # target is pulled back to its gazetteer name before it is compared
    canonical = {}
    for e in ksh.entries:
        canonical.setdefault(normalize_settlement(e["name"]), e["name"])
    target_of = {
        r["settlement"]: {
            layer: canonical.get(normalize_settlement(r.get(f"{layer}At", "")), "")
            for layer in TARGETS}
        for r in travel["settlements"]
    }

    with zipfile.ZipFile(path) as zf:
        feed_info = read(zf, "feed_info.txt", dtype=str)
        stops = read(zf, "stops.txt", dtype={"stop_id": str, "stop_name": str,
                                             "parent_station": str})
        calendar_dates = read(zf, "calendar_dates.txt",
                              dtype={"service_id": str, "date": int,
                                     "exception_type": int})
        day = int(reference_day(calendar_dates))
        running = set(calendar_dates.loc[
            (calendar_dates["date"] == day) & (calendar_dates["exception_type"] == 1),
            "service_id"])
        trips = read(zf, "trips.txt", dtype={"trip_id": str, "service_id": str,
                                             "route_id": str})
        trips = trips[trips["service_id"].isin(running)]
        print(f"  reference day {day}: {len(running)} services, {len(trips)} trips")
        stop_times = read(zf, "stop_times.txt",
                          usecols=["trip_id", "stop_id", "arrival_time",
                                   "departure_time", "stop_sequence"],
                          dtype={"trip_id": str, "stop_id": str,
                                 "arrival_time": str, "departure_time": str,
                                 "stop_sequence": int})

    settlement_of = settlement_of_stops(stops, ksh, coords)
    stop_times = stop_times[stop_times["trip_id"].isin(set(trips["trip_id"]))]
    stop_times = stop_times.sort_values(["trip_id", "stop_sequence"])
    print(f"  {len(stop_times)} stop times on the reference day")

    departures: collections.Counter = collections.Counter()
    served_stops: dict[str, set] = collections.defaultdict(set)
    reachable: dict[str, set] = collections.defaultdict(set)
    direct: dict[tuple[str, str], list[int]] = collections.defaultdict(list)

    trip_ids = stop_times["trip_id"].to_numpy()
    stop_ids = stop_times["stop_id"].to_numpy()
    departure_times = stop_times["departure_time"].to_numpy()
    arrival_times = stop_times["arrival_time"].to_numpy()

    start = 0
    for end in trip_boundaries(trip_ids):
        sequence = []
        for i in range(start, end):
            settlement = settlement_of.get(stop_ids[i])
            if settlement:
                sequence.append((settlement, seconds(departure_times[i]),
                                 seconds(arrival_times[i])))
                served_stops[settlement].add(stop_ids[i])
        seen: set[str] = set()
        for position, (settlement, depart, _arrive) in enumerate(sequence):
            if settlement not in seen:
                seen.add(settlement)
                departures[settlement] += 1
            wanted = target_of.get(settlement)
            for later, _dep, arrive in sequence[position + 1:]:
                if later == settlement:
                    continue
                reachable[settlement].add(later)
                if wanted and later in wanted.values() and depart >= 0 <= arrive:
                    direct[(settlement, later)].append(arrive - depart)
        start = end

    rows = settlement_rows(ksh, coords, target_of, departures, served_stops,
                           reachable, direct)
    out = {
        "schemaVersion": SCHEMA_VERSION,
        "feedVersion": str(feed_info.get("feed_version", pd.Series(["?"]))[0]),
        "feedStart": str(feed_info.get("feed_start_date", pd.Series(["?"]))[0]),
        "feedEnd": str(feed_info.get("feed_end_date", pd.Series(["?"]))[0]),
        "referenceDay": day,
        "source": "Volánbusz (MÁV Személyszállítási Zrt.) GTFS, KTI",
        "licence": "CC0",
        "railIncluded": False,
        "stats": overall(rows),
        "counties": by_county(rows),
        "settlements": rows,
    }
    guard(out)
    return out


def trip_boundaries(trip_ids) -> list[int]:
    """End index of every trip block in the sorted stop-times array."""
    out = []
    for i in range(1, len(trip_ids)):
        if trip_ids[i] != trip_ids[i - 1]:
            out.append(i)
    out.append(len(trip_ids))
    return out


def settlement_rows(ksh, coords, target_of, departures, served_stops,
                    reachable, direct) -> list[dict]:
    rows = []
    for e in ksh.entries:
        if e["name"] == "Budapest" and not e["isDistrictOfCapital"]:
            continue
        name = e["name"]
        capital = bool(e["isDistrictOfCapital"])
        targets = target_of.get(name, {})
        row = {
            "kshId": e["kshId"],
            "settlement": name,
            "county": e["county"],
            "district": e["district"],
            "population": e["population"],
            # the capital runs on a feed this module does not load, so its
            # districts carry no figures at all rather than empty ones
            "capital": capital,
            "stops": None if capital else len(served_stops.get(name, ())),
            "departures": None if capital else departures.get(name, 0),
            "reachable": None if capital else len(reachable.get(name, ())),
        }
        for layer in TARGETS:
            target = targets.get(layer, "")
            rides = direct.get((name, target), []) if target else []
            same = bool(target) and target == name
            row[f"{layer}Target"] = target
            row[f"{layer}Direct"] = None if capital else (
                bool(rides) or (same and bool(row["stops"])))
            row[f"{layer}Trips"] = None if capital else len(rides)
            row[f"{layer}Minutes"] = None if capital else (
                int(round(min(rides) / 60)) if rides else (0 if same else None))
        rows.append(row)
    return rows


def overall(all_rows: list[dict]) -> dict:
    rows = [r for r in all_rows if not r["capital"]]
    served = [r for r in rows if r["departures"] > 0]
    out = {
        "settlements": len(rows),
        "capitalDistricts": len(all_rows) - len(rows),
        "withService": len(served),
        "withoutService": len(rows) - len(served),
        "populationWithoutService": sum(r["population"] for r in rows
                                        if r["departures"] == 0),
        "medianDepartures": round(statistics.median(
            [r["departures"] for r in served])) if served else 0,
    }
    for layer in TARGETS:
        with_direct = [r for r in rows if r[f"{layer}Direct"]]
        minutes = [r[f"{layer}Minutes"] for r in rows
                   if r[f"{layer}Minutes"] not in (None, 0)]
        out[layer] = {
            "direct": len(with_direct),
            "noDirect": len(rows) - len(with_direct),
            "populationNoDirect": sum(r["population"] for r in rows
                                      if not r[f"{layer}Direct"]),
            "medianMinutes": round(statistics.median(minutes)) if minutes else None,
            "maxMinutes": int(max(minutes)) if minutes else None,
        }
    return out


def by_county(all_rows: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for r in all_rows:
        if not r["capital"]:
            groups[r["county"]].append(r)
    out = []
    for county, list_ in groups.items():
        no_direct = [r for r in list_ if not r["gpDirect"]]
        out.append({
            "county": county,
            "settlements": len(list_),
            "population": sum(r["population"] for r in list_),
            "withoutService": sum(1 for r in list_ if r["departures"] == 0),
            "noDirectToGp": len(no_direct),
            "noDirectPopulation": sum(r["population"] for r in no_direct),
            "noDirectShare": len(no_direct) / len(list_) if list_ else 0.0,
            "medianDepartures": round(statistics.median(
                [r["departures"] for r in list_])) if list_ else 0,
        })
    return sorted(out, key=lambda c: -c["noDirectShare"])


def guard(out: dict) -> None:
    rows = [r for r in out["settlements"] if not r["capital"]]
    st = out["stats"]
    if len(out["settlements"]) < 3000:
        raise ParseError(f"only {len(out['settlements'])} settlements in the output")
    if st["settlements"] != len(rows):
        raise ParseError("the capital's districts were not excluded consistently")
    if st["withService"] < 0.8 * len(rows):
        raise ParseError(f"only {st['withService']} settlements have any departure — "
                         "the feed or the stop matching is broken")
    if st["withService"] + st["withoutService"] != len(rows):
        raise ParseError("served and unserved settlements do not add up")
    for layer in TARGETS:
        stats = st[layer]
        if stats["direct"] + stats["noDirect"] != len(rows):
            raise ParseError(f"{layer}: direct and indirect do not add up")
        if stats["medianMinutes"] is not None and not 0 < stats["medianMinutes"] < 240:
            raise ParseError(f"{layer}: implausible median ride {stats['medianMinutes']}")
    for r in rows:
        if r["departures"] < 0 or r["stops"] < 0:
            raise ParseError(f"{r['settlement']}: negative counts")
        for layer in TARGETS:
            minutes = r[f"{layer}Minutes"]
            if minutes is not None and not 0 <= minutes <= 600:
                raise ParseError(f"{r['settlement']}: {layer} ride out of range")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true", help="download the feed first")
    parser.add_argument("--force", action="store_true", help="re-download the feed")
    args = parser.parse_args()
    path = fetch(force=args.force) if (args.fetch or args.force) else GTFS_DIR / FEED_NAME
    if not path.exists():
        sys.exit(f"no feed at {path} — run with --fetch")

    out = build(path)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT} (feed {out['feedVersion']}, reference day {out['referenceDay']})")
    print(f"  {st['withService']} settlements have a departure, "
          f"{st['withoutService']} have none ({st['populationWithoutService']:,} residents)")
    for layer in TARGETS:
        s = st[layer]
        print(f"  {layer}: {s['direct']} settlements have a direct bus to the target, "
              f"{s['noDirect']} do not ({s['populationNoDirect']:,} residents); "
              f"median ride {s['medianMinutes']} min")


if __name__ == "__main__":
    main()
