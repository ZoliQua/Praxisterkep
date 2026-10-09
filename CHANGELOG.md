# Changelog

A projekt nevezetes változásai. A formátum a
[Keep a Changelog](https://keepachangelog.com/hu/) ajánlását követi, a
verziószámozás a [Semantic Versioning](https://semver.org/lang/hu/) szerint
történik. Minden verzióhoz git-címke (`vX.Y.Z`) tartozik.

## [1.32.0] — 2026-10-09

### Hozzáadva
- **Körzetállomány a főoldal tetején**, a betöltetlenségi szám fölött. Eddig
  az oldal egy „1026"-tal nyitott, és az olvasóra hagyta, hogy mennyiből:
  most elöl áll a teljes állomány, sávon és számokban, hogy **mennyi a
  betöltött, a betöltetlen és (ahol a NEAK ilyet közöl) a megszűnt** körzet.
  Háziorvosi: 6283 körzetből 5257 betöltött (83,7%), 1026 betöltetlen.
  Fogorvosi: 2776-ból 2472 betöltött (89,0%), 262 betöltetlen, 42 megszűnt.
- **Típusonkénti bontás**, mert egy szám két különböző országot takar. A
  háziorvosi ellátásban a **felnőtt** körzetek 10,2%-a betöltetlen, a **házi
  gyermekorvosi** körzeteké 18,3%, a **vegyeseké** 28,4% — vagyis ott a
  legrosszabb, ahol egyetlen körzet lát el mindenkit. Fogászatban: felnőtt
  4,9%, gyermek 13,2%, vegyes 11,7%, iskolai 0%. A sávok a legrosszabb
  típushoz arányosítva, hogy a típusok egymáshoz képest legyenek olvashatók.
- A típusnevek ágfüggők: a „gyermek" a háziorvosi ellátásban **házi
  gyermekorvosi körzet**, fogászatban **gyermekfogászat**.

### Javítva
- A geokódoló workflow **rebase-el a push előtt**. Az első futás 2 óra 36
  perc alatt végzett, majd eldobta az egészet, mert közben három commit
  érkezett a `main`-re, és a push elutasításra került.

## [1.31.0] — 2026-10-08

### Hozzáadva
- **Utcaszintű térkép a településlapokon**, gombra betöltve. A lapok
  változatlanul JavaScript nélküli statikus HTML-ek; a térkép csak akkor
  töltődik be, ha valaki kéri, és csak akkor íródik ki egyáltalán, ha van
  beállított csempeszolgáltató (`VITE_MAP_STYLE`). Rajta: minden betöltött
  háziorvosi és fogorvosi rendelő az orvos nevével és címével, a
  gyógyszertárak, az ügyeleti pont, a mentőállomás, a kórház, a
  járóbeteg-szakrendelés és a segédeszköz-kiadóhely — mind kattintható.
- **A betöltött praxisok geokódolása** (`etl/geocode_filled.py`): eddig csak
  a betöltetlen körzeteknek volt koordinátája, mert a térkép a hiányt
  mutatta. 7729 betöltött körzetből 5326-hoz kellett cím szerinti keresés.
  A munka megszakítható és folytatható, mert minden találat azonnal a közös
  gyorsítótárba kerül.
- **`.github/workflows/geocode.yml`**: a geokódolás a futtatón megy, nem egy
  laptopon — másodpercenként egy Nominatim-kérés, utána újraépíti a
  településprofilokat és commitol.
- A településprofilok mostantól viszik a rendelők, gyógyszertárak és a
  település minden egyéb ellátóhelyének koordinátáját.

## [1.30.0] — 2026-10-08

### Hozzáadva
- **Kattintható Magyarország-térkép a megyelapon**: a húsz megye körvonala,
  kattintásra az egész oldal arra a megyére áll át. A négy vezető szám
  grafikát kapott és kicserélődött: korösszetétel-kördiagram a lakosságszám
  mellé, gyűrűdiagram arról, hány településen nincs szerződött háziorvos,
  fogászati körzetszám fog-ikonnal, és a megye **közfinanszírozott ügyeleti
  pontjainak** száma (mentőállomásokkal és a mediánnal).
- **Praxisfluktuáció** (`etl/fluctuation.py`, megyelap): hány körzetben
  cserélődött az orvos. Egy hét éve ugyanazzal az orvossal működő körzet és
  egy négy év alatt hármat látott körzet a térképen egyformán „betöltött" —
  ez a rész a különbség. Az elmúlt 12 hónapban **431 háziorvosi és 251
  fogorvosi körzetben** váltott az orvos; a legnagyobb mozgás Pest (12,3%)
  és Borsod-Abaúj-Zemplén (16,5%) megyében.
- **Településlapok**: a „Kik laknak itt?" felkerült a térkép alá, és két
  kördiagramot kapott — a település korösszetétele és az országos átlagtól
  való eltérése. Új táblázat a **betöltetlen és megszűnt körzetekről** (ág,
  típus, állapot, mióta, székhely), új **„Mi változott egy év alatt?"** rész
  (betöltetlenség egy éve és ma, új orvosok), és a „Milyen messze?" tábla
  „Hol" oszlopa mostantól **átvisz a másik település lapjára**.
- A **településlistán** minden megye fölött kis megyetérkép a székhellyel és
  a nagyobb városokkal.
- **Budapestnél a kerülethatárok** is rajzolódnak a településlap térképén.
- A „Ki lát el még?" menüpont almenüjébe felkerült a **Szakellátó
  intézmények**, a szakmalefedettséghez pedig **szakmaválasztó megyetérkép**:
  egy szakmát kiválasztva látszik, mely megyékben érhető el egyáltalán.
- A segédeszköz-részben **megyei táblázat és térkép**: hány lakosra jut egy
  kiadóhely megyénként.

### Módosítva
- **„Miért fontos?" visszakerült a térkép oldalára** — a menüpont megmaradt,
  most horgonyként. A korábbi `miert.html` átirányít.
- A **Szakellátás oldal térképei egy megyére nyitnak** (mindhárom ugyanarra),
  a többi megye halványan látszik; alapból a megyenevek, megyeszékhelyek,
  járáshatárok és Budapest kerületei vannak bekapcsolva, a többi réteg nem.
  A „Körzetnevek" kapcsoló itt **„Telephelyek"**, és **településenként egy
  felirat** jelenik meg — eddig egy megyeszékhely annyiszor írta ki a nevét,
  ahány telephelye volt.

### Javítva
- **A gyógyszertár-térkép üres volt**, amint megyét választott valaki: a
  gyógyszertársorokban nem volt megye, így a szűrés mindent kidobott. A NEAK
  listája nem közöl megyét, ezért a helységnévtárból kapja (3194/3205 sorhoz).
- A megyeszűrő `select` csak olyan megyéket kínál, amelyek szerepelnek is az
  adott réteg soraiban.

## [1.29.0] — 2026-10-07

### Hozzáadva
- **Megyetérkép minden településlapon.** Beégetett SVG (ezek a lapok
  JavaScriptet nem futtatnak): a megye körvonala, a megyeszékhely és a nagyobb
  városok tájékozódásnak, nagyban kiemelve maga a település — és szaggatott
  vonallal, menetidővel felirat ozva, hol áll a legközelebbi **háziorvosi
  rendelő, fogorvosi rendelő, központi ügyelet, kórház és gyógyszertár**, ha
  nem helyben van. Az egy településre eső szolgáltatások egyetlen feliratba
  kerülnek, a feliratok pedig kitérnek egymás és a pontok elől.
  A vonal nem útvonal, és a felirat ezt ki is mondja.
- **„Betöltött háziorvosi/fogorvosi körzetek a településen"** táblázat: orvos
  neve, körzet típusa, rendelő címe — és hogy **mióta látja el ugyanaz az
  orvos**, éves bontásban („< 1 éve", „3 éve", „7. éve vagy régebben").
  Rendelési időt egyik nyilvános forrás sem közöl, ezt a lap meg is mondja.
- **Gyógyszertár-blokk**: a településen működő szerződött gyógyszertárak
  nevekkel és címmel, ha pedig egy sincs, a legközelebbi hely és menetideje.
- Új ETL-lépés: **`etl/tenure.py`** → `data/tenure.json`. A betöltöttség
  hosszát a saját archívumunkból olvassa (24 fogorvosi és 20 háziorvosi havi
  pillanatkép 2017-10, illetve 2019-03 óta). Amelyik körzetet a legrégebbi
  pillanatkép is ugyanazzal az orvossal mutatja, ott a válasz **„vagy
  régebben"** — a NEAK kezdődátumot nem közöl, és kitalálni nem fogunk.
  A regiszter nélkül újraépített hónapok (csak betöltetlen lista) nem
  szakítják meg a sorozatot, mert nem mondanak semmit.
  1439 fogorvosi és 3938 háziorvosi körzetnél tart ugyanaz az orvos az
  archívum kezdete óta.

### Módosítva
- **„Vármegye" helyett újra „megye"** az egész felületen (62 szöveg). Az ETL
  mindkét írásmódot ismeri továbbra is, mert a források is vegyesen használják.
- A településprofilok (`data/settlements.json`) mostantól viszik a település
  betöltött körzeteit, gyógyszertárait és a legközelebbi gyógyszertár
  menetidejét is.

### Eltávolítva
- A Cloudflare Pages-re mutató `.github/workflows/deploy.yml`. Két titok
  hiányában minden pusholásnál elbukott, miközben az élesítést a Vercel
  végzi — a hibajelzés csak zaj volt.

## [1.28.0] — 2026-10-07

Az oldal szerkezetének újratervezése — `docs/UJRATERVEZES.md`. Az adatoldal
rég kész volt, a megjelenítés viszont a növekedés sorrendjében épült: négyféle
navigáció ugyanarra az oldalra, elveszett ágválasztás a lapok között, 3177
településlap, ahová csak a kereső vitt el, és egy főoldal, ami négy oldal
munkáját végezte.

### Hozzáadva
- **Közös kontextus** (`web/src/lib/context.ts`): az ág, a vármegye és a
  település egyetlen kiválasztás, ami az URL-ben utazik (`?k=&m=&tel=`), és
  minden lapközi link átviszi. Aki a térképen háziorvosit választ és átmegy az
  Elemzőre, **háziorvosi adatot kap** — eddig fogorvosit kapott, szó nélkül.
  Minden lap tetején ugyanott egy **kontextussáv** mutatja, mire szűkítettünk,
  és egy kattintással el is engedhető.
- **Vármegyei lap** (`megye.html`): az ország és a 3177 település közötti
  hiányzó szint. Lakosság, települések, betöltetlenség áganként, medián
  menetidők, buszelérés, kockázati sávok, a vármegye helye a rangsorban — és
  a vármegye **összes települése** táblázatban, mindegyik a saját lapjára
  linkelve. Mögötte új ETL-lépés (`etl/county_profiles.py` →
  `data/counties.json`, 265 KB), ami ugyanazokból a településprofilokból
  dolgozik, így a két lap nem mondhat mást.
- **Mit nézz meg ezután?** sávok: a szekciók végén 2–4 kártya a következő
  kérdéssel, a kontextust megtartva. Eddig minden válasz zsákutca volt.
- **Kattintható településnevek minden táblázatban** (34 oszlopdefiníció egy
  `link: 'settlement'` jelzőt kapott): a menetidő, az index, a hiányterületek,
  a gyógyszertárak és a többi tábla minden sora elvezet a település lapjára.
- **Megosztható táblázatok**: a nyitott tábla és a keresése az URL-be kerül
  (`?tabla=…&tq=…`), így egy konkrét szűrés továbbküldhető.
- Két új lap a főoldalról leválasztva: **`miert.html`** (Miért fontos? és a
  megelőzés láncolata) és **`modszertan.html`** (módszertan + adatexport).

### Módosítva
- **Egyetlen menü, hét ponttal, a nagyítás sorrendjében**: Térkép · Vármegye ·
  Település · Elemző · Nyilvántartás · Ki lát el még? · Módszertan. A
  definíció egy helyen van (`web/src/lib/siteNav.json`), és **a 3177 statikus
  településlap ugyanonnan építi a sávját**, tehát nem csúszhatnak szét.
  Az „EESZT" innentől „Nyilvántartás", a „Szakellátás" „Ki lát el még?".
- **A főoldalon csak a kérdés maradt**: hero, térkép, „Nálam". Az országos
  trendek, a Háziorvos vs Fogorvos összevetés és a légvonalbeli távolság az
  Elemzőre költözött, a vármegyei rangsor a vármegyei lapra. A régi
  horgonylinkek (`/#alapellatas`, `/#adatok`, `/#rangsor`…) átirányítanak oda,
  ahol a tartalmuk most van.
- A `/megye/<slug>/` megosztólapok a vármegyei lapra visznek, nem a térkép
  egy szűrőjére.
- A térkép vármegyeszűrője a közös kontextust állítja: amit ott kiválasztasz,
  azzal nyílnak az elemzések is.

### Javítva
- **A horgonyok végre megérkeznek.** A böngésző akkor ugrott a `#nalam`-ra,
  amikor az oldal még üres `<div id="root">` volt, így minden lapközi link a
  lap tetejére vitt. Mostantól a cél addig marad a helyén, amíg a felette
  betöltődő ábrák lejjebb tolják — és azonnal elengedi, ha az olvasó görget.
- A térkép körzetfelirat-jelölői `lat !== null`-t vizsgáltak, ami az
  `undefined`-ot átengedte: egy hiányzó koordináta `NaN`-nal dobta el a
  MapLibre-t, és vele az egész lapot. Most `Number.isFinite` a feltétel.

## [1.27.1] — 2026-10-07

### Hozzáadva
- **Októberi NEAK-adatok.** Fogorvosi: 2776 körzetből **262 betöltetlen**
  (szeptemberben 259), az érintett lakosság 780 226 fő; 42 megszűnt
  körzet. Háziorvosi: 6283 körzetből **1026 betöltetlen** (1025), 1 398 925
  lakos. A beutalási törzslistából 69 kód lépett be és 47 ki. Minden
  kiegészítés és elemzés újraszámolva, a 3177 településlap is.

### Javítva
A havi futás október 5-én elhasalt, és ez most már látszik is: az új
`--check` megállította a kiadást és nyitott egy hibajegyet ahelyett, hogy
hiányos adatot tett volna ki. Három oka volt, mindhárom megszűnt.
- **Az EESZT-portál 404-et adott** a NEAK_FINSZOLG törzsre, és magával
  vitte mind a 16 rá épülő lépést. Ha egy törzs nem tölthető le, a futás
  mostantól a **legutóbbi archivált példánnyal megy tovább, és kiírja, hány
  napos** — 45 napnál öregebb archívumnál viszont hibával áll meg. Egy
  rossz napja a portálnak nem viheti el a fél oldalt, elavult adatot viszont
  nem adunk ki mai gyanánt.
- **A gyógyszertári munkafüzetet** nem a NEAK havi könyvtárából kell
  szedni, hanem egy landing oldalról — a lépés eddig csak kereste a fájlt.
  Most maga tölti le.
- **A településközéppontokhoz tartozó Overpass-gyorsítótár** `.gitignore`-ban
  volt, így CI-gépen soha nem tudott lefutni, és vitte a menetidőt, a
  buszelérést meg a településlapokat. A két szükséges fájl (2,2 MB statikus
  geometria) mostantól a repó része; a nehéz járás-lekérdezések kint
  maradnak.
- Mindhárom hibára teszt került (`etl/tests/test_pipeline_recovery.py`).

## [1.27.0] — 2026-09-28

### Hozzáadva
- **Településlap mind a 3177 településnek** (`/telepules/<slug>/`). Az
  elemzések eddig országos és vármegyei szinten álltak; innentől minden
  településnek van egy statikus, kereshető lapja: ki látja el (háziorvos,
  fogorvos, védőnő, iskola-egészségügy), mennyi a menetidő a
  legközelebbi rendelőig, ügyeletig, mentőállomásig, kórházig,
  gyógyszertárig, jár-e busz, milyen az életkori összetétel, és hogy áll
  az összetett kockázati indexben. A névazonosság feloldva (Komló és
  Kömlő ugyanarra a slugra egyszerűsödött): a nagyobb kapja a rövid
  címet, a többi vármegyenevet kap. Lapindex és sitemap is készül —
  összesen 3182 URL.
- **NEAK beutalási törzslista** (`etl/referral.py`, Módszertan oldal).
  A havonta közzétett „9 jegyű beutalási törzslista” 35 320 finanszírozási
  kódot ír le, ebből 9183 körzet, és négy munkalapja közül kettő
  változásnapló. Vagyis a NEAK **mégis megnevezi, melyik kód lépett ki és
  melyik be** — háziorvosira is, amire betöltetlenségi listán kívül nincs
  más forrás. Ebben a hónapban 33 belépő és 65 kilépő kód; a kilépők közül
  11 olyan körzet, amit mi is közlünk, és **mind a 11-et már eddig is
  megszűntként tartottuk nyilván**. A körzetcímke 5351 sorban orvosnevet
  tartalmaz: ezeket a fájl visszatartja, mert ez a lista nem mondja meg,
  betöltött-e a körzet (CLAUDE.md 3. szabály).
- **Szerződött gyógyszertárak** (`etl/pharmacy.py`, Szakellátás oldal).
  3205 közforgalmú gyógyszertár 1552 településen — vagyis **1625
  településen egy sincs**. Egy gyógyszertárra átlagosan 2976 lakos jut.
  Menetidőben a legkönnyebben elérhető réteg az egész oldalon: a medián
  2,1 perc, a maximum 17,0, és nincs olyan lakos, aki 30 percnél
  távolabb lakna. Az adat a NEAK szerződött partneri listájából jön; az
  OGYÉI gyógyszertár-keresőjét **nem** használjuk, mert a `robots.txt`-je
  tiltja és a jogi nyilatkozata is kizárja az adatbázis-szerű
  feldolgozást.
- **„Mióta működik a mai szervezeti egység?”** (EESZT oldal,
  `etl/eeszt_history.py`). Az engedélytörzs — és csak az — visszamenőleg
  is válaszol: ugyanaz a végpont elfogad egy dátumot, így hét
  pillanatképet kértünk le 2024-01-15 és ma között. Ebből 33 128
  szolgálatra megállapítható, hogy **4066 olyan szervezeti egység alatt
  dolgozik, amelyik az időszak elején még nem létezett** (járóbeteg 2025,
  háziorvosi 781, fogászati 494, védőnői 289, iskola-egészségügy 254,
  fekvőbeteg 167, ügyelet 52).
  A fontosabb eredmény az, amit **nem** tudunk meg: a 2024-01 és 2026-07
  között is meglévő 81 600 egységből mindössze **kettő** váltott
  szolgáltatót. Az egység tehát véglegesen a szolgáltatójához tartozik,
  működtetőváltáskor új egység jön létre, a FIN-kód és az egység
  kapcsolatának pedig nincs nyilvános története — így a „ki működtette ezt
  a körzetet 2024-ben” kérdés nyilvános adatból nem válaszolható meg, és
  az oldal nem is állítja az ellenkezőjét. A pillanatképek tömörített
  kivonatként kerülnek az archívumba, nem teljes törzsként.

### Módosítva
- **A hónapos futás megmondja, ha valami kimaradt.** Az ellenőrzések és
  kiegészítések eddig egy try/except-ben ültek: ami elhasalt, csendben
  kimaradt a kiadásból. Innentől minden lépés deklarálja, mire épül
  (`etl/pipeline.py`), a futtató kihagyja azt, aminek az előzménye nem
  épült fel, az eredmény bekerül a `data/pipeline.json`-ba, és a
  GitHub Action `--check`-kel bukik, ha bármi hibázott vagy kimaradt —
  a snapshot viszont már előtte el van mentve.
- **A CI-ban addig nem is volt meg minden könyvtár**, amivel az
  útvonal-számítás és a menetidő fut: a `numpy`, `scipy` és `osmium`
  most bekerült az `etl/requirements.txt`-be. Visszamenőleg kiderült,
  hogy ezek a lépések a havi futásból mindig kimaradtak — észrevétlenül,
  mert nem volt, ami szóljon.
- Az engedélytörzs pillanatképeinek dátumlistája **magát hosszabbítja**:
  minden év január és július 15-e bekerül, amint elmúlt, így a
  vizsgált időszak külön kézi szerkesztés nélkül nő.

### Javítva
- A fájl 10 MB lett volna, mert minden szolgálathoz sort írt, azoknak is,
  amelyekre a nyilvános adat nem mond dátumot: a `licence_history.json`
  mostantól csak a datálható 4066 sort közli, a többit számként. 1,2 MB.

## [1.26.0] — 2026-09-24

### Hozzáadva
- **Hivatalos összerendelés — második vélemény** (EESZT-oldal). A NEAK
  bővített finanszírozási törzse (NEAK_FINSZOLG_EXT, 33 962 sor) minden
  FIN-kódhoz megnevezi a szolgáltatót — pont azt a kapcsolatot, amit a
  keresztellenőrzés címből és névből talál ki. A két forrás egymás
  mellett: 8291 praxisból **99,1% egyezés**, 71 eltérés. A kódláncból
  származó engedélyeknél 7860 egyezik és 10 tér el; a heurisztikus
  keresztellenőrzésnél 310 és **61** — vagyis pontosan ott gyenge, ahol
  sejteni lehetett. Négy olyan praxishoz is nevez szolgáltatót, amelyhez mi
  semmit nem találtunk.
  A saját láncunkat **nem cseréltük le**: ez egy másik elemzés, nem végső
  igazság, és ahol eltérnek, az eltérés maga az eredmény.
- **Gyógyászati segédeszköz-forgalmazók** (Szakellátás oldal): 1458
  telephely 506 szolgáltatónál, hét engedélyezett tevékenységgel. Ezek nem
  cserélhetők fel — javítóműhely nem ad ki járókeretet —, ezért a
  távolsági kérdés a három kiadó tevékenységre vonatkozik: **1305
  kiadóhely mindössze 231 településen**. Menetidőben a medián 10,8 perc,
  a maximum 42,2; 11 710 lakos lakik 30 percnél távolabb a legközelebbi
  kiadóhelytől. Egy telephelyre a legtöbb lakos Pest (7592),
  Bács-Kiskun (6881) és Szabolcs-Szatmár-Bereg (6124) vármegyében jut.
- Új ETL-lépések: `officialmap.py` és `gyse.py`; a segédeszköz-kiadóhelyek
  a menetidő-elemzés önálló rétegeként is szerepelnek.

### Módosítva
- **Új felső menü**: tíz lapos link helyett hat pont, legördülő almenükkel.
  Térkép (Miért fontos?, Nálam) · Statisztika (Rangsor, Háziorvos vs
  Fogorvos, Távolság) · Módszertan (Adat export) · Elemző · EESZT ·
  Szakellátás. Egérrel és kattintásra is nyílik, Escape és kívülre
  kattintás zárja, mobilon a menü alá kerül. Az aloldalak ugyanezt a
  sávot kapták.

### Javítva
- A törzsek letöltője eddig minden törzstől elvárta, hogy az első oszlopa
  egyedi legyen; a forgalmazói törzsben egy szolgáltató több telephellyel
  szerepel, ezért ez a szabály mostantól törzsenként kapcsolható.
- A törzseket nem mindig ugyanazon a napon töltjük le. Eddig egy friss
  törzs eltörte volna a régebbiek beolvasását; mostantól minden törzs a
  saját, kért dátumnál nem későbbi pillanatképét olvassa.

## [1.25.0] — 2026-09-24

### Hozzáadva
- **Menetidő légvonal helyett.** Az oldal minden távolsága eddig légvonalban
  értendő kilométer volt; mostantól ugyanazok a távolságok az
  OpenStreetMap úthálózatán számított, szabad forgalmi autós percekben is
  szerepelnek. Medián menetidő: háziorvosig 2,8 perc, fogorvosig 6,1,
  központi ügyeletig 12,9, kórházig 13,9 perc. 138 648 lakos lakik 30
  percnél távolabb kórháztól, 14 484 ügyelettől. Egy légvonalbeli
  kilométerre mediánban 1,15 perc jut — a legnagyobb eltérések ott vannak,
  ahol folyó vagy hegyhát van közben (Zalkod, Szigetmonostor, Nagymaros).
- **Tömegközlekedés (GTFS).** A Volánbusz országos menetrendjéből (CC0,
  napi frissítésű): egy átlagos szerdán 3154 településből 3147-ről indul
  menetrend szerinti busz. Közvetlen járat oda, ahol az ellátás van, **137
  településről nincs háziorvoshoz** (81 293 lakos), **269-ről a központi
  ügyelethez** (379 672 lakos) és 476-ról kórházhoz (502 329 lakos).
- Új ETL-lépések: `roads.py` (OSM úthálózat → gráf), `traveltime.py`
  (többforrású Dijkstra rétegenként), `transit.py` (GTFS-feldolgozás).
  Az OSM-kivonat és a menetrendi zip nem kerül a repóba, a URL és a
  dátum reprodukálja őket.

### Módosítva
- Az **összetett index távolság-összetevői percben** számolnak a korábbi
  légvonalbeli kilométerek helyett, és bekülött egy **tömegközlekedési
  hátrány** összetevő (10% súly): fele a közvetlen járat hiánya a három
  célhoz, fele a járatsűrűség. A súlyok újraosztása után a két
  legmagasabb sávban 640 település van (309 197 lakos). A légvonalbeli
  kilométerek minden sorban ott maradnak, hogy a két mérőszám
  összevethető legyen.
- Az összefüggő hiányterületek újraszámolva az új indexszel: 56 terület,
  433 település, 163 682 lakos.

### Ismert korlátok
- A menetidő szabad forgalmi alsó becslés: forgalom, kanyarodási tilalom,
  komp és szezonális lezárás nincs modellezve.
- Vonat nincs a menetrendi adatban: a MÁV-START csak regisztrációs
  űrlapon adja ki a GTFS-ét, így néhány vasúttal ellátott település
  (Nagymaros, Budakalász) úgy látszik, mintha nem lenne közlekedése. A
  budapesti hálózat külön adatforrás, ezért a főváros 23 kerülete
  kimarad a buszos részből — nem „ellátatlanként” szerepel.

## [1.24.0] — 2026-09-23

### Hozzáadva
- **Ügyelet és mentő** az elemző oldalon — a „betöltetlen ≠ ellátatlan”
  hiányzó fele. Ugyanabból az EESZT-törzsből, amit havonta amúgy is
  letöltünk: 213 központi ügyeleti szolgálat (202 telephellyel), 264
  mentőszolgálati egység, 58 betegszállító és 68 művese-egység. Medián
  távolság a legközelebbi ügyeletig 10,6 km (mentőállomásig 8,1 km);
  111 675 lakos él 20 km-nél távolabb ügyelettől. Az orvos nélküli
  körzetektől a medián 7,8 km, 31 körzet 20 km-nél távolabb.
- **Ki tartja a körzeteket?** — orvosváltás és több körzetet tartó orvosok
  az archívumból. Fogorvosi: 2297 orvos tartja a 2474 körzetet, 135-en
  egynél többet (279 körzet), a legnagyobb állomány 4 körzet; a körzetek
  25,1%-a cserélt orvost legalább egyszer. Háziorvosi: 5006 orvos, 169-en
  több körzettel (426 körzet), a legnagyobb 8, váltás 12,5%. 154 háziorvos
  tart körzetet egynél több vármegyében.
- **A települési lefedettség idősora**: eddig csak a mai állapot látszott.
  Háziorvosi oldalon 2019-03-ban 589 települést érintett betöltetlen
  körzet, ma 1081-et; fogorvosin 232-ről 299-re nőtt. A grafikon külön
  vonalon mutatja azokat, amelyeket kizárólag betöltetlen körzet szolgál.
- **Összefüggő ellátási hiányterületek**: a két legfelső index-sáv
  településeit összekapcsolva 58 összefüggő terület rajzolódik ki, 435
  településsel és 195 350 lakossal; 208 település marad magában. A
  legnagyobb a Vilmány körüli cserehát–hegyközi folyosó. Módszer:
  egyszeres láncolás 6 km-es sugárral, legalább 3 település — a
  kiterjedés minden sornál ott van a méret mellett.
- Új ETL-lépések: `emergency.py`, `workforce.py`, `clusters.py`.

### Módosítva
- Az összetett index kapott egy nyolcadik összetevőt: **távolság a
  legközelebbi központi ügyeletig** (10% súly). A többi súly ennek
  megfelelően újrasúlyozva; a két legmagasabb sávban most 643 település
  van 369 143 lakossal.

### Adatvédelem
- Orvosnév a munkaerő-elemzésből sem kerül ki: a feldolgozó minden nevet
  álnevesített kulccsá alakít, mielőtt bármit megszámolna, és őr ellenőrzi
  a kimenetet. A név gyenge azonosító (két orvost hívhatnak ugyanúgy) — ez
  korlátként ki van írva az oldalon.

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
