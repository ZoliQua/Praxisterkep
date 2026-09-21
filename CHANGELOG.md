# Changelog

A projekt nevezetes változásai. A formátum a
[Keep a Changelog](https://keepachangelog.com/hu/) ajánlását követi, a
verziószámozás a [Semantic Versioning](https://semver.org/lang/hu/) szerint
történik. Minden verzióhoz git-címke (`vX.Y.Z`) tartozik.

## [1.23.0] — 2026-09-21

### Hozzáadva
- **Védőnői körzetek** a főoldalon, saját ikonnal a fejlécben (fogorvos és
  háziorvos mellé): 5050 finanszírozott szolgálat (4038 területi, 1012
  iskolai), 293 fenntartó a 2023-as állami átvétel óta, telephely 1663
  településen. Egy területi szolgálatra 2362 lakos, ebből 343 gyermek
  (0–14 éves). Forrás az EESZT törzspublikáció: védőnői körzetekre sem a
  NEAK, sem az OKFŐ nem közöl betöltetlen listát, ezért ez a rész
  betöltetlenségről nem beszél — ezt ki is mondja. Védőnő neve sehol nem
  jelenik meg; a kimenetet őr járja át névmarkerért.
- **Szakellátó intézmények külön oldalon** (`szakellato.html`): 157
  fekvőbeteg-intézmény 2498 osztállyal, 351 járóbeteg-intézmény 12 931
  rendelővel, 221 szakma 1138 telephelyen. Szakmai lefedettség
  vármegyénként és a legfeljebb három vármegyében elérhető ritka szakmák
  listája. Mindkét lista az XLSX-ből készül: a járóbeteg-PDF 84 sorral
  korábban ér véget, mint a saját táblázata, így hiányos forrás.
- **Túlélés-elemzés** az elemző oldalon: 766 fogorvosi és 1765 háziorvosi
  üresedési időszak Kaplan–Meier-görbével, a még tartó időszakok
  cenzoráltként bent maradnak. Medián üresedés: fogorvosi 36 hónap,
  háziorvosi 76 hónap; 12 hónap után még mindig üres 90%, illetve 88%.
  Bontás településméret, körzettípus, kedvezményezett státusz és vármegye
  szerint.
- **Települési lefedettség a körzetszékhely helyett**: háziorvosi oldalon a
  betöltetlenség 1081 települést érint a székhely szerinti 666 helyett — a
  különbség az a 415 település, amelyet egy máshol székelő körzet lát el.
  667 települést kizárólag betöltetlen körzet szolgál. Fogorvosi oldalon a
  nyilvántartás nem közli az ellátott településeket, ezért ott a „nincs
  adat” gyengébb állítás — külön jelölve.
- **Összetett ellátási kockázati index** településenként: nyolc összetevő
  (betöltetlenség, távolság háziorvosig, fogorvosig, járóbeteg-telephelyig
  és kórházig, 65+ arány, körzeti kockázat, kedvezményezett státusz)
  országos rangsorszázalékké alakítva, kerek és közzétett súlyokkal.
  3177 településből 638 esik a két legmagasabb sávba (372 762 lakos).
  Minden pontszám szétszedhető az őt alkotó összetevőkre.
- **KSH korösszetétel** minden szinten: település, vármegye, ország
  (0–14: 14,5%, 65+: 20,6%). Forrás a 2022. évi népszámlálás nyilvános
  adatbázisa (CC BY 4.0), KSH-törzsszám szerint illesztve; a népszámlálási
  arányok a mai lakosságra vetítve. Ahol a KSH adatvédelmi okból elhagyta a
  cellát, csak a számtanilag egyértelmű eseteket pótoltuk, a többi hiányzó marad.
- Új ETL-lépések: `vedono.py`, `specialist.py`, `ksh_age.py`, `centroids.py`,
  `survival.py`, `coverage.py`, `composite.py`; új adatfájlok mind letölthetők
  az Adatok részben.

### Módosítva
- A `kockazat.html` neve **`elemzo.html`** lett, és a négy elemzést egy
  oldalon fogja össze (kockázati előrejelzés, túlélés, lefedettség,
  összetett index) ugrópontokkal.
- Az **EESZT-kiegészítés leköltözött a főoldalról** a saját oldalára
  (`eeszt.html`): négy blokkra, egy keresztellenőrzésre és két teljes
  adatböngészőre nőtt, és maga alá temette az utána következőket.
- A települések középpontja új közös réteg (OpenStreetMap), így a
  településszintű kérdések egységes koordinátán dolgoznak.

## [1.22.0] — 2026-09-21

### Hozzáadva
- **Kockázati előrejelzés külön oldalon** (`kockazat.html`, fogorvosi és
  háziorvosi részre egyaránt): minden körzet, ahol ma van szerződött
  orvos, rangsorolva aszerint, mekkora eséllyel válik betöltetlenné 12
  hónapon belül. Fogorvosi: 2474 körzet, átlagos 12 havi esély 1,8%;
  háziorvosi: 5263 körzet, 3,1%.
- A modell az archivált havi NEAK-pillanatképekből tanul (fogorvosi 23
  teljes hónap 2017-10 óta, háziorvosi 19 hónap 2019-03 óta): a jellemzők
  (mióta ugyanaz az orvos, településméret, kedvezményezett státusz, volt-e
  már üres, körzettípus, egyszolgálatos szolgáltató) melletti tényleges
  átmeneti arányokat méri, nincs fekete doboz: minden sor megmondja, mi
  vitte fel vagy le a saját számát, és a szorzók táblázatban is látszanak.
- Az oldal a saját ellenőrzését is kiteszi: a modellt a 2023-01 előtti
  hónapokon illesztjük, és a későbbi valódi üresedéseken mérjük
  (fogorvosi 136 esemény, legkockázatosabb tized 3,5% vs. 2,0% — 1,79×,
  AUC 0,682; háziorvosi 87 esemény, 5,2% vs. 3,2% — 1,62×, AUC 0,574).
  Rangsorolásra való, egyedi jóslásra nem — a korlátok az oldalon.
- Térkép kockázati sáv szerint színezve, körzetszintű és vármegyei
  táblázat, minden eddigi szűrő-, export- és PNG-mentő segédlettel.
- Új ETL-lépés: `etl/risk.py` → `data/risk.json`.

### Adatvédelem
- Orvosnév nem hagyja el a feldolgozót: a „ugyanaz az orvos” jellemző
  csak időtartamként jelenik meg, a kimenetet őr járja át névmarkerért.

## [1.21.0] — 2026-09-21

### Javítva
- A működési szinten az „NNGYK9 azonosítók száma” nulla volt olyan
  soroknál, ahol a mellette lévő oszlop engedélyt mutatott: a szám a
  finanszírozási törzs szerinti egységeket számolta, az engedély viszont a
  keresztellenőrzésből jött, másik egység alatt. A szám mostantól azt
  mutatja, ami a sorban látszik; a finanszírozási törzs szerinti
  egységek külön (alapértelmezésben rejtett) oszlopba kerültek. 16
  praxishoz a finanszírozási törzs egyáltalán nem köt szervezeti
  egységet — ez is külön számként látszik.
- A térképi városfeliratoknál több hely a pont és a név között.
- A szövegekbe tévedt markdown-csillagok eltávolítva.

### Módosítva
- A „2. Működési szint” elválasztva és lélegzőbb lett, és grafikus
  bontást kapott ellátástípus szerint (háziorvosi körzet 5263, fogorvosi
  2474, szakellátás 501, ügyelet 34, egyetemi alapellátás 19).
- A kedvezményezett települések összevetésében a körzetszámok
  kattinthatóak: megnyitják az adott csoport körzeteit táblázatban.
- Vármegye kiválasztásakor a vármegye határa vastagabb vonallal látszik.

## [1.20.0] — 2026-09-21

### Hozzáadva
- **Kedvezményezett települések réteg**: a 105/2015. (IV. 23.) Korm.
  rendelet 2. és 3. melléklete alapján 1623 település státusza (1053
  társadalmi-gazdasági és infrastrukturális szempontból kedvezményezett,
  839 jelentős munkanélküliséggel sújtott, 394 átmenetileg
  kedvezményezett). A térképeken kapcsolható réteg: az ilyen településen
  lévő körzetek glóriát kapnak.
- **Összevetés a távolság-szekcióban**: a kedvezményezett települések
  körzeteiben a legközelebbi működő fogorvosi rendelő átlagosan 6,0
  km-re van, másutt 3,0 km-re; a medián 6,2 km, illetve 0,8 km. A
  távolságtáblázat új oszlopokat kapott (kedvezményezett-e, és milyen
  jogcímen), így szűrhető és exportálható.
- Új ETL-lépés: `etl/kedvezmenyezett.py` → `data/kedvezmenyezett.json`.
  A rendelet egységes szerkezetű szövegét a Nemzeti Jogszabálytárból
  tölti le, archiválja dátummal, és formátumváltáskor (túl kevés sor,
  hiányzó melléklet) hangosan elhasal.

## [1.19.0] — 2026-09-20

### Hozzáadva
- **Térkép mentése PNG-be** minden térképen (főtérkép, EESZT, szakellátás,
  távolság, és a táblázatok feletti térképek is): az aktuális nézet
  mentődik, a városnevekkel és megyenevekkel együtt, forrásmegjelöléssel.
- **Körzetnevek** kapcsoló a térképen: vármegye kiválasztásakor jelenik
  meg (alapból bekapcsolva), országos nézetben nincs, mert átláthatatlan
  lenne.
- **Vármegyei összefoglaló a távolságokról**: táblázat-ikon a szekció
  fejlécében — vármegyénként átlag, medián és legnagyobb távolság, hány
  körzet van 5 km-en belül, hány 10 km felett és mennyi lakost érint.
  Vármegye kiválasztásakor ugyanez egy mondatban a térkép alatt is megjelenik.

### Javítva
- A táblázatok megnyitásakor a háttér (és vele a térkép) elcsúszott
  oldalra, mert a modál elrejtette a gördítősávot. Az oldal mostantól
  állandóan fenntartja a sáv helyét (`scrollbar-gutter: stable`), így
  sehol nem ugrik.

## [1.18.0] — 2026-09-20

### Hozzáadva
- Az „Egységes NEAK lista” két részre bomlott: **1. Szolgáltató szint**
  (a korábbi tábla) és **2. Működési szint** (új).
- A működési szint praxisonként egy sor: 9 jegyű FIN-kód, a szolgáltató
  cégjegyzék szerinti neve, törzsszám/adószám, a NEAK 4 jegyű és az EESZT
  6 jegyű azonosítója, az NNGYK9 azonosítók száma, és a működési
  engedély NNGYK9-enként, saját telephellyel és címmel. 8291 praxis: 7873
  engedély a kódláncból, 412 a keresztellenőrzés elfogadott javaslataiból
  (beleértve a 11 kézi esetet), 6 sornál „NINCS TALÁLAT”. 34 praxis több
  telephelyen működik — ott minden NNGYK9-hez külön cím tartozik.
- A megszűnt és betöltetlen körzetek szándékosan nem szerepelnek a
  működési szinten; ezt a szekció leírása is kiírja.
- Új ETL-lépés: `etl/operating.py` → `data/operating.json`.

## [1.17.0] — 2026-09-20

### Hozzáadva
- **4. Egységes NEAK lista** (háziorvosi ágon 3.): egy sor = egy szerződött
  szolgáltató. A NEAK rövid neve és kódja mellé odakerül a **hivatalos
  cégnév, az adószám és a székhely** az EESZT szolgáltatói törzséből,
  valamint a teljes portfólió: hány fogorvosi és háziorvosi körzet,
  ügyelet, egyetemi alapellátás és szakellátás, hány vármegyében és
  településen. 6990 szolgáltatóból 6979 azonosított (6908 adószám
  alapján, determinisztikusan; 71 cégnév alapján).
- Új ETL-lépés: `etl/providers.py` → `data/providers.json`, saját őrrel
  (nincs duplikált NEAK kód, a portfólió számai összeadódnak, azonosítás
  csak szolgáltató-azonosítóval, és a táblázat nem fogad be ismeretlen
  mezőt — például cégjegyzéki tisztségviselőt).

### Megjegyzés
- A cégjegyzéki **ügyvezető** egyik felhasznált nyilvántartásban sem
  szerepel (sem a NEAK-listákban, sem az EESZT törzsekben, sem az EU
  adóalany-ellenőrzőben), így ez a mező egyelőre nincs a listában.

## [1.16.0] — 2026-09-20

### Javítva
- A keresztellenőrzés három új bizonyítékszintet kapott, mert változatlan
  címeken is elbukott (bejelentés: a 190090001 ajkai háziorvosi körzet):
  - **eltérő címírás**: az utcanév törzse + utcatípus + házszám alapján is
    párosítunk, így a „Semmelweis I. u. 1.” ↔ „Semmelweis utca 1.” pár
    összejön, a „Kossuth tér” és a „Kossuth utca” viszont továbbra is
    különbözik;
  - **szolgáltatói adószám**: a finanszírozási törzs adószámát összevetjük
    a szolgáltatói törzzél — determinisztikus kapcsolat, nem hasonlóság;
  - **szolgáltatónév jogi forma nélkül**: a „Kft.” ↔ „Korlátolt
    Felelősségű Társaság” különbség már nem akadály, és a pontozás
    tartalmazás alapú.
- Egy címen több rendelő esetén (egészségházak) a jelölteket erősség
  szerint rendezzük: elöl az, amelyiket a szolgáltató adószáma is
  megerősít. Új oszlop mutatja az adószám-egyezést.
- Az eredmény: 605 nem illeszthető rekordból már **574-re** van javaslat
  (korábban 481), a „nincs javaslat” 124-ről 31-re csökkent. Az új
  „A szolgáltató adószáma egyezik” verdikt 78 esetet fed le.
- Az info-panel keresztellenőrzés füle a három új szintet is végigvezeti.

## [1.15.0] — 2026-09-20

### Hozzáadva
- **Távolság-elemzés** (új „Távolság” szekció): minden szerződött orvos
  nélküli körzetre megmérjük, milyen messze van a legközelebbi működő
  rendelő (légvonalban, a betöltött körzetek EESZT-telephelyétől).
  Fogorvosi: medián 3,7 km, 21 körzet 10 km-nél távolabb (67 137 lakos).
  Háziorvosi: medián 0,3 km, 13 körzet 10 km felett. Távolságsáv szerint
  színezett térkép, szűrhető táblázat, CSV/TSV export.
  A szöveg végig külön tartja a „betöltetlen” és az „ellátatlan” fogalmat:
  a távolság elérhetőségi közelítés, nem állítás az ellátatlanságról.
- **„Adatok és letöltés” szekció**: minden kiszolgált adatfájl listája
  tartalomleírással, mérettel, frissítési dátummal és közvetlen
  letöltéssel. A lista a build által írt `manifest.json`-ból jön, így nem
  hirdethet nem létező fájlt.
- Új ETL-lépés: `etl/access.py` → `data/access.json`, saját őrrel
  (sávhatárok, számok egyezése, 300 km feletti távolság tiltva).

### Javítva
- A keresztellenőrzés „csak az EESZT-ben” magyarázata régi, `archive`
  blokk nélküli gyorsítótárazott fájllal is működik.
- A felső menü tíz szekciónál görgethető lett a levágás helyett.

## [1.14.0] — 2026-09-20

### Hozzáadva
- Három új kapcsolható térképréteg: **járásszékhelyek** (151 pont, az OSM
  járás-relációk `admin_centre` tagjaiból, így egyetlen nevet sem kell a
  járás nevéből kitalálni), **járáshatárok** (a meglévő
  `jaras.geojson`-ból) és **megyenevek**. Mindhárom alapból kikapcsolva.
- A megyenevek kapcsolója minden térképen ott van, és a fő „Betöltetlenség
  a térképen” térképen marad alapból bekapcsolva — a rétegek térképenkénti
  alapértelmezést kaptak, a látogató választása pedig felülírja azt minden
  térképen.
- A „nagyobb városok” réteg méret szerint működik (20 000 fő felett, 60
  település), függetlenül attól, hogy a település járásszékhely-e.

### Módosítva
- A havi ETL-workflow commit-azonossága a GitHub noreply címére váltott
  (a repóban nem marad e-mail cím).

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
