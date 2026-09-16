from parse_okfo import apply_longterm, extract_as_of


def test_extract_as_of():
    assert extract_as_of("<p>Aktuális: 2026. szeptember 1.</p>") == "2026-09"


def test_apply_longterm_matches_by_settlement_type_since():
    praxes = [
        {"id": "1", "type": "mixed", "vacantSince": "2024-06",
         "sites": [{"settlement": "Kővágószőlős"}]},
        {"id": "2", "type": "mixed", "vacantSince": "2024-06",
         "sites": [{"settlement": "Máshol"}]},
        {"id": "3", "type": "child", "vacantSince": "2024-06",
         "sites": [{"settlement": "Kővágószőlős"}]},
    ]
    rows = [
        {"settlement": "Kővágószőlős", "type": "mixed",
         "vacantSince": "2024-06", "longTermSince": "2024-12"},
        {"settlement": "Sehol", "type": "mixed",
         "vacantSince": "2020-01", "longTermSince": "2020-07"},
    ]
    matched, unmatched = apply_longterm(praxes, rows)
    assert matched == 1 and unmatched == 1
    assert praxes[0]["longTerm"] is True
    assert praxes[0]["longTermSince"] == "2024-12"
    assert "longTerm" not in praxes[1] and "longTerm" not in praxes[2]


def test_budapest_kerulet_spelling_matches():
    praxes = [{"id": "1", "type": "child", "vacantSince": "2025-06",
               "sites": [{"settlement": "Budapest III. kerület"}]}]
    rows = [{"settlement": "Budapest III. ker.", "type": "child",
             "vacantSince": "2025-06", "longTermSince": "2025-12"}]
    matched, unmatched = apply_longterm(praxes, rows)
    assert matched == 1 and unmatched == 0
