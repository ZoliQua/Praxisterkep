"""Driving time instead of straight lines.

Every distance published so far has been a crow-flies kilometre, and the
site has said so every time — but a number that is wrong in a known
direction is still wrong. A village four kilometres from its surgery across
a ridge is not four kilometres away; the Cserehát and the Őrség have been
flattered by every chart on the site.

This module measures the same distances as free-flow driving minutes on the
OpenStreetMap road network (see roads.py), for:

    gp / dental      the nearest surgery of a district that has a physician
    oncall           the nearest central on-call surgery
    ambulance        the nearest ambulance station
    inpatient        the nearest contracted hospital site
    outpatient       the nearest contracted outpatient site
    gyse             the nearest medical-aid dispensing premises (GYS1-3;
                     a repair shop is not a substitute for a supplier)

Method: one multi-source Dijkstra per layer over the *transposed* graph, so
what is computed is the time from every road node to the nearest care point
(the direction a patient travels), one-way streets included. Settlements and
care points are snapped to the nearest road node; the snapping distance is
published per settlement so a bad snap is visible rather than hidden.

Snapping happens onto the main road network only, and never onto a motorway
or trunk road. OpenStreetMap Hungary has ~4900 weakly connected pieces, and
all but one are small islands — a car park loop, a forest track, a stub
across the border; attaching a settlement to one of those would report it as
unreachable. Attaching one to a motorway is worse than useless: you can
drive along a motorway but not leave it, so a surgery half a kilometre away
comes out a quarter of an hour distant. Both kinds of node are excluded from
the candidate set before the nearest one is chosen.

Not modelled: traffic, turn restrictions, ferries, seasonal closures, and
anything outside Hungary's borders. The result is therefore a free-flow
lower bound on time, not a promise — and still far closer to what a resident
experiences than a straight line.

Usage:
  python etl/traveltime.py
"""
from __future__ import annotations

import collections
import json
import math
import statistics
import sys
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))

import centroids
import roads
from parse_dental import ParseError
from parse_ksh import load_reference

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "traveltime.json"
SCHEMA_VERSION = 1

# a point further than this from any road is not snapped at all
MAX_SNAP_KM = 5.0
# the bands the UI colours and counts by (upper bound in minutes)
BANDS: list[tuple[str, float | None]] = [
    ("0-10", 10.0), ("10-20", 20.0), ("20-30", 30.0), ("30+", None),
]
EARTH_KM = 6371.0088
# one fixed reference latitude for every projection in this module: projecting
# two point sets with their own means would stretch them differently and the
# nearest neighbour would come out wrong
REFERENCE_LAT = 47.0
LAYERS = ("gp", "dental", "oncall", "ambulance", "inpatient", "outpatient", "gyse")


def band_of(minutes: float) -> str:
    for key, upper in BANDS:
        if upper is None or minutes < upper:
            return key
    return BANDS[-1][0]


