"""Who holds the districts: turnover and multi-district physicians.

Every archived month names the contracted physician of each filled district,
which is the one thing the site has never used for anything but the tenure
factor of the risk model. Read across the whole archive it answers questions
no single snapshot can:

    how often does a district change physician at all
    how many districts one physician holds at the same time
    how much of the country is held by physicians holding several districts
    which counties churn and which never move

Names never leave this module. Every physician is reduced to a stable
pseudonymous key (a truncated hash of the normalised name) before anything
is counted, the output carries only counts and keys, and a guard fails the
build if a name marker appears anywhere in it. The published numbers are
therefore about *how many* physicians, never about who.

A name is a weak identity: two physicians can share one, and one can appear
with and without a title or a middle name. Names are normalised (title,
punctuation and accents stripped, word order sorted) to soften the second
case; the first is left as it is and stated as a limit, because the public
data carries nothing else to tell two people apart.

Usage:
  python etl/workforce.py
"""
from __future__ import annotations

import collections
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from risk import RiskError, load_history, months_between

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "workforce.json"
SCHEMA_VERSION = 1

TITLE_RE = re.compile(r"\b(dr|prof|med|habil|phd|univ)\b\.?", re.IGNORECASE)
NAME_MARKER_RE = re.compile(r"\bdr\b\.?", re.IGNORECASE)
PORTFOLIO_BANDS = [("1", 1), ("2", 2), ("3", 3), ("4+", None)]


def normalise(name: str) -> str:
    """"Dr. Kovács-Nagy Béla István" -> "bela istvan kovacsnagy" (sorted)."""
    text = TITLE_RE.sub(" ", name or "")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-zA-Z\s]", "", text).lower()
    return " ".join(sorted(w for w in text.split() if len(w) > 1))


def key_of(name: str) -> str:
    """A stable pseudonym; the name itself never travels further than here."""
    canon = normalise(name)
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()[:12] if canon else ""


def build() -> dict:
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    kinds: dict[str, dict] = {}
    for kind in ("dental", "gp"):
        history = load_history(kind)
        months = sorted(history)
        snap = latest["kinds"][kind]
        county_of = {f["id"]: f.get("county", "") for f in snap["filledPraxes"]}
        settlement_of = {f["id"]: f.get("settlement", "") for f in snap["filledPraxes"]}

        # --- turnover: how often a district changed hands -------------------
        seen: dict[str, str] = {}          # district -> last physician key
        changes: dict[str, int] = collections.Counter()
        spans: dict[str, int] = collections.Counter()   # months observed filled
        first_month: dict[str, str] = {}
        for month in months:
            for fid, (status, doctor) in history[month].items():
                if status != "filled":
                    seen.pop(fid, None)
                    continue
                key = key_of(doctor)
                spans[fid] += 1
                first_month.setdefault(fid, month)
                if not key:
                    continue
                previous = seen.get(fid)
                if previous and previous != key:
                    changes[fid] += 1
                seen[fid] = key

        # --- portfolios: how many districts one physician holds today -------
        today = history[months[-1]]
        holding: dict[str, list[str]] = collections.defaultdict(list)
        for fid, (status, doctor) in today.items():
            key = key_of(doctor)
            if status == "filled" and key:
                holding[key].append(fid)
        portfolios = [{
            "key": key,
            "districts": len(fids),
            "counties": sorted({county_of.get(f, "") for f in fids if county_of.get(f)}),
            "settlements": sorted({settlement_of.get(f, "") for f in fids
                                   if settlement_of.get(f)}),
            "ids": sorted(fids),
        } for key, fids in holding.items()]
        portfolios.sort(key=lambda p: (-p["districts"], p["key"]))

        districts = [{
            "id": fid,
            "county": county_of.get(fid, ""),
            "settlement": settlement_of.get(fid, ""),
            "changes": changes.get(fid, 0),
            "monthsObserved": spans.get(fid, 0),
            "firstSeen": first_month.get(fid, ""),
            "heldToday": bool(today.get(fid, ("", ""))[0] == "filled"),
            "portfolioToday": len(holding.get(key_of(today.get(fid, ("", ""))[1]), []))
            if today.get(fid, ("", ""))[0] == "filled" else 0,
        } for fid in sorted(spans)]

        kinds[kind] = {
            "months": months,
            "archiveMonths": months_between(months[0], months[-1]),
            "stats": summarise(districts, portfolios),
            "counties": by_county(districts),
            "portfolioBands": portfolio_bands(portfolios),
            "portfolios": [p for p in portfolios if p["districts"] > 1],
            "districts": districts,
        }

    out = {"schemaVersion": SCHEMA_VERSION, "dataMonth": latest.get("month", ""),
           "kinds": kinds}
    guard(out)
    return out


