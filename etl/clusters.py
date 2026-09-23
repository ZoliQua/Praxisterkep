"""Care deserts: where the high-index settlements form one contiguous area.

The composite index ranks settlements one by one, and read that way it looks
like a scatter of unlucky villages. It is not. Where a high-index settlement
is surrounded by other high-index settlements, the neighbouring village is
no help either, and the nearest real alternative is an area away — that is a
different problem from a single village between two well-served towns.

Method, deliberately the simplest one that can be checked by hand:

    take every settlement in the two highest index bands
    join two of them when their centres are within NEIGHBOUR_KM (6 km, about
        the distance between two neighbouring Hungarian villages)
    every connected component of at least MIN_SETTLEMENTS is a cluster

Single linkage chains, and in the south-west it chains a long way: the
largest clusters are corridors of sixty or seventy villages stretching
eighty kilometres, not compact blobs. That is what the data says — the
high-index villages there really do run into each other — so the extent of
each cluster is published beside its size instead of being hidden by a
tighter radius.

No distance decay, no smoothing, no chosen number of clusters: the only
parameters are the radius and the minimum size, and both are published with
the output. A cluster is an area where the indicators agree, never a claim
about care quality (CLAUDE.md rule 4).

Usage:
  python etl/clusters.py
"""
from __future__ import annotations

import collections
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "clusters.json"
SCHEMA_VERSION = 1

