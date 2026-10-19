"""The three outside sources behind the health-outcome and social analyses.

Each parser is tested on the shape its source really has, and on the ways it
must refuse to publish: a map whose names drift between files, a KSH answer
that was cut short, a county sheet whose settlements do not add up to the
total printed under them. A half-read source is worse than none.
"""
from __future__ import annotations

import json

import ksh_timea as kt
import nfsz_jobseekers as nf
import nngyk_mortality as nm
import openpyxl
import pytest
from parse_dental import ParseError

# --------------------------------------------------------------- NNGYK maps

def _popup(fields: list[tuple[str, str]]) -> str:
    rows = "".join(f"<tr><td>{i}</td><th>{k}&emsp;</th><td>{v}&emsp;</td></tr>"
                   for i, (k, v) in enumerate(fields))
    return f"<div class='scrollableContainer'><table id='popup'>{rows}</table></div>"


def _widget(cause: str, districts: dict, counties: dict) -> str:
    calls = [{"method": "addControl", "args": [f"{cause} - 2024 - SHA", "topleft"]}]
    for sex in ("ffi", "nő", "összesen"):
        calls.append({"method": "addFlatGeoBuf", "args": [
            "x", f"Vármegye - {sex}", None,
            [_popup([("Feature ID", "1"), ("Vármegye:", c), (cause, str(v))])
             for c, v in counties.items()]]})
        calls.append({"method": "addFlatGeoBuf", "args": [
            "x", f"Járás - {sex}", None,
            [_popup([("Feature ID", "1"), ("Vármegye:", c), ("Járás:", d), (cause, str(v))])
             for d, (c, v) in districts.items()]]})
    return json.dumps({"x": {"calls": calls}})


def test_popup_cells_mend_latin1_letters():
    cells = nm._cells(_popup([("Vármegye:", "Gyõr-Moson-Sopron"), ("Elkerülhető", "41.2")]))
    assert cells == {"Vármegye": "Győr-Moson-Sopron", "Elkerülhető": "41.2"}


def test_widget_parses_every_layer_and_sex():
    parsed = nm.parse_widget(_widget("Elkerülhető halálozás",
                                     {"Ajkai": ("Veszprém", 41.2476)},
                                     {"Veszprém": 60.1}))
    assert parsed["cause"] == "Elkerülhető halálozás"
    assert parsed["layers"][("Járás", "t")] == {"Ajkai": 41.2476}
    assert parsed["layers"][("Vármegye", "m")] == {"Veszprém": 60.1}


def test_widget_refuses_a_popup_with_two_values():
    bad = json.dumps({"x": {"calls": [{"method": "addFlatGeoBuf", "args": [
        "x", "Járás - összesen", None,
        [_popup([("Járás:", "Ajkai"), ("A", "1"), ("B", "2")])]]}]}})
    with pytest.raises(ParseError):
        nm.parse_widget(bad)


def test_map_numbers_come_from_the_file_name():
    url = "https://x/2024_SHA_Halalokonkent/11_Elker%C3%BClhet%C5%91%20hal%C3%A1loz%C3%A1s.html"
    assert nm.file_number(url) == "11"
    assert nm.CAUSES["11"] == "treatable" and nm.CAUSES["13"] == "both"


# ----------------------------------------------------------------- KSH TIMEA

def _answer(rows: list[dict]) -> bytes:
    return json.dumps({"features": [{"attributes": r} for r in rows]}).encode()


def _files(settlement_rows, district_rows, county_rows) -> dict[str, bytes]:
    files = {"INDIKATOR1.json": json.dumps({"features": [
        {"attributes": {"MUTATO_KOD": code, "MUTATO_MEGNEV": key, "MERTEKEGYSEG": "u"}}
        for code, (key, _) in kt.INDICATORS.items()]}).encode()}
    for code, (_, levels) in kt.INDICATORS.items():
        for level in levels:
            rows = {"settlement": settlement_rows, "district": district_rows,
                    "county": county_rows}[level]
            files[f"{code}_{level}.json"] = _answer([{**r, "M_KOD": code} for r in rows])
    return files


