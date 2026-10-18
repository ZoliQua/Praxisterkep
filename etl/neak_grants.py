"""Did paying a doctor to settle fill the district — and keep it filled?

NEAK runs two grants for primary care and publishes every year's winners
(source P):

  letelepedés   a lump sum for a GP or dentist who takes over a district
                that has been vacant for at least twelve months
  praxisjog     support for a GP buying the practice right of a district,
                usually from a doctor about to retire

Each list gives, per winner, the county, the settlement and the address of
the district taken over, and marks with an asterisk the winners who in the
end signed no contract. The lists are PDFs on neak.gov.hu, one per year and
programme; the URLs are below and every file is archived under
data/raw/neak_grants/ with its SHA-256 in the manifest beside it.

The winner's name is read past and never kept: the site shows a physician's
name only from the NEAK registry of contracted providers (CLAUDE.md rule 3),
and a grant list is not that registry.

What this module adds is the follow-up NEAK does not publish. Each winner's
address is matched to a district (FIN code) through the monthly archive:

  1. a vacant district of the same kind, in the same settlement, at the same
     address (etl/address.py decides "same address"), listed vacant in the
     two years up to the end of the grant year — the district the grant was
     for;
  2. failing that, a filled district at that address in a registry snapshot
     from the grant year on — the district the winner went on to run;
  3. failing both, the winner stays unmatched and is counted as such.

Then each matched district's status in the latest month: filled, vacant
again, or gone from the registry (dissolved or merged). The comparison
group is every GP or dental district that had been vacant for at least
twelve months at the end of a grant year without a grant — the districts
that could have been chosen and were not. A district taken over with a
grant was chosen by a doctor who wanted it, so the gap between the two
groups is not the grant's effect alone; the page says so.

Usage:
  python etl/neak_grants.py [--refresh]
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import pdfplumber
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

import address
from parse_dental import ParseError
from parse_ksh import load_reference

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw" / "neak_grants"
OUT = DATA / "grants.json"
SCHEMA_VERSION = 1

BASE = ("https://neak.gov.hu/pfile/file?path=/letoltheto/altfin_dok/altfin_virt_dok2/"
        "Alapellatas/hsz-fog-palyazatok/")
PAGE = ("https://neak.gov.hu/felso_menu/szakmai_oldalak/gyogyito_megeleozo_ellatas/"
        "alapellatas/haziorvosi_ellatas/archivum")
HEADERS = {"User-Agent": "Praxisterkep/1.0 (+https://github.com/ZoliQua/Praxisterkep)"}

# (programme, kind, grant year) -> path under BASE. NEAK names the files by
# hand: 2023's GP list sits under a "2022" file name, 2020 has no winners list
# on the site at all, and the dental praxisjog grant has never been listed.
FILES = {
    ("settle", "gp", 2019): "Hsz_fog_letelepedes_palyazat_2019/nyert_letel_hsz_2019",
    ("settle", "dental", 2019): "Hsz_fog_letelepedes_palyazat_2019/nyert_letel_fog_2019",
    ("settle", "gp", 2021): "hsz_fog_letel_2021/palyzat_nyertes_letel_hsz_2021",
    ("settle", "dental", 2021): "hsz_fog_letel_2021/palyzat_nyertes_letel_fog_2021",
    ("settle", "gp", 2022): "hsz_fog_letel_2022/palyzat_nyertes_letel_hsz_2022",
    ("settle", "dental", 2022): "hsz_fog_letel_2022/palyzat_nyertes_letel_fog_2022",
    ("settle", "gp", 2023): "hsz_fog_letel_2023_2/palyazat_nyertes_letel_hsz_2022",
    ("settle", "dental", 2023): "hsz_fog_letel_2023_2/palyazat_nyertes_letel_fog_2023",
    ("settle", "gp", 2024): "hsz_fog_letel_2024/palyazat_nyertes_letel_hsz_2024",
    ("settle", "dental", 2024): "hsz_fog_letel_2024/palyazat_nyertes_letel_fog_2024",
    ("settle", "gp", 2025): "hsz_fog_letel_2025/kozlemeny-nyertesekrol_letelepedes_haziorvos_2025",
    ("settle", "dental", 2025): "hsz_fog_letel_2025/kozlemeny-nyertesekrol_letelepedes_fogaszat-2025",
    ("practice", "gp", 2021): "hsz_prjog_2021/palyzat_nyertes_prjog_hsz_2021",
    ("practice", "gp", 2022): "hsz_prjog_2022/palyzat_nyertes_prjog_hsz_2022",
    ("practice", "gp", 2023): "hsz_fog_letel_2023_2/palyazat_nyertes_prjog_hsz_2023",
    ("practice", "gp", 2024): "hsz_fog_prjog_2024/palyazat_nyertes_prjog_hsz_2024",
    ("practice", "gp", 2025): "hsz_fog_prjog_2025/kozlemeny-nyertesekrol_praxisjog_haziorvos_2025",
}
TITLE = {
    "settle": re.compile(r"letelepedésének\s+támogatása.*?(\d{4})\.\s*évi\s+nyertes", re.S),
    "practice": re.compile(r"praxisjog\s+vásárlásának\s+támogatása.*?(\d{4})\.\s*évi\s+nyertes", re.S),
}
KIND_WORD = {"gp": "háziorvos", "dental": "fogorvos"}
ROMAN = {"I": 1, "V": 5, "X": 10}
# NEAK's own misspellings, put right by hand and flagged in the output.
# "Rém-Csávoly" is the joint dental district of the two villages; its
# surgery, Május 1. u. 19/a, is in Rém.
SETTLEMENT_FIXES = {"Gyomaenrőd": "Gyomaendrőd", "Rém-Csávoly": "Rém"}
# a year's list is published early the next year; the vacant lists searched
# for the district run from two years before to the end of the grant year
LOOKBACK_YEARS = 2


def _file_name(key: tuple) -> str:
    programme, kind, year = key
    return f"{programme}_{kind}_{year}.pdf"


def archive(refresh: bool = False) -> dict:
    """Download (or reuse) every list; the manifest pins each file's hash."""
    RAW.mkdir(parents=True, exist_ok=True)
    manifest_path = RAW / "manifest.json"
    manifest = (json.loads(manifest_path.read_text(encoding="utf-8"))
                if manifest_path.exists() else {"files": {}})
    for key, rel in FILES.items():
        name = _file_name(key)
        target = RAW / name
        if target.exists() and not refresh and name in manifest["files"]:
            continue
        url = f"{BASE}{rel}&inline=true"
        resp = requests.get(url, timeout=120, headers=HEADERS)
        resp.raise_for_status()
        if not resp.content.startswith(b"%PDF"):
            raise ParseError(f"{url} did not return a PDF")
        target.write_bytes(resp.content)
        manifest["files"][name] = {"url": url, "retrieved": date.today().isoformat(),
                                   "sha256": hashlib.sha256(resp.content).hexdigest()}
    manifest["page"] = PAGE
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                             encoding="utf-8")
    return manifest


