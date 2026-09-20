# Changelog

A projekt nevezetes változásai. A formátum a
[Keep a Changelog](https://keepachangelog.com/hu/) ajánlását követi, a
verziószámozás a [Semantic Versioning](https://semver.org/lang/hu/) szerint
történik. Minden verzióhoz git-címke (`vX.Y.Z`) tartozik.

## [1.13.0] — 2026-09-20

### Hozzáadva
- Tájékozódási rétegek minden térképen, kapcsolhatóan: **megyeszékhelyek**
  (19), **megyei jogú városok** (további 5), **nagyobb városok** (20 000 fő
  felett, 36 település) és **Budapest kerülethatárai** (23 kerület). A
  választott rétegeket minden térkép követi (főtérkép, EESZT-térkép,
  szakellátási térkép, táblázatok feletti térképek), és a böngésző
  megjegyzi őket.
- Új geo-adatok OpenStreetMapből (`etl/fetch_geo.py --what cities|budapest`):
  `data/geo/cities.geojson` (városrang szerint bélyegezve) és
  `data/geo/budapest.geojson`. A városfeliratok DOM-jelölők, így nem kell
  hozzájuk külső betűtípus-szolgáltatás, és nem fogják el a térképi
  kattintásokat.

## [1.12.0] — 2026-09-20

### Hozzáadva
- „Kézi ellenőrzésre javasolt” táblázat a keresztellenőrzésben: az a 11
  fogorvosi körzet, ahol a saját szervezeti egységének van engedélye a NEAK
  szerinti címen, mégsem született automatikus párosítás. Soronként
  megmutatja az összes szóba jövő engedélyt, hogy miért nem választott az
  automatika, és konkrét javaslatot ad: mindegyiknél a székhelycímen lévő
  engedély a helyes pár, a többi ugyanannak a körzetnek a másik
  településen lévő rendelője.
- A „Csak az EESZT-ben szerepel” táblázat összeveti a kódokat a 38
  archivált havi NEAK-pillanatképpel (2017-10 óta): új oszlopok mondják meg,
  szerepelt-e korábban a listában, mikor láttuk utoljára, milyen
  állapotban és melyik településen. 91 szolgálatból 10 ilyen
  „maradány” (7 betöltetlen, 3 betöltött körzet volt), 81-et pedig
  egyetlen archivált NEAK-lista sem tartalmazott.

## [1.11.0] — 2026-09-20

### Hozzáadva
- **3. Keresztellenőrzés** (háziorvosi ágon 2.): ahol a kódlánc nem talált
  EESZT-engedélyt, ott a rendelő címe és a szolgáltató neve alapján
  keressük meg, hogy ugyanaz a rendelő vagy szolgáltató szerepel-e az
  EESZT-ben — esetleg másik szervezeti egység alatt. 605 rekordból 481-re
  van értelmezhető javaslat; 379 esetben ugyanazon a címen van azonos
  szakmájú engedély, csak más szervezeti egység alatt.
- A táblázat rekordonként kiírja a javasolt szervezeti egységet, az
  engedély-azonosítót, az EESZT telephelyet, a szakmát, az egyezés alapját
  (telephelycím / utcanév / szolgáltatónév) és egy teljes mondatos
  indoklást; szűrhető, rendezhető, CSV/TSV-be exportálható.
- „Csak az EESZT-ben szerepel” táblázat: 7 fogorvosi és 84 háziorvosi
  finanszírozott szolgálat, amely a NEAK közzétett listáiban nem szerepel.
- Az info-panel negyedik füle a keresztellenőrzés módszerét írja le
  (cím- és névnormalizálás, szakmacsalád-szűrés, bizonyítékszintek,
  korlátok), élő eredménytáblával; a számokra kattintva minden jelölt
  soronként megjelenik.
- Új ETL-lépés: `etl/crosscheck.py` → `data/crosscheck.json`. A javaslatok
  sehol nem módosítják a körzetadatokat és a lefedettségi számokat.

## [1.10.0] — 2026-09-20

### Hozzáadva
- „Nem illeszthető” gomb a fogorvosi ügyeletnél (6 szolgálat) és
  „Nem illeszthető szakellátások” a szakellátásnál (31) — minden sornál
  a konkrét indokkal, a szóba jövő engedélyek felsorolásával, szűrhető
  és CSV/TSV-be exportálható formában. Az egyetemi alapellátásnál nincs
  ilyen eset, ott a gomb sem jelenik meg.
- Az „Hogyan illesztettük az EESZT-adatokat?” panel füles lett. Az 1–3.
  pont (mi ez, források, letöltés) közös, a 4–12. pont pedig adatkörönként
  külön: **Körzetek (alapellátás)**, **Ügyelet és egyetemi alapellátás**,
  **Szakellátás**. Minden fül a saját illesztési láncát, döntési szabályait,
  névkezelését, helymeghatározását, élő eredménytábláját, kidolgozott
  példáját és korlátait írja le.
- A szolgálatos füleken is kattinthatóak az eredménytábla számai: a
  kétértelmű eseteknél soronként megjelenik minden szóba jövő engedély
  (szervezeti egység, engedély-azonosító, telephely, szakma, közfinanszírozás).

## [1.9.0] — 2026-09-20

### Hozzáadva
- Az EESZT-szekció két részre tagolódik. **1. Alapellátás** a körzetek eddigi
  elemzése, alatta két új blokk: a **fogorvosi ügyelet** (34 szolgálat,
  376 regisztersor) és az **egyetemi alapellátás** (19 szolgálat) —
  összegző számokkal és teljes értékű, szűrhető táblázattal (térkép
  nélkül).
- **2. Szakellátás**: a fogászati szakellátás mind az 560 szerződött
  szolgálata (fogszabályozás 158, röntgen 128, egyetemi szakellátás 127,
  szájsebészet 108, fogyatékkal élők ellátása 24, parodontológia 9,
  gyermek szakellátás 6) típusonkénti bontással, típus szerint színezett
  térképpel és ugyanazzal a szűrhető, rendezhető, CSV/TSV-be exportálható
  táblázattal, amit a körzeteknél is használunk. A táblázat feletti térkép
  követi a szűrést.
- Az ETL új kimenete: `data/dental_extra.json` (`etl/build_dental_extra.py`).
  A szolgálatokat ugyanazzal a kódlánccal illesztjük az EESZT-hez, mint a
  körzeteket, de a szolgáltatás típusához tartozó szakmakóddal (röntgen →
  1306, fogszabályozás → 1302, szájsebészet → 1301, parodontológia → 1303).
  Mind a 613 szolgálat a térképen van: ahol van EESZT-engedély, annak
  telephelyén, egyébként a NEAK rendelőcímén (a táblázat oszlopban mutatja,
  melyik).
- A szakellátási szervezeti egység kódja betűt is tartalmazhat
  (`02006A425`), ezért a parser 9 karakteres alfanumerikus kódot vár — így
  a 832 szakellátási sorból egy sem vész el; formátumváltáskor a build
  hangosan elhasal.

### Módosítva
- `CLAUDE.md`: rögzítve, mi számít körzetnek (fogorvosi: `Ellátási szint =
  Alapellátás` + körzeti típus; háziorvosi: `ellátási forma = T`), és hogy
  minden más szolgálat a kiegészítő fájlba kerül, nem a betöltetlenségi
  arányba.
- A táblázatfejléc mostantól a megfelelő egységben számol (körzet, sor vagy
  szolgálat).

## [1.8.0] — 2026-09-20

### Hozzáadva
- Két új oszlop az EESZT-táblázatban a NEAK nyilvántartásából: **betöltő
  orvos neve** és **NEAK kód** (a szerződött szolgáltató kódja). Mindkettő
  kizárólag betöltött körzetnél jelenik meg; betöltetlen és megszűnt
  körzetnél soha (CLAUDE.md 3. szabály).
- A Státusz oszlop „Betöltött” jelvénye kattintható, és felugró
  NEAK-adatlapot nyit a körzetről: szervezeti egység kódja (FIN/HSZ),
  NEAK kód, szolgáltató neve, ellátási szint, szervezeti egység típusa,
  rendelő címe, megye, járás, ellátandó települések, betöltő orvos —
  forrásmegjelöléssel együtt.
- Színes jelvények a Típus, EESZT-illesztés, Telephely a körzet
  településén, Ügyelet és Közfin. oszlopokban is, a Státusz mintájára; a
  típusok a diagramokon használt színeket viszik tovább.
- Az ETL átveszi a regiszter eddig eldobott mezőit (NEAK kód, szolgáltató
  neve, ellátási szint). A szolgáltató neve és kódja csak ott kerül be,
  ahol a NEAK szerződőtt orvost is közöl — egy betöltetlen körzetnél a
  szolgáltató neve a helyettesítőt azonosítaná.

### Javítva
- A névvédő ellenőrzés a `provider` mezőre is kiterjed: a snapshot minden
  olyan részében hibát dob, ami nem betöltött körzet.
- Friss EESZT-törzsadatok (2026-09-20) és minden engedélyezett telephely
  geokódolva: 8496 körzet látszik a térképen.

## [1.7.0] — 2026-09-20

### Hozzáadva
- Az info-ablak „9. Eredmények” szakaszában a négy illesztési indok
  száma kattintható: a „Nincs működési engedély”, „Kétértelmű
  telephely”, „Nincs az EESZT-ben” és „Más szakmájú engedély” sorokból
  részletes, szűrhető, rendezhető és CSV/TSV-be exportálható
  táblázat nyílik — ágazatonként (fogorvosi / háziorvosi) külön.
- A kétértelmű eseteknél a táblázat a körzet minden szóba jövő
  engedélyét felsorolja soronként (engedély-azonosító, szervezeti
  egység, telephely, szakma, közfinanszírozottság), így látszik, miért
  nem lehetett egyértelműen választani. A más szakmájú engedélyeknél
  az derül ki, mire szól ténylegesen az engedély (pl. fogászati
  röntgen).
- Az ETL a nem illesztett körzetek engedélysorait is exportálja
  (`unmatchedDetails`), névadatok nélkül, ETL-őrrel ellenőrizve.

### Módosítva
- Az EESZT-szekcióból eltűnt a 20 soros előnézeti táblázat: a teljes,
  szűrhető táblázat a táblázat-ikonnal nyílik meg.
- Az engedélysoros táblázatok fejléce sorban, nem körzetben számol.

## [1.6.0] — 2026-09-19

### Hozzáadva
- „Hogyan illesztettük?” info-ablak (ⓘ) az EESZT-szekcióban: a három
  forrás élő portál-linkkel, sorszámmal és archivált nyers fájllal; a
  letöltés módja és ellenőrzései; az illesztés lépésről lépésre a valódi
  mezőnevekkel; döntési szabályok; névvédelem; körzetszám-kinyerés;
  geokódolás; élő eredménytábla; kidolgozott példa (Sásd) élő
  EESZT-linkekkel; önellenőrzési útmutató; korlátok.
- Visszakövetés: körzetenként exportált kódlánc (szervezeti egység,
  engedély-azonosító, betöltött körzetnél szolgáltató-azonosító). A
  térkép oldalpanelén és a táblázat új oszlopaiban mindegyik kód az
  EESZT nyilvános portálján pontosan a forrássort nyitja meg.
- A névvédelem miatt rejtett esetek száma az ETL-ben számolva jelenik
  meg (nem beégetett érték).

### Javítva
- A geokódoló nem áll le a telephely nélküli EESZT-engedélyen; az ETL
  ilyenkor címmel rendelkező engedélyt választ; üres telephely nem
  jelenik meg a felületen.

## [1.5.0] — 2026-09-19

### Hozzáadva
- EESZT-térkép: minden illesztett körzet az engedélyezett telephelyén;
  nagyítható, megyére szűrhető (ráközelítéssel), a pontokra kattintva
  oldalpanel mutatja a körzet EESZT-adatait. Színek: betöltött /
  betöltetlen / megszűnt; gyűrű: a telephely másik településen van;
  halvány pont: hozzávetőleges (település-középponti) hely.
- A teljes EESZT-táblázat felett ki/be kapcsolható térkép, amely mindig
  a táblázat aktuális szűrését követi, és a szűrt pontokra közelít.
- Az engedélyezett telephelyek geokódolása (`etl/geocode_eeszt.py`,
  Nominatim, 1 kérés/mp, közös cache); új „hozzávetőleges hely” oszlop.

### Javítva
- A geokódoló cache írása atomi (párhuzamos olvasó nem kaphat félig
  kiírt fájlt).

## [1.4.0] — 2026-09-19

### Hozzáadva
- Általános adattábla-böngésző: minden oszlop szerint rendezhető
  (növekvő/csökkenő/ki), oszloponkénti szűrés (szöveg, választó,
  igen/nem/üres, szám-összehasonlítás pl. `>=2`), globális keresés,
  oszlopok ki-be kapcsolása, lapméret-választás, valamint a szűrt és
  rendezett adatok exportja CSV (RFC 4180) és TSV formátumban.
- Az EESZT-szekcióban alapból 20 soros előnézet; a teljes adat
  (20 oszlop) a táblázat-ikonnal nyílik.
- Külön táblázat a nem illeszthető körzetekről, körzetenkénti indokkal
  és részletes magyarázattal (nincs az EESZT-ben; más szolgálattípus;
  kétértelmű telephely; más szakmájú engedély; nincs működési engedély).

### Javítva
- EESZT-statisztika: a kétértelmű eseteket korábban „nincs engedély”-
  ként is számoltuk; most minden körzet pontosan egy kategóriába esik,
  és a build ellenőrzi, hogy illesztett + nem illesztett = összes.
- Két modal egymás utáni nyitásakor a korábbi ablak késleltetett
  bezárás-eseménye nem zárhatja be az újonnan megnyitottat.

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

[1.6.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v1.6.0
[1.5.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v1.5.0
[1.4.0]: https://github.com/ZoliQua/OEP-Alapellatas/releases/tag/v1.4.0
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
