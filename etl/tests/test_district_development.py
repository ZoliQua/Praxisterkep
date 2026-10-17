"""The state's own ranking of the járás, parsed from the decree that sets it.

The numbers decide who may apply for what, so the parser has to be exact
about three things: which column is the complex indicator, which spellings of
a járás name mean the same place, and refusing to publish a half-read table.
"""
from __future__ import annotations

import json

import pytest

import district_development as dd
from parse_dental import ParseError

ANNEX_1 = """
<table>
<tr><td></td><td>A</td><td>B</td><td>C</td><td>D</td><td>E</td><td>F</td><td>G</td></tr>
<tr><td>1.</td><td>Régió</td><td>Vármegye</td><td>Járás</td><td>Lakónépesség</td>
    <td>A komplex mutató értéke</td><td>Rangsorszám</td><td>Kedvezményezett</td></tr>
<tr><td>2.</td><td>ÉM</td><td>BAZ</td><td>Cigándi</td><td>16 115</td>
    <td>18,63</td><td>1.</td><td>1</td></tr>
<tr><td>3.</td><td>DA</td><td>BKK</td><td>Jánoshalmi</td><td>17 000</td>
    <td>35,10</td><td>20.</td><td>1</td></tr>
<tr><td>4.</td><td>KM</td><td>BP</td><td>Budapest, VIII. ker.</td><td>75 294</td>
    <td>69,34</td><td>175.</td><td>0</td></tr>
<tr><td>199.</td><td></td><td></td><td>Ország összesen</td><td>9 877 365</td>
    <td></td><td></td><td>109</td></tr>
</table>
"""
ANNEX_2 = """
<table>
<tr><td></td><td>A</td><td>B</td><td>C</td><td>D</td><td>E</td><td>F</td></tr>
<tr><td>1.</td><td></td><td></td><td></td><td>Kedvezményezett</td></tr>
<tr><td>2.</td><td>Régió</td><td>Vármegye</td><td>Járás</td><td></td><td>Fejlesztendő</td></tr>
<tr><td>3.</td><td></td><td></td><td></td><td></td><td>Komplex</td></tr>
<tr><td>4.</td><td>ÉM</td><td>BAZ</td><td>Cigándi</td><td>1</td><td>1</td><td>1</td></tr>
<tr><td>5.</td><td>DA</td><td>BKK</td><td>Jánoshalmi</td><td>1</td><td>0</td><td>0</td></tr>
</table>
"""


class TestDistrictKey:
    def test_the_capital_lands_on_the_gazetteer_name(self):
        assert dd.district_key("Budapest, VIII. ker.") == "Budapest 08. ker."

    def test_drops_the_word_járás(self):
        assert dd.district_key("Cigándi járás") == "Cigándi"

    def test_the_one_spelling_the_decree_and_the_gazetteer_disagree_on(self):
        # the decree writes Jánoshalma's járás "Jánoshalmi", KSH "Jánoshalmai"
        assert dd.district_key("Jánoshalmi") == "Jánoshalmai"

    def test_leaves_an_ordinary_name_alone(self):
        assert dd.district_key("Pápai") == "Pápai"


class TestParse:
    @pytest.fixture
    def parsed(self, monkeypatch):
        monkeypatch.setattr(dd, "MIN_ROWS", 3)
        return dd.parse(ANNEX_1 + ANNEX_2)

    def test_reads_the_complex_indicator_and_the_rank(self, parsed):
        assert parsed["districts"]["Cigándi"]["complex"] == 18.63
        assert parsed["districts"]["Cigándi"]["rank"] == 1
        assert parsed["districts"]["Cigándi"]["population2013"] == 16115

    def test_the_total_row_is_not_a_district(self, parsed):
        assert not any(n.startswith("Ország") for n in parsed["districts"])
        assert len(parsed["districts"]) == 3

    def test_takes_the_strongest_grade_the_second_annex_gives(self, parsed):
        assert parsed["districts"]["Cigándi"]["grade"] == "komplex"
        assert parsed["districts"]["Jánoshalmai"]["grade"] == "kedvezmenyezett"

    def test_an_ungraded_district_is_not_a_beneficiary(self, parsed):
        row = parsed["districts"]["Budapest 08. ker."]
        assert row["beneficiary"] is False
        assert not row.get("grade")

    def test_says_where_the_numbers_come_from(self, parsed):
        assert "290/2014" in parsed["source"]
        assert parsed["measuredYear"] == 2014
        assert parsed["beneficiaryBelow"] == dd.BENEFICIARY_BELOW

    def test_refuses_a_page_with_no_annexes(self):
        with pytest.raises(ParseError, match="annex tables"):
            dd.parse("<p>nothing here</p>")

    def test_refuses_a_table_it_only_half_read(self):
        # the real decree has ~198 rows; a short read means the page changed
        with pytest.raises(ParseError, match="only 3 districts"):
            dd.parse(ANNEX_1 + ANNEX_2)


class TestShippedFile:
    @pytest.fixture(scope="class")
    @classmethod
    def data(cls):
        if not dd.OUT.exists():
            pytest.skip("district_development.json not built")
        return json.loads(dd.OUT.read_text(encoding="utf-8"))

    def test_covers_every_district_the_site_knows(self, data):
        path = dd.ROOT / "data" / "districts.json"
        if not path.exists():
            pytest.skip("districts.json not built")
        ours = {d["name"] for d in
                json.loads(path.read_text(encoding="utf-8"))["districts"]}
        assert ours <= set(data["districts"]), sorted(ours - set(data["districts"]))

    def test_the_indicator_is_a_number_in_a_plausible_range(self, data):
        values = [d["complex"] for d in data["districts"].values()]
        assert 10 < min(values) < 30
        assert 70 < max(values) < 100

    def test_the_ranks_are_a_permutation(self, data):
        ranks = sorted(d["rank"] for d in data["districts"].values())
        assert ranks == list(range(1, len(ranks) + 1))
