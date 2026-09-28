"""The monthly referral master list, and the exit log it carries.

NEAK publishes no dissolved (megszűnt) list for GP districts — that gap is
written into CLAUDE.md and the site works around it by treating a FIN code
that disappears from the registry as dissolved. The referral master list
("9 jegyű beutalási törzslista") does better: it is republished every month
with four sheets, and two of them are change logs. In the words of its own
methodology sheet:

    teljes törzs       a tárgyhónap teljes állománya
    kiléptek           a tárgyhónapban már nem szereplő 9 jegyű kódokat
    beléptek           a tárgyhónapban újonnan belépő 9 jegyű kódokat
    egyéb változás     kódok, melyek mindkét hónapban szerepelnek, de
                       valamelyik paraméterükben eltérnek

So NEAK does say which financing codes left and which arrived — for every
branch, including GP. It is also the authoritative FIN -> institution
crosswalk, which is the join the financing workbooks need.

One rule this module keeps: GYFKOD_KAPCS_NEV holds a district label for
most rows ("Pécsvárad 1. körzet", "Vegyes", "Reumatológia") but a
physician's name for many GP ones. The site publishes a name only for a
filled district out of the NEAK registry, and this file does not say which
districts are filled — so a label that looks like a person's name is
withheld here and the row is flagged instead (CLAUDE.md rule 3).

Usage:
  python etl/referral.py [--month 2026-09]
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT = ROOT / "data" / "referral.json"
SCHEMA_VERSION = 1
FILE = "referral_master.xlsx"

# the sheet names are Hungarian and the file is republished monthly
SHEETS = {
    "all": "teljes törzs",
    "addresses": "teljes törzs címmel",
    "exited": "kiléptek",
    "entered": "beléptek",
    "changed": "egyéb változás (nem gyfkod)",
}
# the branch codes this project cares about, as the file's own key explains
TYPES = {
    "HSZ": "háziorvos", "FOGA": "fogászati alapellátás",
    "FOGSZ": "fogászati szakellátás", "VNO": "védőnő",
    "ISK": "iskolaorvos", "UGY": "ügyelet", "JAR": "járóbeteg",
    "FEK": "fekvőbeteg", "MENT": "mentés", "MUV": "művese",
    "OTT": "otthoni szakápolás", "HOS": "hospice", "ANY": "anya-, gyermek- és csecsemővédelem",
    "MSZ": "mozgó szakorvosi szolgálat", "SGY": "spec. gyermek", "CT": "CT",
    "MR": "MR", "PET": "PET", "EGYEB": "egyéb",
    "ZBEUT": "beutalási szerződésben szereplő, nem NEAK-finanszírozott",
    # the file's own key omits this one; its 58 rows match the 58 betegszállítás
    # services the EESZT financing register carries under TIP = BET
    "BSZ": "betegszállítás",
}
# a branch code nobody documented is worth recording, but only a large one
# means the register itself changed shape
UNKNOWN_TYPE_LIMIT = 500
NAME_MARKER_RE = re.compile(r"\bdr\b\.?", re.IGNORECASE)
# a district code is always nine characters; the referral-only (ZBEUT) rows
# carry a handful of legacy codes that are shorter, and they are not ours
FIN_RE = re.compile(r"^[0-9A-Z]{5,9}$")
DISTRICT_FIN_RE = re.compile(r"^[0-9A-Z]{9}$")
DISTRICT_TYPES = ("HSZ", "FOGA")


def latest_month() -> str:
    months = sorted(p.name for p in RAW_DIR.iterdir()
                    if p.is_dir() and re.fullmatch(r"\d{4}-\d{2}", p.name)
                    and (p / FILE).exists())
    if not months:
        raise ParseError("no archived month holds the referral master list")
    return months[-1]


def sheet(path: Path, name: str) -> pd.DataFrame:
    frames = pd.read_excel(path, sheet_name=None, dtype=str)
    # the sheet names carry accents and one of them a parenthesis, so they are
    # matched loosely rather than quoted exactly
    wanted = name.lower().replace(" ", "")
    for key, frame in frames.items():
        if key.lower().replace(" ", "").startswith(wanted[:12]):
            return frame.fillna("")
    raise ParseError(f"{path.name}: no sheet like {name!r} (has {list(frames)})")


def rows_of(frame: pd.DataFrame, with_address: bool) -> list[dict]:
    out = []
    for r in frame.to_dict("records"):
        fin = str(r.get("GYFKOD", "")).strip()
        if not fin:
            continue
        label = str(r.get("GYFKOD_KAPCS_NEV", "")).strip()
        withheld = bool(NAME_MARKER_RE.search(label))
        row = {
            "period": str(r.get("IDOSZAK", "")).strip(),
            "fin": fin,
            "county": str(r.get("VARMEGYE", "")).strip(),
            "neakCode": str(r.get("INTKOD", "")).strip(),
            "institution": str(r.get("INTNEV_TELJES") or r.get("INTNEV", "")).strip(),
            "type": str(r.get("TIPUS", "")).strip(),
            "label": "" if withheld else label,
            "labelWithheld": withheld,
        }
        if with_address:
            row |= {
                "postalCode": str(r.get("IRSZ", "")).strip(),
                "settlement": str(r.get("TELNEV", "")).strip(),
                "address": str(r.get("CIM", "")).strip(),
            }
        out.append(row)
    return out


def build(month: str | None = None) -> dict:
    month = month or latest_month()
    path = RAW_DIR / month / FILE
    if not path.exists():
        raise ParseError(f"{path} is missing — fetch the month first")

    # the address sheet repeats a code once per site, so the plain sheet is
    # the row source and the addresses are attached to it
    everything = rows_of(sheet(path, SHEETS["all"]), with_address=False)
    addresses: dict[str, dict] = {}
    for r in rows_of(sheet(path, SHEETS["addresses"]), with_address=True):
        addresses.setdefault(r["fin"], r)
    for row in everything:
        extra = addresses.get(row["fin"], {})
        row |= {k: extra.get(k, "") for k in ("postalCode", "settlement", "address")}
    exited = rows_of(sheet(path, SHEETS["exited"]), with_address=False)
    entered = rows_of(sheet(path, SHEETS["entered"]), with_address=False)
    changed = rows_of(sheet(path, SHEETS["changed"]), with_address=False)

    latest = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
    ours: dict[str, str] = {}
    for kind in ("dental", "gp"):
        snap = latest["kinds"][kind]
        for f in snap.get("filledPraxes", []):
            ours[f["id"]] = "filled"
        for p in snap.get("praxes", []):
            ours[p["id"]] = p.get("status", "vacant")

    known = {r["fin"] for r in everything}
    districts = [r for r in everything if r["type"] in DISTRICT_TYPES]

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "period": everything[0]["period"] if everything else "",
        "dataMonth": month,
        "types": TYPES,
        "stats": {
            "rows": len(everything),
            "districts": len(districts),
            "byType": dict(collections.Counter(r["type"] for r in everything).most_common()),
            "entered": len(entered),
            "exited": len(exited),
            "changed": len(changed),
            "labelsWithheld": sum(1 for r in everything if r["labelWithheld"]),
            "unknownTypes": dict(collections.Counter(
                r["type"] for r in everything if r["type"] not in TYPES).most_common()),
            # how the master list lines up with the district universe we publish
            "oursInMaster": sum(1 for fin in ours if fin in known),
            "oursMissing": sum(1 for fin in ours if fin not in known),
            "exitedKnownToUs": sum(1 for r in exited if r["fin"] in ours),
            "enteredKnownToUs": sum(1 for r in entered if r["fin"] in ours),
        },
        "entered": entered,
        "exited": [r | {"ourStatus": ours.get(r["fin"], "")} for r in exited],
        "changed": changed,
        "rows": everything,
    }
    guard(out)
    return out


def guard(out: dict) -> None:
    st = out["stats"]
    if st["rows"] < 30000:
        raise ParseError(f"only {st['rows']} rows in the master list")
    if not re.fullmatch(r"\d{6}", out["period"] or ""):
        raise ParseError(f"the period {out['period']!r} is not a YYYYMM stamp")
    if st["districts"] < 8000:
        raise ParseError(f"only {st['districts']} district rows (HSZ + FOGA)")
    # the district universe we publish must be in the master list; a big
    # mismatch means one of the two moved and the join is no longer safe
    if st["oursMissing"] > st["oursInMaster"] * 0.02:
        raise ParseError(f"{st['oursMissing']} of our districts are absent from "
                         "the master list")
    for code, count in st["unknownTypes"].items():
        if count > UNKNOWN_TYPE_LIMIT:
            raise ParseError(f"branch code {code!r} is undocumented and carries "
                             f"{count} rows — the register changed shape")
    seen: set[str] = set()
    for r in out["rows"]:
        if not FIN_RE.fullmatch(r["fin"]):
            raise ParseError(f"not a FIN code: {r['fin']!r}")
        if r["labelWithheld"] and r["label"]:
            raise ParseError(f"{r['fin']}: a withheld label was published anyway")
        if r["type"] not in DISTRICT_TYPES:
            continue
        # a code may repeat across branches, but never inside the districts
        if not DISTRICT_FIN_RE.fullmatch(r["fin"]):
            raise ParseError(f"{r['fin']}: a district code must be nine characters")
        if r["fin"] in seen:
            raise ParseError(f"duplicate district code {r['fin']}")
        seen.add(r["fin"])
    for name in ("entered", "exited"):
        for r in out[name]:
            if not FIN_RE.fullmatch(r["fin"]):
                raise ParseError(f"{name}: not a FIN code: {r['fin']!r}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", default=None)
    args = parser.parse_args()
    out = build(args.month)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    st = out["stats"]
    print(f"wrote {OUT}: {st['rows']} financing codes in {out['period']}, "
          f"{st['districts']} of them districts")
    print(f"  entered {st['entered']}, exited {st['exited']} "
          f"({st['exitedKnownToUs']} of the exits are districts we publish), "
          f"other changes {st['changed']}")
    print(f"  our districts found in the master list: {st['oursInMaster']}, "
          f"missing: {st['oursMissing']}; labels withheld as names: "
          f"{st['labelsWithheld']}")


if __name__ == "__main__":
    main()
