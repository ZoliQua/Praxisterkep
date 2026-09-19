"""Build the EESZT supplement (source H) on top of the latest snapshots.

Usage:
  python etl/build_eeszt.py [--date YYYY-MM-DD]

Reads the archived EESZT entities (data/raw/eeszt/*_<date>.jsonl.gz, see
fetch_eeszt.py) and writes data/eeszt.json — a supplement keyed by NEAK
FIN code, kept separate from the monthly NEAK snapshots.

Key chain (deterministic codes only, no fuzzy matching):

  praxis.id (FIN) --NEAK_FINSZOLG.FINKOD--> NNGYK9_KOD
  NNGYK9_KOD --EUSZOLG_ENGEDELY.SZERVEZETI_EGYSEG_KOD--> operating licence(s)
  licence.EUSZOLG_AZONOSITO --EUSZOLG_PUBLIKUS--> provider tax number,
      cross-checked against NEAK_FINSZOLG.ADOIGSZ_8 (providerMatch)

Only licences of the district's own profession are used (GP 6301-6303,
dental 1300/1304/1305). A licence whose premises settlement differs from
every NEAK site of the district is kept but flagged (settlementMatch=false).

Name policy (CLAUDE.md rule 3): the financed provider name and institution
code are written ONLY for filled praxes. For vacant/dissolved districts no
free-text name field is ever copied — organisational-unit names often carry
the former physician's name. The district number is extracted from the
official service name with a strict pattern and rejected if it contains a
personal-name marker. build() fails loudly if any guard is violated.
"""
from __future__ import annotations

import argparse
import collections
import gzip
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_ksh import normalize_settlement

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "eeszt"
OUT = ROOT / "data" / "eeszt.json"

TIP = {"gp": "HSZ", "dental": "FOG"}
PROFESSIONS = {
    "gp": {"6301", "6302", "6303"},
    "dental": {"1300", "1304", "1305"},
}
DISTRICT_NO_RE = re.compile(
    r"(\d{1,3})\s*\.?\s*(?:sz(?:ámú|\.)\s*)?"
    r"((?:felnőtt|gyermek|vegyes|fogorvosi|fogászati|háziorvosi|"
    r"házi\s*gyermekorvosi|iskolai)\s+)?körzet",
    re.IGNORECASE,
)
NAME_MARKER_RE = re.compile(r"\bdr\b\.?", re.IGNORECASE)


class EesztError(Exception):
    pass


def latest_date() -> str:
    dates = sorted({p.name.rsplit("_", 1)[1].split(".")[0]
                    for p in RAW.glob("*_*.meta.json")})
    if not dates:
        raise EesztError(f"no EESZT downloads in {RAW}")
    return dates[-1]


def load(name: str, date: str) -> tuple[dict[str, int], list[list]]:
    meta = json.loads((RAW / f"{name}_{date}.meta.json").read_text(encoding="utf-8"))
    rows = [json.loads(line) for line in
            gzip.open(RAW / f"{name}_{date}.jsonl.gz", "rt", encoding="utf-8")]
    if len(rows) != meta["totalRowCount"]:
        raise EesztError(f"{name}: {len(rows)} rows != declared {meta['totalRowCount']}")
    return {f: i for i, f in enumerate(meta["fields"])}, rows


def district_no(fin_name: str) -> str | None:
    m = DISTRICT_NO_RE.search(fin_name or "")
    if not m:
        return None
    label = f"{int(m.group(1))}. {(m.group(2) or '').strip().lower()} körzet"
    label = re.sub(r"\s+", " ", label)
    if NAME_MARKER_RE.search(label):
        return None
    return label


def same_place(a: str, b: str) -> bool:
    na, nb = normalize_settlement(a), normalize_settlement(b)
    if na == nb:
        return True
    # NEAK sometimes gives bare "Budapest" where the licence names the district
    return {na, nb} & {"budapest"} != set() and na.startswith("budapest") and nb.startswith("budapest")


