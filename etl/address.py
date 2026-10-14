"""One spelling per surgery.

The NEAK registry is typed by hand, in twenty counties, over many years, and
it shows. In Szombathely the same dental clinic appears as

    9700 Szombathely, Kiskar u. 5-7.
    9700 Szombathely, KISKAR 7.
    9700 Szombathely, kISKAR 7.
    9700 Szombathely, Kiskar u. 7.

and the same street as both "Szent M. u. 20/A." and "Szent Márton u. 20/A.",
both "Nádasdy Ferenc u. 43." and "Nádasdy Ferenc út 43.". To a reader they are
one place; to every piece of code that groups by address they are four, which
is why a settlement page could claim four surgeries where there is one, and
why the geocoder was asked the same question several times over.

This module makes one spelling of each. It does two separable things:

  tidy()     spelling only, one address at a time: whitespace, capitals that
             the registry shouts in, the street-type word ("utca" -> "u."),
             the house number ("20/a" -> "20/A."). Nothing here depends on
             any other address, so it is safe and reversible by eye.

  resolve()  the part that needs company: inside one settlement, addresses
             that are the same place get one label. Two are the same place
             when their street stems agree — allowing an abbreviation to
             stand for the full name, "Szent M." for "Szent Márton" — and
             their house numbers overlap, a plain 7 falling inside 5-7.
             The label is the most complete spelling among them.

Nothing is invented: every canonical form is a string that the registry
itself publishes somewhere, and the entry keeps the registry's own wording in
`addressRaw` whenever the two differ, so the page can show both and the claim
stays checkable.

Decisions are pinned in etl/address_cache.json (git-tracked, like the geocode
cache) so that a later month cannot quietly relabel a surgery because one new
row changed which spelling is the most frequent. A monthly run only has to
resolve the strings it has not seen before. etl/address_overrides.json holds
corrections by hand; they win over everything.

Usage:
  python etl/address.py --report        # what the current data would become
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "address_cache.json"
OVERRIDES = Path(__file__).resolve().parent / "address_overrides.json"
SCHEMA_VERSION = 1

# The street-type words, as the registry writes them -> as we write them.
# "utca" becomes "u." because that is what most of the registry already says;
# "út", "tér", "köz" and the rest keep their own word, because they are a
# different kind of street and shortening them would lose that.
STREET_TYPES = {
    "utca": "u.", "u": "u.", "u.": "u.", "utcza": "u.",
    "út": "út", "ut": "út", "út": "út", "útja": "útja",
    "tér": "tér", "ter": "tér", "tere": "tere",
    "körút": "krt.", "korut": "krt.", "krt": "krt.", "krt.": "krt.",
    "sétány": "sétány", "setany": "sétány",
    "köz": "köz", "koz": "köz",
    "sugárút": "sgt.", "sgt": "sgt.", "sgt.": "sgt.",
    "lakótelep": "ltp.", "ltp": "ltp.", "ltp.": "ltp.", "lakotelep": "ltp.",
    "fasor": "fasor", "park": "park", "sor": "sor", "dűlő": "dűlő",
    "rakpart": "rkp.", "rkp": "rkp.", "rkp.": "rkp.",
    "puszta": "puszta", "telep": "telep", "major": "major",
}
# the canonical forms themselves, for recognising a type word in a tidied string
CANONICAL_TYPES = set(STREET_TYPES.values())

# "5-7", "20/A", "12.", "3/b", "1-3." — everything from the first digit on
HOUSE_RE = re.compile(
    r"^(?P<num>\d+(?:\s*[-–/]\s*[0-9A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+)*)\.?\s*(?P<rest>.*)$")
RANGE_RE = re.compile(r"^(\d+)\s*[-–]\s*(\d+)$")
# "Váci utca" and "Váci út" are one street as the registry types them, and the
# user of a settlement page means one place by them; "Mártírok útja" is a
# different street from "Mártírok utca", so only this family is interchangeable
STREET_FAMILY = {"u.", "út"}


def _fold(text: str) -> str:
    """Lowercase, accent-stripped — for comparing, never for showing."""
    return "".join(
        c for c in unicodedata.normalize("NFKD", text.lower())
        if not unicodedata.combining(c))


def _fix_caps(word: str) -> str:
    """"KISKAR" and "kISKAR" -> "Kiskar"; "Dr" and "20/A" left alone."""
    letters = [c for c in word if c.isalpha()]
    if len(letters) < 3:
        return word
    upper = sum(1 for c in letters if c.isupper())
    if upper < len(letters) - 1:
        return word  # ordinary capitalisation, or a name like "McDonald"
    # the registry shouting: rewrite as a name, keeping any punctuation
    return word[:1].upper() + word[1:].lower() if word[:1].isalpha() \
        else word.capitalize()


def _house(part: str) -> str:
    """"20/a" -> "20/A."; "5 - 7" -> "5-7."; "4./B." -> "4/B."; "12" -> "12."."""
    m = HOUSE_RE.match(part)
    if not m:
        return part
    num = re.sub(r"\s*([-–/])\s*", r"\1", m.group("num")).replace("–", "-")
    num = re.sub(r"/([a-záéíóöőúüű])", lambda x: "/" + x.group(1).upper(), num)
    rest = m.group("rest").strip().lstrip(". ").rstrip()
    # "4." + "/B." is one house number typed with a stray stop in the middle
    if rest.startswith("/"):
        return _house(f"{num}{rest}")
    if not rest:
        return f"{num}."
    # a floor or a flat behind the number keeps its own closing stop, and is
    # written the way the rest of the address is rather than shouted
    rest = " ".join(_fix_caps(w) for w in rest.rstrip(".").split(" "))
    return f"{num}. {rest}."


def _cut(words: list[str]) -> int:
    """Where the house number starts.

    A number inside the street name — "Március 15. u." , "Május 1. tér" — is
    followed by the kind of street; the house number is not. That one rule
    tells them apart without a list of street names.
    """
    for i, w in enumerate(words):
        if not i or not re.match(r"^\d", w):
            continue
        following = words[i + 1] if i + 1 < len(words) else ""
        if following and (following in CANONICAL_TYPES
                          or _fold(following).strip(".") in STREET_TYPES):
            continue  # part of the name
        return i
    return len(words)


def tidy(raw: str) -> str:
    """Spelling-level clean-up of one address, with no knowledge of others."""
    text = " ".join((raw or "").split()).strip(" ,;")
    if not text:
        return ""
    # "Pasaréti u.41" — the registry sometimes forgets the space
    text = re.sub(r"(?<=[^\W\d_.])(?=\d)|(?<=\.)(?=\d)", " ", text)
    words = text.split(" ")
    cut = _cut(words)
    # a bare number inside a street name is an ordinal: "Március 15. u."
    name_words = [f"{w}." if w.isdigit() else _fix_caps(w) for w in words[:cut]]
    house = _house(" ".join(words[cut:])) if cut < len(words) else ""
    # the street-type word, if the last word of the name is one
    if name_words:
        key = _fold(name_words[-1]).strip(".")
        if key in STREET_TYPES or name_words[-1] in CANONICAL_TYPES:
            name_words[-1] = STREET_TYPES.get(key, name_words[-1])
    name = " ".join(w for w in name_words if w)
    return f"{name} {house}".strip()


def _stem(tidied: str) -> tuple[str, str]:
    """(street stem, house part) of a tidied address, folded for comparing.

    The stem keeps the kind of street, because "Mártírok útja" and "Mártírok
    u." are two streets — except for the one family the registry itself is
    inconsistent about, where "u." and "út" become the same word.
    """
    words = tidied.split(" ")
    cut = _cut(words)
    name_words = list(words[:cut])
    if name_words and name_words[-1] in CANONICAL_TYPES:
        kind = name_words.pop()
        if kind not in STREET_FAMILY:
            name_words.append(kind)
    return _fold(" ".join(name_words)), " ".join(words[cut:])


def _has_type(tidied: str) -> int:
    """Whether the address says what kind of street it is at all."""
    words = [w for w in tidied.split(" ") if w]
    return int(any(w in CANONICAL_TYPES for w in words))


def _accents(tidied: str) -> int:
    """How many accented letters a spelling keeps.

    A registry row typed in capitals usually loses them ("VASUT" for "Vasút"),
    and nothing can put them back; where both spellings exist, the one that
    kept them is the one to show.
    """
    return sum(1 for c in tidied if c.isalpha() and ord(c) > 127)


def _type_word(tidied: str) -> str:
    """The kind of street this spelling says, or "" where it says none."""
    words = [w for w in tidied.split(" ") if w]
    cut = _cut(words)
    name_words = words[:cut]
    return name_words[-1] if name_words and name_words[-1] in CANONICAL_TYPES else ""


def _short_type(tidied: str) -> int:
    """Prefers "u." where the registry is split between "u." and "út"."""
    return int(" u. " in f" {tidied} ")


def _is_plain(house: str) -> bool:
    """A bare number or a bare range: no door letter, no floor, no flat."""
    return bool(re.fullmatch(r"\d+(?:-\d+)?\.?", house.strip()))


def _numbers(house: str) -> set[int]:
    """The house numbers an address covers: "5-7." -> {5, 6, 7}."""
    first = house.split(" ")[0].rstrip(".") if house else ""
    out: set[int] = set()
    for part in first.split("/")[:1]:
        m = RANGE_RE.match(part)
        if m:
            lo, hi = int(m.group(1)), int(m.group(2))
            if 0 < lo <= hi <= lo + 40:
                out.update(range(lo, hi + 1))
            continue
        digits = re.match(r"^\d+", part)
        if digits:
            out.add(int(digits.group(0)))
    return out


def _abbreviates(short: str, full: str) -> bool:
    """Whether "szent m" stands for "szent marton" (same words, one cut short)."""
    a, b = short.split(), full.split()
    if len(a) != len(b) or a == b:
        return False
    cut = 0
    for x, y in zip(a, b):
        if x == y:
            continue
        if len(x) < len(y) and y.startswith(x.rstrip(".")) and len(x.rstrip(".")) >= 1:
            cut += 1
            continue
        return False
    return cut > 0


def _same_place(a: tuple[str, str], b: tuple[str, str]) -> bool:
    (stem_a, house_a), (stem_b, house_b) = a, b
    if not stem_a or not stem_b:
        return False
    if stem_a != stem_b and not (_abbreviates(stem_a, stem_b)
                                 or _abbreviates(stem_b, stem_a)):
        return False
    if house_a == house_b:
        return True
    # Beyond an identical house number, only one merge is safe: a plain number
    # that falls inside a plain range, which is the same building written two
    # ways ("Kiskar u. 7." inside "Kiskar u. 5-7."). A door letter, a floor or
    # a flat number is a different address — "4/B." is not "4/C." — so
    # anything carrying one is left alone.
    if not (_is_plain(house_a) and _is_plain(house_b)):
        return False
    na, nb = _numbers(house_a), _numbers(house_b)
    if not (na and nb and na & nb):
        return False
    # two overlapping ranges are two buildings that share a number, not one
    # address written twice ("88-92." and "88-96." are different blocks)
    return len(na) == 1 or len(nb) == 1


def resolve(addresses: list[str]) -> dict[str, str]:
    """{raw address: canonical address} for the addresses of ONE settlement.

    The canonical form of a group is the most complete spelling in it, in
    this order: it names the kind of street at all ("Kiskar u. 7." over
    "Kiskar 7."), it writes the name out ("Szent Márton" over "Szent M."), it
    gives the widest house-number range of the building ("5-7." over "7."),
    and it is what most entries already say. Where even that ties — the
    registry says "Nádasdy Ferenc u. 43." exactly as often as "Nádasdy Ferenc
    út 43." — the shorter street-type word wins, which keeps the choice
    deterministic; etl/address_overrides.json is where a wrong pick is put
    right by hand.
    """
    tidied = {raw: tidy(raw) for raw in addresses}
    counts: dict[str, int] = defaultdict(int)
    for raw in addresses:
        counts[tidied[raw]] += 1

    keys = {t: _stem(t) for t in counts}
    # Which word the registry uses for this street, counted over the whole
    # settlement: at Pasaréti út one block is typed "u." three times out of
    # five, but the street as a whole is "út" nine times out of thirteen, and
    # the street is what the reader is looking at.
    type_vote: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for text, n in counts.items():
        type_vote[keys[text][0]][_type_word(text)] += n
    # Connected components, not a greedy first match: "8." and "10." are only
    # the same place through "8-10.", and whether they find each other must
    # not depend on which of the three the loop happens to see first.
    texts = sorted(counts)
    parent = {t: t for t in texts}

    def find(t: str) -> str:
        while parent[t] != t:
            parent[t] = parent[parent[t]]
            t = parent[t]
        return t

    for i, a in enumerate(texts):
        for b in texts[i + 1:]:
            if _same_place(keys[a], keys[b]):
                parent[find(a)] = find(b)
    merged: dict[str, list[str]] = defaultdict(list)
    for t in texts:
        merged[find(t)].append(t)
    groups = list(merged.values())

    canonical: dict[str, str] = {}
    for group in groups:
        best = max(group, key=lambda t: (
            _has_type(t),                      # names the kind of street
            len(_stem(t)[0]),                  # the written-out street name
            type_vote[keys[t][0]][_type_word(t)],  # what this street is called
            _accents(t),                       # the careful spelling, not the shouted one
            len(_numbers(_stem(t)[1])),        # the widest range of the building
            counts[t],                         # what most entries already say
            _short_type(t),                    # a coin toss that lands alike
            t,
        ))
        for text in group:
            canonical[text] = best
    return {raw: canonical[tidied[raw]] for raw in addresses}


# ---------------------------------------------------------------- the cache

def _key(settlement: str, postal: str, raw: str) -> str:
    return f"{postal} {settlement}|{raw}"


def load_cache() -> dict:
    if not CACHE.exists():
        return {"schemaVersion": SCHEMA_VERSION, "addresses": {}}
    data = json.loads(CACHE.read_text(encoding="utf-8"))
    data.setdefault("addresses", {})
    return data


def load_overrides() -> dict[str, str]:
    if not OVERRIDES.exists():
        return {}
    return json.loads(OVERRIDES.read_text(encoding="utf-8")).get("addresses", {})


def save_cache(cache: dict) -> None:
    cache["schemaVersion"] = SCHEMA_VERSION
    cache["addresses"] = dict(sorted(cache["addresses"].items()))
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1,
                               sort_keys=False) + "\n", encoding="utf-8")


def normalize_entries(entries: list, *, cache: dict | None = None,
                      get=None, put=None) -> int:
    """Give every entry one spelling of its address. Returns how many changed.

    `entries` may be dicts or dataclasses; `get`/`put` default to attribute
    access falling back to item access, so both parsers can hand their own
    rows over unchanged. An entry that changes keeps the registry's wording in
    `addressRaw`.
    """
    def _get(entry, field):
        if isinstance(entry, dict):
            return entry.get(field, "")
        return getattr(entry, field, "")

    def _put(entry, field, value):
        if isinstance(entry, dict):
            entry[field] = value
        else:
            setattr(entry, field, value)

    get = get or _get
    put = put or _put
    cache = load_cache() if cache is None else cache
    overrides = load_overrides()
    known = cache["addresses"]

    by_place: dict[tuple[str, str], list] = defaultdict(list)
    for entry in entries:
        settlement = get(entry, "settlement")
        if not settlement or not get(entry, "address"):
            continue
        by_place[(settlement, get(entry, "postalCode"))].append(entry)

    changed = 0
    for (settlement, postal), rows in by_place.items():
        raws = [get(r, "address") for r in rows]
        # a decision already made stays made; only the new strings are resolved
        decided = {raw: known[_key(settlement, postal, raw)] for raw in raws
                   if _key(settlement, postal, raw) in known}
        fresh = [raw for raw in raws if raw not in decided]
        if fresh:
            # the new strings are resolved against the settled ones too, so a
            # new row joins the group it belongs to instead of starting one
            resolved = resolve(sorted(set(fresh) | set(decided)))
            for raw in fresh:
                decided[raw] = resolved[raw]
                known[_key(settlement, postal, raw)] = resolved[raw]
        for row in rows:
            raw = get(row, "address")
            final = overrides.get(_key(settlement, postal, raw), decided[raw])
            if final != raw:
                put(row, "addressRaw", raw)
                put(row, "address", final)
                changed += 1
    return changed


# ---------------------------------------------------------------- reporting

def _report() -> int:
    """What the addresses in data/settlements.json would become."""
    path = ROOT / "data" / "settlements.json"
    if not path.exists():
        print("no data/settlements.json to report on", file=sys.stderr)
        return 1
    rows = json.loads(path.read_text(encoding="utf-8"))["settlements"]
    groups = 0
    merged = 0
    for profile in rows:
        places: dict[tuple[str, str], list[str]] = defaultdict(list)
        for surgery in profile.get("surgeries", []):
            if surgery.get("address"):
                places[(profile["settlement"],
                        surgery.get("postalCode", ""))].append(surgery["address"])
        for (settlement, postal), raws in places.items():
            mapping = resolve(raws)
            distinct_before = len(set(raws))
            distinct_after = len(set(mapping.values()))
            if distinct_after < distinct_before:
                groups += 1
                merged += distinct_before - distinct_after
                for raw in sorted(set(raws)):
                    if mapping[raw] != raw:
                        print(f"{postal} {settlement}: {raw!r} -> {mapping[raw]!r}")
    print(f"\n{merged} spellings folded into {groups} settlements' addresses")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--report", action="store_true",
                    help="print what the current data would become")
    args = ap.parse_args()
    if args.report:
        sys.exit(_report())
    ap.print_help()


if __name__ == "__main__":
    main()