def test_timea_keys_settlements_by_the_ksh_stem(monkeypatch):
    monkeypatch.setattr(kt, "MIN_SETTLEMENTS", 1)
    monkeypatch.setattr(kt, "DISTRICTS", 2)
    monkeypatch.setattr(kt, "COUNTIES", 1)
    out = kt.parse(
        _files([{"ELEM_KOD": "3422", "TELEP_NEV": "Annavölgy", "VON_IDO": "2024", "VALUE": 1931.958},
                {"ELEM_KOD": "1357", "TELEP_NEV": "Budapest", "VON_IDO": "2024", "VALUE": 3500.0},
                {"ELEM_KOD": "9999", "TELEP_NEV": "Sehol", "VON_IDO": "2024", "VALUE": 1.0}],
               [{"ELEM_KOD": "123", "JARAS_NEV": "Esztergomi", "VON_IDO": "2024", "VALUE": 2.0},
                {"ELEM_KOD": "999", "JARAS_NEV": "Budapest", "VON_IDO": "2024", "VALUE": 3.0}],
               [{"ELEM_KOD": "11", "MEGYE_NEV": "Komárom-Esztergom", "VON_IDO": "2024", "VALUE": 4.0}]),
        {"3422": "34227"})
    assert out["settlements"]["34227"]["incomePerResident"] == {"2024": 1931.96}
    # the capital is one settlement in TIMEA, kept apart, never matched by stem
    assert out["capital"]["incomePerResident"] == {"2024": 3500.0}
    assert out["unmatched"] == ["9999 Sehol"]
    assert set(out["districts"]) == {"Esztergomi", "Budapest"}


def test_timea_refuses_a_truncated_answer(monkeypatch):
    class Resp:
        def raise_for_status(self): pass
        def json(self): return {"features": [], "exceededTransferLimit": True}
    monkeypatch.setattr(kt.requests, "get", lambda *a, **k: Resp())
    with pytest.raises(ParseError):
        kt._query(2, "1=1", "*")


# ---------------------------------------------------------------- NFSZ sheets

HEADER = ("Baranya vármegye", None, None, "Nyilvántar-tott össz. fő",
          "Foly.nyilv. hossz>365 nap", "Járadék tip.ell. fő", "Segély tip.ell. fő",
          "FHT, RSZS fő", "Munkav. korú népes. fő*", "Relatív mutató** %", "Arányszám***")


def _workbook(path, rows, total):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Baranya vármegye"
    for r in [("NMH",), ("T01",), ("A nyilvántartott álláskeresők…",), ("(2026. 09. 20.)",),
              ("Baranya vármegye",), HEADER, ("települései",), *rows,
              (None, *HEADER[1:]), ("Baranya vármegye", None, None, *total),
              ("*     Munkav. korú népes. fő - …",)]:
        ws.append(list(r))
    wb.save(path)


def test_nfsz_sheet_reads_settlements_and_checks_the_total(tmp_path):
    p = tmp_path / "2026-09.xlsx"
    _workbook(p, [("ABALIGET", None, None, 13, 6, 2, 8, 1, 375, 3.47, 0.96),
                  ("ÁG", None, None, 15, 8, 1, 2, 4, 104, 14.42, 4.01)],
              (28, 14, 3, 10, 5, 479, 5.85, 1.6))
    book = nf.parse_workbook(p)
    assert [r["name"] for r in book["Baranya"]] == ["ABALIGET", "ÁG"]
    assert book["Baranya"][1]["workingAge"] == 104


def test_nfsz_sheet_refuses_settlements_that_do_not_add_up(tmp_path):
    p = tmp_path / "2026-09.xlsx"
    _workbook(p, [("ABALIGET", None, None, 13, 6, 2, 8, 1, 375, 3.47, 0.96)],
              (99, 6, 2, 8, 1, 375, 3.47, 0.96))
    with pytest.raises(ParseError):
        nf.parse_workbook(p)


def test_nfsz_month_comes_from_the_title_not_the_file_name():
    m = nf.TITLE.search("NFSZ településsoros adatai 2026. szeptember")
    assert (m.group(1), nf.MONTHS[m.group(2)]) == ("2026", 9)
    assert nf.county_of("Szabolcs-Szatmár-Bereg vm.") == "Szabolcs-Szatmár-Bereg"
    assert nf.county_of("Főváros") == "Budapest"
    assert nf._key("BUDAPEST 01. KER.") == "budapest 01. ker."
    assert nf._key("ŐRTILOS") == "őrtilos"
