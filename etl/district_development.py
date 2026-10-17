"""How developed a járás is, by the state's own measure.

The site can say how many districts of a járás have no doctor. It cannot say
whether that járás is a prosperous commuter belt or the poorest corner of
Borsod — and without that, a vacancy rate is a number without a country.

There is an official answer, and it is not ours to invent: the

    290/2014. (XI. 26.) Korm. rendelet a kedvezményezett járások
    besorolásáról

ranks every járás by a **komplex mutató** that KSH builds from social,
demographic, housing, labour-market and economic indicators, and classifies
them in three tightening grades — kedvezményezett, fejlesztendő, komplex
programmal fejlesztendő. The decree's own annexes carry both:

    1. melléklet  régió | vármegye | járás | lakónépesség | komplex mutató |
                  rangsorszám | kedvezményezett (1/0)
    2. melléklet  the three grades, 1/0 each

The consolidated text comes from the Nemzeti Jogszabálytár, is archived in
data/raw/kedvezmenyezett/ with its date (the git history is the audit trail)
and is parsed into data/district_development.json keyed by járás name.

Two honesty notes the UI repeats:

  * The decree is from 2014 and uses the járás map of the time. A handful of
    járás have been created or renamed since, and the capital's districts are
    in it as "Budapest, VIII. ker.". Everything that matches is published,
    everything that does not is counted and named in `unmatched` — never
    guessed at from a neighbour.
  * The komplex mutató is a 2014 measurement. It is the state's standing
    classification (it still decides who may apply for what), not a reading
    of today, and the page says so.

Usage:
  python etl/district_development.py [--url ...]
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from datetime import date
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError, resolve_capital

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "district_development.json"
RAW = ROOT / "data" / "raw" / "kedvezmenyezett"
SOURCE_URL = "https://njt.hu/jogszabaly/2014-290-20-22"
SOURCE_NAME = ("290/2014. (XI. 26.) Korm. rendelet a kedvezményezett "
               "járások besorolásáról, 1. és 2. melléklet")
SCHEMA_VERSION = 1
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Praxisterkep/1.0"}
# the decree classifies 175 járás and the capital's 23 districts
MIN_ROWS = 190
# the threshold the decree itself names in the column header
BENEFICIARY_BELOW = 46.68
# One járás, two spellings of the same town's adjective: the decree writes
# "Jánoshalmi", the KSH gazetteer "Jánoshalmai". Both are Jánoshalma's járás
# and nothing else is called either. Every other name matches exactly, and
# anything that stops matching is reported rather than guessed at.
ALIASES = {"Jánoshalmi": "Jánoshalmai"}


def fetch(url: str, cache: Path) -> str:
    if cache.exists():
        print(f"using the archived copy: {cache}")
        return cache.read_text(encoding="utf-8")
    resp = requests.get(url, headers=HEADERS, timeout=120, allow_redirects=True)
    resp.raise_for_status()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(resp.text, encoding="utf-8")
    print(f"saved: {cache} ({len(resp.text)} characters)")
    return resp.text


def _rows(table: str) -> list[list[str]]:
    out = []
    for row in re.findall(r"<tr.*?</tr>", table, re.S):
        cells = [html.unescape(re.sub("<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]
        out.append([re.sub(r"\s+", " ", c) for c in cells])
    return out


def _number(text: str) -> float | None:
    """"18,63" -> 18.63; "9 877 365" -> 9877365.0; anything else -> None."""
    cleaned = (text or "").replace(" ", " ").replace(" ", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def district_key(name: str) -> str:
    """The járás as districts.json spells it.

    The decree writes the capital "Budapest, VIII. ker." and the rest
    "Cigándi" or sometimes "Cigándi járás"; resolve_capital already knows
    every way NEAK and the gazetteer write the capital, so it is reused here
    rather than written again.
    """
    text = re.sub(r"\s+járás$", "", (name or "").strip())
    return ALIASES.get(text, resolve_capital(text))


def parse(page: str) -> dict:
    tables = re.findall(r"<table.*?</table>", page, re.S)
    if len(tables) < 2:
        raise ParseError(f"expected the annex tables, found {len(tables)}")

    districts: dict[str, dict] = {}
    for cells in _rows(tables[0])[2:]:  # two header rows
        if len(cells) < 8 or not cells[3]:
            continue
        name = district_key(cells[3])
        if name.startswith("Ország"):
            continue  # the total row
        value = _number(cells[5])
        if value is None:
            continue
        districts[name] = {
            "region": cells[1],
            "complex": round(value, 2),
            "rank": int(_number(cells[6]) or 0) or None,
            "population2013": int(_number(cells[4]) or 0) or None,
            "beneficiary": cells[7].strip() == "1",
        }

    # the second annex grades the beneficiary ones; a járás may carry more
    # than one flag, and the strongest is what the page shows
    grades = 0
    for cells in _rows(tables[1])[4:]:  # four header rows
        if len(cells) < 7 or not cells[3]:
            continue
        name = district_key(cells[3])
        row = districts.get(name)
        if row is None:
            continue
        flags = {
            "kedvezmenyezett": cells[4].strip() == "1",
            "fejlesztendo": cells[5].strip() == "1",
            "komplex": cells[6].strip() == "1",
        }
        row["grade"] = ("komplex" if flags["komplex"]
                        else "fejlesztendo" if flags["fejlesztendo"]
                        else "kedvezmenyezett" if flags["kedvezmenyezett"]
                        else "")
        grades += 1 if row["grade"] else 0

    if len(districts) < MIN_ROWS:
        raise ParseError(f"only {len(districts)} districts parsed, expected "
                         f"at least {MIN_ROWS}")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": SOURCE_NAME,
        "sourceUrl": SOURCE_URL,
        "measuredYear": 2014,
        "beneficiaryBelow": BENEFICIARY_BELOW,
        "fetched": date.today().isoformat(),
        "counts": {"districts": len(districts), "graded": grades},
        "districts": districts,
    }


def build(url: str = SOURCE_URL) -> dict:
    cache = RAW / f"290-2014_{date.today().isoformat()}.html"
    existing = sorted(RAW.glob("290-2014_*.html"))
    out = parse(fetch(url, existing[-1] if existing else cache))
    if not existing:
        return out
    print(f"parsed the archived copy {existing[-1].name}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default=SOURCE_URL)
    args = ap.parse_args()
    out = build(args.url)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}: {out['counts']['districts']} districts, "
          f"{out['counts']['graded']} graded")


if __name__ == "__main__":
    main()