def _roman(text: str) -> int:
    total = 0
    for a, b in zip(text, text[1:] + " "):
        v = ROMAN[a]
        total += -v if b != " " and ROMAN.get(b, 0) > v else v
    return total


def _bare(text: str) -> str:
    """Casefolded, accents off: "BORSOD-ABAUJ-ZEMPLÉN" is the same county."""
    return "".join(ch for ch in unicodedata.normalize("NFD", text.casefold())
                   if unicodedata.category(ch) != "Mn")


class Places:
    """County and settlement spelled the way the gazetteer spells them."""

    def __init__(self) -> None:
        ksh = load_reference()
        if ksh is None:
            raise ParseError("the KSH gazetteer is missing; run the pipeline first")
        self.entries = {(e["county"], e["name"].casefold()): e for e in ksh.entries}
        self.counties = sorted({e["county"] for e in ksh.entries})

    def county(self, raw: str) -> str:
        text = re.sub(r"-\s+", "-", " ".join(raw.split())).strip()
        # "P E S T": a heading letter-spaced by hand
        if re.fullmatch(r"(?:\w )+\w", text):
            text = text.replace(" ", "")
        # "Borsod-Abaúj Zemplén": a space where the hyphen belongs
        folded = re.sub(r"[\s-]+", "-", _bare(text).rstrip("."))
        for c in self.counties:
            if _bare(c) == folded:
                return c
        if folded == "csongrad":
            return "Csongrád-Csanád"
        # "Komárom-E." — the list abbreviates the second half
        hits = [c for c in self.counties if _bare(c).startswith(folded)]
        if len(hits) == 1:
            return hits[0]
        raise ParseError(f"unknown county {raw!r} in a grant list")

    def settlement(self, county: str, raw: str) -> tuple[dict, list[str]]:
        """The gazetteer entry, and what had to be corrected to find it."""
        fixes: list[str] = []
        text = " ".join(raw.split())
        if text in SETTLEMENT_FIXES:
            text = SETTLEMENT_FIXES[text]
            fixes.append("settlement")
        m = re.fullmatch(r"Budapest,?\s+([IVX]+)\.?\s*(?:kerület|ker\.)?", text, re.I)
        if m:
            text = f"Budapest {_roman(m.group(1).upper()):02d}. ker."
            if county != "Budapest":
                county = "Budapest"
                fixes.append("county")
        hit = self.entries.get((county, text.casefold()))
        if hit is None:
            # the right settlement under the wrong county: only when the name
            # is unique in the country, so the correction cannot pick wrongly
            same = [e for (c, n), e in self.entries.items() if n == text.casefold()]
            if len(same) == 1:
                hit = same[0]
                fixes.append("county")
        if hit is None:
            raise ParseError(f"unknown settlement {raw!r} in {county} in a grant list")
        return hit, fixes


