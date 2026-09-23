"""The drivable road network, turned into a graph the analyses can walk on.

Every distance on the site has been a straight line so far. In the Cserehát
or the Őrség that is not a small difference: a village four kilometres away
across a hill can be a twenty-minute drive, and the index has been quietly
flattering those places. This module builds the road graph that lets the
distances be measured as driving time instead.

Source: the Geofabrik extract of OpenStreetMap Hungary (ODbL), downloaded
into data/raw/osm/ and *not* committed — it is 310 MB of binary that the
URL and the date reproduce exactly. Everything derived from it is written
to data/geo/road_graph.npz, also outside git for the same reason.

What is kept: the ways a car may use (motorway to residential plus the link
roads and unclassified/track-free service roads), with free-flow speed taken
from maxspeed where OSM has it and from the road class where it does not.
One-way restrictions are honoured. What is deliberately not modelled:
turn restrictions, traffic, ferries, seasonal closures and border crossings —
so the result is free-flow driving time in the country, an upper bound on
how fast and a lower bound on how long.

Usage:
  python etl/roads.py            # build the graph (needs the extract)
  python etl/roads.py --fetch    # download the extract first
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import osmium
import requests

ROOT = Path(__file__).resolve().parent.parent
OSM_DIR = ROOT / "data" / "raw" / "osm"
GEO_DIR = ROOT / "data" / "geo"
OUT = GEO_DIR / "road_graph.npz"
EXTRACT_URL = "https://download.geofabrik.de/europe/hungary-latest.osm.pbf"
HEADERS = {"User-Agent": "Praxisterkep/1.0 (+https://github.com/ZoliQua/OEP-Alapellatas)"}

# free-flow speed in km/h when the way carries no usable maxspeed tag
DEFAULT_SPEED = {
    "motorway": 110, "motorway_link": 70,
    "trunk": 90, "trunk_link": 60,
    "primary": 80, "primary_link": 55,
    "secondary": 70, "secondary_link": 50,
    "tertiary": 60, "tertiary_link": 45,
    "unclassified": 45, "residential": 35, "living_street": 20,
    "service": 20,
}
# a settlement centre often sits on a residential street, so those stay in
DRIVABLE = set(DEFAULT_SPEED)
# a motorway node is a terrible place to attach a village to: you can drive
# along it but not leave it, so a surgery half a kilometre away can come out
# fifteen minutes distant. These classes stay in the graph but are never
# offered as a snapping target.
NO_SNAP = {"motorway", "motorway_link", "trunk", "trunk_link"}
EARTH_KM = 6371.0088


class RoadCollector(osmium.SimpleHandler):
    """First pass: the drivable ways and the ids of the nodes they use."""

    def __init__(self) -> None:
        super().__init__()
        self.ways: list[tuple[list[int], float, bool]] = []
        self.wanted: set[int] = set()
        self.snappable: set[int] = set()

    def way(self, w) -> None:  # noqa: N802 — osmium's callback name
        tags = w.tags
        highway = tags.get("highway")
        if highway not in DRIVABLE:
            return
        if tags.get("access") in ("no", "private"):
            return
        if tags.get("motor_vehicle") in ("no", "private"):
            return
        speed = parse_speed(tags.get("maxspeed"), highway)
        oneway = tags.get("oneway") in ("yes", "true", "1", "-1")
        reverse = tags.get("oneway") == "-1"
        nodes = [n.ref for n in w.nodes]
        if len(nodes) < 2:
            return
        if reverse:
            nodes.reverse()
        self.ways.append((nodes, speed, oneway))
        self.wanted.update(nodes)
        if highway not in NO_SNAP:
            self.snappable.update(nodes)


class NodeCollector(osmium.SimpleHandler):
    """Second pass: the coordinates of the nodes the kept ways refer to."""

    def __init__(self, wanted: set[int]) -> None:
        super().__init__()
        self.wanted = wanted
        self.lat: dict[int, float] = {}
        self.lon: dict[int, float] = {}

    def node(self, n) -> None:  # noqa: N802 — osmium's callback name
        if n.id in self.wanted:
            self.lat[n.id] = n.location.lat
            self.lon[n.id] = n.location.lon


def parse_speed(value: str | None, highway: str) -> float:
    """OSM maxspeed is free text; anything unusable falls back to the class."""
    default = float(DEFAULT_SPEED[highway])
    if not value:
        return default
    text = value.strip().lower()
    if text.endswith("mph"):
        try:
            return float(text[:-3].strip()) * 1.609
        except ValueError:
            return default
    try:
        return float(text)
    except ValueError:
        return default


def fetch(force: bool = False) -> Path:
    """The extract, cached under data/raw/osm/ (not committed — it is huge)."""
    OSM_DIR.mkdir(parents=True, exist_ok=True)
    existing = sorted(OSM_DIR.glob("hungary-*.osm.pbf"))
    if existing and not force:
        return existing[-1]
    head = requests.head(EXTRACT_URL, headers=HEADERS, timeout=60, allow_redirects=False)
    name = head.headers.get("Location", EXTRACT_URL).rsplit("/", 1)[-1]
    target = OSM_DIR / name
    if target.exists() and not force:
        return target
    print(f"downloading {name} (about 310 MB)…")
    with requests.get(EXTRACT_URL, headers=HEADERS, timeout=1800, stream=True) as resp:
        resp.raise_for_status()
        with target.open("wb") as fh:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                fh.write(chunk)
    return target


def build(path: Path) -> dict:
    """Node coordinates plus the directed edge list, in minutes."""
    print(f"reading {path.name}…")
    roads = RoadCollector()
    roads.apply_file(str(path), locations=False)
    print(f"  {len(roads.ways)} drivable ways, {len(roads.wanted)} nodes to locate")

    nodes = NodeCollector(roads.wanted)
    nodes.apply_file(str(path), locations=False)
    print(f"  {len(nodes.lat)} node coordinates read")

    index: dict[int, int] = {}
    lats: list[float] = []
    lons: list[float] = []
    for osm_id in roads.wanted:
        if osm_id in nodes.lat:
            index[osm_id] = len(lats)
            lats.append(nodes.lat[osm_id])
            lons.append(nodes.lon[osm_id])

    lat = np.asarray(lats, dtype=np.float32)
    lon = np.asarray(lons, dtype=np.float32)
    snappable = np.zeros(len(lat), dtype=bool)
    for osm_id in roads.snappable:
        position = index.get(osm_id)
        if position is not None:
            snappable[position] = True
    rows: list[int] = []
    cols: list[int] = []
    minutes: list[float] = []
    for way_nodes, speed, oneway in roads.ways:
        previous = None
        for osm_id in way_nodes:
            current = index.get(osm_id)
            if current is None:
                previous = None
                continue
            if previous is not None and previous != current:
                km = haversine_np(lat[previous], lon[previous], lat[current], lon[current])
                cost = (km / speed) * 60.0
                rows.append(previous)
                cols.append(current)
                minutes.append(cost)
                if not oneway:
                    rows.append(current)
                    cols.append(previous)
                    minutes.append(cost)
            previous = current

    print(f"  {len(lat)} graph nodes, {len(rows)} directed edges")
    print(f"  {int(snappable.sum())} nodes may receive a snap")
    return {
        "lat": lat,
        "lon": lon,
        "snappable": snappable,
        "rows": np.asarray(rows, dtype=np.int32),
        "cols": np.asarray(cols, dtype=np.int32),
        "minutes": np.asarray(minutes, dtype=np.float32),
        "source": np.asarray([path.name]),
    }


def haversine_np(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * EARTH_KM * np.arcsin(np.sqrt(a))


def load() -> dict | None:
    """The saved graph, or None when it has not been built on this machine."""
    if not OUT.exists():
        return None
    with np.load(OUT, allow_pickle=False) as data:
        return {k: data[k] for k in data.files}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true",
                        help="download the OSM extract before building")
    parser.add_argument("--force", action="store_true", help="re-download the extract")
    args = parser.parse_args()

    path = fetch(force=args.force) if (args.fetch or args.force) else None
    if path is None:
        existing = sorted(OSM_DIR.glob("hungary-*.osm.pbf"))
        if not existing:
            sys.exit("no OSM extract in data/raw/osm — run with --fetch")
        path = existing[-1]

    graph = build(path)
    GEO_DIR.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT, **graph)
    size = OUT.stat().st_size / (1 << 20)
    print(f"wrote {OUT} ({size:.0f} MB) from {path.name}")


if __name__ == "__main__":
    main()
