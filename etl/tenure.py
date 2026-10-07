"""Since when has this district had a doctor — as far back as our archive goes.

A settlement page can say "there is a dentist here" because the current
registry says so. How long that has been true is a different question, and
the only honest source for it is this repository's own archive: 39 monthly
snapshots between 2017-10 and today, each one a NEAK publication we kept.

So the answer here is always qualified. For a district that was already
filled in the oldest snapshot we hold, the truth is "at least that long" —
NEAK does not publish a start date, and inventing one would be worse than
saying "or longer". Between snapshots there are gaps (the archive is not
monthly before 2024, and some months were rebuilt from the vacancy list
alone and hold no registry at all), so a spell that started inside a gap is
dated to the first snapshot that shows it filled: the tenure reported is
never longer than the truth, only shorter.

A spell ends when a snapshot shows the FIN code vacant, dissolved, or filled
by a different physician — a new doctor is a new spell, which is what a
resident means by "how long have we had this doctor".

Output: data/tenure.json
  {kind: {fin: {since, months, snapshots, fromStart, doctor}}}

Usage:
  python etl/tenure.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "tenure.json"
SCHEMA_VERSION = 1
KINDS = ("dental", "gp")
MONTH_RE = re.compile(r"^\d{4}-\d{2}$")
# below this the archive is too thin to say anything about a branch
MIN_SNAPSHOTS = 6


def months() -> list[str]:
    return sorted(p.name for p in DATA.iterdir()
                  if p.is_dir() and MONTH_RE.match(p.name))


def snapshot(month: str, kind: str) -> dict | None:
    path = DATA / month / f"{kind}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def doctor_key(name: str) -> str:
    """Names are spelled unevenly across years; compare them loosely."""
    return re.sub(r"[^a-z]", "", (name or "").lower()
                  .replace("dr.", "").replace("dr ", ""))


def month_diff(a: str, b: str) -> int:
    """Whole months from a to b, both YYYY-MM."""
    return (int(b[:4]) - int(a[:4])) * 12 + int(b[5:7]) - int(a[5:7])


def walk(kind: str, all_months: list[str]) -> tuple[dict, list[str]]:
    """The current filled spell of every district of one branch."""
    seen: list[str] = []
    spells: dict[str, dict] = {}
    for month in all_months:
        snap = snapshot(month, kind)
        if snap is None:
            continue
        filled = {f["id"]: f for f in snap.get("filledPraxes", [])}
        # some archived months were rebuilt from the vacancy list alone — the
        # registry behind them was never published at a stable URL — so they
        # carry no filled districts at all. Such a month says nothing about
        # who was working where, and must not end every spell in the country.
        if not filled:
            continue
        seen.append(month)
        # only a district filled in this snapshot too keeps its spell: one
        # that went vacant, was dissolved or simply left the registry starts
        # again from whenever it comes back
        carried: dict[str, dict] = {}
        for fin, row in filled.items():
            key = doctor_key(row.get("doctor", ""))
            spell = spells.get(fin)
            if spell is not None and spell["doctorKey"] == key:
                spell["snapshots"] += 1
                carried[fin] = spell
            else:
                # a different physician is a different spell: "how long have
                # we had this doctor" is the question a resident is asking
                carried[fin] = {"since": month, "doctorKey": key,
                                "doctor": row.get("doctor", ""), "snapshots": 1}
        spells = carried
    return spells, seen


def build() -> dict:
    all_months = months()
    if not all_months:
        raise ParseError("no monthly snapshots in data/")
    latest = all_months[-1]

    out: dict = {
        "schemaVersion": SCHEMA_VERSION,
        "dataMonth": latest,
        "kinds": {},
        "stats": {},
    }
    for kind in KINDS:
        spells, seen = walk(kind, all_months)
        if len(seen) < MIN_SNAPSHOTS:
            raise ParseError(f"{kind}: only {len(seen)} archived snapshots")
        first = seen[0]
        rows = {}
        for fin, spell in spells.items():
            from_start = spell["since"] == first
            rows[fin] = {
                "since": spell["since"],
                "months": month_diff(spell["since"], latest),
                "snapshots": spell["snapshots"],
                # the spell reaches the edge of what we hold: "or longer"
                "fromStart": from_start,
                "doctor": spell["doctor"],
            }
        out["kinds"][kind] = rows
        out["stats"][kind] = {
            "snapshots": len(seen),
            "from": first,
            "districts": len(rows),
            "fromStart": sum(1 for r in rows.values() if r["fromStart"]),
        }
    guard(out)
    return out


def guard(out: dict) -> None:
    latest = out["dataMonth"]
    for kind in KINDS:
        rows = out["kinds"][kind]
        stats = out["stats"][kind]
        if not rows:
            raise ParseError(f"{kind}: no filled spells at all")
        # every spell we report must also be filled in the current snapshot
        current = snapshot(latest, kind)
        if current is None:
            raise ParseError(f"{latest}: the {kind} snapshot is missing")
        filled = {f["id"] for f in current.get("filledPraxes", [])}
        if set(rows) != filled:
            missing = len(filled - set(rows))
            extra = len(set(rows) - filled)
            raise ParseError(f"{kind}: {missing} filled districts without a spell, "
                             f"{extra} spells without a filled district")
        for fin, row in rows.items():
            if row["months"] < 0:
                raise ParseError(f"{fin}: a spell that starts in the future")
            if row["since"] > latest:
                raise ParseError(f"{fin}: {row['since']} is after {latest}")
            if row["fromStart"] != (row["since"] == stats["from"]):
                raise ParseError(f"{fin}: the 'or longer' flag contradicts the date")


def main() -> None:
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT}:")
    for kind, st in out["stats"].items():
        print(f"  {kind}: {st['districts']} filled districts over {st['snapshots']} "
              f"snapshots from {st['from']}; {st['fromStart']} already filled by "
              "the same physician at the start of the archive")


if __name__ == "__main__":
    main()