def parse(path: Path, programme: str, kind: str, year: int, places: Places) -> list[dict]:
    with pdfplumber.open(path) as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        rows = [r for page in pdf.pages for t in page.extract_tables() for r in t]
    title = TITLE[programme].search(text)
    if not title or int(title.group(1)) != year:
        raise ParseError(f"{path.name}: not the {year} {programme} winners list")
    if programme == "settle" and KIND_WORD[kind] not in text[:600]:
        raise ParseError(f"{path.name}: not a {kind} list")
    winners = []
    for r in rows:
        cells = [c for c in r if c not in (None, "")]
        if not cells or not re.fullmatch(r"\d+\.?", str(cells[0]).strip()):
            continue
        if len(cells) != 5:
            raise ParseError(f"{path.name}: row {cells[0]} has {len(cells)} cells")
        seq, name, county_raw, settlement_raw, addr = cells
        # 2019's dental list puts the kerület in the county column and plain
        # "Budapest" in the settlement column
        if re.fullmatch(r"Budapest\s+[IVX]+\.?", " ".join(county_raw.split())) \
                and settlement_raw.strip() == "Budapest":
            county_raw, settlement_raw = "Budapest", f"{county_raw.strip()} kerület"
        entry, fixes = places.settlement(places.county(county_raw), settlement_raw)
        winners.append({
            "programme": programme, "kind": kind, "year": year,
            "seq": int(str(seq).strip(". ")),
            "county": entry["county"], "settlement": entry["name"], "kshId": entry["kshId"],
            "corrected": fixes,
            "district": entry["district"],
            "address": address.tidy(" ".join(addr.split())),
            # the asterisk: chosen, but no contract was signed
            "contract": "*" not in name,
        })
    seqs = [w["seq"] for w in winners]
    if not winners or seqs != list(range(1, len(seqs) + 1)):
        raise ParseError(f"{path.name}: winners are not numbered 1..n ({seqs[:5]}…)")
    return winners


