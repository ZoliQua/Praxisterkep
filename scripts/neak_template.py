"""The workbook that goes with the NEAK data request.

An institution answers a request more readily when the answer takes the shape
of a file it only has to fill in. This builds that file: one sheet with the
columns and nothing else, one sheet explaining what each column means and
why the request is narrow.

The dental catchment is the gap. The GP registry already publishes, for every
district, the settlements it serves ("12548 Abaliget,14517 Kovácsszénája,…"),
which is why this site can answer "who looks after my village" for GP care.
The dental registry publishes only the seat of the district, so for 2105 of
the 3177 settlements the question has no public answer.

Usage:
  python scripts/neak_template.py
"""
from __future__ import annotations

import json
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "neak-adatigenyles-minta.xlsx"

HEADER_FILL = PatternFill("solid", fgColor="1F3864")
EXAMPLE_FILL = PatternFill("solid", fgColor="FFF2CC")

COLUMNS = [
    ("FIN kód", 16,
     "A fogászati szolgálat kilencjegyű szervezeti egység kódja, ahogyan a "
     "szerződött szolgáltatói listában szerepel."),
    ("Körzet típusa", 16,
     "Felnőtt / gyermek / vegyes / iskolai — a NEAK saját besorolása szerint."),
    ("Megye", 18, "A körzet székhelyének megyéje."),
    ("Körzet székhelye", 22,
     "Az a település, ahol a rendelő működik (ez ma is nyilvános)."),
    ("Ellátott település KSH-kódja", 24,
     "Az ellátott település ötjegyű KSH-azonosítója. Ha nem áll rendelkezésre, "
     "elég a név."),
    ("Ellátott település neve", 26,
     "Egy sor = egy ellátott település. Ha egy körzet több települést lát el, "
     "annyi sor tartozik hozzá."),
    ("Településrész / utcák", 26,
     "Csak ha a körzet egy településnek nem az egészét látja el (jellemzően "
     "nagyobb városokban). Egyébként üresen hagyható."),
    ("Érvényesség kezdete", 18,
     "ÉÉÉÉ-HH-NN. Ha nincs nyilvántartva, üresen hagyható."),
]

EXAMPLES = [
    ["PÉLDA 020066098", "vegyes", "Baranya", "Pécs", "33587", "Pécs",
     "Jókai utca páros oldal", "2019-01-01"],
    ["PÉLDA 020066099", "vegyes", "Baranya", "Szigetvár", "08316", "Szigetvár",
     "", "2014-07-01"],
    ["PÉLDA 020066099", "vegyes", "Baranya", "Szigetvár", "26826", "Csebény",
     "", "2014-07-01"],
]


def districts_without_catchment() -> tuple[int, int]:
    """How many settlements the question is open for, from our own data."""
    path = ROOT / "data" / "settlements.json"
    if not path.exists():
        return (0, 0)
    rows = json.loads(path.read_text(encoding="utf-8"))["settlements"]
    absent = sum(1 for s in rows if (s.get("dental") or {}).get("state") == "absent")
    return absent, len(rows)


def build() -> Workbook:
    wb = Workbook()
    sheet = wb.active
    sheet.title = "Kitöltendő"

    for i, (name, width, _help) in enumerate(COLUMNS, start=1):
        cell = sheet.cell(row=1, column=i, value=name)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        sheet.column_dimensions[get_column_letter(i)].width = width
    sheet.row_dimensions[1].height = 32
    sheet.freeze_panes = "A2"

    for r, row in enumerate(EXAMPLES, start=2):
        for c, value in enumerate(row, start=1):
            cell = sheet.cell(row=r, column=c, value=value)
            cell.fill = EXAMPLE_FILL
            cell.alignment = Alignment(vertical="center")
    note = sheet.cell(row=len(EXAMPLES) + 2, column=1,
                      value="↑ A sárga sorok csak példák, kérjük törölni őket.")
    note.font = Font(italic=True, color="7F6000")

    types = DataValidation(type="list",
                           formula1='"felnőtt,gyermek,vegyes,iskolai"',
                           allow_blank=True)
    sheet.add_data_validation(types)
    types.add(f"B2:B{len(EXAMPLES) + 4000}")

    guide = wb.create_sheet("Útmutató")
    guide.column_dimensions["A"].width = 30
    guide.column_dimensions["B"].width = 96
    absent, total = districts_without_catchment()
    intro = [
        ("Mire vonatkozik a kérés",
         "A közfinanszírozott fogászati alapellátási körzetekhez tartozó "
         "települések listájára — vagyis arra, hogy egy adott körzet mely "
         "településeket látja el."),
        ("Miért éppen ez",
         "A háziorvosi szerződött szolgáltatói listában ez az adat szerepel "
         "(az „Ellátott települések” oszlopban, KSH-kóddal és névvel együtt). "
         "A fogászati listában viszont csak a rendelő székhelye van, így "
         f"{absent} település a {total}-ból egyetlen fogászati körzet "
         "listáján sem jelenik meg."),
        ("Milyen formátumban",
         "Ez a munkafüzet egy javaslat: ha a NEAK rendszeréből más szerkezetű "
         "kivonat egyszerűbben előállítható, az is tökéletesen megfelel. "
         "A lényeg a FIN kód és az ellátott település összerendelése."),
        ("Mi nem kell",
         "Személyes adat semmilyen formában: sem orvosnév, sem beteg- vagy "
         "kártyaadat. Kizárólag a körzet–település összerendelés."),
        ("", ""),
        ("Oszlop", "Mit jelent"),
    ]
    for r, (a, b) in enumerate(intro, start=1):
        guide.cell(row=r, column=1, value=a).font = Font(bold=True)
        cell = guide.cell(row=r, column=2, value=b)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    for r, (name, _w, help_text) in enumerate(COLUMNS, start=len(intro) + 1):
        guide.cell(row=r, column=1, value=name)
        cell = guide.cell(row=r, column=2, value=help_text)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    return wb


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    build().save(OUT)
    absent, total = districts_without_catchment()
    print(f"wrote {OUT} ({absent} of {total} settlements have no published "
          "dental district)")


if __name__ == "__main__":
    main()
