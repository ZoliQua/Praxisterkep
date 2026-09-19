# Changelog

A projekt nevezetes változásai. A formátum a
[Keep a Changelog](https://keepachangelog.com/hu/) ajánlását követi, a
verziószámozás a [Semantic Versioning](https://semver.org/lang/hu/) szerint
történik. Minden verzióhoz git-címke (`vX.Y.Z`) tartozik.

## [1.3.0] — 2026-09-19

### Hozzáadva
- EESZT-kiegészítés (H forrás): az EESZT törzspublikáció három nyilvános
  törzse (NEAK_FINSZOLG, EUSZOLG_PUBLIKUS, EUSZOLG_ENGEDELY_PUBLIKUS)
  teljes letöltése a portál REST-végpontjáról (`etl/fetch_eeszt.py`,
  archívum: `data/raw/eeszt/`), és illesztése a körzetekhez kizárólag
  hivatalos kódokkal: FIN-kód → szervezeti egység → működési engedély
  (`etl/build_eeszt.py` → `data/eeszt.json`).
- A körzetekhez: hivatalos körzetsorszám, engedélyezett telephely,
  ügyeleti részvétel, közfinanszírozás; betöltött körzetnél a
  finanszírozott szolgáltató és intézménykód. Megjelenik a
  térkép-popupban, a keresőkártyán és új „EESZT” szekcióban
  (illesztési lefedettség + szűrhető táblázat, eltérés-szűrővel).
- A keresőkártyán a település összes működési engedélyes
  alapellátási rendelője (nevek nélkül).
- Pontossági ellenőrzések: telephely–település egyezés, az engedélyes
  és a finanszírozott szolgáltató adószámának egyezése; az ellentmondó
  (több telephelyre mutató) esetekben nem mutatunk telephelyet.
  Névvédelmi őr a buildben és tesztekben: betöltetlen körzetnél soha
  nem kerül ki szolgáltató- vagy szervezeti egység-név.

## [1.2.0] — 2026-09-19

### Hozzáadva
- Új „Összevetés” szekció: a fogorvosi és háziorvosi ág mutatói egymás
  mellett, közös arány- és medián-idősorral és megyénkénti
  dumbbell-diagrammal.
- „Lekerültek a betöltetlen listáról” kártya a statisztikában: a két
  legutóbbi archivált hónap közti változás körzetenként, a betöltött
  körzeteknél a NEAK által közölt szerződött orvos nevével.
- Angol nyelvű felület (navbar HU/EN váltó, ?lang= paraméter,
  honosított szám- és dátumformátumok).
- OKFŐ-historikum: a tartósan-betöltetlen jelölés visszamenőleges
  feltöltése az archivált hónapokra a Wayback Machine mentéseiből
  (`etl/backfill_okfo.py`).
- Megyénkénti megosztó-oldalak (`/megye/<megye>/`) OG-metaadatokkal és
  buildkor generált közösségi előnézeti kép (og.png).
- Cloudflare Pages deploy-workflow (`.github/workflows/deploy.yml`).
- A Tippelj!-játék megyeválasztójában az összes körzet száma.

## [1.1.0] — 2026-09-19

### Hozzáadva
- Fogászati prevenciós történet (Van/Nincs fogorvos) kurátori illusztrációkkal.
- Görgetésre épülő országos bevezető adatvezérelt ország- és megyesziluettekkel
  (legrosszabb megye, leghosszabb ideje üres körzet településjelölővel,
  megyeszékhelyekkel).
- Megye-összehasonlító és Tippelj!-játék a rangsor szekcióban.
- Település-szintű betöltetlenség-idővonal a keresőben.
- Járás-szintű kartogram (OSM-határok, `etl/fetch_geo.py`).
- Szinkronizált statisztikai diagramok, PNG- és CSV-export.
- Beágyazható mini-térkép (`embed.html`) és beágyazókód a módszertanban.
- Megosztható körzet-mélylinkek (`?p=FIN`).

### Javítva
- A bevezető első száma a betöltetlen körzeteket mutatja (a megszűnt
  szerződésűek nélkül); a kézi jelenetválasztást nem írja felül az
  automatikus léptetés; feliratpozíció-ugrás a prevenciós láncban.

## [1.0.0] — 2026-09-19

Első nyilvános kiadás a GitHubon.

### Hozzáadva
- Magyar README jelvényekkel, magatartási kódex (Contributor Covenant 2.1
  magyar adaptáció), MIT licenc a kódra — a `data/` tartalma a forrás-
  intézmények (NEAK/OEP, OKFŐ, KSH, OpenStreetMap) saját feltételei alatt.
- CHANGELOG és verziókövetés (git-címkék).

### Módosítva
- Kapcsolattartás GitHub-profilon keresztül (@ZoliQua); a Nominatim
  user-agent a repó URL-jét adja meg elérhetőségként.

## [0.9.1] — 2026-09-17

### Javítva
- A két sérült háziorvosi hónap (2023-12, 2024-03) helyreállítása a Wayback
  Machine csonka mentéseiből (lineárizált PDF-rekonstrukció, hiánytalan
  30/30 és 29/29 oldal, ellenőrzött adatközlési hónapokkal). A háziorvosi
  idősor 26 archivált hónapra bővült.

## [0.9.0] — 2026-09-16

### Hozzáadva
- OKFŐ tartósan betöltetlen körzetek (E forrás): település + típus +
  betöltetlenség-kezdet szerinti párosítás, `longTerm`/`longTermSince`
  mezők, megyei/országos darabszámok; jelvény a keresőben, oszlop a
  táblázatban, csempe a statisztikában, fánkdiagram a nyitóoldalon.

## [0.8.0] — 2026-09-16

### Hozzáadva
- KSH Helységnévtár integráció (F forrás): településszintű lakónépesség,
  lakossághányad- és 10 000 lakosra vetített mutatók, új térképi metrika.
- 2026. szeptemberi NEAK-adatok.

## [0.7.0] — 2026-08-25

### Hozzáadva
- Interaktív térkép: havi idő-csúszka lejátszással, megyefókusz
  panellel, üresedési idő szerinti színezés és szűrés, hover-tooltip,
  felugró→kereső hidak, megosztható URL-állapot.

## [0.6.0] — 2026-08-25

### Hozzáadva
- Nyitóoldali statisztika-vitrin: egymás után megjelenő, animált
  mutatók számfelfutással és mutatónkénti vizualizációval.

## [0.5.0] — 2026-08-24

### Hozzáadva
- Animált prevenciós történet („Van háziorvos / Nincs háziorvos"),
  flat-illusztrációs karakterekkel, 2×4 jelenettel.

### Módosítva
- „Vármegye" → „megye" szóhasználat az egész felületen.

## [0.4.0] — 2026-08-23

### Hozzáadva
- Térképi megyecímkék és oszlopnézet, alapellátás-magyarázó szekció,
  betöltött praxisok orvosneve és címe a keresőben, összesített
  körzet-táblázat, rendezhető-szűrhető betöltetlenségi táblázat,
  megyei rangsor időtartam-szűrővel, navbar ágváltó ikonok.

## [0.3.0] — 2026-08-23

### Hozzáadva
- Történeti archívum saját gyűjtésből (2017-10-től) `etl/backfill.py`
  visszatöltővel, generáció-felismerő parserekkel.
- Statisztikai elemzés oldal: idősorok, ki-be áramlás, medián üresedési
  idő, eloszlások, tartósság.

## [0.2.0] — 2026-08-23

### Hozzáadva
- Háziorvosi (GP) ág: kettős kazettás ETL és felület, lefedettség-alapú
  településkereső a körzeti törzslistából.

## [0.1.0] — 2026-08-23

### Hozzáadva
- Fogorvosi MVP: teljes ETL-csővezeték (letöltés → parse → geokódolás →
  validálás → snapshot), sötét témájú egyoldalas SPA térképpel,
  keresővel, rangsorral és módszertannal; havi GitHub Actions workflow.

[1.3.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v1.3.0
[1.2.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v1.2.0
[1.1.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v1.1.0
[1.0.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v1.0.0
[0.9.1]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v0.9.1
[0.9.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v0.9.0
[0.8.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v0.8.0
[0.7.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v0.7.0
[0.6.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v0.6.0
[0.5.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v0.5.0
[0.4.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v0.4.0
[0.3.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v0.3.0
[0.2.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v0.2.0
[0.1.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v0.1.0