def snapshots(kind: str) -> list[dict]:
    out = []
    for month_dir in sorted(p for p in DATA.iterdir() if re.fullmatch(r"\d{4}-\d{2}", p.name)):
        f = month_dir / f"{kind}.json"
        if f.exists():
            d = json.loads(f.read_text(encoding="utf-8"))
            out.append({"month": d["month"], "vacant": d.get("praxes") or [],
                        "filled": d.get("filledPraxes") or []})
    return out


def _same(a: str, b: str) -> bool:
    return address._same_place(address._stem(address.tidy(a)), address._stem(address.tidy(b)))


def _left_vacancy(fin: str, snaps: list[dict], first: str, last: str) -> bool:
    """Whether the district was vacant before `last` and filled by the end of it."""
    seen_vacant = was_filled = False
    for s in snaps:
        if s["month"] > last:
            break
        ids = {p["id"] for p in s["vacant"]}
        if fin in ids:
            seen_vacant, was_filled = True, False
        elif seen_vacant and s["month"] >= first and s["filled"] and \
                fin in {p["id"] for p in s["filled"]}:
            was_filled = True
    return seen_vacant and was_filled


def match(w: dict, snaps: list[dict]) -> tuple[list[str], str, str | None]:
    """(FIN codes, how they were found, since when the district was vacant).

    One surgery address often hosts several districts — a health centre with
    five GPs is one address. Anything short of a single district is reported
    as "ambiguous" with every candidate, and left out of the outcome counts:
    "any of the five has a doctor now" would flatter the grant.
    """
    first = f"{w['year'] - LOOKBACK_YEARS}-01"
    last = f"{w['year']}-12"
    since: dict[str, str | None] = {}
    for s in snaps:
        if not first <= s["month"] <= last:
            continue
        for p in s["vacant"]:
            for site in p.get("sites") or []:
                if site.get("settlement") == w["settlement"] and _same(site.get("address", ""),
                                                                      w["address"]):
                    since.setdefault(p["id"], p.get("vacantSince"))
    if since:
        fins = sorted(since)
        if len(fins) > 1:
            # the district the grant filled left the vacant list in the
            # grant year or the year after
            left = [f for f in fins if _left_vacancy(f, snaps, f"{w['year']}-01",
                                                    f"{w['year'] + 1}-12")]
            if len(left) == 1:
                return left, "vacant", since[left[0]]
            return fins, "ambiguous", None
        return fins, "vacant", since[fins[0]]
    # no vacant district there: the registry's first snapshot from the grant
    # year on, and only if the address holds exactly one district
    for s in snaps:
        if s["month"] < f"{w['year']}-01" or not s["filled"]:
            continue
        here = sorted({p["id"] for p in s["filled"]
                       if p.get("settlement") == w["settlement"]
                       and _same(p.get("address", ""), w["address"])})
        if here:
            return (here, "registry", None) if len(here) == 1 else (here, "ambiguous", None)
    return [], "none", None


def status_now(fins: list[str], latest: dict) -> str:
    """filled if any of the districts has a doctor now, else vacant, else gone."""
    if any(f in latest["filledIds"] for f in fins):
        return "filled"
    if any(f in latest["vacantIds"] for f in fins):
        return "vacant"
    return "gone"


def _months(a: str, b: str) -> int:
    ya, ma = map(int, a.split("-"))
    yb, mb = map(int, b.split("-"))
    return (yb - ya) * 12 + (mb - ma)


def comparison(kind: str, snaps: list[dict], granted: set[str], latest: dict,
               years: list[int]) -> list[dict]:
    """Long-vacant districts without a grant, per grant year, and where they are now."""
    out = []
    for year in years:
        in_year = [s for s in snaps if s["month"].startswith(str(year))]
        if not in_year:
            continue
        s = in_year[-1]
        cohort = [p["id"] for p in s["vacant"]
                  if p.get("vacantSince") and _months(p["vacantSince"], s["month"]) >= 12
                  and p["id"] not in granted]
        counts = collections.Counter(status_now([f], latest) for f in cohort)
        out.append({"year": year, "month": s["month"], "districts": len(cohort), **counts})
    return out


