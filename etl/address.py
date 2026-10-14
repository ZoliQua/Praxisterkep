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

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_ksh import normalize_settlement  # noqa: E402

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
    "út": "út", "ut": "út", "út": "út", "útja": "útja", "utja": "útja",
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
BUILDING_RE = re.compile(
    r'^[„"\u201d]?([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű])[„"\u201d]?\.?\s*'
    r'(?:ép|épület|epulet)\.?$', re.IGNORECASE)
# "Váci utca" and "Váci út" are one street as the registry types them, and the
# user of a settlement page means one place by them; "Mártírok útja" is a
# different street from "Mártírok utca", so only this family is interchangeable
STREET_FAMILY = {"u.", "út"}


def _fold(text: str) -> str:
    """Lowercase, accent-stripped — for comparing, never for showing."""
    return "".join(
        c for c in unicodedata.normalize("NFKD", text.lower())
        if not unicodedata.combining(c))


ROMAN_RE = re.compile(r"^[IVXLC]+[./]?$")


def _fix_caps(word: str) -> str:
    """"KISKAR" and "kISKAR" -> "Kiskar"; "IV." and "20/A" left alone."""
    if ROMAN_RE.match(word) or any(c.isdigit() for c in word):
        return word  # a floor or a door number, not a shouted name
    letters = [c for c in word if c.isalpha()]
    if len(letters) < 2:
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
    # "47. C. ép.", "2. A. épület.", '21. "E" épület.' — a building letter the
    # registry hangs behind the number instead of writing "47/C."
    building = BUILDING_RE.match(rest)
    if building and "/" not in num:
        return f"{num}/{building.group(1).upper()}."
    # a floor or a flat behind the number keeps its own closing stop, and is
    # written the way the rest of the address is rather than shouted
    rest = " ".join(_fix_caps(w) for w in _rest_words(rest.rstrip(".")))
    return f"{num}. {rest.rstrip('.')}."


# what stands behind the house number, as the registry spells it -> as we do
REST_WORDS = {
    "épület": "ép.", "epulet": "ép.", "ép": "ép.", "ep": "ép.",
    "emelet": "em.", "em": "em.", "emlet": "em.",
    "fszt": "fsz.", "fszt.": "fsz.", "fsz": "fsz.", "földszint": "fsz.",
    "foldszint": "fsz.", "ajto": "ajtó", "lház": "lph.", "lph": "lph.",
}


REST_FOLDED = {_fold(k).rstrip("."): v for k, v in REST_WORDS.items()}


def _rest_words(rest: str) -> list[str]:
    """The floor and the door, spelled one way.

    "fsz,4.", "fszt. 4." and "fsz. 4." are the same ground-floor room, and
    "A épület", "A. ép." and "A.épület." are the same building.
    """
    rest = rest.replace(",", " ")
    out = []
    for word in rest.split():
        key = _fold(word).rstrip(".")
        word = REST_FOLDED.get(key, word)
        # a bare building or staircase letter carries its own stop
        if len(word) == 1 and word.isalpha():
            word = f"{word.upper()}."
        out.append(word)
    return out


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


def strip_place(raw: str, settlement: str, postal: str) -> str:
    """Drop the postal code and settlement the address cell repeats.

    "2626. Nagymaros, Fő tér 10." in the Nagymaros row says the town twice;
    the page prints the settlement from its own column. A leading place name
    that is NOT this settlement — "Agárd, Balatoni u. 84." in Gárdony — names
    a part of the town and stays.
    """
    text = " ".join((raw or "").split()).strip()
    if postal:
        text = re.sub(rf"^{re.escape(postal)}\.?\s*,?\s*", "", text)
    head, sep, rest = text.partition(",")
    if sep and settlement and _fold(head.strip()) == _fold(settlement.strip()):
        return rest.strip() or text
    return text


def tidy(raw: str) -> str:
    """Spelling-level clean-up of one address, with no knowledge of others."""
    text = " ".join((raw or "").split()).strip(" ,;")
    # "Kossuth L,. sgt." and "Komakut tér,1." — a comma where a stop belongs
    text = re.sub(r"\s*,\s*\.", ".", text)
    text = re.sub(r"(?<=[^\W\d_])\s*,\s*(?=\d)", " ", text)
    if not text:
        return ""
    # Hungarian has no ô or û; both are a slip of the keyboard for ő and ű
    text = text.translate(str.maketrans("ôÔûÛ", "őŐűŰ"))
    # "Pasaréti u.41", "Dr.Lumniczer", "Dózsa Gy.u." — the registry forgets
    # the space after a stop as often as it types one
    text = re.sub(r"(?<=[^\W\d_.])(?=\d)|(?<=\.)(?=\d)", " ", text)
    text = re.sub(r"(?<=\.)(?=[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű])", " ", text)
    # "12. -14." is a range the registry broke in two
    text = re.sub(r"(\d)\.?\s*-\s*(\d)", r"\1-\2", text)
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