def build(date: str) -> dict:
    fx, fin = load("neak_finszolg", date)
    ex, eng = load("euszolg_engedely", date)
    px, prov = load("euszolg", date)

    # FINSZOLG: one FIN can appear several times — under more than one
    # organisational unit (NNGYK9) or service type (TIP). Rows are grouped
    # per FIN and filtered to the branch's own TIP later.
    fin_rows: dict[str, list] = collections.defaultdict(list)
    for r in fin:
        fin_rows[r[fx["FINKOD"]]].append(r)
    lic_by_unit: dict[str, list] = collections.defaultdict(list)
    for r in eng:
        lic_by_unit[r[ex["SZERVEZETI_EGYSEG_KOD"]]].append(r)
    tax_by_provider = {r[px["EUSZOLG_AZONOSITO"]]: (r[px["ADOSZAM"]] or "")[:8] for r in prov}

    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    geocache = json.loads((ROOT / "etl" / "geocode_cache.json").read_text(encoding="utf-8"))
    professions: dict[str, str] = {}
    on_call: list[str] = []

    def on_call_idx(text: str | None) -> int:
        text = text or ""
        if text not in on_call:
            on_call.append(text)
        return on_call.index(text)

    praxes: dict[str, dict] = {}
    # FIN -> [kind initial, reason code, detail] for every district with no
    # usable licence; details are codes/profession names only, never names
    unmatched: dict[str, list] = {}
    stats: dict[str, collections.Counter] = {}
    unit_users: collections.Counter = collections.Counter()

    def candidates(fid: str, kind: str) -> list:
        return [r for r in fin_rows.get(fid, []) if r[fx["TIP"]] == TIP[kind]]

    # first pass: which FINs share an organisational unit (institutional units)
    for kind in ("dental", "gp"):
        snap = latest["kinds"][kind]
        for p in snap["praxes"] + snap["filledPraxes"]:
            for unit in {r[fx["NNGYK9_KOD"]] for r in candidates(p["id"], kind)}:
                unit_users[unit] += 1

    for kind in ("dental", "gp"):
        snap = latest["kinds"][kind]
        st = stats.setdefault(kind, collections.Counter())
        groups = [("filled", f) for f in snap["filledPraxes"]] + \
                 [(p["status"], p) for p in snap["praxes"]]
        for status, p in groups:
            st["total"] += 1
            fid = p["id"]
            cands = candidates(fid, kind)
            if not cands:
                other = sorted({r2[fx["TIP"]] for r2 in fin_rows.get(fid, [])})
                if other:
                    # the FIN exists, but only as another service type
                    unmatched[fid] = [kind[0], "otherTip", ", ".join(other)]
                    st["otherTip"] += 1
                else:
                    unmatched[fid] = [kind[0], "noFin", ""]
                    st["noFin"] += 1
                continue
            st["fin"] += 1
            r = cands[0]
            entry: dict = {}
            # descriptive fields only when every candidate row agrees
            names = {c[fx["FINNEV"]] for c in cands}
            dno = district_no(r[fx["FINNEV"]]) if len(names) == 1 else None
            if dno:
                entry["d"] = dno
            if status == "filled" and len({(c[fx["INEV"]], c[fx["INTKOD"]]) for c in cands}) == 1:
                entry["p"] = r[fx["INEV"]]
                entry["i"] = r[fx["INTKOD"]]

            units = sorted({c[fx["NNGYK9_KOD"]] for c in cands})
            lics = [x for u in units for x in lic_by_unit.get(u, [])
                    if x[ex["SZAKMA_KOD"]] in PROFESSIONS[kind]]
            places = {(normalize_settlement(x[ex["TELEPHELY_TELEPULES"]] or ""),
                       re.sub(r"\W+", "", (x[ex["TELEPHELY_CIM"]] or "").lower())[:12])
                      for x in lics}
            reason: list | None = None
            if lics and len(units) > 1 and len(places) > 1:
                # the FIN points at several units whose licences disagree on
                # the premises — refuse to pick one
                reason = ["ambiguous", f"{len(units)}|{len(places)}"]
                lics = []
            elif not lics:
                unit_lics = [x for u in units for x in lic_by_unit.get(u, [])]
                if unit_lics:
                    other_prof = sorted({x[ex["SZAKMA_NEV"]] for x in unit_lics})
                    reason = ["otherProfession", "; ".join(other_prof[:3])
                              + ("; …" if len(other_prof) > 3 else "")]
                else:
                    reason = ["noUnitLicence", ", ".join(units)]
            unit = r[fx["NNGYK9_KOD"]]
            if lics:
                st["licence"] += 1
                sites = ([s["settlement"] for s in p.get("sites", [])]
                         or [p.get("settlement", "")])
                matching = [x for x in lics
                            if any(same_place(s, x[ex["TELEPHELY_TELEPULES"]] or "") for s in sites)]
                best = (matching or lics)[0]
                fin_tax = (r[fx["ADOIGSZ_8"]] or "")[:8]
                lic_tax = tax_by_provider.get(best[ex["EUSZOLG_AZONOSITO"]], "")
                provider_match = bool(fin_tax) and fin_tax == lic_tax
                flags = ((1 if matching else 0)
                         | (2 if provider_match else 0)
                         | (4 if best[ex["KOZFINANSZIROZOTT"]] == "I" else 0)
                         | (8 if unit_users[unit] > 1 else 0))
                # [postal, settlement, address, professionCode, onCallIdx, flags, licenceCount]
                entry["l"] = [
                    best[ex["TELEPHELY_IRSZAM"]], best[ex["TELEPHELY_TELEPULES"]],
                    best[ex["TELEPHELY_CIM"]], best[ex["SZAKMA_KOD"]],
                    on_call_idx(best[ex["UGYELET_KESZENLET"]]), flags, len(lics),
                ]
                professions[best[ex["SZAKMA_KOD"]]] = best[ex["SZAKMA_NEV"]]
                # coordinates of the licensed premises from the shared geocode
                # cache (filled by geocode_eeszt.py; no network here)
                geo = geocache.get(f"{best[ex['TELEPHELY_IRSZAM']]} "
                                   f"{best[ex['TELEPHELY_TELEPULES']]}, {best[ex['TELEPHELY_CIM']]}")
                if geo:
                    entry["g"] = [geo["lat"], geo["lon"], 1 if geo.get("geoApprox") else 0]
                st["settlementMatch" if matching else "settlementMismatch"] += 1
                st["providerMatch" if provider_match else "providerMismatch"] += 1
            else:
                st[reason[0]] += 1
                unmatched[fid] = [kind[0], *reason]
            entry["k"] = "g" if kind == "gp" else "d"
            praxes[fid] = entry

    # every district is either matched to a licence or has exactly one
    # recorded reason — the two sets must add up to the snapshot
    for kind, st in stats.items():
        n_unmatched = sum(1 for u in unmatched.values() if u[0] == kind[0])
        if st["licence"] + n_unmatched != st["total"]:
            raise EesztError(
                f"{kind}: {st['licence']} matched + {n_unmatched} unmatched "
                f"!= {st['total']} districts")

    # settlement directory: every primary-care licence, no names
    by_norm: dict[str, list] = collections.defaultdict(list)
    all_prof = PROFESSIONS["gp"] | PROFESSIONS["dental"]
    seen: set[tuple] = set()
    for x in eng:
        code = x[ex["SZAKMA_KOD"]]
        if code not in all_prof or x[ex["ELLATASI_FORMA"]] != "A1":
            continue
        key = (normalize_settlement(x[ex["TELEPHELY_TELEPULES"]] or ""),
               re.sub(r"\W+", "", (x[ex["TELEPHELY_CIM"]] or "").lower()), code)
        if key in seen:
            continue
        seen.add(key)
        professions[code] = x[ex["SZAKMA_NEV"]]
        by_norm[normalize_settlement(x[ex["TELEPHELY_TELEPULES"]] or "")].append([
            "g" if code in PROFESSIONS["gp"] else "d",
            x[ex["TELEPHELY_IRSZAM"]], x[ex["TELEPHELY_CIM"]], code,
            1 if x[ex["KOZFINANSZIROZOTT"]] == "I" else 0,
            on_call_idx(x[ex["UGYELET_KESZENLET"]]),
        ])

    # key the directory by OUR settlement names (Budapest "01" vs "I. kerület",
    # accent slips in the NEAK spelling) so the UI does exact lookups only
    settlements: dict[str, list] = {}
    for kind in ("dental", "gp"):
        for sett in latest["kinds"][kind]["settlements"]:
            rows = by_norm.get(normalize_settlement(sett["name"]))
            if rows:
                settlements[sett["name"]] = rows

    out = {
        "schemaVersion": 1,
        "source": "EESZT törzspublikáció (NEAK_FINSZOLG, EUSZOLG_PUBLIKUS, EUSZOLG_ENGEDELY_PUBLIKUS)",
        "asOf": date,
        "dataMonth": latest["month"],
        "stats": {k: dict(v) for k, v in stats.items()},
        "professions": professions,
        "onCall": on_call,
        "praxes": praxes,
        "unmatched": unmatched,
        "settlements": dict(settlements),
    }
    guard(out, latest)
    return out


