# Praxistérkép

[![Monthly ETL](https://github.com/ZoliQua/Praxisterkep/actions/workflows/monthly-etl.yml/badge.svg)](https://github.com/ZoliQua/Praxisterkep/actions/workflows/monthly-etl.yml)
[![Version](https://img.shields.io/badge/version-1.51.0-blue)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE.md)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white)](etl/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)](web/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)](web/)
[![Live site](https://img.shields.io/badge/live-praxisterkep.hu-e34948)](https://praxisterkep.hu)

**[praxisterkep.hu](https://praxisterkep.hu)** — an interactive, public
map and analysis of Hungarian primary care: where there is no contracted
**general practitioner** or **dentist**, since when, how many people are
affected, what to expect a year from now, and what goes with the shortage —
avoidable mortality, poverty, low schooling, unemployment, people moving away.

Every number is built from public state data: NEAK's monthly lists and the
publications of OKFŐ, EESZT, KSH, NNGYK, NFSZ and Eurostat, plus the
OpenStreetMap road network. The site collects no data of its own and is not
an official publication. The interface is bilingual (Hungarian/English) on
every page.

> NEAK's data is informational. **Vacant ≠ unserved:** residents of a vacant
> district are usually seen by a substitute doctor, which public data does not
> show.

**Languages:** [English](#english) · [Magyarul](#magyarul)

---

<a id="english"></a>

## English

### What the site shows

Four levels — **country → county → district (járás) → settlement** — with the
chosen branch (GP or dental) and place kept across the whole site. Every long
page carries a left-hand menu of its sections (on a phone, a column of dots
that opens into the list), and every footer names the release being served.

| Page | What it does |
|---|---|
| [Map](https://praxisterkep.hu/) | Vacant and dissolved districts as points and bars, county and district choropleths, a time slider, shareable URLs, a settlement search, the prevention chain explained, two headline findings |
| [County](https://praxisterkep.hu/megye.html) | A county among the other nineteen: vacancy, its districts and settlements, nine rankings (avoidable mortality, income, jobseekers, natural change, migration, education, digital inactivity, emergency drive time, expected vacancy), a 12-month forecast path, settlement grants by year, the four cross-sections |
| [District](https://praxisterkep.hu/jaras.html) | Each of the 197 units (174 járás + the capital's 23 kerület): districts, on-call care, yardstick cards among the 174 rural járás, mortality by cause, census, emergency access, forecast, grants, the four cross-sections — and a ranking of **the most vulnerable districts** by access |
| [Settlement](https://praxisterkep.hu/en/telepules/) | 3,177 static pages in Hungarian and English, readable without JavaScript: is there a doctor (named only for staffed districts, from NEAK), how long a district has been vacant, how far care is by car and bus, pharmacies, health visitors, age structure, how people live (income, jobseekers, births and deaths, migration, census), grants, a one-year chance that a serving district falls vacant, a year of change |
| [Analysis](https://praxisterkep.hu/elemzo.html?lang=en) | 22 sections in five groups — the national picture, what comes next (risk, survival, forecast, grants), districts and counties (mortality, income, jobs, population, census, associations), access (on-call, distance, drive time, emergency department, bus), settlements (composite index, cross-sections, care deserts) |
| [Europe](https://praxisterkep.hu/europa.html?lang=en) | Hungary among the 27 member states and the UK — narrowed to Central and Eastern Europe (with Germany and the UK as yardsticks) or the V4: who needs care (age, healthy life years, long-standing illness), doctors and their age, foreign-trained doctors and where a country's doctors go, GP and dentist visits by city and countryside, unmet need by income, avoidable mortality, screening, flu vaccination, avoidable hospital admissions, spending, doctors' pay; a map of the NUTS 2 regions and nine border regions face to face |
| [More — who else provides care?](https://praxisterkep.hu/szakellato.html?lang=en) | Health visitors, outpatient and inpatient specialist care, pharmacies, medical-aid retailers |
| [Methodology](https://praxisterkep.hu/modszertan.html?lang=en) | Where every number comes from and what it cannot say; the downloadable files; the embed code |

### Data sources

| ID | Source | What it gives | Module |
|----|--------|---------------|--------|
| A, B, C | [NEAK](https://www.neak.gov.hu/letoltheto/altfin_dok/szerzodott_szolgaltatok) — vacant dental and GP districts, contracted providers | the districts, the denominator, named doctors of staffed districts | `parse_dental.py`, `parse_gp.py`, `parse_registry.py` |
| E | [OKFŐ](https://alapellatas.okfo.gov.hu/) — persistently vacant districts | the legal long-term flag | `parse_okfo.py` |
| F, F2 | [KSH](https://www.ksh.hu/apps/hntr.egyeb) gazetteer; [2022 census](https://nepszamlalas2022.ksh.hu/adatbazis/) (CC BY 4.0) | settlements and population; age, education, work, digital skills, housing, households | `parse_ksh.py`, `ksh_age.py`, `ksh_census.py` |
| G, J | [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL), [Geofabrik](https://download.geofabrik.de/europe/hungary.html) | boundaries; the drivable road network | `fetch_geo.py`, `roads.py`, `traveltime.py` |
| H | [EESZT](https://www.eeszt.gov.hu/hu/torzspublikacio) public registers | funded services, providers, operating licences | `fetch_eeszt.py`, `build_eeszt.py` |
| I | [NEAK](https://www.neak.gov.hu/letoltheto/altfin_dok/szerzodott_szolgaltatok) specialist institutions | hospitals, outpatient care, emergency departments | `specialist.py` |
| K | [Volánbusz GTFS](https://gtfs.kti.hu/) (CC0) | scheduled buses | `transit.py` |
| L | [Government Decrees 290/2014 and 105/2015](https://njt.hu/jogszabaly/2014-290-20-22) | district development ranking, beneficiary settlements | `district_development.py`, `kedvezmenyezett.py` |
| M | [NNGYK mortality database](https://nngyk.gov.hu/hu/halandosagi-adatbazis.html) | standardised and avoidable mortality by district and county | `nngyk_mortality.py` |
| N | [KSH TIMEA](https://map.ksh.hu/timea/) | income (NAV data), natural change, migration, GP workload | `ksh_timea.py` |
| O | [NFSZ settlement data](https://nfsz.munka.hu/tart/stat_telepulessoros_adatok) | registered jobseekers | `nfsz_jobseekers.py` |
| P | [NEAK settlement grants](https://neak.gov.hu/felso_menu/szakmai_oldalak/gyogyito_megeleozo_ellatas/alapellatas/haziorvosi_ellatas/archivum) | where and when grants were won (no names) | `neak_grants.py` |
| Q | [Eurostat](https://ec.europa.eu/eurostat/web/health/database) health and regional databases, [GISCO](https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/territorial-units-statistics) outlines | Hungary's avoidable mortality against the EU-27; the European comparison and its maps | `eurostat_avoidable.py`, `eu_compare.py` |
| R | [OECD Health Statistics](https://data-explorer.oecd.org/) (CC BY 4.0) | avoidable hospital admissions, doctors' pay, the UK after 2019 | `eu_compare.py` |

Every downloaded file is archived under [`data/raw/`](data/raw/) — **the git
history is the audit trail**. Screening participation and vaccination coverage
would belong here, but no institution publishes them by district or
settlement in public, machine-readable form; no estimate is shown instead.

### Data policy

1. **No invented data.** Every number traces to an archived source file. If a
   source is missing or does not read back as its publisher states, the
   pipeline fails loudly — no partial or estimated figure is published.
2. **Public data only; names only where NEAK publishes them** — the
   contracted doctor of a staffed district, never of a vacant or dissolved
   one, never a substitute, never a grant winner.
3. **Vacant ≠ unserved**, in code, data model and wording.
4. **Association ≠ cause.** Associations are measured between places, not
   people; the main ones are also given with income, and with income and
   education, held constant. Findings that did not hold are reported too.

### Main findings (October 2026 data)

- Across the 174 rural districts, the share of vacant GP districts and
  avoidable mortality correlate at r = 0.44; 0.36 with income held constant;
  0.17 (p ≈ 0.02) with income and education held constant together.
- Of GP districts filled with a state settlement grant, 91% have a doctor
  today, against 17% of matched districts without a grant (vacant as long, in
  settlements of the same size, in the same county where possible). The groups
  still differ: a doctor chose the granted district.
- Hungary's avoidable mortality is twice the EU average (Eurostat, 2023:
  472.7 against 237.7 per 100,000).
- Hungary has 45.6 practising GPs per 100,000 (2024), seventh of the eight
  regional countries that report it; 46.2% saw a dentist in a year (EHIS 2019),
  37.4% in rural areas, against an EU figure of 60.5%.
- Across the border, Észak-Magyarország has 238 doctors per 100,000 and a life
  expectancy of 75.1 years; Východné Slovensko 389 and 78.2 (2024).
- Distance to an emergency department does not go with mortality once income
  and education are held constant — reported as a null result.

### Architecture

No backend: a static site and a monthly batch ETL.

```
etl/ (Python 3.12)                               web/ (React 19 + Vite + TypeScript)
download → parse → address normalisation →       MapLibre GL map, D3 and SVG charts,
geocoding → validation → snapshot →        →     Zustand state, hand-written CSS,
supplements and analyses (declared steps)        + 2 × 3,177 static settlement pages
```

Each analysis is a declared step in [`etl/run.py`](etl/run.py) with its own
guard; `python etl/pipeline.py --check` fails the monthly workflow if anything
failed or was skipped. All interface text lives in
[`web/src/i18n/hu.json`](web/src/i18n/hu.json) and `en.json`.

### Running it

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r etl/requirements.txt
python etl/run.py --month 2026-10 --skip-geocode   # one month, cached coordinates only
python etl/pipeline.py --check
python -m pytest etl/tests

cd web && npm install
npm run dev        # development server
npm test           # Vitest
npm run build      # data copy, build and the static settlement pages
```

Environment (Vercel project settings): `VITE_GA_ID` (Google Analytics 4,
consent-gated; without it nothing loads), `VITE_MAP_STYLE` (street-map tiles),
`VITE_SITE_URL` (the sitemap address).

### Deployment and privacy

The monthly workflow ([`.github/workflows/monthly-etl.yml`](.github/workflows/monthly-etl.yml))
runs twice a month and opens an issue instead of publishing when validation
fails. Vercel deploys every push to `main` to
[praxisterkep.hu](https://praxisterkep.hu). Releases are tagged `vX.Y.Z` with
[GitHub release notes](https://github.com/ZoliQua/Praxisterkep/releases); the
version lives in `web/package.json` only, and every footer shows it. The site collects no personal
data; analytics load only after consent (`web/public/consent.js`); see the
[privacy notice](https://praxisterkep.hu/adatkezeles.html).

### Citation

If you use the code or the processed data, please cite it as given in
[`CITATION.cff`](CITATION.cff) (GitHub's “Cite this repository” reads it). The
Zenodo DOI is added once the first release is archived.

### Contributing and licence

Issues with data errors or new public sources are welcome — see
[CONTRIBUTORS.md](CONTRIBUTORS.md) and the [code of conduct](CODE_OF_CONDUCT.md).
Code: [MIT](LICENSE.md). Processed data (`data/*.json`): CC BY 4.0, with the
original source credited; raw source files (`data/raw/`) remain under their
publishers' terms (KSH census CC BY 4.0, OECD CC BY 4.0, OpenStreetMap ODbL,
Volánbusz GTFS CC0). One exception to CC BY: the European outlines
(`data/geo/europe.json`, from GISCO) are for non-commercial use only, with
"© EuroGeographics for the administrative boundaries" — details in
[LICENSE.md](LICENSE.md).

---

<a id="magyarul"></a>

## Magyarul

**[praxisterkep.hu](https://praxisterkep.hu)** — interaktív, nyilvános
térkép és elemzés a magyar egészségügyi alapellátásról: hol nincs
szerződött **háziorvos** vagy **fogorvos**, mióta, hány embert érint, mi
várható egy év múlva, és mivel jár együtt a hiány — elkerülhető halálozással,
szegénységgel, munkanélküliséggel, elvándorlással.

Minden szám nyilvános állami adatból épül: a NEAK havi listáiból, az OKFŐ,
az EESZT, a KSH, az NNGYK és az NFSZ közléseiből, valamint az OpenStreetMap
úthálózatából. Az oldal nem gyűjt saját adatot, és nem hivatalos kiadvány.

> A NEAK adatai tájékoztató jellegűek. **Betöltetlen ≠ ellátatlan:** egy
> betöltetlen körzet lakóit helyettesítő orvos láthatja el; a nyilvános
> adatok ezt nem mutatják.

---

### Tartalom

- [Mit mutat az oldal?](#mit-mutat-az-oldal)
- [Adatforrások](#adatforrások)
- [Adatpolitika](#adatpolitika-nem-alku-tárgya)
- [Elemzések és módszerek](#elemzések-és-módszerek)
- [Architektúra](#architektúra)
- [Az ETL-pipeline lépései](#az-etl-pipeline-lépései)
- [Adatfájlok](#adatfájlok)
- [Futtatás és fejlesztés](#futtatás-és-fejlesztés)
- [Telepítés és üzemeltetés](#telepítés-és-üzemeltetés)
- [Adatkezelés](#adatkezelés)
- [Hivatkozás, közreműködés, licenc](#hivatkozás)

---

### Mit mutat az oldal?

A nézőpont négy szinten fut: **ország → megye → járás → település**. A
kiválasztott ág (háziorvos vagy fogorvos) és a hely az egész oldalon
megmarad.

| Oldal | Mit tud |
|---|---|
| [Térkép](https://praxisterkep.hu/) (`index.html`) | Betöltetlen és megszűnt körzetek pont- és oszlopnézetben, megyei és járási kartogram több mutatóval, idősor-csúszka, megosztható URL; „Hol a háziorvos?” települési kereső; a prevenciós lánc magyarázata |
| [Megye](https://praxisterkep.hu/megye.html) (`megye.html`) | Egy megye a többi tizenkilenc között: betöltetlenség, járásai, települései, és az **Egészség és életkörülmények** rész — kilenc rangsor (elkerülhető halálozás, jövedelem, álláskeresők, népmozgalom, vándorlás, végzettség, digitális inaktivitás, sürgősségi menetidő, várható betöltetlenség), 12 hónapos előrejelzési görbe, letelepedési támogatások évenként |
| [Járás](https://praxisterkep.hu/jaras.html) (`jaras.html`) | A 197 egység (174 járás + 23 kerület) mindegyike: körzetek, ügyelet, rangsor, és mérőszalag-kártyák a 174 vidéki járás között (halálozás halálokonként, jövedelem, álláskeresők, népszámlálás, sürgősségi elérés, előrejelzés), a járásban elnyert támogatások |
| [Település](https://praxisterkep.hu/telepules/) (`/telepules/<slug>/`, angolul `/en/telepules/<slug>/`) | 3177 statikus oldal két nyelven, JavaScript nélkül is olvasható: van-e orvos és ki az (betöltött körzetnél), mióta üres, milyen messze az ellátás autóval és busszal, gyógyszertár, védőnő, korösszetétel, **Hogyan élnek itt?** (jövedelem, álláskeresők idősorral, születés és halálozás, vándorlás, betegforgalom, népszámlálási pontdiagram, támogatással betöltött körzet, a járás előrejelzése és elkerülhető halálozása), egy év változása |
| [Elemző](https://praxisterkep.hu/elemzo.html) (`elemzo.html`) | Országos trendek, háziorvos és fogorvos összevetése, kockázati modell, túlélés-elemzés, **előrejelzés egy évre**, **a letelepedési támogatások sorsa**, települési lefedettség, járási kép, **elkerülhető halálozás**, jövedelem, álláskeresők, népesség, **népszámlálás**, összefüggés-mátrix (nyers / jövedelem / jövedelem + végzettség kiszűrve), ügyelet és mentő, távolság, menetidő, **sürgősségi osztály**, busz, összetett index, keresztmetszetek, hiányterületek |
| [Európa](https://praxisterkep.hu/europa.html) (`europa.html`) | Magyarország az EU 27 tagállama és az Egyesült Királyság között — szűkíthető Közép-Kelet-Európára (Németország és az Egyesült Királyság mércéjével) vagy a V4-re: kinek kell az ellátás (kor, egészségben eltöltött évek, tartós betegség), orvosok és koruk, külföldön végzett orvosok és orvosvándorlás, háziorvos- és fogorvos-látogatás városban és vidéken, kimaradt ellátás jövedelem szerint, elkerülhető halálozás, szűrés, influenzaoltás, elkerülhető kórházi felvételek, kiadások, orvosi jövedelmek; a NUTS 2 régiók térképe és kilenc határ menti régiópár |
| [Továbbiak — Ki lát el még?](https://praxisterkep.hu/szakellato.html) (`szakellato.html`) | Védőnői ellátás, járóbeteg- és fekvőbeteg-szakellátás, gyógyszertárak, gyógyászati segédeszköz-forgalmazók |
| [Módszertan](https://praxisterkep.hu/modszertan.html) (`modszertan.html`) | Minden szám eredete és korlátai, a letölthető adatfájlok, beágyazási kód |
| [Adatkezelés](https://praxisterkep.hu/adatkezeles.html) (`adatkezeles.html`) | Adatkezelési tájékoztató |
| `eeszt.html` | Munkajegyzet két nyilvános nyilvántartás összevetéséről (nincs a menüben, a láblécből érhető el) |
| `embed.html` | Beágyazható térkép más oldalakra |

Az oldal két nyelvű: a HU/EN váltó minden oldal fejlécében ott van. Minden
hosszabb oldalnak bal oldali, csúszó menüje van a szakaszaival (telefonon
pöttysor, amely koppintásra kinyílik), a településlistán a húsz megyével; a
lábléc mindenhol megnevezi a futó verziót.

Minden diagram interaktív: mértékválasztó chipek, ágváltó, szórásdiagram
kiemeléssel, kattintható mátrix, megyére váltó előrejelzési görbe, térképek
átkattintással a járásra.

---

### Adatforrások

A kanonikus lista a [`CLAUDE.md`](CLAUDE.md)-ben él; másik forrás nem kerül be.
A NEAK-URL-ek az [`etl/sources.py`](etl/sources.py)-ban vannak, a többi forrásé
az azt olvasó modulban, a modul fejkommentjében leírva. Minden letöltött
fájl a [`data/raw/`](data/raw/) alatt archiválódik — **a git-történet maga az
audit-nyomvonal**.

| ID | Forrás | Mi származik belőle | Formátum | Gyakoriság | Modul |
|----|--------|---------------------|----------|------------|-------|
| A | [NEAK — Betöltetlen fogorvosi szolgálatok](https://www.neak.gov.hu/letoltheto/altfin_dok/szerzodott_szolgaltatok) | betöltetlen és megszűnt fogorvosi körzetek | PDF | havi | `parse_dental.py` |
| B | [NEAK — Betöltetlen háziorvosi szolgálatok](https://www.neak.gov.hu/letoltheto/altfin_dok/szerzodott_szolgaltatok) | betöltetlen háziorvosi körzetek | PDF | havi | `parse_gp.py` |
| C | [NEAK — Szerződött szolgáltatók](https://www.neak.gov.hu/letoltheto/altfin_dok/szerzodott_szolgaltatok) | a nevező: minden körzet, a betöltöttek orvosa | XLS | havi | `parse_registry.py` |
| D | NEAK — havi finanszírozási adatok | teljesítmény | XLS | havi | — |
| E | [OKFŐ — Tartósan betöltetlen körzetek](https://alapellatas.okfo.gov.hu/) | tartós betöltetlenség jelölése | HTML | havi | `parse_okfo.py` |
| F | [KSH — Helységnévtár](https://www.ksh.hu/apps/hntr.egyeb) | települések, lakónépesség, terület, járás | XLSX | évi | `parse_ksh.py` |
| F2 | [KSH — 2022. évi népszámlálás](https://nepszamlalas2022.ksh.hu/adatbazis/) (CC BY 4.0) | korösszetétel; végzettség, foglalkoztatás, digitális jártasság, lakás, háztartás | REST JSON | egyszeri | `ksh_age.py`, `ksh_census.py` |
| G | [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL) | megye-, járás-, településhatárok | GeoJSON | statikus | `fetch_geo.py` |
| H | [EESZT törzspublikáció](https://www.eeszt.gov.hu/hu/torzspublikacio) | finanszírozott szolgálatok, szolgáltatók, működési engedélyek, gyse-forgalmazók | REST JSON | havi | `fetch_eeszt.py`, `build_eeszt.py` |
| I | [NEAK — fekvő- és járóbeteg-szakellátók](https://www.neak.gov.hu/letoltheto/altfin_dok/szerzodott_szolgaltatok) | szakrendelések, kórházak, sürgősségi osztályok (4602, 4605) | XLSX | havi | `specialist.py` |
| J | [Geofabrik — Magyarország OSM-kivonat](https://download.geofabrik.de/europe/hungary.html) (ODbL) | autós úthálózat | PBF | igény szerint | `roads.py`, `traveltime.py` |
| K | [Volánbusz GTFS](https://gtfs.kti.hu/) (MÁV Sz. Zrt., KTI, CC0) | menetrend szerinti buszjáratok | ZIP | havi | `transit.py` |
| L | [290/2014. Korm. rendelet](https://njt.hu/jogszabaly/2014-290-20-22), [105/2015. Korm. rendelet](https://njt.hu/jogszabaly/2015-105-20-22) | járásfejlettség, kedvezményezett települések | HTML | igény szerint | `district_development.py`, `kedvezmenyezett.py` |
| M | [NNGYK — Halandósági adatbázis](https://nngyk.gov.hu/hu/halandosagi-adatbazis.html) | standardizált halálozás tíz halálokra és az elkerülhető halálozás (járás, megye) | HTML (widget JSON) | évi | `nngyk_mortality.py` |
| N | [KSH TIMEA](https://map.ksh.hu/timea/) | jövedelem (NAV), adózók, népmozgalom, vándorlás, háziorvosi betegforgalom, nyilvántartott krónikus betegek | REST JSON | évi | `ksh_timea.py` |
| O | [NFSZ — településsoros adatok](https://nfsz.munka.hu/tart/stat_telepulessoros_adatok) | nyilvántartott álláskeresők településenként | XLSX | havi (2024 előtt negyedéves) | `nfsz_jobseekers.py` |
| P | [NEAK — letelepedési és praxisjog-pályázatok](https://neak.gov.hu/felso_menu/szakmai_oldalak/gyogyito_megeleozo_ellatas/alapellatas/haziorvosi_ellatas/archivum) | a nyertesek helye és éve (név nélkül) | PDF | évi | `neak_grants.py` |
| Q | [Eurostat](https://ec.europa.eu/eurostat/web/health/database) egészségügyi és regionális adatbázis, [GISCO](https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/territorial-units-statistics) határok | kezelhető és megelőzhető halálozás; az európai összevetés mutatói és térképei | JSON-stat, GeoJSON | évi | `eurostat_avoidable.py`, `eu_compare.py` |
| R | [OECD Health Statistics](https://data-explorer.oecd.org/) (CC BY 4.0) | elkerülhető kórházi felvételek, orvosi jövedelmek, az Egyesült Királyság 2019 után | SDMX CSV | évi | `eu_compare.py` |

További nyilvános források, amelyeket egy-egy kiegészítő épít: a NEAK
[gyógyszertári partnerlistája](https://www.neak.gov.hu/felso_menu/lakossagnak/)
(`pharmacy.py` — az OGYÉI gyógyszertár-keresőjét a felhasználási feltételei
tiltják, ezért azt nem használjuk), a NEAK havi beutalási törzse
(`referral.py`), és a [Nominatim](https://nominatim.openstreetmap.org/)
geokódoló (1 kérés/másodperc, minden cím gyorsítótárazva).

**Amit szerettünk volna, de nincs nyilvános adat:** szűrővizsgálati
részvétel és átoltottság járási vagy települési bontásban. Egyik intézmény
sem közli géppel olvasható, nyilvános formában; becslést nem teszünk közzé.

---

### Adatpolitika (nem alku tárgya)

1. **Nincs kitalált adat.** Minden szám visszavezethető egy archivált
   forrásfájlra. Ha egy forrás hiányzik, vagy a beolvasás nem olyan
   eredményt ad, mint amit a forrás maga állít (darabszám, összesítő,
   egységszám), a pipeline hangosan hibázik — részleges vagy becsült adat
   sosem jelenik meg.
2. **Csak nyilvános adat; nevek csak ott, ahol a NEAK közli őket.** A
   betöltött praxis szerződött orvosának neve a NEAK nyilvános törzséből
   megjelenhet. Betöltetlen vagy megszűnt körzetnél, helyettesítő orvosnál,
   pályázati nyertesnél — soha. A pályázati feldolgozó a nevet be sem olvassa
   a kimenetbe, és teszt ellenőrzi, hogy egyetlen mezőben se szerepeljen.
3. **Betöltetlen ≠ ellátatlan.** A kód, az adatmodell és a szövegek
   szigorúan megkülönböztetik.
4. **Összefüggés ≠ ok.** Minden összefüggés járások között mért (ökológiai),
   nem egyéneken; a fő eredményeket a jövedelem, illetve a jövedelem és a
   végzettség kiszűrése után is közöljük. Ami nem igazolódott, az is
   szerepel.

---

### Elemzések és módszerek

Részletesen: [módszertan](https://praxisterkep.hu/modszertan.html). Röviden:

- **Betöltetlenségi arány** — a NEAK szerződött szolgáltatói törzse a
  nevező (fogorvosnál `Alapellátás` × felnőtt/gyermek/vegyes/iskolai,
  háziorvosnál `ellátási forma = T`), a FIN-kód a kulcs; ami eltűnik a
  törzsből, az `dissolved`, nem csendben eldobott.
- **Kockázati modell** (`risk.py`) — átlátható hazárdmodell: alapkockázat ×
  tényezőnkénti szorzók, a saját archívumból illesztve, időbeli bontással
  validálva (AUC és felső tized közölve).
- **Túlélés** (`survival.py`) — Kaplan–Meier-görbék az üresedések hosszára,
  megyénként, településméret és típus szerint; a balról csonkolt esetek
  száma közölve.
- **Előrejelzés** (`forecast.py`) — egy év múlva betöltetlen = most
  betöltetlen − várható betöltődés (Kaplan–Meier, megyénként) + várható új
  üresedés (a kockázatok összege), 90%-os sávval és visszaméréssel két
  archivált hónap között; településenként annak esélye, hogy egy év múlva
  legalább egy ellátó körzet üres lesz.
- **Letelepedési támogatások** (`neak_grants.py`) — minden nyertes címe a
  havi archívumban egy körzethez kötve, a körzet mai állapota (betöltött /
  újra üres / megszűnt) a támogatás nélküli, legalább egy éve üres
  körzetekkel összevetve. Közös rendelőcím, amely nem dönthető el,
  „nem egyértelmű”, és kimarad minden arányból. Illesztett összevetés: minden
  támogatott körzet mellé legfeljebb öt hasonló, támogatás nélküli körzet.
- **Menetidő** (`traveltime.py`) — szabad forgalmú percek az OSM-úthálózaton
  kilenc ellátástípusig (háziorvos, fogorvos, ügyelet, mentő, kórház,
  szakrendelés, gyse, gyógyszertár, sürgősségi osztály); a légvonal mellette.
- **Busz** (`transit.py`) — eljut-e menetrend szerinti járat a legközelebbi
  orvosig, és mennyi idő alatt.
- **Halálozás és körülmények** (`outcomes.py`) — Pearson és Spearman a 174
  vidéki járás között, parciális korreláció a jövedelemmel, másodrendű
  parciális a jövedelemmel és a végzettséggel együtt, jövedelem ×
  betöltetlenség harmadrács, négy keresztmetszet (az üresedés hossza ×
  menetidő, korösszetétel, buszelérés, ellátási sivatagok).
- **Népszámlálás** (`ksh_census.py`) — öt arány két-két közölt darabszámból;
  az elrejtett kis cellákat nem becsüljük, a rossz lakásokat pontos
  azonossággal (összes − összkomfortos − komfortos) állítjuk vissza.
- **Települési lefedettség, összetett index, hiányterületek** (`coverage.py`,
  `composite.py`, `clusters.py`) — a körzetszékhely helyett a települési
  ellátottság, és az összefüggő ellátási sivatagok.

A fő eredmények (2026. októberi adat): a 174 vidéki járásban a betöltetlen
háziorvosi körzetek aránya és az elkerülhető halálozás között r = 0,44; a
jövedelmet kiszűrve 0,36; a jövedelmet és a végzettséget együtt kiszűrve
0,17 (p ≈ 0,02). A letelepedési támogatással betöltött háziorvosi körzetek
91%-ában ma is van orvos; a hozzájuk illesztett — ugyanannyi ideje üres,
ugyanakkora településen lévő, lehetőleg azonos megyei — támogatás nélküli
körzeteknek csak 17%-ában (a két csoport így sem teljesen összevethető —
lásd a módszertant). A sürgősségi osztály távolsága a két kontroll után nem jár
együtt a halálozással.

Európai összevetésben (Eurostat): Magyarországon 100 ezer lakosra 45,6
praktizáló háziorvos jut (2024) — a régió nyolc, adatot közlő országa közül a
hetedik hely; az elmúlt évben fogorvosnál a lakosok 46,2%-a járt, vidéken
37,4% (EHIS 2019), az EU-ban 60,5%. A határ két oldalán: Észak-Magyarországon
100 ezer lakosra 238 orvos jut és a várható élettartam 75,1 év, Kelet-Szlovákiában
389 orvos és 78,2 év (2024).

---

### Architektúra

Nincs backend: statikus oldal + havi kötegelt ETL.

```
etl/  (Python 3.12)                             web/  (React 19 + Vite + TypeScript)
letöltés → parse → címegységesítés →            MapLibre GL térkép, D3 és saját SVG
geokódolás → validálás → snapshot →      →      diagramok, Zustand állapot, saját CSS
kiegészítők és elemzések (deklarált lépések)    + 3177 statikus településlap (JS nélkül)
        ↓
data/YYYY-MM/{dental,gp}.json · latest.json · timeseries.json · history.json
data/*.json (kiegészítők és elemzések) · data/raw/ (minden forrásfájl)
```

- **Címek** (`address.py`) — a kézzel gépelt törzs egy rendelőt többféleképp
  ír; a tisztítás és az összevonás külön lépés, a döntések az
  `etl/address_cache.json`-ban rögzülnek, a kézi javítások az
  `etl/address_overrides.json`-ban.
- **Településnevek** — mindenhol a KSH Helységnévtár írásmódja; a NEAK
  ékezet nélküli alakjait („Gyor”) csak akkor javítjuk, ha az ékezet nélküli
  név egyetlen települést jelöl.
- **Felület** — minden szöveg a [`web/src/i18n/hu.json`](web/src/i18n/hu.json)-ban
  és az `en.json`-ban; a komponensekben és a statikus lapok generátorában
  nincs beégetett szöveg. Minden oldal két nyelvű.

---

### Az ETL-pipeline lépései

A [`etl/run.py`](etl/run.py) a havi NEAK-adatból épít, majd deklarált
lépésekben futtatja a kiegészítőket és az elemzéseket. Minden lépés megnevezi,
mire van szüksége; amelyiknek a bemenete nem épült újra, az kimarad, az
eredmény a `data/pipeline.json`-ba kerül, és a `python etl/pipeline.py --check`
megbuktatja a munkafolyamatot, ha bármi hibázott vagy kimaradt.

| Lépés | Kimenet | Mire épül |
|---|---|---|
| havi NEAK-build | `data/YYYY-MM/*.json`, `latest.json`, `timeseries.json`, `history.json` | A, B, C, E, F |
| `eeszt`, `crosscheck`, `providers`, `operating`, `officialmap`, `licence_history` | EESZT-összevetés, szolgáltatók, működési szint, a NEAK saját FIN-összerendelése, egységek kora | H, C |
| `dental_extra`, `referral`, `pharmacy`, `gyse`, `specialist`, `vedono` | nem-körzeti fogászat, beutalási törzs, gyógyszertárak, gyse, szakellátás, védőnők | A, C, H, I |
| `access`, `centroids`, `emergency`, `roads`, `traveltime`, `transit` | légvonal, település-középpontok, ügyelet/mentő, úthálózat, menetidő, busz | G, H, I, J, K |
| `risk`, `survival`, **`forecast`**, `tenure`, `fluctuation` | kockázat, túlélés, előrejelzés, fluktuáció | a havi archívum |
| `ksh_age`, **`census`**, `coverage`, `composite`, `clusters` | kor, népszámlálás, lefedettség, index, sivatagok | F, F2 |
| `mortality`, `eurostat`, **`europe`**, `territorial`, `jobseekers`, **`grants`** | halálozás, Magyarország és az EU, európai összevetés, TIMEA, álláskeresők, támogatások | M, N, O, P, Q, R |
| `settlements`, `county_profiles`, `district_development`, `district_profiles`, `outcomes` | település-, megye-, járásprofilok, kimenetek | minden fenti |

Kötelező ellenőrzések (`validate.py` és a modulok saját `guard()`-jai):
sorszám-eltérés legfeljebb ±15% az előző hónaphoz; minden betöltetlen
körzetnek FIN, megye, legalább egy cím és kezdődátum; a település → járás →
megye → ország összegek egyeznek; a járási rétegek pontosan 197 egységet, a
megyeiek 20-at adnak; az NFSZ minden munkalapja kiadja a saját megyei
összesítőjét; a népszámlálás komfortkategóriái kiadják a lakott lakások
számát.

---

### Adatfájlok

Mind a [`data/`](data/) alatt, a webes build a `web/public/data/`-ba másolja
(`web/scripts/sync-data.mjs`).

| Fájl | Tartalom |
|---|---|
| `YYYY-MM/dental.json`, `YYYY-MM/gp.json` | egy hónap pillanatképe: betöltetlen, megszűnt és betöltött körzetek, megyék, települések |
| `latest.json`, `timeseries.json`, `history.json` | a legutóbbi hónap, idősor, ki-be áramlás |
| `settlements.json`, `settlement_slugs.json` | 3177 település-profil (ebből épülnek a statikus lapok) |
| `counties.json`, `districts.json` | a profilok megyei és járási (197) szelete |
| `outcomes.json` | halálozás, körülmények, népszámlálás, sürgősségi elérés, támogatások, előrejelzés — járásonként, megyénként, korrelációkkal |
| `mortality.json`, `eurostat.json`, `territorial.json`, `jobseekers.json`, `census.json` | az M, Q, N, O és F2 forrás feldolgozva |
| `europe.json`, `geo/europe.json`, `europe_summary.json` | az európai összevetés: 49 mutató és az orvosvándorlás a 27 tagállamra és az Egyesült Királyságra, a NUTS 2 régiók, a határ menti párok; országhatárok és régióhatárok |
| `grants.json`, `forecast.json`, `highlights.json` | a támogatások sorsa; az egyéves előrejelzés; a főoldal két kiemelt eredménye |
| `risk.json`, `survival.json`, `tenure.json`, `fluctuation.json` | archívumra épülő elemzések |
| `coverage.json`, `composite.json`, `clusters.json`, `age.json` | lefedettség, összetett index, sivatagok, korösszetétel |
| `traveltime.json`, `transit.json`, `access.json`, `emergency.json` | menetidő, busz, légvonal, ügyelet és mentő |
| `eeszt.json`, `crosscheck.json`, `officialmap.json`, `providers.json`, `operating.json`, `licence_history.json` | EESZT-összevetés és nyilvántartási kiegészítők |
| `dental_extra.json`, `vedono.json`, `specialist.json`, `pharmacy.json`, `gyse.json`, `referral.json` | további ellátási ágak |
| `district_development.json`, `kedvezmenyezett.json` | járásfejlettség, kedvezményezett települések |
| `pipeline.json` | az utolsó futás lépésenkénti eredménye |
| `raw/` | minden eredeti forrásfájl, manifesztekkel és SHA-256-lenyomatokkal |

Gitben nem tárolt, URL-ből és dátumból újraépíthető: az OSM-kivonat
(`data/raw/osm/`), a GTFS (`data/raw/gtfs/`), az úthálózat
(`data/geo/road_graph.npz`).

---

### Futtatás és fejlesztés

```bash
# ETL (Python 3.12+)
python -m venv .venv && source .venv/bin/activate
pip install -r etl/requirements.txt
python etl/run.py --month 2026-10                 # egy hónap teljes futása
python etl/run.py --month 2026-10 --skip-geocode  # csak gyorsítótárazott koordinátákkal
python etl/pipeline.py --check                    # megbukik, ha bármi hibázott
python etl/address.py --report                    # mit csinálna a címegységesítés

# egy-egy modul önállóan (archivált forrásból, ha van)
python etl/ksh_census.py
python etl/neak_grants.py
python etl/forecast.py

# ETL tesztek
python -m pytest etl/tests

# Web
cd web && npm install
npm run dev            # fejlesztői szerver
npm test               # Vitest
npx tsc -b             # típusellenőrzés
npm run build          # adatmásolás, build és a 3177 statikus oldal
```

Környezeti változók (Vercel projektbeállítás): `VITE_GA_ID` (Google
Analytics 4 mérőazonosító — nélküle semmi nem töltődik be),
`VITE_MAP_STYLE` (utcaszintű térképstílus — nélküle a településlapok
utcaszintű térképe nem készül el), `VITE_SITE_URL` (a sitemap címe).

---

### Telepítés és üzemeltetés

- **Havi frissítés** — [`.github/workflows/monthly-etl.yml`](.github/workflows/monthly-etl.yml)
  havonta kétszer fut; validálási hibánál nem publikál, hanem issue-t nyit.
- **Telepítés** — Vercel, a GitHub-integráción át: minden `main`-re küldött
  változás egy-két perc alatt élesbe kerül, a
  [praxisterkep.hu](https://praxisterkep.hu) domainen.
- **Verziók** — [`CHANGELOG.md`](CHANGELOG.md) (Keep a Changelog, SemVer),
  minden verzióhoz `vX.Y.Z` git-címke és [GitHub-kiadás](https://github.com/ZoliQua/Praxisterkep/releases);
  a verziószám egyetlen helye a `web/package.json`, ebből olvassa minden lábléc.

---

### Adatkezelés

Az oldal személyes adatot nem gyűjt. Látogatói statisztika (Google
Analytics 4) **csak hozzájárulás után** töltődik be: a
`web/public/consent.js` alapértelmezésben `analytics_storage: denied`
állapotot állít be, és csak igen után tölti be a gtag-et. Részletek: az
[adatkezelési tájékoztató](https://praxisterkep.hu/adatkezeles.html). A
beágyazható nézet (`embed.html`) semmilyen sütit nem használ.

---

### Hivatkozás

Ha a kódot vagy a feldolgozott adatokat felhasználod, kérlek, hivatkozz rá a
[`CITATION.cff`](CITATION.cff) szerint (a GitHub „Cite this repository”
gombja ebből dolgozik). A Zenodón archivált kiadás DOI-ja a megjelenés után
kerül a fájlba.

### Közreműködés

Hibajelentést, adatészrevételt, új nyilvános forrást issue-ban szívesen
fogadok; részletek a [CONTRIBUTORS.md](CONTRIBUTORS.md)-ben. Kérlek, tartsd be a
[magatartási kódexet](CODE_OF_CONDUCT.md). Fejlesztési terv:
[`docs/PLAN.md`](docs/PLAN.md).

### Licenc

A kód [MIT licencű](LICENSE.md). A feldolgozott adatok (`data/*.json`) CC BY
4.0 licencűek, az eredeti forrás megjelölésével; a `data/raw/` alatti
forrásfájlok a kibocsátóik feltételei szerint használhatók (NEAK, OKFŐ,
EESZT, KSH — a népszámlálás CC BY 4.0 —, NNGYK, NFSZ, OpenStreetMap — ODbL —,
Volánbusz GTFS — CC0, OECD — CC BY 4.0). Kivétel a CC BY alól: az európai
határok (`data/geo/europe.json`, GISCO) csak nem kereskedelmi célra
használhatók, „© EuroGeographics for the administrative boundaries”
felirattal. Részletek a [LICENSE.md](LICENSE.md)-ben.

---

Szerző: **Dr. Dul Zoltán** · [@ZoliQua](https://github.com/ZoliQua) ·
Magánkezdeményezés, nem hivatalos kiadvány · Az adatok tájékoztató jellegűek.
