# Licenc / License

## A kód — MIT

Copyright (c) 2026 Dul Zoltán

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Az adatok — a forrásaik feltételei szerint

A fenti MIT licenc a repó **kódjára** vonatkozik (`etl/`, `web/`, `scripts/`,
a dokumentáció). A `data/` könyvtár — a `data/raw/` alatti eredeti
forrásfájlok és a belőlük épített JSON-állományok — harmadik felek
nyilvános adataiból származik. A **forrásadatok** (a `data/raw/` alatti
eredeti fájlok) az alábbi kibocsátók saját feltételei szerint használhatók. A
**feldolgozott adatokat** (a `data/` alatti JSON-állományok: arányok,
korrelációk, előrejelzés) [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.hu)
licenccel tesszük közzé — azzal, hogy az eredeti forrás megjelölése ilyenkor
is kötelező, és az OpenStreetMapből származó részekre az ODbL feltételei
érvényesek.

| Forrás | Mi származik belőle | Feltétel |
|---|---|---|
| [NEAK](https://www.neak.gov.hu/letoltheto/altfin_dok/szerzodott_szolgaltatok) — Nemzeti Egészségbiztosítási Alapkezelő | betöltetlen és megszűnt szolgálatok, szerződött szolgáltatói törzslisták, szakellátó intézmények, gyógyszertárak, beutalási törzs, letelepedési pályázatok nyertesei | nyilvános közadat; a NEAK közlése szerint **tájékoztató jellegű** |
| [OKFŐ](https://alapellatas.okfo.gov.hu/) — Országos Kórházi Főigazgatóság | tartósan betöltetlen körzetek | nyilvános közadat |
| [EESZT törzspublikáció](https://www.eeszt.gov.hu/hu/torzspublikacio) | finanszírozott szolgálatok, szolgáltatók, működési engedélyek, gyógyászati segédeszköz-forgalmazók | nyilvános közadat |
| [KSH Helységnévtár](https://www.ksh.hu/apps/hntr.egyeb) | települések, lakónépesség, terület | nyilvános közadat, forrásmegjelöléssel |
| [KSH 2022. évi népszámlálás](https://nepszamlalas2022.ksh.hu/adatbazis/) | korösszetétel, végzettség, foglalkoztatás, digitális jártasság, lakás, háztartás | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.hu) |
| [KSH TIMEA](https://map.ksh.hu/timea/) | jövedelem (NAV-adatokból), népmozgalom, vándorlás, háziorvosi betegforgalom | nyilvános közadat, forrásmegjelöléssel |
| [NNGYK Halandósági adatbázis](https://nngyk.gov.hu/hu/halandosagi-adatbazis.html) | standardizált és elkerülhető halálozás járásonként | nyilvános közadat, forrásmegjelöléssel |
| [Eurostat](https://ec.europa.eu/eurostat/databrowser/view/hlth_cd_apr/default/table) | Magyarország és az EU-27 elkerülhető halálozása | [Eurostat szerzői jogi közlemény](https://ec.europa.eu/eurostat/help/copyright-notice): az adatok újrafelhasználása a forrás megjelölésével engedélyezett |
| [NFSZ településsoros adatok](https://nfsz.munka.hu/tart/stat_telepulessoros_adatok) | nyilvántartott álláskeresők | nyilvános közadat, forrásmegjelöléssel |
| [Nemzeti Jogszabálytár](https://njt.hu/) | 290/2014. és 105/2015. Korm. rendelet: járásfejlettség, kedvezményezett települések | jogszabályszöveg, szabadon felhasználható |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) (a [Geofabrik](https://download.geofabrik.de/europe/hungary.html) kivonatán át) | határok, úthálózat, geokódolás (Nominatim) | © OpenStreetMap közreműködők, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |
| [Volánbusz GTFS](https://gtfs.kti.hu/) (MÁV Személyszállítási Zrt., a KTI közzétételében) | menetrend szerinti buszjáratok | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |

Az OpenStreetMapből származó adatbázis-részek (`data/geo/`, a geokódolási
gyorsítótár) az ODbL hatálya alá tartoznak: továbbadásuk ugyanilyen
feltétellel lehetséges.

Az oldal orvosnevet kizárólag a betöltött praxisoknál, a NEAK nyilvános
szolgáltatói törzséből jelenít meg. A pályázati nyertesek nevét az adatok
nem tartalmazzák; a `data/raw/neak_grants/` alatti eredeti NEAK-dokumentumok
az auditálhatóság kedvéért, változatlanul vannak archiválva.

---

The MIT license above covers the **code** in this repository. The contents of
`data/` — the original source files under `data/raw/` and the JSON built from
them — derive from third-party public data. The original source files under
`data/raw/` remain subject to each source's own terms (listed above). The
processed data (the JSON under `data/`) is published under CC BY 4.0, with the
original source credited as well; OpenStreetMap-derived parts remain under
the ODbL 1.0.
