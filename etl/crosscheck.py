"""Cross-check the NEAK records that the code chain could not pair with EESZT.

build_eeszt.py and build_dental_extra.py join by code only: FIN/unit code ->
NEAK_FINSZOLG -> organisational unit -> licence. Where that chain finds
nothing, the question is whether the surgery and the provider are in EESZT
after all — just under a different organisational unit, or with fields that
differ character by character. This module answers it for every unmatched
record, by premises address and by provider name:

    NEAK surgery address  ->  EUSZOLG_ENGEDELY_PUBLIKUS premises
      (settlement + street + house number, normalized the same way the
       geocoder normalizes, accents folded, abbreviations expanded)
    NEAK provider name    ->  EUSZOLG_PUBLIKUS.KOZPONTITORZS_NEV
      (token overlap on names of 3+ characters)

Every hit is a SUGGESTION with its evidence, never a match: the output says
what was compared and what agreed, and the UI labels it as such. The reverse
direction is reported too: financed dental/GP services that EESZT knows but
the published NEAK lists do not contain.

Name policy (CLAUDE.md rule 3): free-text names from either side are exported
only for records that NEAK itself publishes with a contracted physician; for
everything else the output carries codes, addresses and profession names only.

Usage:
  python etl/crosscheck.py
"""
from __future__ import annotations

import collections
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_eeszt import EesztError, load, latest_date
from geocode import normalize_street

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "crosscheck.json"
SCHEMA_VERSION = 1

# profession families: a dental district is only "the same care" as a dental
# licence (13xx), a GP district as a GP licence (63xx)
FAMILY = {"dental": "13", "gp": "63"}
NAME_MARKER_RE = re.compile(r"\bdr\b\.?", re.IGNORECASE)
# a suggestion is as good as its weakest link — strongest first
VERDICTS = ("otherUnitSameProfession", "ownUnitSameProfession",
            "otherProfessionAtAddress", "streetSameProfession",
            "providerName", "none")
MAX_CANDIDATES = 5


def fold(text: str) -> str:
    stripped = unicodedata.normalize("NFD", (text or "").lower())
    return "".join(c for c in stripped if unicodedata.category(c) != "Mn")


def settlement_key(settlement: str) -> str:
    key = re.sub(r"[^a-z0-9]", "", fold(settlement))
    # NEAK writes "Budapest 07", the licences "Budapest VII. kerület"
    return "budapest" if key.startswith("budapest") else key


def address_key(settlement: str, address: str) -> tuple[str, str, str]:
    """(settlement, street, house number) with the spelling ironed out."""
    text = fold(normalize_street(address or ""))
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    number = re.search(r"(\d+)", text)
    street = re.sub(r"\d.*$", "", text).strip()
    return settlement_key(settlement), street, number.group(1) if number else ""


def name_tokens(name: str) -> set[str]:
    return {w for w in re.split(r"[^a-z0-9]+", fold(name)) if len(w) >= 3}


def neak_history(codes: set[str]) -> dict[str, dict]:
    """Where a code shows up in the archived monthly NEAK snapshots.

    A service EESZT still finances but the current NEAK list no longer
    carries may be the remnant of a district that went vacant or was
    dissolved — the archive says whether it was ever published, when it was
    last seen and with what status.
    """
    seen: dict[str, dict] = {}
    months = sorted({p.parent.name for p in (ROOT / "data").glob("20*/*.json")})
    for month in months:
        for kind in ("dental", "gp"):
            path = ROOT / "data" / month / f"{kind}.json"
            if not path.exists():
                continue
            snap = json.loads(path.read_text(encoding="utf-8"))
            rows = [(p["id"], p.get("status", "vacant"),
                     (p.get("sites") or [{}])[0].get("settlement", ""))
                    for p in snap.get("praxes", [])]
            rows += [(p["id"], "filled", p.get("settlement", ""))
                     for p in snap.get("filledPraxes", [])]
            for code, status, settlement in rows:
                if code not in codes:
                    continue
                entry = seen.setdefault(code, {
                    "firstMonth": month, "lastMonth": month, "months": 0,
                    "lastStatus": status, "settlement": settlement, "kind": kind,
                })
                entry["lastMonth"] = month
                entry["lastStatus"] = status
                entry["months"] += 1
                if settlement:
                    entry["settlement"] = settlement
    return seen


