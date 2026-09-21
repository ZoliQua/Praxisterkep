"""The operating picture per praxis: which licence, under which unit, where.

One row per contracted praxis that has a physician — vacant and dissolved
districts are deliberately left out, because this table answers "under which
operating licence does this praxis work", and a district with no contracted
physician has no answer to give.

Each row carries:

    FIN code (9)           the praxis, as NEAK publishes it
    provider               official company name (EESZT provider register)
    tax number             from the provider register, else the financing one
    NEAK code (4)          INTKOD, the provider's NEAK identifier
    EESZT provider id (6)  EUSZOLG_AZONOSITO
    organisational units   every NNGYK9 the financing register links to the FIN
    licences               per unit: licence id, premises settlement + address

The licence comes from the code chain where it worked; where it did not, the
cross-check's accepted suggestion fills in (including the eleven districts
whose own unit holds the licence at their headquarters address). Rows with
neither are published with no licence at all, and the UI marks them.

Usage:
  python etl/operating.py
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_eeszt import EesztError, load, latest_date

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "operating.json"
SCHEMA_VERSION = 1

FAMILY = {"dental": "13", "gp": "63"}
TIP = {"dental": "FOG", "gp": "HSZ"}
# the services of dental_extra.json are all dental
EXTRA_GROUPS = ("oncall", "university", "specialist")


def build(date: str) -> dict:
    fx, fin = load("neak_finszolg", date)
    ex, eng = load("euszolg_engedely", date)
    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    extra_path = ROOT / "data" / "dental_extra.json"
    extra = json.loads(extra_path.read_text(encoding="utf-8")) if extra_path.exists() else None
    xc_path = ROOT / "data" / "crosscheck.json"
    xcheck = json.loads(xc_path.read_text(encoding="utf-8")) if xc_path.exists() else {"records": []}
    prov_path = ROOT / "data" / "providers.json"
    providers = json.loads(prov_path.read_text(encoding="utf-8")) if prov_path.exists() else {"providers": []}

    fin_rows: dict[str, list] = collections.defaultdict(list)
    for r in fin:
        fin_rows[r[fx["FINKOD"]]].append(r)
    lic_by_unit: dict[str, list] = collections.defaultdict(list)
    for r in eng:
        lic_by_unit[r[ex["SZERVEZETI_EGYSEG_KOD"]]].append(r)
    by_neak_code = {p["neakCode"]: p for p in providers.get("providers", [])}
    # the cross-check's accepted suggestions, by FIN
    suggestion: dict[str, list] = {}
    for rec in xcheck.get("records", []):
        if rec["verdict"] == "none":
            continue
        picks = rec.get("ownLicences") or rec.get("candidates") or []
        if rec.get("suggestion"):
            picks = [x for x in picks if x["licenceId"] == rec["suggestion"]] or picks[:1]
        else:
            picks = picks[:1]
        if picks:
            suggestion[rec["id"]] = picks

    professions: dict[str, str] = {}
    rows: list[dict] = []
    stats: collections.Counter = collections.Counter()

    def licences_of(fid: str, family: str, units: list[str]) -> tuple[list[dict], str]:
        """Every licence of the praxis' own units, else the accepted suggestion."""
        own: list[dict] = []
        for unit in units:
            for lic in lic_by_unit.get(unit, []):
                if not (lic[ex["SZAKMA_KOD"]] or "").startswith(family):
                    continue
                professions[lic[ex["SZAKMA_KOD"]]] = lic[ex["SZAKMA_NEV"]]
                own.append({
                    "unit": unit,
                    "licenceId": lic[ex["ENGEDELY_AZONOSITO"]] or "",
                    "settlement": lic[ex["TELEPHELY_TELEPULES"]] or "",
                    "address": lic[ex["TELEPHELY_CIM"]] or "",
                    "profession": lic[ex["SZAKMA_KOD"]] or "",
                    "publicFunded": lic[ex["KOZFINANSZIROZOTT"]] == "I",
                })
        if own:
            return own, "code"
        picks = suggestion.get(fid)
        if picks:
            out = []
            for c in picks:
                professions.setdefault(c["profession"], c["profession"])
                out.append({
                    "unit": c["unit"], "licenceId": c["licenceId"],
                    "settlement": c["settlement"], "address": c["address"],
                    "profession": c["profession"],
                    "publicFunded": bool(c.get("publicFunded")),
                })
            return out, "crosscheck"
        return [], "none"

    def add(fid: str, group: str, family: str, tip: str, settlement: str,
            county: str, neak_code: str) -> None:
        cands = [r for r in fin_rows.get(fid, []) if r[fx["TIP"]] == tip]
        units = sorted({r[fx["NNGYK9_KOD"]] for r in cands if r[fx["NNGYK9_KOD"]]})
        licences, source = licences_of(fid, family, units)
        provider = by_neak_code.get(neak_code, {})
        tax = provider.get("tax") or next(
            (r[fx["ADOIGSZ_8"]] for r in cands if r[fx["ADOIGSZ_8"]]), "")
        # the count has to describe what the row shows: the units of the
        # licences listed next to it. Where the financing register links no
        # unit at all (15 praxes) the cross-check still finds the licence, and
        # a "0" beside a printed NNGYK9 would simply read as an error.
        licence_units = sorted({lic["unit"] for lic in licences if lic["unit"]})
        rows.append({
            "fin": fid,
            "group": group,
            "settlement": settlement,
            "county": county,
            "neakCode": neak_code,
            "provider": provider.get("officialName") or provider.get("neakName") or "",
            "providerSource": "official" if provider.get("officialName") else "neak",
            "tax": tax,
            "euszolgId": provider.get("euszolgId", ""),
            "units": licence_units,
            "unitCount": len(licence_units),
            "finUnits": units,
            "licences": licences,
            "licenceSource": source,
        })
        stats[f"{group}:{source}"] += 1
        stats[source] += 1

    for kind in ("dental", "gp"):
        for f in latest["kinds"][kind]["filledPraxes"]:
            add(f["id"], kind, FAMILY[kind], TIP[kind], f.get("settlement", ""),
                f.get("county", ""), f.get("neakCode", ""))
    for svc in (extra or {}).get("services", []):
        if not svc.get("doctors"):
            continue  # the same rule as everywhere: NEAK must name a physician
        add(svc["id"], svc["group"], "13", "FOG", svc.get("settlement", ""),
            svc.get("county", ""), svc.get("neakCode", ""))

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "asOf": date,
        "dataMonth": latest.get("month", ""),
        "professions": professions,
        "stats": {
            "praxes": len(rows),
            "withLicence": sum(1 for r in rows if r["licences"]),
            "fromCode": stats["code"],
            "fromCrosscheck": stats["crosscheck"],
            "noLicence": stats["none"],
            "byGroup": {k: v for k, v in sorted(stats.items()) if ":" in k},
            "multiSite": sum(1 for r in rows
                             if len({(x["settlement"], x["address"]) for x in r["licences"]}) > 1),
            "withoutFinUnit": sum(1 for r in rows if not r["finUnits"]),
            "byCare": dict(sorted(collections.Counter(r["group"] for r in rows).items())),
        },
        "rows": rows,
    }
    guard(out)
    return out


