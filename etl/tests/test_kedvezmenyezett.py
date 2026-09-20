"""Parsing the beneficiary-settlement annexes of 105/2015. Korm. rendelet."""
import pytest

from kedvezmenyezett import ParseError, county_key, normalize, parse

HEAD = "<html><body>"
TAIL = "</body></html>"


def _table(rows):
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table>{body}</table>"


def _page(benefit_rows, temporary_rows):
    benefit = [["", "A", "B", "C", "D"],
               ["1", "Megye", "Település", "Társadalmi-gazdasági", "Munkanélküliség"]]
    benefit += benefit_rows
    temporary = [["", "A", "B"], ["1", "Megye", "Település"]] + temporary_rows
    return HEAD + _table(benefit) + _table(temporary) + TAIL


def _bulk(prefix, county, n, extra=None):
    return [[str(i), county if i == 0 else "", f"{prefix}{i}"] + (extra or [])
            for i in range(n)]


def test_normalization_matches_the_registry_spelling():
    assert normalize("Bácsszőlős") == "bacsszolos"
    assert county_key("Bács-Kiskun megye") == county_key("Bács-Kiskun") == "bacskiskun"
    assert county_key("Vas vármegye") == "vas"


def test_parse_reads_both_annexes_and_their_flags():
    page = _page(_bulk("Falu", "Bács-Kiskun megye", 1100, ["1", "0"]),
                 _bulk("Ideiglenes", "Zala megye", 350))
    out = parse(page)
    assert out["counts"]["socio"] == 1100
    assert out["counts"]["unemployment"] == 0
    assert out["counts"]["temporary"] == 350
    entry = out["settlements"]["bacskiskun|falu0"]
    assert entry == {"n": "Falu0", "c": "Bács-Kiskun megye", "s": 1, "u": 0, "t": 0}
    # the county is printed once per block and carried down
    assert out["settlements"]["bacskiskun|falu999"]["c"] == "Bács-Kiskun megye"


def test_parse_refuses_a_page_that_lost_its_rows():
    page = _page(_bulk("Falu", "Vas megye", 10, ["1", "0"]),
                 _bulk("Ideiglenes", "Zala megye", 5))
    with pytest.raises(ParseError, match="too short"):
        parse(page)


def test_parse_refuses_a_page_without_the_annex_tables():
    with pytest.raises(ParseError, match="two annex tables"):
        parse(HEAD + "<table><tr><td>semmi</td></tr></table>" + TAIL)
