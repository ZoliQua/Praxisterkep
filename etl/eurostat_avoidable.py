"""Hungary's avoidable mortality against the EU, from Eurostat (source Q).

NNGYK (source M) publishes avoidable mortality by járás and county; it does
not say where the country stands in Europe. Eurostat's hlth_cd_apr does —
treatable and preventable mortality per 100 000 under 75, age-standardised
to the 2013 European Standard Population, for Hungary and the EU-27:

    https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/
        hlth_cd_apr?geo=EU27_2020&geo=HU&sex=T&icd10=TOTAL&unit=RT&format=JSON

Two things a reader comparing the two sources has to know, and the page
says both:

  * Eurostat splits the causes on both lists 50/50 between treatable and
    preventable; NNGYK publishes them as a third group of their own (its
    map 13). The NNGYK figures are therefore also given in Eurostat's split
    (treatable-only + ½·both, preventable-only + ½·both) — the same deaths,
    divided the way Eurostat divides them.
  * The levels differ: NNGYK's national figure for 2024 sits some 15 %
    below Eurostat's for 2023 in both halves, while their all-cause rates
    agree. The cause list (Eurostat's 2022 version adds COVID-19 to the
    preventable causes) or the age limit is the likely reason; NNGYK's
    method note is a PDF this project could not read, so the reason is not
    asserted. The two are never mixed: Eurostat for Europe, NNGYK inside
    Hungary.

The response is archived under data/raw/eurostat/ with its date.

Usage:
  python etl/eurostat_avoidable.py [--refresh]
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
from datetime import date
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "eurostat"
OUT = ROOT / "data" / "eurostat.json"
SCHEMA_VERSION = 1

URL = ("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/hlth_cd_apr"
       "?geo=EU27_2020&geo=HU&sex=T&icd10=TOTAL&unit=RT&format=JSON")
PAGE = "https://ec.europa.eu/eurostat/databrowser/view/hlth_cd_apr/default/table"
HEADERS = {"User-Agent": "Praxisterkep/1.0 (+https://github.com/ZoliQua/Praxisterkep)"}
GEOS = {"HU": "hu", "EU27_2020": "eu"}
MEASURES = {"TOTAL": "avoidable", "TRT": "treatable", "PRVT": "preventable"}


def fetch(refresh: bool = False) -> tuple[dict, str]:
    RAW.mkdir(parents=True, exist_ok=True)
    archived = sorted(RAW.glob("hlth_cd_apr_*.json.gz"))
    if archived and not refresh:
        path = archived[-1]
        return json.loads(gzip.decompress(path.read_bytes())), path.name[12:22]
    resp = requests.get(URL, timeout=120, headers=HEADERS)
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise ParseError(f"Eurostat answered with an error: {data['error']}")
    today = date.today().isoformat()
    (RAW / f"hlth_cd_apr_{today}.json.gz").write_bytes(
        gzip.compress(json.dumps(data, ensure_ascii=False).encode("utf-8"), 9))
    return data, today


def parse(data: dict) -> dict:
    """{geo: {measure: {year: rate}}} from Eurostat's JSON-stat."""
    dims, sizes = data["id"], data["size"]
    index = {d: data["dimension"][d]["category"]["index"] for d in dims}
    for d in ("sex", "icd10", "unit", "freq"):
        if len(index[d]) != 1:
            raise ParseError(f"Eurostat {d}: expected one category, got {list(index[d])}")
    out: dict = {GEOS[g]: {m: {} for m in MEASURES.values()} for g in GEOS}
    for geo, short in GEOS.items():
        for mort, key in MEASURES.items():
            for year in index["time"]:
                pos = {d: 0 for d in dims}
                pos.update({"geo": index["geo"][geo], "mortalit": index["mortalit"][mort],
                            "time": index["time"][year]})
                flat = 0
                for d, size in zip(dims, sizes):
                    flat = flat * size + pos[d]
                v = data["value"].get(str(flat))
                if v is not None:
                    out[short][key][year] = round(float(v), 2)
    return out


def build(refresh: bool = False) -> dict:
    data, fetched = fetch(refresh)
    series = parse(data)
    out = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "Eurostat, hlth_cd_apr — Treatable and preventable mortality of residents",
        "sourceUrl": PAGE,
        "fetched": fetched,
        "standard": "2013 European Standard Population, deaths under 75, per 100 000",
        "years": sorted({y for g in series.values() for m in g.values() for y in m}),
        "series": series,
    }
    guard(out)
    return out


def guard(out: dict) -> None:
    for geo, measures in out["series"].items():
        for year, total in measures["avoidable"].items():
            parts = measures["treatable"].get(year), measures["preventable"].get(year)
            if None in parts:
                continue
            # Eurostat's two halves add up to its total, to rounding
            if abs(sum(parts) - total) > 1.0:
                raise ParseError(f"{geo} {year}: {parts} do not add up to {total}")
            if not 100 < total < 1500:
                raise ParseError(f"{geo} {year}: implausible avoidable rate {total}")
    if not out["series"]["hu"]["avoidable"] or not out["series"]["eu"]["avoidable"]:
        raise ParseError("Eurostat returned no series for Hungary or the EU")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true")
    out = build(parser.parse_args().refresh)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    last = out["years"][-1]
    s = out["series"]
    print(f"wrote {OUT}: {out['years'][0]}–{last}; {last}: HU {s['hu']['avoidable'].get(last)}, "
          f"EU {s['eu']['avoidable'].get(last)}")


if __name__ == "__main__":
    main()