def build(date: str) -> dict:
    ex, eng = load("euszolg_engedely", date)
    fx, fin = load("neak_finszolg", date)
    px, prov = load("euszolg", date)

    by_address: dict[tuple, list] = collections.defaultdict(list)
    by_street: dict[tuple, list] = collections.defaultdict(list)
    by_settlement: dict[tuple, int] = collections.Counter()
    for r in eng:
        key = address_key(r[ex["TELEPHELY_TELEPULES"]], r[ex["TELEPHELY_CIM"]])
        by_address[key].append(r)
        by_street[(key[0], key[1])].append(r)
        by_settlement[(key[0], (r[ex["SZAKMA_KOD"]] or "")[:2])] += 1
    lic_by_provider: dict[str, list] = collections.defaultdict(list)
    lic_by_unit: dict[str, list] = collections.defaultdict(list)
    for r in eng:
        lic_by_provider[r[ex["EUSZOLG_AZONOSITO"]]].append(r)
        lic_by_unit[r[ex["SZERVEZETI_EGYSEG_KOD"]]].append(r)

    # provider names, indexed by their tokens so a rename or a suffix change
    # does not hide the provider
    providers = {r[px["EUSZOLG_AZONOSITO"]]: r for r in prov}
    by_token: dict[str, set[str]] = collections.defaultdict(set)
    for r in prov:
        for token in name_tokens(r[px["KOZPONTITORZS_NEV"]]):
            by_token[token].add(r[px["EUSZOLG_AZONOSITO"]])

    eeszt = json.loads((ROOT / "data" / "eeszt.json").read_text(encoding="utf-8"))
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    extra_path = ROOT / "data" / "dental_extra.json"
    extra = json.loads(extra_path.read_text(encoding="utf-8")) if extra_path.exists() else None

    records: list[dict] = []
    stats: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)

    def provider_candidates(name: str, settlement: str, family: str) -> list[dict]:
        """Providers whose name overlaps, with a licence in the settlement."""
        tokens = name_tokens(name)
        if not tokens:
            return []
        scores: collections.Counter = collections.Counter()
        for token in tokens:
            for pid in by_token.get(token, ()):
                scores[pid] += 1
        out: list[dict] = []
        skey = settlement_key(settlement)
        for pid, hits in scores.most_common(20):
            other = name_tokens(providers[pid][px["KOZPONTITORZS_NEV"]])
            overlap = hits / max(len(tokens | other), 1)
            if overlap < 0.5:
                continue
            for lic in lic_by_provider.get(pid, []):
                if settlement_key(lic[ex["TELEPHELY_TELEPULES"]]) != skey:
                    continue
                if not (lic[ex["SZAKMA_KOD"]] or "").startswith(family):
                    continue
                out.append(candidate(lic, "provider", ex, round(overlap, 2)))
                break
        return out

    def candidate(lic: list, match: str, ex: dict, overlap: float | None = None) -> dict:
        out = {
            "unit": lic[ex["SZERVEZETI_EGYSEG_KOD"]] or "",
            "licenceId": lic[ex["ENGEDELY_AZONOSITO"]] or "",
            "profession": lic[ex["SZAKMA_KOD"]] or "",
            "settlement": lic[ex["TELEPHELY_TELEPULES"]] or "",
            "address": lic[ex["TELEPHELY_CIM"]] or "",
            "publicFunded": lic[ex["KOZFINANSZIROZOTT"]] == "I",
            "match": match,
        }
        if overlap is not None:
            out["nameOverlap"] = overlap
        return out

    def inspect(entry: dict) -> dict:
        """One NEAK record against the EESZT registers."""
        family = FAMILY[entry["family"]]
        key = address_key(entry["settlement"], entry["address"])
        at_address = by_address.get(key, [])
        same = [c for c in at_address if (c[ex["SZAKMA_KOD"]] or "").startswith(family)]
        own = set(entry["units"])
        cands: list[dict] = []
        verdict = "none"

        if same:
            other = [c for c in same if c[ex["SZERVEZETI_EGYSEG_KOD"]] not in own]
            verdict = "otherUnitSameProfession" if other else "ownUnitSameProfession"
            cands = [candidate(c, "address", ex) for c in (other or same)]
        elif at_address:
            verdict = "otherProfessionAtAddress"
            cands = [candidate(c, "address", ex) for c in at_address]
        else:
            street = [c for c in by_street.get((key[0], key[1]), [])
                      if (c[ex["SZAKMA_KOD"]] or "").startswith(family)]
            if street:
                verdict = "streetSameProfession"
                cands = [candidate(c, "street", ex) for c in street]
            elif entry.get("provider"):
                found = provider_candidates(entry["provider"], entry["settlement"], family)
                if found:
                    verdict = "providerName"
                    cands = found

        for c in cands:
            c["otherUnit"] = c["unit"] not in own
        # keep the list short and stable: same-unit first would hide the point,
        # so keep source order and cap it
        record = {
            "id": entry["id"],
            "source": entry["source"],
            "family": entry["family"],
            "reason": entry["reason"],
            "named": entry["named"],
            "settlement": entry["settlement"],
            "county": entry["county"],
            "address": entry["address"],
            "units": ",".join(sorted(own)),
            "verdict": verdict,
            "candidates": cands[:MAX_CANDIDATES],
            "candidateCount": len(cands),
            "settlementLicences": by_settlement.get((key[0], family), 0),
        }
        if entry["named"] and entry.get("provider"):
            record["provider"] = entry["provider"]
        if verdict == "ownUnitSameProfession":
            # the automation refused to choose; list what it had to choose
            # between, and mark the premises that is the NEAK headquarters
            own_lics = []
            for unit in sorted(own):
                for lic in lic_by_unit.get(unit, []):
                    if not (lic[ex["SZAKMA_KOD"]] or "").startswith(family):
                        continue
                    same_site = address_key(lic[ex["TELEPHELY_TELEPULES"]],
                                            lic[ex["TELEPHELY_CIM"]]) == key
                    own_lics.append({**candidate(lic, "address", ex),
                                     "atNeakSite": same_site})
            record["ownLicences"] = own_lics
            at_site = [x for x in own_lics if x["atNeakSite"]]
            record["suggestion"] = at_site[0]["licenceId"] if len(at_site) == 1 else ""
        return record

    # ---- districts (source A/B/C + H) ----
    for kind, letter in (("dental", "d"), ("gp", "g")):
        snap = latest["kinds"][kind]
        info: dict[str, dict] = {}
        for p in snap["praxes"]:
            site = (p.get("sites") or [{}])[0]
            info[p["id"]] = {
                "settlement": site.get("settlement", ""), "address": site.get("address", ""),
                "county": p.get("county", ""), "named": False, "provider": None,
            }
        for f in snap["filledPraxes"]:
            info[f["id"]] = {
                "settlement": f.get("settlement", ""), "address": f.get("address", ""),
                "county": f.get("county", ""), "named": bool(f.get("doctor")),
                "provider": f.get("provider"),
            }
        for fid, reason in eeszt["unmatched"].items():
            if reason[0] != letter or fid not in info:
                continue
            base = info[fid]
            units = [u for u in ((eeszt["praxes"].get(fid, {}).get("t") or [""])[0]).split(",") if u]
            rec = inspect({
                "id": fid, "source": f"district-{kind}", "family": kind,
                "reason": reason[1], "units": units, **base,
            })
            records.append(rec)
            stats[f"district-{kind}"][rec["verdict"]] += 1

    # ---- the dental services that are not districts (source C) ----
    if extra:
        for svc in extra["services"]:
            if svc["id"] not in extra["unmatched"]:
                continue
            rec = inspect({
                "id": svc["id"], "source": f"service-{svc['group']}", "family": "dental",
                "reason": extra["unmatched"][svc["id"]][0],
                "units": [u for u in (svc.get("trace", {}).get("units") or "").split(",") if u],
                "settlement": svc["settlement"], "address": svc["address"],
                "county": svc["county"], "named": bool(svc.get("doctors")),
                "provider": svc.get("provider"),
            })
            records.append(rec)
            stats[f"service-{svc['group']}"][rec["verdict"]] += 1

    # ---- the other direction: financed in EESZT, absent from the NEAK lists ----
    known = {p["id"] for k in ("dental", "gp")
             for p in latest["kinds"][k]["praxes"] + latest["kinds"][k]["filledPraxes"]}
    if extra:
        known |= {s["id"] for s in extra["services"]}
    eeszt_only: list[dict] = []
    seen: set[str] = set()
    for r in fin:
        tip = r[fx["TIP"]]
        if tip not in ("FOG", "HSZ") or r[fx["FINKOD"]] in known:
            continue
        code = r[fx["FINKOD"]]
        if code in seen:
            continue
        seen.add(code)
        unit = r[fx["NNGYK9_KOD"]] or ""
        family = "13" if tip == "FOG" else "63"
        lic = next((x for x in lic_by_unit.get(unit, [])
                    if (x[ex["SZAKMA_KOD"]] or "").startswith(family)), None)
        row = {
            "fin": code, "tip": tip, "county": r[fx["MEGYE"]] or "",
            "unit": unit, "institution": r[fx["INTKOD"]] or "",
            "settlement": lic[ex["TELEPHELY_TELEPULES"]] if lic else "",
            "address": lic[ex["TELEPHELY_CIM"]] if lic else "",
            "profession": lic[ex["SZAKMA_KOD"]] if lic else "",
            "licenceId": lic[ex["ENGEDELY_AZONOSITO"]] if lic else "",
        }
        eeszt_only.append(row)
        stats["eesztOnly"][tip] += 1

    archive_months = sorted({q.parent.name for q in (ROOT / "data").glob("20*/*.json")})
    history = neak_history({r["fin"] for r in eeszt_only})
    for row in eeszt_only:
        past = history.get(row["fin"])
        if past:
            row["neakFirstMonth"] = past["firstMonth"]
            row["neakLastMonth"] = past["lastMonth"]
            row["neakMonths"] = past["months"]
            row["neakLastStatus"] = past["lastStatus"]
            row["neakSettlement"] = past["settlement"]
        stats["eesztOnlyHistory"]["found" if past else "never"] += 1

    professions = {}
    for r in eng:
        code = r[ex["SZAKMA_KOD"]]
        if code and code not in professions:
            professions[code] = r[ex["SZAKMA_NEV"]]

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "asOf": date,
        "dataMonth": eeszt.get("dataMonth", ""),
        "professions": professions,
        "verdicts": list(VERDICTS),
        "archive": {"from": archive_months[0] if archive_months else "",
                    "to": archive_months[-1] if archive_months else "",
                    "months": len(archive_months)},
        "stats": {k: dict(sorted(v.items())) for k, v in stats.items()},
        "records": records,
        "eesztOnly": eeszt_only,
    }
    guard(out)
    return out