NEIGHBOUR_KM = 6.0
MIN_SETTLEMENTS = 3
BANDS = ("kiemelt", "magas")
EARTH_KM = 6371.0088


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def components(nodes: list[dict]) -> list[list[dict]]:
    """Connected components of the within-NEIGHBOUR_KM graph (union-find)."""
    parent = list(range(len(nodes)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    # a degree of latitude is ~111 km, so a latitude window keeps the scan cheap
    order = sorted(range(len(nodes)), key=lambda i: nodes[i]["lat"])
    window = NEIGHBOUR_KM / 110.0
    for pos, i in enumerate(order):
        for j in order[pos + 1:]:
            if nodes[j]["lat"] - nodes[i]["lat"] > window:
                break
            if haversine(nodes[i]["lat"], nodes[i]["lon"],
                         nodes[j]["lat"], nodes[j]["lon"]) <= NEIGHBOUR_KM:
                union(i, j)
    groups: dict[int, list[dict]] = collections.defaultdict(list)
    for i, node in enumerate(nodes):
        groups[find(i)].append(node)
    return list(groups.values())


def build() -> dict:
    data = json.loads((ROOT / "data" / "composite.json").read_text(encoding="utf-8"))
    nodes = [s for s in data["settlements"] if s["band"] in BANDS]
    if not nodes:
        raise ParseError("no settlement falls into the two highest bands")

    groups = components(nodes)
    clusters = [describe(g, i) for i, g in enumerate(
        sorted(groups, key=lambda g: -sum(s["population"] for s in g)), start=1)
        if len(g) >= MIN_SETTLEMENTS]
    for i, c in enumerate(clusters, start=1):
        c["id"] = i

    loose = [s for s in nodes
             if not any(s["kshId"] in c["kshIds"] for c in clusters)]

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": data.get("dataMonth", ""),
        "neighbourKm": NEIGHBOUR_KM,
        "minSettlements": MIN_SETTLEMENTS,
        "bands": list(BANDS),
        "stats": {
            "candidates": len(nodes),
            "clusters": len(clusters),
            "settlementsInClusters": sum(c["settlements"] for c in clusters),
            "populationInClusters": sum(c["population"] for c in clusters),
            "isolated": len(loose),
            "isolatedPopulation": sum(s["population"] for s in loose),
            "largest": clusters[0]["population"] if clusters else 0,
        },
        "counties": by_county(clusters),
        "clusters": clusters,
    }
    guard(out)
    return out


def describe(group: list[dict], index: int) -> dict:
    """One cluster: how big, how bad, where, and what it is named after."""
    # named after the settlement people would recognise, with the worst one
    # reported separately: the two are rarely the same village
    anchor = max(group, key=lambda s: (s["population"], s["index"]))
    core = max(group, key=lambda s: s["index"])
    counties = collections.Counter(s["county"] for s in group)
    lats = [s["lat"] for s in group]
    lons = [s["lon"] for s in group]
    spread = max((haversine(min(lats), min(lons), max(lats), max(lons)), 0.0))
    km = [s["raw"].get("gpKm") for s in group if s["raw"].get("gpKm") is not None]
    inpatient = [s["raw"].get("inpatientKm") for s in group
                 if s["raw"].get("inpatientKm") is not None]
    old = [s["raw"].get("ageing") for s in group if s["raw"].get("ageing") is not None]
    return {
        "id": index,
        "name": anchor["settlement"],
        "core": core["settlement"],
        "county": counties.most_common(1)[0][0],
        "counties": [c for c, _ in counties.most_common()],
        "settlements": len(group),
        "population": sum(s["population"] for s in group),
        "meanIndex": round(sum(s["index"] for s in group) / len(group), 1),
        "maxIndex": core["index"],
        "spreadKm": round(spread, 1),
        "meanGpKm": round(sum(km) / len(km), 1) if km else None,
        "meanInpatientKm": round(sum(inpatient) / len(inpatient), 1) if inpatient else None,
        "meanOldShare": round(sum(old) / len(old), 4) if old else None,
        "lat": round(sum(lats) / len(lats), 5),
        "lon": round(sum(lons) / len(lons), 5),
        "kshIds": [s["kshId"] for s in group],
        "members": sorted(
            ({"kshId": s["kshId"], "settlement": s["settlement"], "county": s["county"],
              "population": s["population"], "index": s["index"], "band": s["band"]}
             for s in group),
            key=lambda s: -s["index"]),
    }


def by_county(clusters: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for c in clusters:
        for member in c["members"]:
            groups[member["county"]].append(member)
    return sorted(({
        "county": county,
        "settlements": len(list_),
        "population": sum(m["population"] for m in list_),
        "clusters": len({c["id"] for c in clusters
                         if any(m["county"] == county for m in c["members"])}),
    } for county, list_ in groups.items()), key=lambda c: -c["population"])


def guard(out: dict) -> None:
    st = out["stats"]
    if st["settlementsInClusters"] + st["isolated"] != st["candidates"]:
        raise ParseError("clustered and isolated settlements do not add up")
    seen: set[str] = set()
    for c in out["clusters"]:
        if c["settlements"] < MIN_SETTLEMENTS:
            raise ParseError(f"cluster {c['id']} is below the minimum size")
        if len(c["members"]) != c["settlements"]:
            raise ParseError(f"cluster {c['id']}: member count does not match")
        if sum(m["population"] for m in c["members"]) != c["population"]:
            raise ParseError(f"cluster {c['id']}: population does not add up")
        for m in c["members"]:
            if m["kshId"] in seen:
                raise ParseError(f"{m['settlement']} belongs to two clusters")
            seen.add(m["kshId"])
            if m["band"] not in BANDS:
                raise ParseError(f"{m['settlement']} is not in a clustered band")
    if sum(c["settlements"] for c in out["counties"]) != st["settlementsInClusters"]:
        raise ParseError("county counts do not add up to the clustered settlements")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT}: {st['clusters']} clusters hold {st['settlementsInClusters']} "
          f"settlements ({st['populationInClusters']:,} residents); "
          f"{st['isolated']} stay isolated")
    for c in out["clusters"][:8]:
        print(f"  {c['name']} ({c['county']}): {c['settlements']} settlements, "
              f"{c['population']:,} residents, mean index {c['meanIndex']}, "
              f"{c['spreadKm']} km across")


if __name__ == "__main__":
    main()