def guard(out: dict) -> None:
    allowed = {"fin", "group", "settlement", "county", "neakCode", "provider",
               "providerSource", "tax", "euszolgId", "units", "unitCount",
               "finUnits", "licences", "licenceSource"}
    seen: set[str] = set()
    for row in out["rows"]:
        unknown = set(row) - allowed
        if unknown:
            raise EesztError(f"{row['fin']}: unexpected fields {sorted(unknown)}")
        if row["fin"] in seen:
            raise EesztError(f"duplicate praxis {row['fin']}")
        seen.add(row["fin"])
        if row["unitCount"] != len(row["units"]):
            raise EesztError(f"{row['fin']}: unit count does not match the list")
        if row["unitCount"] != len({lic["unit"] for lic in row["licences"] if lic["unit"]}):
            raise EesztError(
                f"{row['fin']}: the unit count contradicts the licences shown")
        if row["licenceSource"] not in {"code", "crosscheck", "none"}:
            raise EesztError(f"{row['fin']}: unknown licence source")
        if (row["licenceSource"] == "none") != (not row["licences"]):
            raise EesztError(f"{row['fin']}: licence source contradicts the licences")
        for lic in row["licences"]:
            for field in ("unit", "licenceId", "settlement", "address", "profession"):
                if field not in lic:
                    raise EesztError(f"{row['fin']}: licence without {field}")
    st = out["stats"]
    if st["fromCode"] + st["fromCrosscheck"] + st["noLicence"] != st["praxes"]:
        raise EesztError("licence sources do not add up to the praxis count")


def main() -> None:
    out = build(latest_date())
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT}: {st['praxes']} praxes with a physician")
    print(f"  licence from the code chain: {st['fromCode']}, "
          f"from the cross-check: {st['fromCrosscheck']}, none: {st['noLicence']}")
    print(f"  praxes with premises in more than one place: {st['multiSite']}")


if __name__ == "__main__":
    main()