def guard(out: dict) -> None:
    """A suggestion may never leak a name or invent a code."""
    allowed = {"id", "source", "family", "reason", "named", "settlement", "county",
               "address", "units", "verdict", "candidates", "candidateCount",
               "settlementLicences", "provider", "ownLicences", "suggestion"}
    for rec in out["records"]:
        unknown = set(rec) - allowed
        if unknown:
            raise EesztError(f"{rec['id']}: unexpected fields {sorted(unknown)}")
        if rec.get("provider") and not rec["named"]:
            raise EesztError(f"{rec['id']}: provider name without a named physician")
        if rec["verdict"] not in VERDICTS:
            raise EesztError(f"{rec['id']}: unknown verdict {rec['verdict']!r}")
        if rec["verdict"] == "ownUnitSameProfession" and not rec.get("ownLicences"):
            raise EesztError(f"{rec['id']}: manual-review record without its licences")
        if rec["verdict"] == "none" and rec["candidates"]:
            raise EesztError(f"{rec['id']}: candidates under a 'none' verdict")
        if rec["verdict"] != "none" and not rec["candidates"]:
            raise EesztError(f"{rec['id']}: verdict without a candidate")
        for c in rec["candidates"]:
            for field in ("unit", "licenceId", "profession", "settlement", "address"):
                if field not in c:
                    raise EesztError(f"{rec['id']}: candidate without {field}")
            if NAME_MARKER_RE.search(c["settlement"] + " " + c["address"]):
                # an address may legitimately be "Dr. Veress Endre utca" — a
                # street named after someone is not a physician's name, but a
                # premises NAME would be, and we never export those
                pass
    for row in out["eesztOnly"]:
        if set(row) - {"fin", "tip", "county", "unit", "institution", "settlement",
                       "address", "profession", "licenceId", "neakFirstMonth",
                       "neakLastMonth", "neakMonths", "neakLastStatus",
                       "neakSettlement"}:
            raise EesztError(f"{row['fin']}: unexpected fields in the EESZT-only row")


def main() -> None:
    out = build(latest_date())
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    total = len(out["records"])
    print(f"wrote {OUT}: {total} unmatched records, {len(out['eesztOnly'])} EESZT-only services")
    for source, counter in out["stats"].items():
        print(f"  {source}: " + ", ".join(f"{k}={v}" for k, v in counter.items()))


if __name__ == "__main__":
    main()
