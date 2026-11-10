"""nonterritorial.py: TN practices counted beside the districts."""
import json
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import nonterritorial
from parse_dental import ParseError
from parse_gp import parse_registry_forms

HEADER = ["Vármegye", "Szervezti egység kódja (HSZ kód)", "Szervezeti egység típusa",
          "Szervezeti egység ellátási formája", "NEAK kód", "Szolgáltató neve", "Irányítószám",
          "Háziorvosi rendelő székhelye (település)", "Háziorvosi rendelő címe",
          "Szervezeti egység telefonszáma", "Ellátandó települések KSH kódjai", "Járás neve",
          "Háziorvos neve"]


def registry(path: Path, rows: list[tuple[str, str, str, str]]) -> Path:
    """rows: (hsz, type, form, doctor)"""
    body = [["BARANYA", h, ty, f, "", "", "7600", "Pécs", "Fő u. 1.", "", "", "Pécsi járás", d]
            for h, ty, f, d in rows]
    pd.DataFrame([HEADER] + body).to_excel(path, header=False, index=False)
    return path


def test_forms_are_read_and_names_are_not(tmp_path):
    rows = parse_registry_forms(registry(tmp_path / "r.xlsx", [
        ("020090001", "F", "T", "Dr. Teszt Elek"),
        ("020090002", "F", "TN", "BETÖLTETLEN"),
        ("020090003", "G", "TN", "Dr. Teszt Anna"),
    ]))
    assert [(r["id"], r["form"], r["type"], r["named"]) for r in rows] == [
        ("020090001", "T", "adult", True), ("020090002", "TN", "adult", False),
        ("020090003", "TN", "child", True)]
    assert all("doctor" not in r for r in rows)


def test_unknown_form_fails_loudly(tmp_path):
    with pytest.raises(ParseError):
        parse_registry_forms(registry(tmp_path / "r.xlsx", [("020090001", "F", "X", "")]))


def test_span_and_flows(tmp_path, monkeypatch):
    raw = tmp_path / "raw"
    for month, rows in {
        "2019-03": [("020090001", "F", "TN", "a"), ("020090002", "F", "TN", "b"), ("020090003", "V", "T", "c")],
        "2026-11": [("020090002", "F", "TN", "b"), ("020090004", "G", "TN", "d"), ("020090003", "V", "T", "c")],
    }.items():
        (raw / month).mkdir(parents=True)
        registry(raw / month / "gp_registry.xlsx", rows)
    monkeypatch.setattr(nonterritorial, "RAW", raw)
    out = nonterritorial.build()
    sp = out["span"]
    assert (sp["start"], sp["end"], sp["kept"], sp["left"], sp["new"]) == (2, 2, 1, 1, 1)
    assert sp["toTerritorial"] == sp["fromTerritorial"] == 0
    last = out["months"][-1]
    assert last["nonTerritorial"]["byType"] == {"adult": 1, "child": 1, "mixed": 0}
    assert last["territorial"]["total"] == 1


def test_operator_kind():
    from parse_gp import operator_kind
    assert operator_kind("Hajdú-Bihar VMRFK") == "state"
    assert operator_kind("Terrorelhárítási Központ (TEK)") == "state"
    assert operator_kind("Pécsi Tudományegyetem Klinikai Központ") == "university"
    assert operator_kind("Teszt-Med Kft.") == "company"
    assert operator_kind("Dr. Teszt Elek") == "sole"
    assert operator_kind("") == "unknown"


def test_no_name_or_digest_in_output(tmp_path, monkeypatch):
    raw = tmp_path / "raw"
    for month in ("2019-03", "2026-11"):
        (raw / month).mkdir(parents=True)
        registry(raw / month / "gp_registry.xlsx", [("020090001", "F", "TN", "Dr. Teszt Elek")])
    monkeypatch.setattr(nonterritorial, "RAW", raw)
    out = nonterritorial.build()
    assert "Teszt" not in json.dumps(out, ensure_ascii=False)
    assert out["continuity"]["TN"] == {"compared": 1, "same": 1}