def projector(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Equirectangular kilometres around REFERENCE_LAT, for the whole module."""
    x = np.radians(lon) * math.cos(math.radians(REFERENCE_LAT)) * EARTH_KM
    y = np.radians(lat) * EARTH_KM
    return np.column_stack([x, y])


def care_points() -> dict[str, list[tuple[float, float, str]]]:
    """(lat, lon, label) of every care point the layers measure to."""
    data_dir = ROOT / "data"
    latest = json.loads((data_dir / "latest.json").read_text(encoding="utf-8"))
    eeszt_path = data_dir / "eeszt.json"
    eeszt = json.loads(eeszt_path.read_text(encoding="utf-8")) if eeszt_path.exists() else {}
    cache = json.loads((ROOT / "etl" / "geocode_cache.json").read_text(encoding="utf-8"))

    out: dict[str, list[tuple[float, float, str]]] = {k: [] for k in LAYERS}
    for kind in ("gp", "dental"):
        for f in latest["kinds"][kind]["filledPraxes"]:
            geo = (eeszt.get("praxes", {}).get(f["id"]) or {}).get("g")
            if not geo:
                hit = cache.get(f"{f.get('postalCode', '')} {f.get('settlement', '')}, "
                                f"{f.get('address', '')}")
                geo = (hit["lat"], hit["lon"]) if hit and hit.get("lat") is not None else None
            if geo:
                out[kind].append((geo[0], geo[1], f.get("settlement", "")))

    emergency_path = data_dir / "emergency.json"
    if emergency_path.exists():
        emergency = json.loads(emergency_path.read_text(encoding="utf-8"))
        for p in emergency["points"]:
            if p["group"] in out and p["lat"] is not None:
                out[p["group"]].append((p["lat"], p["lon"], p["settlement"]))

    gyse_path = data_dir / "gyse.json"
    if gyse_path.exists():
        gyse = json.loads(gyse_path.read_text(encoding="utf-8"))
        for s in gyse["sites"]:
            if s["lat"] is not None and s["kind"] in ("shop", "branch", "workshop"):
                out["gyse"].append((s["lat"], s["lon"], s["settlement"]))

    specialist_path = data_dir / "specialist.json"
    if specialist_path.exists():
        specialist = json.loads(specialist_path.read_text(encoding="utf-8"))
        for s in specialist["sites"]:
            if s["lat"] is not None:
                out[s["care"]].append((s["lat"], s["lon"], s["settlement"]))
    return out


def build() -> dict:
    graph = roads.load()
    if graph is None:
        raise ParseError("no road graph — run etl/roads.py first")
    n = len(graph["lat"])
    matrix = csr_matrix((graph["minutes"], (graph["rows"], graph["cols"])), shape=(n, n))
    # the patient travels towards care, so the reverse graph is the one to walk
    reverse = matrix.T.tocsr()
    # only the main network may receive a snap (see the note above)
    _count, labels = connected_components(matrix, directed=True, connection="weak")
    main = int(np.bincount(labels).argmax())
    snappable = graph.get("snappable")
    eligible = (labels == main)
    if snappable is not None:
        eligible &= snappable.astype(bool)
    main_nodes = np.flatnonzero(eligible)
    tree = cKDTree(projector(graph["lat"][main_nodes], graph["lon"][main_nodes]))

    def snap(lat: np.ndarray, lon: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        km, local = tree.query(projector(lat, lon))
        return km, main_nodes[local]

    ksh = load_reference()
    coords = centroids.load()
    if not coords:
        raise ParseError("run etl/centroids.py first — no settlement coordinates")

    entries = [e for e in (ksh.entries if ksh else [])
               if not (e["name"] == "Budapest" and not e["isDistrictOfCapital"])
               and e["kshId"] in coords]
    settle_lat = np.asarray([coords[e["kshId"]][0] for e in entries])
    settle_lon = np.asarray([coords[e["kshId"]][1] for e in entries])
    snap_km, settle_node = snap(settle_lat, settle_lon)

    points = care_points()
    # the straight line each layer used to be measured with, kept so the two
    # can be compared row by row rather than only in the aggregate
    air = {layer: air_km(settle_lat, settle_lon, items)
           for layer, items in points.items() if items}
    results: dict[str, dict] = {}
    for layer in LAYERS:
        items = points.get(layer, [])
        if not items:
            continue
        lat = np.asarray([p[0] for p in items])
        lon = np.asarray([p[1] for p in items])
        labels = [p[2] for p in items]
        km, nodes = snap(lat, lon)
        keep = km <= MAX_SNAP_KM
        sources = np.unique(nodes[keep])
        print(f"  {layer}: {len(items)} points, {int(keep.sum())} snapped to "
              f"{len(sources)} road nodes")
        minutes, _predecessors, nearest = dijkstra(
            reverse, directed=True, indices=sources, min_only=True,
            return_predecessors=True)
        # nearest[] holds the source node each node was reached from
        label_of = {}
        for node, label in zip(nodes[keep], np.asarray(labels)[keep]):
            label_of.setdefault(int(node), label)
        results[layer] = {
            "minutes": minutes,
            "nearest": nearest,
            "labels": label_of,
            "points": int(keep.sum()),
        }

    rows: list[dict] = []
    for i, e in enumerate(entries):
        node = int(settle_node[i])
        row = {
            "kshId": e["kshId"],
            "settlement": e["name"],
            "county": e["county"],
            "district": e["district"],
            "population": e["population"],
            "snapKm": round(float(snap_km[i]), 2),
        }
        for layer, result in results.items():
            value = float(result["minutes"][node])
            reachable = math.isfinite(value)
            row[f"{layer}Min"] = round(value, 1) if reachable else None
            row[f"{layer}Band"] = band_of(value) if reachable else ""
            source_node = int(result["nearest"][node]) if reachable else -1
            row[f"{layer}At"] = result["labels"].get(source_node, "")
            km = air.get(layer, [None] * len(entries))[i]
            row[f"{layer}Km"] = None if km is None else round(float(km), 1)
            # how much longer the road is than the crow flies, at 60 km/h
            row[f"{layer}Detour"] = (
                round(float(value) / max(float(km), 0.5), 2)
                if (reachable and km is not None) else None)
        rows.append(row)

    districts = district_rows(results, snap, entries)

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "roadSource": str(graph["source"][0]),
        "comparison": comparison(rows),
        "bands": [b[0] for b in BANDS],
        "layers": [k for k in LAYERS if k in results],
        "stats": overall(rows, results),
        "counties": by_county(rows),
        "settlements": rows,
        "districts": districts,
    }
    guard(out)
    return out


def air_km(lat: np.ndarray, lon: np.ndarray,
           items: list[tuple[float, float, str]]) -> np.ndarray:
    """Crow-flies kilometres to the nearest point of the layer."""
    target = projector(np.asarray([p[0] for p in items]),
                       np.asarray([p[1] for p in items]))
    tree = cKDTree(target)
    km, _index = tree.query(projector(lat, lon))
    return km


def district_rows(results: dict, snap, entries: list[dict]) -> list[dict]:
    """Districts with no contracted physician, in driving minutes."""
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    rows: list[dict] = []
    todo: list[tuple[dict, float, float]] = []
    for kind in ("dental", "gp"):
        for p in latest["kinds"][kind].get("praxes", []):
            site = (p.get("sites") or [{}])[0]
            if site.get("lat") is None:
                continue
            todo.append(({
                "id": p["id"], "kind": kind, "status": p.get("status", "vacant"),
                "settlement": site.get("settlement", ""), "county": p.get("county", ""),
                "type": p.get("type", ""), "population": p.get("population"),
                "longTerm": bool(p.get("longTerm")),
            }, site["lat"], site["lon"]))
    if not todo:
        return rows
    lat = np.asarray([t[1] for t in todo])
    lon = np.asarray([t[2] for t in todo])
    _km, nodes = snap(lat, lon)
    for (row, _lat, _lon), node in zip(todo, nodes):
        for layer in ("gp", "dental", "oncall", "ambulance", "inpatient"):
            result = results.get(layer)
            if not result:
                continue
            value = float(result["minutes"][int(node)])
            row[f"{layer}Min"] = round(value, 1) if math.isfinite(value) else None
        rows.append(row)
    return rows


def comparison(rows: list[dict]) -> dict:
    """What changes when the straight line becomes a road.

    The detour ratio is driving minutes per crow-flies kilometre: 1.0 means
    the road is as fast as 60 km/h in a straight line, 2.0 means it takes
    twice that. The settlements at the top of that list are the ones every
    earlier chart on the site flattered.
    """
    out: dict = {}
    for layer in ("gp", "oncall", "inpatient"):
        pairs = [(r, r.get(f"{layer}Detour")) for r in rows]
        values = [v for _r, v in pairs if v is not None]
        if not values:
            continue
        worst = sorted((p for p in pairs if p[1] is not None),
                       key=lambda p: -p[1])[:20]
        out[layer] = {
            "medianDetour": round(statistics.median(values), 2),
            "meanDetour": round(statistics.fmean(values), 2),
            "worst": [{
                "settlement": r["settlement"], "county": r["county"],
                "population": r["population"], "km": r.get(f"{layer}Km"),
                "minutes": r.get(f"{layer}Min"), "detour": v,
            } for r, v in worst],
        }
    return out


def overall(rows: list[dict], results: dict) -> dict:
    out: dict = {"settlements": len(rows)}
    for layer in results:
        values = [r[f"{layer}Min"] for r in rows if r[f"{layer}Min"] is not None]
        counts = collections.Counter(r[f"{layer}Band"] for r in rows)
        population = collections.Counter()
        for r in rows:
            population[r[f"{layer}Band"]] += r["population"]
        out[layer] = {
            "points": results[layer]["points"],
            "medianMin": round(statistics.median(values), 1) if values else None,
            "meanMin": round(statistics.fmean(values), 1) if values else None,
            "maxMin": round(max(values), 1) if values else None,
            "unreachable": len(rows) - len(values),
            "counts": dict(counts),
            "population": dict(population),
            "populationBeyond30": sum(r["population"] for r in rows
                                      if (r[f"{layer}Min"] or 0) >= 30),
        }
    return out


def by_county(rows: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        groups[r["county"]].append(r)
    out = []
    for county, list_ in groups.items():
        row = {"county": county, "settlements": len(list_),
               "population": sum(r["population"] for r in list_)}
        for layer in ("gp", "oncall", "inpatient"):
            values = [r[f"{layer}Min"] for r in list_ if r.get(f"{layer}Min") is not None]
            row[f"{layer}MedianMin"] = round(statistics.median(values), 1) if values else None
            row[f"{layer}MaxMin"] = round(max(values), 1) if values else None
            row[f"{layer}Beyond30"] = sum(
                r["population"] for r in list_ if (r.get(f"{layer}Min") or 0) >= 30)
        out.append(row)
    return sorted(out, key=lambda c: -(c["gpMedianMin"] or 0))


def guard(out: dict) -> None:
    rows = out["settlements"]
    if len(rows) < 3000:
        raise ParseError(f"only {len(rows)} settlements measured")
    far = [r for r in rows if r["snapKm"] > MAX_SNAP_KM]
    if far:
        raise ParseError(f"{len(far)} settlements are more than {MAX_SNAP_KM} km "
                         f"from any road: {[r['settlement'] for r in far[:5]]}")
    for layer in out["layers"]:
        stats = out["stats"][layer]
        if stats["medianMin"] is None or not 0 < stats["medianMin"] < 120:
            raise ParseError(f"{layer}: implausible median {stats['medianMin']} minutes")
        if stats["unreachable"] > len(rows) * 0.02:
            raise ParseError(f"{layer}: {stats['unreachable']} settlements unreachable")
        if sum(stats["counts"].values()) != len(rows):
            raise ParseError(f"{layer}: the bands do not add up")
    for r in rows:
        for layer in out["layers"]:
            value = r[f"{layer}Min"]
            if value is not None and not 0 <= value <= 600:
                raise ParseError(f"{r['settlement']}: {layer} time out of range")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT} (road data: {out['roadSource']})")
    for layer in out["layers"]:
        s = out["stats"][layer]
        print(f"  {layer}: median {s['medianMin']} min, max {s['maxMin']} min, "
              f"{s['populationBeyond30']:,} residents beyond 30 minutes")


if __name__ == "__main__":
    main()