def summarise(districts: list[dict], portfolios: list[dict]) -> dict:
    held = [d for d in districts if d["heldToday"]]
    multi = [p for p in portfolios if p["districts"] > 1]
    changed = [d for d in districts if d["changes"] > 0]
    return {
        "districtsObserved": len(districts),
        "districtsHeldToday": len(held),
        "physicians": len(portfolios),
        "multiDistrictPhysicians": len(multi),
        "districtsInMultiHands": sum(p["districts"] for p in multi),
        "largestPortfolio": portfolios[0]["districts"] if portfolios else 0,
        "districtsWithAChange": len(changed),
        "changes": sum(d["changes"] for d in districts),
        "changeShare": len(changed) / len(districts) if districts else 0.0,
        "neverChanged": sum(1 for d in districts if d["changes"] == 0),
        "crossCountyPhysicians": sum(1 for p in portfolios if len(p["counties"]) > 1),
    }


def portfolio_bands(portfolios: list[dict]) -> list[dict]:
    out = []
    for name, upper in PORTFOLIO_BANDS:
        if upper is None:
            group = [p for p in portfolios if p["districts"] >= 4]
        else:
            group = [p for p in portfolios if p["districts"] == upper]
        out.append({
            "band": name,
            "physicians": len(group),
            "districts": sum(p["districts"] for p in group),
        })
    return out


def by_county(districts: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for d in districts:
        groups[d["county"]].append(d)
    out = []
    for county, list_ in groups.items():
        if not county:
            continue
        changed = [d for d in list_ if d["changes"] > 0]
        multi = [d for d in list_ if d["portfolioToday"] > 1]
        out.append({
            "county": county,
            "districts": len(list_),
            "changes": sum(d["changes"] for d in list_),
            "districtsWithAChange": len(changed),
            "changeShare": len(changed) / len(list_) if list_ else 0.0,
            "inMultiHands": len(multi),
            "multiShare": len(multi) / len(list_) if list_ else 0.0,
        })
    return sorted(out, key=lambda c: -c["changeShare"])


def guard(out: dict) -> None:
    text = json.dumps(out, ensure_ascii=False)
    hit = NAME_MARKER_RE.search(text)
    if hit:
        raise RiskError(f"a physician's name reached the output: {hit.group(0)!r}")
    for kind, k in out["kinds"].items():
        st = k["stats"]
        if st["districtsObserved"] < 1000:
            raise RiskError(f"{kind}: only {st['districtsObserved']} districts observed")
        if st["districtsWithAChange"] + st["neverChanged"] != st["districtsObserved"]:
            raise RiskError(f"{kind}: changed and unchanged districts do not add up")
        if st["districtsInMultiHands"] > st["districtsHeldToday"]:
            raise RiskError(f"{kind}: more districts in portfolios than held")
        bands = sum(b["physicians"] for b in k["portfolioBands"])
        if bands != st["physicians"]:
            raise RiskError(f"{kind}: portfolio bands do not add up to the physicians")
        for p in k["portfolios"]:
            if len(p["ids"]) != p["districts"]:
                raise RiskError(f"{kind}: a portfolio's district count is wrong")
            if not re.fullmatch(r"[0-9a-f]{12}", p["key"]):
                raise RiskError(f"{kind}: a portfolio key is not a pseudonym")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}")
    for kind, k in out["kinds"].items():
        st = k["stats"]
        print(f"  {kind}: {st['physicians']} physicians hold "
              f"{st['districtsHeldToday']} districts; "
              f"{st['multiDistrictPhysicians']} hold more than one "
              f"({st['districtsInMultiHands']} districts), largest "
              f"{st['largestPortfolio']}")
        print(f"    turnover: {st['changes']} changes over {k['archiveMonths']} months, "
              f"{st['districtsWithAChange']} of {st['districtsObserved']} districts "
              f"changed physician at least once")


if __name__ == "__main__":
    main()
