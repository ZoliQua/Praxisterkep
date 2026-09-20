# Praxistérkép · OEP-Alapellatas

[![Havi ETL](https://github.com/ZoliQua/OEP-Alapellatas/actions/workflows/monthly-etl.yml/badge.svg)](https://github.com/ZoliQua/OEP-Alapellatas/actions/workflows/monthly-etl.yml)
[![Verzió](https://img.shields.io/badge/verzi%C3%B3-1.15.0-blue)](CHANGELOG.md)
[![Licenc: MIT](https://img.shields.io/badge/licenc-MIT-green.svg)](LICENSE)
[![Python 3.13](https://img.shields.io/badge/Python-3.13-3776ab?logo=python&logoColor=white)](etl/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)](web/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](web/)
[![Utolsó adat](https://img.shields.io/badge/utols%C3%B3%20adat-2026.%20szeptember-e34948)](data/latest.json)
[![Adatarchívum](https://img.shields.io/badge/adatarch%C3%ADvum-38%20h%C3%B3nap%20%C2%B7%202017%E2%80%932026-2a9d8f)](data/)

Interaktív, nyilvános térkép a magyar alapellátási körzetekről: hol nincs
szerződött **fogorvos** vagy **háziorvos**, mióta, hány embert érint, és
merre tart a folyamat. Az oldal havonta frissülő hivatalos NEAK-adatokból
épül (a NEAK jogelődje az OEP — a repó neve az időtállóság jegyében ezt
viseli), kiegészítve OKFŐ-, KSH- és OpenStreetMap-forrásokkal.

## Mit tud?

- **Térkép** — betöltetlen és megszűnt szerződésű körzetek pont- és
  oszlopnézetben, megyei kartogram három mutatóval (arány, érintett
  lakosság, lakossághányad), idősor-csúszkával, megyefókusszal,
  megosztható URL-lel.
- **Keresés** — „Mi a helyzet nálam?": településre keresve a működő és
  betöltetlen körzetek, a betöltött praxisok NEAK által közölt orvosnevével
  és címével.
- **Statisztika** — több évre visszanyúló idősorok saját gyűjtésű
  archívumból: darabszám, arány, ki-be áramlás, medián üresedési idő,
  megyei rangsor, tartósság-elemzés.
- **Tartósan betöltetlen körzetek** — az OKFŐ 313/2011. Korm. rendelet
  szerinti listájával megjelölve.
- **Prevenciós magyarázó** — animált grafika arról, miért számít az
  elérhető alapellátás.

## Adatforrások

| ID | Forrás | Formátum | Gyakoriság |
|----|--------|----------|------------|
| A | NEAK — Betöltetlen fogorvosi szolgálatok | PDF/XLSX | havi |
| B | NEAK — Betöltetlen háziorvosi szolgálatok | PDF/XLSX | havi |
| C | NEAK — Szerződött szolgáltatók törzslistája (nevező) | XLS/XLSX | havi |
| E | OKFŐ — Tartósan betöltetlen körzetek | HTML | havi |
| F | KSH — Helységnévtár, lakónépesség | XLSX | évi |
| G | Település-/megyehatárok (OpenStreetMap) | GeoJSON | statikus |
| H | EESZT törzspublikáció — finanszírozott szolgálatok, szolgáltatók, működési engedélyek | REST JSON | havi (kiegészítő) |

A NEAK adatai tájékoztató jellegűek. A forrás-URL-ek az
[`etl/sources.py`](etl/sources.py) fájlban vannak; minden nyers forrásfájl
a [`data/raw/`](data/raw/) alatt archiválódik — **a git-történet maga az
audit-nyomvonal**.

## Adatpolitika (nem alku tárgya)

1. **Nincs kitalált adat.** Minden szám visszavezethető egy archivált
   forrásfájlra. Ha egy forrás hiányzik vagy a validálás elbukik, a
   pipeline hangosan hibázik — részleges vagy becsült adat sosem jelenik meg.
2. **Betöltetlen ≠ ellátatlan.** A betöltetlen körzet lakóit helyettesítő
   orvos látja el; a két fogalmat a kód, az adatmodell és a szövegek is
   szigorúan megkülönböztetik.
3. **Nevek csak ott, ahol a NEAK maga közli őket:** a betöltött praxisok
   szerződött orvosa igen; betöltetlen/megszűnt körzet és helyettesítő
   orvos neve soha. Ezt a validátor is kikényszeríti.

## Architektúra

Nincs backend: statikus SPA + havi kötegelt ETL (GitHub Actions).

```
etl/  (Python 3.13)                        web/  (React 19 + Vite + TS)
letöltés → parse → geokódolás →     →      MapLibre GL térkép, D3 grafikonok,
validálás → snapshot build                 Zustand state, saját CSS
        ↓
data/YYYY-MM/{dental,gp}.json · latest.json · timeseries.json · history.json
```

## Futtatás

```bash
# ETL (Python 3.13): letöltés -> parse -> geokódolás -> validálás -> build
pip install -r etl/requirements.txt
python etl/run.py --month 2026-09

# ETL tesztek
cd etl && python -m pytest

# Történeti visszatöltés saját gyűjtésből (audit-archívumba másol + snapshotot épít)
python etl/backfill.py --source-dir "/path/to/gyujtes" [--dry-run]

# Web — az ETL kimenetét fogyasztja
cd web && npm install && npm run dev

# Web tesztek és éles build
cd web && npm test && npm run build
```

## Adatfolyam

- Nyers források (audit): `data/raw/YYYY-MM/`.
- Havi snapshot: `data/YYYY-MM/dental.json` és `data/YYYY-MM/gp.json`, plusz
  `data/latest.json` (mindkét ág), `data/timeseries.json` és a statisztikai
  oldalt tápláló `data/history.json` (ki-be áramlás, medián, eloszlások).
- Történeti hónapok geokódolás nélkül épülnek (csak cache-találat), a nevező
  (betöltetlenségi arány) pedig csak ott szerepel, ahol az adott havi
  törzslista is megvan — hiányzó adatot sosem becslünk.
- A pipeline validálási hibánál nem publikál (a havi GitHub Actions futás
  ilyenkor issue-t nyit).

A megyehatár-réteg (`data/geo/counties.geojson`) OSM-ből származik
(© OpenStreetMap közreműködők, ODbL), Overpass-lekérdezésből egyszerűsítve.

## Közreműködés

Hibajelentést, adatészrevételt issue-ban örömmel fogadok. Kérlek, tartsd be
a [magatartási kódexet](CODE_OF_CONDUCT.md). Fejlesztési terv:
[`docs/PLAN.md`](docs/PLAN.md).

## Licenc

A kód [MIT licencű](LICENSE). Az adatok a forrásaik (NEAK, OKFŐ, KSH,
OpenStreetMap) saját feltételei alá esnek — részletek a licencfájlban.

---

Szerző: **Dr. Dul Zoltán** · Az adatok tájékoztató jellegűek.