def summarise(rows: list[dict]) -> dict:
    c = collections.Counter(r["status"] for r in rows if r["contract"] and r["status"])
    return {
        "winners": len(rows),
        "noContract": sum(1 for r in rows if not r["contract"]),
        "matched": sum(1 for r in rows if r["status"]),
        "ambiguous": sum(1 for r in rows if r["matchedBy"] == "ambiguous"),
        "unmatched": sum(1 for r in rows if r["matchedBy"] == "none"),
        "filled": c["filled"], "vacant": c["vacant"], "gone": c["gone"],
    }


def build(refresh: bool = False) -> dict:
    manifest = archive(refresh)
    places = Places()
    winners: list[dict] = []
    for key in FILES:
        winners += parse(RAW / _file_name(key), *key, places)

    out_kinds: dict[str, dict] = {}
    for kind in ("gp", "dental"):
        snaps = snapshots(kind)
        latest_vacant = next(s for s in reversed(snaps) if s["vacant"])
        latest_filled = next(s for s in reversed(snaps) if s["filled"])
        if latest_filled["month"] != snaps[-1]["month"]:
            raise ParseError(f"{kind}: the newest snapshot has no registry; "
                             "a grant's outcome cannot be read")
        latest = {"month": snaps[-1]["month"],
                  "filledIds": {p["id"] for p in latest_filled["filled"]},
                  "vacantIds": {p["id"] for p in latest_vacant["vacant"]}}
        rows = []
        for w in (w for w in winners if w["kind"] == kind):
            fins, how, since = match(w, snaps)
            rows.append({**w, "fins": fins, "matchedBy": how, "vacantSince": since,
                         "status": (status_now(fins, latest)
                                    if fins and how != "ambiguous" else None)})
        settle = [r for r in rows if r["programme"] == "settle"]
        years = sorted({r["year"] for r in settle})
        granted = {f for r in settle for f in r["fins"]}
        out_kinds[kind] = {
            "latestMonth": latest["month"],
            "years": years,
            "byProgrammeYear": [
                {"programme": p, "year": y, **summarise([r for r in rows
                                                         if r["programme"] == p and r["year"] == y])}
                for p in ("settle", "practice") for y in sorted({r["year"] for r in rows})
                if any(r["programme"] == p and r["year"] == y for r in rows)],
            "byCounty": [
                {"county": c, **summarise([r for r in settle if r["county"] == c])}
                for c in sorted({r["county"] for r in settle})],
            "total": {p: summarise([r for r in rows if r["programme"] == p])
                      for p in ("settle", "practice") if any(r["programme"] == p for r in rows)},
            "comparison": comparison(kind, snaps, granted, latest, years),
            "winners": rows,
        }
    out = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "NEAK — háziorvosi és fogorvosi letelepedési, illetve praxisjog-vásárlási "
                  "pályázatok nyertesei",
        "sourceUrl": PAGE,
        "files": manifest["files"],
        "kinds": out_kinds,
    }
    guard(out)
    return out


def guard(out: dict) -> None:
    for kind, k in out["kinds"].items():
        rows = k["winners"]
        if len(rows) < 100:
            raise ParseError(f"{kind}: only {len(rows)} winners read")
        signed = [r for r in rows if r["contract"]]
        share = sum(1 for r in signed if r["status"]) / len(signed)
        # an address that matches nothing is possible (a surgery that moved),
        # and a shared health centre is honestly ambiguous; most of them not
        # matching means the matcher broke
        if share < 0.6:
            raise ParseError(f"{kind}: only {share:.0%} of winners matched to a district")
        for r in rows:
            if "name" in r or "doctor" in r:
                raise ParseError("a winner's name reached the output")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true", help="re-download the lists")
    args = parser.parse_args()
    out = build(args.refresh)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}")
    for kind, k in out["kinds"].items():
        for p, t in k["total"].items():
            print(f"  {kind} {p}: {t}")
        for c in k["comparison"]:
            print(f"    no grant, vacant ≥12 months at {c['month']}: {c}")


if __name__ == "__main__":
    main()
