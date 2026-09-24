"""NEAK's own FIN → provider link, held up against ours.

The cross-check (crosscheck.py) works out which operating licence a praxis
runs under by matching addresses, tax numbers and provider names, because
the register we had did not say. The extended financing register does say:
NEAK_FINSZOLG_EXT carries the same rows as NEAK_FINSZOLG plus the provider's
six-character id (NNGYK6), name and tax number — the very link the
cross-check reconstructs.

This module does not replace our answer with theirs. It publishes both, side
by side, with a verdict per praxis:

    agree         the licence we publish belongs to the provider NEAK names
    differ        it belongs to someone else
    onlyOfficial  we found no licence, NEAK names a provider
    onlyOurs      we found a licence, NEAK names no provider
    neither       nothing on either side

That is the honest shape for a second opinion. Where the two disagree, the
disagreement is the finding — not a correction to be applied quietly. The
site keeps showing its own chain, and this table says how far it can be
trusted.

Usage:
  python etl/officialmap.py
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_eeszt import EesztError, latest_date, load, resolve

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "officialmap.json"
SCHEMA_VERSION = 1

VERDICTS = ("agree", "differ", "onlyOfficial", "onlyOurs", "neither")


def build() -> dict:
    date = latest_date()
    ex, ext = load("neak_finszolg_ext", date)
    lx, licences = load("euszolg_engedely", date)

    operating_path = ROOT / "data" / "operating.json"
    if not operating_path.exists():
        raise EesztError("run etl/operating.py first — there is nothing to compare")
    operating = json.loads(operating_path.read_text(encoding="utf-8"))

    # which provider owns each organisational unit, and which units have a licence
    provider_of_unit: dict[str, str] = {}
    for r in licences:
        provider_of_unit.setdefault(r[lx["SZERVEZETI_EGYSEG_KOD"]],
                                    r[lx["EUSZOLG_AZONOSITO"]])

    official: dict[str, list[dict]] = collections.defaultdict(list)
    for r in ext:
        official[r[ex["FINKOD"]]].append({
            "providerId": r[ex["NNGYK6"]] or "",
            "providerName": r[ex["NNGYK_NEV"]] or "",
            "tax": r[ex["NNGYK_ADOSZAM"]] or "",
            "unit": r[ex["NNGYK9_KOD"]] or "",
            "type": r[ex["TIP"]] or "",
        })

    rows: list[dict] = []
    for praxis in operating["rows"]:
        theirs = official.get(praxis["fin"], [])
        their_ids = sorted({t["providerId"] for t in theirs if t["providerId"]})
        our_ids = sorted({provider_of_unit.get(lic["unit"], "")
                          for lic in praxis["licences"]} - {""})
        rows.append({
            "fin": praxis["fin"],
            "group": praxis["group"],
            "settlement": praxis["settlement"],
            "county": praxis["county"],
            "neakCode": praxis["neakCode"],
            "licenceSource": praxis["licenceSource"],
            "ourProviderIds": our_ids,
            "ourProvider": praxis["provider"],
            "ourLicenceIds": sorted({lic["licenceId"] for lic in praxis["licences"]
                                     if lic["licenceId"]}),
            "ourUnits": praxis["units"],
            "officialProviderIds": their_ids,
            "officialProvider": next((t["providerName"] for t in theirs
                                      if t["providerName"]), ""),
            "officialTax": next((t["tax"] for t in theirs if t["tax"]), ""),
            "officialUnits": sorted({t["unit"] for t in theirs if t["unit"]}),
            # can the official unit be followed into the licence register?
            "officialUnitHasLicence": any(t["unit"] in provider_of_unit for t in theirs),
            "verdict": verdict_of(our_ids, their_ids),
        })

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "asOf": resolve("neak_finszolg_ext", date),
        "licenceAsOf": resolve("euszolg_engedely", date),
        "dataMonth": operating.get("dataMonth", ""),
        "verdicts": list(VERDICTS),
        "stats": overall(rows),
        "counties": by_county(rows),
        "rows": rows,
    }
    guard(out)
    return out


def verdict_of(ours: list[str], theirs: list[str]) -> str:
    if ours and theirs:
        return "agree" if set(ours) & set(theirs) else "differ"
    if theirs:
        return "onlyOfficial"
    if ours:
        return "onlyOurs"
    return "neither"


def overall(rows: list[dict]) -> dict:
    counts = collections.Counter(r["verdict"] for r in rows)
    by_source: dict[str, dict] = {}
    for source in ("code", "crosscheck", "none"):
        group = [r for r in rows if r["licenceSource"] == source]
        inner = collections.Counter(r["verdict"] for r in group)
        by_source[source] = {"praxes": len(group),
                             **{v: inner.get(v, 0) for v in VERDICTS}}
    decidable = counts["agree"] + counts["differ"]
    return {
        "praxes": len(rows),
        "withOfficial": sum(1 for r in rows if r["officialProviderIds"]),
        **{v: counts.get(v, 0) for v in VERDICTS},
        "decidable": decidable,
        "agreement": counts["agree"] / decidable if decidable else 0.0,
        "bySource": by_source,
        # where our chain found nothing, does the official one open a door?
        "rescuable": sum(1 for r in rows
                         if r["verdict"] == "onlyOfficial" and r["officialUnitHasLicence"]),
    }


def by_county(rows: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        groups[r["county"]].append(r)
    out = []
    for county, list_ in sorted(groups.items()):
        counts = collections.Counter(r["verdict"] for r in list_)
        decidable = counts["agree"] + counts["differ"]
        out.append({
            "county": county,
            "praxes": len(list_),
            **{v: counts.get(v, 0) for v in VERDICTS},
            "agreement": counts["agree"] / decidable if decidable else 0.0,
        })
    return sorted(out, key=lambda c: c["agreement"])


def guard(out: dict) -> None:
    rows = out["rows"]
    st = out["stats"]
    if len(rows) < 5000:
        raise EesztError(f"only {len(rows)} praxes compared")
    if sum(st[v] for v in VERDICTS) != len(rows):
        raise EesztError("the verdicts do not add up to the praxis count")
    if not 0.0 <= st["agreement"] <= 1.0:
        raise EesztError("agreement out of range")
    for source, block in st["bySource"].items():
        if sum(block[v] for v in VERDICTS) != block["praxes"]:
            raise EesztError(f"{source}: the verdicts do not add up")
    seen: set[str] = set()
    for r in rows:
        if r["verdict"] not in VERDICTS:
            raise EesztError(f"{r['fin']}: unknown verdict")
        if r["fin"] in seen:
            raise EesztError(f"duplicate praxis {r['fin']}")
        seen.add(r["fin"])
        if r["verdict"] == "agree" and not (
                set(r["ourProviderIds"]) & set(r["officialProviderIds"])):
            raise EesztError(f"{r['fin']}: agree without a shared provider")
    if sum(c["praxes"] for c in out["counties"]) != len(rows):
        raise EesztError("county counts do not add up")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT}: {st['praxes']} praxes compared "
          f"(official register {out['asOf']})")
    print(f"  agree {st['agree']}, differ {st['differ']}, "
          f"only official {st['onlyOfficial']}, only ours {st['onlyOurs']}, "
          f"neither {st['neither']} — agreement {st['agreement']:.1%}")
    for source, block in st["bySource"].items():
        if block["praxes"]:
            print(f"    licence from {source}: {block['praxes']} praxes, "
                  f"{block['agree']} agree, {block['differ']} differ")


if __name__ == "__main__":
    main()
