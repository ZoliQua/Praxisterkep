"""Mortality by járás: what the site has been missing — an outcome.

Everything else on the site measures an input: whether a district has a
doctor, how far the surgery is, how long the post has been empty. None of it
says what that costs. Avoidable mortality is the measure that does: deaths
under 75 from causes that timely care or prevention should not let kill.

The source is the Nemzeti Népegészségügyi és Gyógyszerészeti Központ
(NNGYK), which publishes it per járás from the full death microdata:

    https://nngyk.gov.hu/hu/halandosagi-adatbazis.html

It is the right source rather than a computation of our own from KSH's
district death tables (Statinfo NH3A07), because KSH masks every cell under
three deaths and draws it exactly like a zero. Broken down by járás, cause,
age and year most cells are that small, and treating them as zero would make
the small rural járás — the ones this site is about — look healthiest. NNGYK
works from the unmasked records.

What it publishes, per year, as one interactive map per cause group:

  SHA  standardizált halálozási arányszám — directly standardised to the
       2013 European Standard Population, per 100 000. Additive across
       disjoint causes, comparable between places.
  SHH  standardizált halálozási hányados — indirectly standardised against
       the national rates; 100 = what the national rates would predict.

and three avoidable-mortality groups (SHA only), following Eurostat's lists:

  11  elkerülhető        causes only on the treatable list
  12  megelőzhető        causes only on the preventable list
  13  részben-részben    causes on both lists (ischaemic heart disease,
                         colorectal, breast and cervical cancer, diabetes,
                         pneumonia…)

The three groups are disjoint, so their sum is total avoidable mortality, and
11 + 13 is everything on the treatable list — the part where access to care
is what decides. Both sums are computed here and named for what they are.

Each map is an R htmlwidgets/leaflet page of about 22 MB, almost all of it
base64 map geometry. The numbers live in one JSON payload of ~270 KB inside
it (the popup tables). That payload is archived byte for byte, gzipped, in
data/raw/nngyk/<year>/, and the manifest beside it records the URL, the date
and the SHA-256 of the whole original file — so every figure traces to an
archived file, and anyone can download the original again and check it is
the same one. Archiving the geometry too would put 330 MB in git for nothing
the site reads.

Usage:
  python etl/nngyk_mortality.py [--refresh]
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import html as htmllib
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import unquote

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "mortality.json"
RAW = ROOT / "data" / "raw" / "nngyk"
SCHEMA_VERSION = 1

SITE = "https://nngyk.gov.hu"
LISTING = SITE + "/index.php?option=com_ajax&plugin=filelista&group=content&format=json"
PAGE = SITE + "/hu/halandosagi-adatbazis.html"
FOLDER = "halandosagi-adatbazis-{year}-terkepek/{year}_{kind}_Halalokonkent"
HEADERS = {"User-Agent": "Praxisterkep/1.0 (+https://github.com/ZoliQua/Praxisterkep)"}
# the newest year looked for; the fetcher walks back from here until it finds
# a published set, so next year's maps are picked up without a code change
FIRST_YEAR_TRIED = date.today().year
OLDEST_YEAR = 2024

# file number -> our key. The numbering is NNGYK's own and is the same in
# the SHA and the SHH folders; 11–13 exist only as SHA.
CAUSES = {
    "01": "all",
    "02": "digestive",
    "03": "cerebrovascular",
    "04": "chronicRespiratory",
    "05": "ischaemicHeart",
    "06": "circulatory",
    "07": "respiratory",
    "08": "mental",
    "09": "external",
    "10": "cancer",
    "11": "treatable",
    "12": "preventable",
    "13": "both",
}
AVOIDABLE = ("treatable", "preventable", "both")
SEXES = {"ffi": "m", "nő": "f", "összesen": "t"}
LAYER = re.compile(r"^(Vármegye|Járás) - (ffi|nő|összesen)$")
WIDGET = re.compile(r'<script type="application/json" data-for="[^"]+">(.*?)</script>', re.S)
# the járás layer must carry exactly the 197 járás (174 + the capital's 23)
DISTRICTS = 197
COUNTIES = 20


def _post(url: str, data: dict) -> dict:
    r = requests.post(url, data=data, headers=HEADERS, timeout=120)
    r.raise_for_status()
    return r.json()


def list_files(year: int, kind: str) -> list[str]:
    """The map URLs NNGYK lists for one year and one indicator."""
    payload = _post(LISTING, {"folder": FOLDER.format(year=year, kind=kind),
                              "exclude_files": "", "exclude_extensions": ""})
    data = payload.get("data")
    text = "".join(data) if isinstance(data, list) else str(data or "")
    urls = re.findall(r'href="([^"]+\.html)"', text)
    return sorted({htmllib.unescape(u) for u in urls})


def latest_year() -> int:
    for year in range(FIRST_YEAR_TRIED, OLDEST_YEAR - 1, -1):
        if list_files(year, "SHA"):
            return year
    raise ParseError("NNGYK lists no mortality maps for any year from "
                     f"{FIRST_YEAR_TRIED} back to {OLDEST_YEAR}")


def file_number(url: str) -> str:
    m = re.match(r"(\d{2})_", unquote(url.rsplit("/", 1)[-1]))
    if not m:
        raise ParseError(f"unexpected map file name: {url}")
    return m.group(1)


def extract_widget(page: str) -> str:
    m = WIDGET.search(page)
    if not m:
        raise ParseError("no htmlwidgets payload in the map page")
    return m.group(1)


def archive(year: int, refresh: bool = False) -> Path:
    """Download every map of `year` once and keep the data-bearing part."""
    folder = RAW / str(year)
    manifest_path = folder / "manifest.json"
    if manifest_path.exists() and not refresh:
        return folder
    folder.mkdir(parents=True, exist_ok=True)
    manifest = {"source": PAGE, "year": year, "fetched": date.today().isoformat(),
                "note": ("Each entry keeps the htmlwidgets JSON payload of one "
                         "NNGYK map byte for byte; sha256 is of the whole "
                         "original page, which also carries the base64 map "
                         "geometry this project does not archive."),
                "files": []}
    for kind in ("SHA", "SHH"):
        for url in list_files(year, kind):
            resp = requests.get(url, headers=HEADERS, timeout=300)
            resp.raise_for_status()
            raw = resp.content
            widget = extract_widget(raw.decode("utf-8"))
            num = file_number(url)
            name = f"{kind}_{num}.widget.json.gz"
            (folder / name).write_bytes(gzip.compress(widget.encode("utf-8"), 9))
            manifest["files"].append({
                "kind": kind, "number": num, "url": url, "archived": name,
                "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                "widgetSha256": hashlib.sha256(widget.encode("utf-8")).hexdigest(),
            })
            print(f"  {kind} {num}: {len(raw) / 1e6:.1f} MB -> {name}")
    if not manifest["files"]:
        raise ParseError(f"NNGYK listed no files for {year}")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n",
                             encoding="utf-8")
    return folder


# Some maps were written through Latin-1, which has no ő or ű and puts õ and
# û in their place: the SHH set spells the county "Gyõr-Moson-Sopron". It is
# the same county, so the letter is mended rather than the county doubled.
_LATIN1 = str.maketrans({"õ": "ő", "Õ": "Ő", "û": "ű", "Û": "Ű"})


def _cells(popup: str) -> dict[str, str]:
    """One popup table -> {header: value}. The tables are machine-written:
    <th>Label&emsp;</th><td>value&emsp;</td>, one row per field."""
    out = {}
    for th, td in re.findall(r"<th>(?:<b>)?(.*?)(?:</b>)?</th><td>(.*?)</td>", popup, re.S):
        key = htmllib.unescape(re.sub("<[^>]+>", "", th)).replace(" ", "").strip().rstrip(":")
        val = htmllib.unescape(re.sub("<[^>]+>", "", td)).replace(" ", "").strip()
        out[key.translate(_LATIN1)] = val.translate(_LATIN1)
    return out


def parse_widget(widget: str) -> dict:
    """{'title': str, 'cause': str, 'layers': {('Járás','t'): {name: value}}}"""
    doc = json.loads(widget)
    calls = doc["x"]["calls"]
    title = next((c["args"][0] for c in calls if c["method"] == "addControl"), "")
    layers: dict[tuple[str, str], dict[str, float | None]] = {}
    cause = None
    for c in calls:
        if c["method"] != "addFlatGeoBuf":
            continue
        m = LAYER.match(c["args"][1] or "")
        if not m:
            continue
        level, sex = m.group(1), SEXES[m.group(2)]
        values: dict[str, float | None] = {}
        for popup in c["args"][3]:
            cells = _cells(popup)
            name = cells.get("Járás") if level == "Járás" else cells.get("Vármegye")
            fields = [k for k in cells if k not in ("Feature ID", "Vármegye", "Járás")]
            if not name or len(fields) != 1:
                raise ParseError(f"unexpected popup in '{title}': {sorted(cells)}")
            cause = cause or fields[0]
            text = cells[fields[0]]
            values[name] = None if text in ("", "NA", "NaN") else float(text)
        layers[(level, sex)] = values
    if not layers:
        raise ParseError(f"no area layers in '{title}'")
    return {"title": title, "cause": cause, "layers": layers}


def _check(parsed: dict, label: str) -> None:
    for sex in SEXES.values():
        d = parsed["layers"].get(("Járás", sex), {})
        c = parsed["layers"].get(("Vármegye", sex), {})
        if len(d) != DISTRICTS or len(c) != COUNTIES:
            raise ParseError(f"{label}: {len(d)} járás / {len(c)} counties for sex "
                             f"{sex}, expected {DISTRICTS} / {COUNTIES}")


def build(refresh: bool = False) -> dict:
    year = latest_year()
    folder = archive(year, refresh)
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))

    districts: dict[str, dict] = {}
    counties: dict[str, dict] = {}
    measures: dict[str, dict] = {}
    for entry in manifest["files"]:
        key = CAUSES.get(entry["number"])
        if key is None:
            raise ParseError(f"unknown NNGYK map number {entry['number']}: {entry['url']}")
        widget = gzip.decompress((folder / entry["archived"]).read_bytes()).decode("utf-8")
        if hashlib.sha256(widget.encode("utf-8")).hexdigest() != entry["widgetSha256"]:
            raise ParseError(f"archived payload {entry['archived']} does not match its manifest")
        parsed = parse_widget(widget)
        _check(parsed, entry["archived"])
        kind = entry["kind"].lower()
        measures.setdefault(key, {"label": parsed["cause"], "kinds": []})["kinds"].append(kind)
        for (level, sex), values in parsed["layers"].items():
            target = districts if level == "Járás" else counties
            for name, value in values.items():
                target.setdefault(name, {}).setdefault(kind, {}).setdefault(key, {})[sex] = (
                    None if value is None else round(value, 2))

    # the járás layer names its county in every popup; keep it so a district
    # can be placed without a second lookup
    for entry in manifest["files"]:
        if entry["kind"] == "SHA" and entry["number"] == "01":
            widget = gzip.decompress((folder / entry["archived"]).read_bytes()).decode("utf-8")
            for c in json.loads(widget)["x"]["calls"]:
                if c["method"] == "addFlatGeoBuf" and c["args"][1] == "Járás - összesen":
                    for popup in c["args"][3]:
                        cells = _cells(popup)
                        districts[cells["Járás"]]["county"] = cells["Vármegye"]

    missing = [k for k in AVOIDABLE if k not in measures]
    if missing:
        raise ParseError(f"avoidable-mortality maps missing: {', '.join(missing)}")

    def combine(rows: dict) -> None:
        # directly standardised rates on one standard population add up over
        # disjoint causes; the three avoidable groups are disjoint by design
        for row in rows.values():
            sha = row.get("sha", {})
            for name, parts in (("avoidable", AVOIDABLE), ("amenable", ("treatable", "both"))):
                out = {}
                for sex in SEXES.values():
                    vals = [sha.get(p, {}).get(sex) for p in parts]
                    out[sex] = None if any(v is None for v in vals) else round(sum(vals), 2)
                sha[name] = out
            # the same deaths divided the way Eurostat divides them: a cause
            # on both lists counts half to each (OECD/Eurostat 2022 method)
            for name, own in (("treatableEU", "treatable"), ("preventableEU", "preventable")):
                out = {}
                for sex in SEXES.values():
                    a, b = sha.get(own, {}).get(sex), sha.get("both", {}).get(sex)
                    out[sex] = None if a is None or b is None else round(a + b / 2, 2)
                sha[name] = out

    if len(districts) != DISTRICTS or len(counties) != COUNTIES:
        # one spelling drifting between maps would split a place in two
        raise ParseError(f"maps disagree on names: {len(districts)} járás, "
                         f"{len(counties)} counties after merging")

    combine(districts)
    combine(counties)
    measures["avoidable"] = {"label": "Elkerülhető halálozás összesen (11+12+13)", "kinds": ["sha"]}
    measures["amenable"] = {"label": "Ellátással befolyásolható (11+13)", "kinds": ["sha"]}
    measures["treatableEU"] = {"label": "Kezelhető, Eurostat-módszer (11+½·13)", "kinds": ["sha"]}
    measures["preventableEU"] = {"label": "Megelőzhető, Eurostat-módszer (12+½·13)", "kinds": ["sha"]}

    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "NNGYK Halandósági adatbázis",
        "sourceUrl": PAGE,
        "year": year,
        "fetched": manifest["fetched"],
        "standard": "2013 European Standard Population",
        "measures": measures,
        "counts": {"districts": len(districts), "counties": len(counties),
                   "maps": len(manifest["files"])},
        "districts": districts,
        "counties": counties,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true",
                    help="download the maps again even if this year is archived")
    out = build(ap.parse_args().refresh)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}: {out['year']}, {out['counts']['districts']} járás, "
          f"{out['counts']['maps']} maps")


if __name__ == "__main__":
    main()