def guard(out: dict, latest: dict) -> None:
    """Hard name-policy and consistency checks — the supplement must never
    publish a name on a vacant/dissolved district."""
    filled = {f["id"] for k in ("dental", "gp") for f in latest["kinds"][k]["filledPraxes"]}
    known = filled | {p["id"] for k in ("dental", "gp") for p in latest["kinds"][k]["praxes"]}
    for fid, e in out["praxes"].items():
        if fid not in known:
            raise EesztError(f"{fid}: not in the latest snapshots")
        if fid not in filled and ("p" in e or "i" in e):
            raise EesztError(f"{fid}: provider data on a non-filled district")
        if "d" in e and NAME_MARKER_RE.search(e["d"]):
            raise EesztError(f"{fid}: name marker in district number {e['d']!r}")
        if set(e) - {"k", "d", "p", "i", "l", "g"}:
            raise EesztError(f"{fid}: unexpected fields {set(e)}")
        if "l" in e and len(e["l"]) != 7:
            raise EesztError(f"{fid}: licence block has unexpected shape")
        if "g" in e and not (45.5 < e["g"][0] < 48.7 and 16.0 < e["g"][1] < 23.0):
            raise EesztError(f"{fid}: coordinates outside Hungary {e['g']}")
    reasons = {"noFin", "otherTip", "ambiguous", "otherProfession", "noUnitLicence"}
    for fid, u in out.get("unmatched", {}).items():
        if fid not in known or len(u) != 3 or u[1] not in reasons:
            raise EesztError(f"{fid}: malformed unmatched record {u!r}")
        if NAME_MARKER_RE.search(u[2]):
            raise EesztError(f"{fid}: name marker in unmatched detail")
    for row in (r for rows in out["settlements"].values() for r in rows):
        if len(row) != 6:
            raise EesztError("settlement directory row has unexpected shape")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=None)
    args = parser.parse_args()
    date = args.date or latest_date()
    out = build(date)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for kind, st in out["stats"].items():
        print(f"[{kind}] {st}")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KiB), "
          f"{len(out['praxes'])} praxes, "
          f"{sum(len(v) for v in out['settlements'].values())} settlement licences")


if __name__ == "__main__":
    main()
