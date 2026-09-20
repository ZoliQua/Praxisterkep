"""One row per contracted provider: who runs the districts and services.

The NEAK registry names a provider per service with a short trade name and a
NEAK code; the EESZT provider register carries the official company name, the
tax number and the registered seat. The financing register links the two
deterministically through the tax number:

    NEAK code (INTKOD)  ->  NEAK_FINSZOLG.ADOIGSZ_8
      ->  EUSZOLG_PUBLIKUS.ADOSZAM  ->  official name + registered seat

Where the tax number is missing, the provider name is matched with the same
legal-form-insensitive comparison the cross-check uses, and the row says which
of the two identified it.

Name policy (CLAUDE.md rule 3): only providers NEAK itself publishes are
listed — a provider enters this list through a service where the registry
names the contracted physician. Company officers are NOT part of any register
used here and are never invented.

Usage:
  python etl/providers.py
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_eeszt import EesztError, load, latest_date
from crosscheck import name_match

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "providers.json"
SCHEMA_VERSION = 1

GROUPS = ("dental", "gp", "oncall", "university", "specialist")


def build(date: str) -> dict:
    fx, fin = load("neak_finszolg", date)
    px, prov = load("euszolg", date)
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    extra_path = ROOT / "data" / "dental_extra.json"
    extra = json.loads(extra_path.read_text(encoding="utf-8")) if extra_path.exists() else None

    # what each provider runs, from the records NEAK publishes with a physician
    portfolio: dict[str, dict] = {}

    def add(code: str, name: str | None, group: str, county: str, settlement: str) -> None:
        entry = portfolio.setdefault(code, {
            "neakCode": code, "neakName": name or "",
            "counts": dict.fromkeys(GROUPS, 0), "counties": set(), "settlements": set(),
        })
        if name and not entry["neakName"]:
            entry["neakName"] = name
        entry["counts"][group] += 1
        if county:
            entry["counties"].add(county)
        if settlement:
            entry["settlements"].add(settlement)

    for kind in ("dental", "gp"):
        for f in latest["kinds"][kind]["filledPraxes"]:
            if f.get("neakCode"):
                add(f["neakCode"], f.get("provider"), kind,
                    f.get("county", ""), f.get("settlement", ""))
    for svc in (extra or {}).get("services", []):
        if svc.get("neakCode"):
            add(svc["neakCode"], svc.get("provider"), svc["group"],
                svc.get("county", ""), svc.get("settlement", ""))

    # tax number per NEAK code, from the financing register
    tax_by_code: dict[str, set[str]] = collections.defaultdict(set)
    for r in fin:
        code, tax = r[fx["INTKOD"]], r[fx["ADOIGSZ_8"]]
        if code and tax:
            tax_by_code[code].add(tax)

    providers_by_tax: dict[str, list] = collections.defaultdict(list)
    for r in prov:
        tax = (r[px["ADOSZAM"]] or "")[:8]
        if tax:
            providers_by_tax[tax].append(r)

    stats: collections.Counter = collections.Counter()
    rows: list[dict] = []
    for code, entry in sorted(portfolio.items()):
        taxes = sorted(tax_by_code.get(code, ()))
        match = "none"
        chosen = None
        if taxes:
            stats["withTax"] += 1
            hits = [p for tax in taxes for p in providers_by_tax.get(tax, [])]
            if len(hits) == 1:
                chosen, match = hits[0], "tax"
            elif hits:
                # several providers share the tax prefix: the name decides
                best = max(hits, key=lambda p: name_match(
                    entry["neakName"], p[px["KOZPONTITORZS_NEV"]]))
                if name_match(entry["neakName"], best[px["KOZPONTITORZS_NEV"]]) >= 0.6:
                    chosen, match = best, "taxAndName"
                else:
                    chosen, match = hits[0], "tax"
        if chosen is None and entry["neakName"]:
            # no tax number: fall back to the company name
            for p in prov:
                if name_match(entry["neakName"], p[px["KOZPONTITORZS_NEV"]]) >= 0.8:
                    chosen, match = p, "name"
                    break

        row = {
            "neakCode": code,
            "neakName": entry["neakName"],
            "tax": taxes[0] if taxes else "",
            "match": match,
            "counts": entry["counts"],
            "total": sum(entry["counts"].values()),
            "counties": sorted(entry["counties"]),
            "settlements": len(entry["settlements"]),
        }
        if chosen is not None:
            row["euszolgId"] = chosen[px["EUSZOLG_AZONOSITO"]]
            row["officialName"] = chosen[px["KOZPONTITORZS_NEV"]] or ""
            row["seatCounty"] = chosen[px["SZEKHELY_MEGYE"]] or ""
            row["seatPostal"] = chosen[px["SZEKHELY_IRSZ"]] or ""
            row["seatSettlement"] = chosen[px["SZEKHELY_TELEPULES"]] or ""
            row["seatAddress"] = chosen[px["SZEKHELY_CIM"]] or ""
        stats[match] += 1
        rows.append(row)

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "asOf": date,
        "dataMonth": latest.get("month", ""),
        "groups": list(GROUPS),
        "stats": {
            "providers": len(rows),
            "identified": sum(1 for r in rows if r.get("euszolgId")),
            "byMatch": dict(sorted(stats.items())),
            "services": sum(r["total"] for r in rows),
        },
        "providers": rows,
    }
    guard(out)
    return out


def guard(out: dict) -> None:
    allowed = {"neakCode", "neakName", "tax", "match", "counts", "total", "counties",
               "settlements", "euszolgId", "officialName", "seatCounty", "seatPostal",
               "seatSettlement", "seatAddress"}
    seen: set[str] = set()
    for row in out["providers"]:
        unknown = set(row) - allowed
        if unknown:
            raise EesztError(f"{row['neakCode']}: unexpected fields {sorted(unknown)}")
        if row["neakCode"] in seen:
            raise EesztError(f"duplicate NEAK code {row['neakCode']}")
        seen.add(row["neakCode"])
        if not row["neakName"]:
            raise EesztError(f"{row['neakCode']}: provider without a NEAK name")
        if row["total"] != sum(row["counts"].values()):
            raise EesztError(f"{row['neakCode']}: portfolio counts do not add up")
        if row["match"] not in {"tax", "taxAndName", "name", "none"}:
            raise EesztError(f"{row['neakCode']}: unknown match {row['match']!r}")
        if row["match"] != "none" and not row.get("euszolgId"):
            raise EesztError(f"{row['neakCode']}: matched without a provider id")
    if out["stats"]["providers"] != len(out["providers"]):
        raise EesztError("provider count does not match the list")


def main() -> None:
    out = build(latest_date())
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT}: {st['providers']} providers, {st['identified']} identified "
          f"in the EESZT provider register, {st['services']} services")
    print("  match:", st["byMatch"])


if __name__ == "__main__":
    main()