def _capitals(tidied: str) -> int:
    """How many words of the street name start with a capital.

    The registry types the same street as "Dr. Lumniczer S. u." and "Dr.
    lumniczer S. u."; nothing can tell which letters belong in capitals in
    general, but where both spellings exist the careful one is right.
    """
    words = tidied.split(" ")
    return sum(1 for w in words[:_cut(words)] if w[:1].isupper())


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


def _without_initials(stem: str) -> str:
    """The street name with the middle initials dropped.

    The registry writes one street as "Markusovszky u.", "Markusovszky L. u."
    and "Markusovszky Lajos u."; the first two differ by an initial, which
    carries no information the other words do not already carry.
    """
    return " ".join(w for w in stem.split() if len(w.rstrip(".")) > 1)


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
        # one of them may simply leave the middle initial out
        bare_a, bare_b = _without_initials(stem_a), _without_initials(stem_b)
        if not bare_a or bare_a != bare_b:
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
            _capitals(t),                      # "Dr. Lumniczer", not "Dr. lumniczer"
            len(_numbers(_stem(t)[1])),        # the widest range of the building
            counts[t],                         # what most entries already say
            _short_type(t),                    # a coin toss that lands alike
            t,
        ))
        for text in group:
            canonical[text] = best
    return {raw: canonical[tidied[raw]] for raw in addresses}


# ---------------------------------------------------------------- the cache

def place_key(settlement: str, postal: str) -> str:
    """The settlement as a key, not as a label.

    NEAK writes the capital's districts both ways — the dental registry says
    "Budapest 04.", the GP vacancy list "Budapest IV. kerület" — and a
    surgery on Örs vezér tere must not get two spellings because of it.
    """
    return f"{postal} {normalize_settlement(settlement)}"


def _key(settlement: str, postal: str, raw: str) -> str:
    return f"{place_key(settlement, postal)}|{raw}"


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

    by_place: dict[str, list] = defaultdict(list)
    for entry in entries:
        settlement = get(entry, "settlement")
        if not settlement or not get(entry, "address"):
            continue
        by_place[place_key(settlement, get(entry, "postalCode"))].append(entry)
    # the raw string the rest of this works from has the repeated place
    # removed first, so two rows that differ only in it meet as one
    stripped: dict[int, str] = {}
    for place, rows in by_place.items():
        postal, _, settlement_key = place.partition(" ")
        for row in rows:
            stripped[id(row)] = strip_place(
                get(row, "address"), get(row, "settlement"), postal)

    # Every address the cache already holds for a place, not only the ones in
    # this batch. The dental and the GP registry are parsed one after the
    # other, and "Fő u. 179." in one of them is the same door as "Fő út 179."
    # in the other: without this the two never met and the settlement kept
    # both spellings.
    settled: dict[str, dict[str, str]] = defaultdict(dict)
    for key, canonical in known.items():
        place, raw = key.split("|", 1)
        settled[place][raw] = canonical

    changed = 0
    for place, rows in by_place.items():
        raws = [stripped[id(r)] for r in rows]
        # a decision already made stays made; only the new strings are resolved
        decided = dict(settled[place])
        fresh = [raw for raw in raws if raw not in decided]
        if fresh:
            # the new strings are resolved against the settled ones too, so a
            # new row joins the group it belongs to instead of starting one
            resolved = resolve(sorted(set(fresh) | set(decided)))
            # A group that already has a settled member keeps that member's
            # label: a new spelling joins the surgery, it does not rename it.
            settled_label = {}
            for raw, canonical in resolved.items():
                if raw in decided:
                    settled_label.setdefault(canonical, decided[raw])
            for raw in fresh:
                final = settled_label.get(resolved[raw], resolved[raw])
                decided[raw] = final
                known[f"{place}|{raw}"] = final
                settled[place][raw] = final
        for row in rows:
            original = get(row, "address")
            raw = stripped[id(row)]
            final = overrides.get(f"{place}|{raw}", decided[raw])
            if final != original:
                put(row, "addressRaw", original)
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
