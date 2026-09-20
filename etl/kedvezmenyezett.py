"""Beneficiary settlements: the lists of 105/2015. (IV. 23.) Korm. rendelet.

The decree classifies settlements that lag behind, and it is the authority for
the status the maps and comparisons use — KSH publishes the indicators behind
it, the decree publishes the classification itself:

    2. melléklet  A kedvezményezett települések jegyzéke
                  C: társadalmi-gazdasági és infrastrukturális szempontból
                     kedvezményezett  (1/0)
                  D: jelentős munkanélküliséggel sújtott                (1/0)
    3. melléklet  Átmenetileg kedvezményezett települések jegyzéke

The consolidated text is fetched from the Nemzeti Jogszabálytár, archived in
data/raw/kedvezmenyezett/ with its date (the git history is the audit trail),
and parsed into data/kedvezmenyezett.json keyed by county + settlement.

Usage:
  python etl/kedvezmenyezett.py [--url ...]
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "kedvezmenyezett.json"
RAW = ROOT / "data" / "raw" / "kedvezmenyezett"
SOURCE_URL = "https://njt.hu/jogszabaly/2015-105-20-22"
SCHEMA_VERSION = 1
HEADERS = {"User-Agent": "OEP-Alapellatas/1.0 (+https://github.com/ZoliQua/OEP-Alapellatas)"}
# the decree is a fixed list; a wild swing means the page changed, not reality
MIN_ROWS = {"benefit": 1000, "temporary": 300}


class ParseError(Exception):
    pass


def normalize(name: str) -> str:
    text = unicodedata.normalize("NFD", (name or "").lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", text)


def county_key(county: str) -> str:
    return normalize(re.sub(r"\s*(megye|vármegye)\s*$", "", county or "", flags=re.I))


def fetch(url: str, cache: Path) -> str:
    if cache.exists():
        print(f"using the archived copy: {cache}")
        return cache.read_text(encoding="utf-8")
    resp = requests.get(url, headers=HEADERS, timeout=120)
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


def parse(page: str) -> dict:
    tables = re.findall(r"<table.*?</table>", page, re.S)
    if len(tables) < 2:
        raise ParseError(f"expected the two annex tables, found {len(tables)}")
    benefit, temporary = _rows(tables[0]), _rows(tables[1])
    if len(benefit) < MIN_ROWS["benefit"] or len(temporary) < MIN_ROWS["temporary"]:
        raise ParseError(
            f"annex tables too short: {len(benefit)} / {len(temporary)} rows")

    settlements: dict[str, dict] = {}
    counts = {"socio": 0, "unemployment": 0, "temporary": 0}

    def put(county: str, name: str, **flags) -> None:
        key = f"{county_key(county)}|{normalize(name)}"
        entry = settlements.setdefault(key, {"n": name, "c": county, "s": 0, "u": 0, "t": 0})
        entry.update(flags)

    county = ""
    for cells in benefit[2:]:  # two header rows
        if len(cells) < 5:
            continue
        _, col_county, name, socio, unemployment = cells[:5]
        county = col_county or county  # the county is printed once per block
        if not name or not county:
            continue
        put(county, name, s=1 if socio.strip() == "1" else 0,
            u=1 if unemployment.strip() == "1" else 0)
        counts["socio"] += 1 if socio.strip() == "1" else 0
        counts["unemployment"] += 1 if unemployment.strip() == "1" else 0

    county = ""
    for cells in temporary[2:]:
        if len(cells) < 3:
            continue
        _, col_county, name = cells[:3]
        county = col_county or county
        if not name or not county:
            continue
        put(county, name, t=1)
        counts["temporary"] += 1

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "105/2015. (IV. 23.) Korm. rendelet 2. és 3. melléklete",
        "sourceUrl": SOURCE_URL,
        "fetched": date.today().isoformat(),
        "counts": {**counts, "settlements": len(settlements)},
        "settlements": dict(sorted(settlements.items())),
    }
    guard(out)
    return out


def guard(out: dict) -> None:
    counts = out["counts"]
    if counts["socio"] < 900 or counts["temporary"] < 300:
        raise ParseError(f"implausible counts: {counts}")
    for key, entry in out["settlements"].items():
        if set(entry) - {"n", "c", "s", "u", "t"}:
            raise ParseError(f"{key}: unexpected fields")
        if not entry["n"] or not entry["c"]:
            raise ParseError(f"{key}: settlement without a name or county")
        if not any(entry[flag] for flag in ("s", "u", "t")):
            raise ParseError(f"{key}: listed without any status")
        if "|" not in key:
            raise ParseError(f"{key}: malformed key")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=SOURCE_URL)
    args = parser.parse_args()
    cache = RAW / f"105-2015_{date.today().isoformat()}.html"
    try:
        out = parse(fetch(args.url, cache))
    except (ParseError, requests.RequestException) as exc:
        sys.exit(f"beneficiary settlements: {exc}")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    c = out["counts"]
    print(f"wrote {OUT}: {c['settlements']} settlements "
          f"(socio-economic {c['socio']}, unemployment {c['unemployment']}, "
          f"temporary {c['temporary']})")


if __name__ == "__main__":
    main()
