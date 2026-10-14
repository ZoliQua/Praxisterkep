"""One spelling per surgery: the cases the registry actually produced.

Every address here is a real pair from data/raw — Szombathely's four spellings
of one dental clinic, Veszprém's three doors of one block that must NOT become
one, Pasaréti út, where the registry itself is split about the kind of street.
"""
from __future__ import annotations

import json

import pytest

from address import load_cache, normalize_entries, resolve, tidy


class TestTidy:
    @pytest.mark.parametrize("raw,expected", [
        # the registry shouting
        ("KISKAR 7.", "Kiskar 7."),
        ("kISKAR 7.", "Kiskar 7."),
        ("CSALOGÁNY UTCA 22-24.", "Csalogány u. 22-24."),
        # the kind of street, written one way
        ("Fő utca 110.", "Fő u. 110."),
        ("Rákóczi út. 2.", "Rákóczi út 2."),
        ("JÓZSEF KÖRÚT 36.", "József krt. 36."),
        ("Cserhát Ltp. 1.", "Cserhát ltp. 1."),
        # the house number
        ("Béke u. 94", "Béke u. 94."),
        ("Rákóczi u. 20/C", "Rákóczi u. 20/C."),
        ("Mogyoródi u 2/a", "Mogyoródi u. 2/A."),
        ("Vilonyai u. 4./B.", "Vilonyai u. 4/B."),
        ("Göcseji u 27-29.", "Göcseji u. 27-29."),
        ("Pasaréti u.41", "Pasaréti u. 41."),
        ("JÓZSEF KÖRÚT36.", "József krt. 36."),
        # a stop too many, and a floor behind the number
        ("Szent -Györgyi Albert u. 2..", "Szent -Györgyi Albert u. 2."),
        ("Ady Endre u 58. fsz. 3.", "Ady Endre u. 58. fsz. 3."),
        # a number inside the street name is an ordinal, not a house number
        ("Március 15 u. 4/c", "Március 15. u. 4/C."),
    ])
    def test_one_address_at_a_time(self, raw, expected):
        assert tidy(raw) == expected

    def test_leaves_an_already_clean_address_alone(self):
        for clean in ("Markusovszky u. 8.", "Söptei út 85.", "Gazdagréti tér 1."):
            assert tidy(clean) == clean


class TestResolve:
    def test_szombathely_dental_clinic(self):
        """Four spellings of one clinic, as the registry types them."""
        raws = ["Kiskar u. 5-7.", "Kiskar u. 5-7.", "Kiskar u. 5-7.",
                "KISKAR 7.", "kISKAR 7.", "Kiskar u. 7."]
        out = resolve(raws)
        assert set(out.values()) == {"Kiskar u. 5-7."}

    def test_the_abbreviated_name_takes_the_written_out_one(self):
        out = resolve(["Szent M. u. 20/A.", "Szent Márton u. 20/A."])
        assert set(out.values()) == {"Szent Márton u. 20/A."}

    def test_u_and_ut_are_one_street_when_the_registry_cannot_decide(self):
        out = resolve(["Nádasdy Ferenc u. 43.", "Nádasdy Ferenc u. 43.",
                       "Nádasdy Ferenc út 43.", "Nádasdy Ferenc út 43."])
        assert len(set(out.values())) == 1

    def test_the_street_decides_its_own_kind_not_one_block_of_it(self):
        """Pasaréti út: one block is typed "u." more often, the street is not."""
        raws = (["Pasaréti út 41-43."] * 6 + ["Pasaréti u.41"]
                + ["PASARÉTI U. 67-69."] * 3 + ["Pasaréti út 67-69."] * 2)
        out = resolve(raws)
        assert out["PASARÉTI U. 67-69."] == "Pasaréti út 67-69."
        assert out["Pasaréti u.41"] == "Pasaréti út 41-43."

    def test_doors_of_one_block_stay_apart(self):
        raws = ["Március 15. u. 4/B.", "Március 15. u. 4/C.", "Március 15. u. 4/D."]
        assert len(set(resolve(raws).values())) == 3

    def test_utja_is_not_utca(self):
        out = resolve(["Mártírok útja 76.", "Mártírok u. 76."])
        assert len(set(out.values())) == 2

    def test_a_plain_number_joins_the_range_that_contains_it(self):
        out = resolve(["Jókai u. 8.", "Jókai u. 8.", "Jókai u. 8-10.", "Jókai u.10."])
        assert set(out.values()) == {"Jókai u. 8-10."}

    def test_two_overlapping_ranges_are_two_buildings(self):
        out = resolve(["Vörösvári út 88-92.", "Vörösvári út 88-96."])
        assert len(set(out.values())) == 2

    def test_the_accented_spelling_wins(self):
        out = resolve(["Vasút út 33.", "Vasut u. 33."])
        assert set(out.values()) == {"Vasút út 33."}

    def test_a_different_house_number_is_a_different_address(self):
        out = resolve(["Fő u. 1.", "Fő u. 2."])
        assert len(set(out.values())) == 2


class TestNormalizeEntries:
    def _rows(self):
        return [
            {"settlement": "Szombathely", "postalCode": "9700",
             "address": "KISKAR 7."},
            {"settlement": "Szombathely", "postalCode": "9700",
             "address": "Kiskar u. 5-7."},
            {"settlement": "Szombathely", "postalCode": "9700",
             "address": "Kiskar u. 5-7."},
            # a different settlement is never folded into this one
            {"settlement": "Sárvár", "postalCode": "9600",
             "address": "KISKAR 7."},
        ]

    def test_keeps_the_registry_wording_beside_the_canonical_one(self):
        rows = self._rows()
        cache = {"addresses": {}}
        changed = normalize_entries(rows, cache=cache)
        assert changed == 2  # the shouted one here, and the one in Sárvár
        assert rows[0]["address"] == "Kiskar u. 5-7."
        assert rows[0]["addressRaw"] == "KISKAR 7."
        assert "addressRaw" not in rows[1]

    def test_settlements_are_resolved_apart(self):
        rows = self._rows()
        normalize_entries(rows, cache={"addresses": {}})
        assert rows[3]["address"] == "Kiskar 7."  # nothing to learn from in Sárvár

    def test_a_decision_once_made_survives_the_next_month(self):
        cache = {"addresses": {}}
        normalize_entries(self._rows(), cache=cache)
        # next month the registry drops the row that carried the full spelling
        later = [{"settlement": "Szombathely", "postalCode": "9700",
                  "address": "KISKAR 7."}]
        normalize_entries(later, cache=cache)
        assert later[0]["address"] == "Kiskar u. 5-7."

    def test_an_entry_without_an_address_is_left_alone(self):
        rows = [{"settlement": "Szombathely", "postalCode": "9700", "address": ""}]
        assert normalize_entries(rows, cache={"addresses": {}}) == 0

    def test_the_shipped_cache_is_a_mapping_of_strings(self):
        cache = load_cache()
        assert cache["addresses"], "the git-tracked cache should not be empty"
        for key, value in list(cache["addresses"].items())[:200]:
            assert "|" in key and isinstance(value, str) and value
        json.dumps(cache)  # serialisable, as the ETL writes it back every run
