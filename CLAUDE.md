# CLAUDE.md — Praxistérkép

Interactive public map of Hungarian primary care districts (dental first, GP later),
showing vacancies, duration, affected population and trends, built from monthly
NEAK open data. Visual/UX reference: https://holadelej.hu

Full plan: `docs/PLAN.md` (Hungarian). Read it before non-trivial work.

## Non-negotiable rules

1. **Authorship: Dul Zoltán only.** NEVER add `Co-Authored-By: Claude`,
   "Generated with Claude", or any AI attribution to commits, files, docs,
   READMEs, or metadata. No exceptions.
2. **No hallucinated data.** Every number must trace to a source file in
   `data/raw/YYYY-MM/`. If a source is missing or a parser fails validation,
   the pipeline must fail loudly — never publish partial or guessed data.
3. **Public data only; names only where NEAK itself publishes them.** The
   contracted physician's name of a FILLED praxis (from the NEAK public
   registry) may be shown. Names on vacant/dissolved districts and
   substitute physicians — never. Vacancy markers (BETÖLTETLEN) are not
   names. (Policy widened 2026-08 at the owner's request.)
4. **Betöltetlen ≠ ellátatlan.** Keep "vacant" (no contracted physician) and
   "unserved" (no care available incl. substitution) strictly separate in code,
   data model and UI copy.

## Project phase

**MVP (dental) and the v1 GP branch are both implemented.** Every pipeline
component is dual-cassette (`kind: 'dental' | 'gp'`). Note: NEAK publishes no
dissolved (megszűnt) list for GP; the GP registry is the source of district
(járás) names and served-settlement lists.

## Language conventions

- Code, comments, commit messages, identifiers: **English**.
- UI copy, docs for stakeholders, PLAN.md: **Hungarian**. UI strings live in
  `web/src/i18n/hu.json` only — never hardcode Hungarian text in components.
- Hungarian quotes in JS/JSON string literals: use Unicode escapes
  (`\u201E` „ and `\u201D` ”) to avoid encoding issues (known past pain point).

## Architecture

- **No backend.** Static SPA + monthly batch ETL via GitHub Actions.
- ETL: Python 3.12 in `etl/` — pdfplumber, pandas, openpyxl, numpy, scipy,
  osmium (the last three carry the road graph; they were missing from
  requirements for weeks and the routing steps silently never ran in CI).
  Install with `pip install -r etl/requirements.txt`.
- Data: versioned JSON snapshots in `data/YYYY-MM/`, `data/latest.json`,
  `data/timeseries.json`. Raw source files archived in `data/raw/YYYY-MM/`
  (git-tracked — the git history IS the audit trail).
- Supplements (optional, never block a release): `data/eeszt.json` (EESZT
  match per district), `data/dental_extra.json` (the dental services that
  are NOT districts: on-call, university primary care, every Szakellátás
  service), `data/vedono.json` (the health-visitor branch, EESZT-only — no
  vacancy list exists for it anywhere), `data/specialist.json` (source I),
  `data/emergency.json` (on-call, ambulance, patient transport, dialysis),
  `data/gyse.json` (medical-aid retail premises), `data/pharmacy.json`
  (contracted pharmacies — the NEAK partner list, never the OGYÉI finder,
  whose robots.txt and terms forbid it) and `data/referral.json` (NEAK's
  monthly referral master list: the FIN → institution crosswalk and the
  entry/exit log that stands in for the dissolved list NEAK does not
  publish for GP).
- Analyses built on top of the above, each with its own guard:
  `risk.json` (vacancy risk), `survival.json` (Kaplan–Meier of vacancy
  spells), `workforce.json` (physician turnover and multi-district
  holdings, pseudonymous), `coverage.json` (settlement-level coverage
  instead of district seats), `composite.json` (the composite care-risk
  index), `clusters.json` (contiguous care deserts), `age.json` (KSH census
  age composition), `traveltime.json` (driving minutes on the OSM road
  graph), `transit.json` (scheduled bus reach) and `officialmap.json`
  (NEAK's own FIN → provider link held against our cross-check — a second
  opinion, never a replacement), `licence_history.json` (how old the
  organisational unit behind a district is, from the licence register's
  dated snapshots — the only register that answers for the past; it cannot
  say who operated a district before, because a unit belongs to its
  provider for good) and `settlements.json` + `settlement_slugs.json` (the
  analyses turned inside out, one profile per settlement, which the build
  bakes into a static page each). `data/geo/settlements.geojson` carries a
  centre point per settlement. `counties.json` and `districts.json` are the
  same profiles sliced one level up — twenty counties and the 197 járás
  (174 + the capital's 23 kerület) — so a browser never downloads 3177 towns
  to look at one of them. `district_development.json` carries the state's own
  development ranking of the járás (source L).
- Outcomes and circumstances, from outside the health registers:
  `mortality.json` (source M — what a vacancy costs, in deaths),
  `territorial.json` (source N — income, births and deaths, people leaving)
  and `jobseekers.json` (source O). Three rules hold for all three:
  * Avoidable mortality comes from NNGYK, never from KSH's district death
    tables (Statinfo NH3A07): KSH masks every cell under three deaths and
    draws it exactly like a zero, which would make the small rural járás
    look healthiest. The three NNGYK groups are disjoint, so 11+12+13 is
    total avoidable and 11+13 everything on the treatable list.
  * Every TIMEA value is a rate, and rates are never averaged up a level:
    járás and county values come from KSH's own higher layers. There is no
    national layer; comparisons use the county and the median of the 174
    járás. TIMEA has no kerület level — the capital is one settlement there.
  * Settlements are keyed by the KSH code (TIMEA's ELEM_KOD is the first four
    digits of our kshId) or, for NFSZ, by county + casefolded name, always
    from the gazetteer itself — never by reading settlements.json, which is
    built from these files. Every NFSZ sheet must add up to its own printed
    county total or it is rejected.
- Not in git, reproducible from their URL and date: the OSM extract under
  `data/raw/osm/`, the GTFS zip under `data/raw/gtfs/` and the derived
  `data/geo/road_graph.npz`.
- Every supplement and analysis is a declared step in `etl/pipeline.py`:
  steps name what they need, the runner skips those whose input did not
  rebuild, the outcome lands in `data/pipeline.json`, and
  `python etl/pipeline.py --check` fails the workflow if anything failed or
  was skipped. A failure must be loud, never silent.
- Pages: `index.html` (landing), `megye.html` (county), `jaras.html` (járás),
  `elemzo.html` (the analyses), `szakellato.html` ("Ki lát el még?" — the
  health-visitor branch first, then specialist care, pharmacies and
  medical-aid retailers), `modszertan.html`, `embed.html`, and `eeszt.html`,
  which is **not in the menu**: it is a working note comparing two public
  registers, reachable only from the sources list in the footer, and it says
  so at the top. The zoom levels run country → megye → járás → település.
- Every page carries the same footer (`components/Footer.tsx`, mirrored for
  the static pages by `siteFooter()` in `settlement-pages.mjs`, both reading
  `i18n/hu.json`): the public-data-only statement first, the sources, then
  the legal notes — informational data, vacant ≠ unserved, names only where
  NEAK publishes them, what the site does and does not store, that it is a
  private initiative and not an official publication, and where to report an
  error. Changing any of those claims means checking they are still true
  (no names on vacant praxes, no trackers in the bundle).
- Frontend: React 18 + Vite + TypeScript in `web/`, Zustand for state,
  MapLibre GL JS for the map, D3 for charts. No Tailwind; hand-rolled CSS
  matching the dark holadelej-style theme.
- Analytics: Google Analytics 4, **behind consent**. `web/public/consent.js`
  is a hand-written file (not bundled) that every page — including the 3177
  static ones — includes: it sets `analytics_storage: denied` as the consent
  default, shows the bar, and only loads gtag after a yes. The measurement id
  comes from `VITE_GA_ID` (Vite fills `%VITE_GA_ID%` in the HTML entries, the
  generator writes the same meta tag); without it nothing loads and no bar
  appears. `adatkezeles.html` is the privacy notice and must stay true to the
  code. embed.html is deliberately excluded: a cookie there would be the
  embedding site's consent problem.
- Sources: `web/src/lib/sources.json` holds one row per downloadable file,
  with labels in `i18n` under `footer.src.*`. The Footer component and the
  static generator both render it, so the app and the 3177 pages cannot
  disagree about where a number came from.
- Geocoding: Nominatim, 1 req/s, results cached in `etl/geocode_cache.json`
  (git-tracked). Only query addresses not in cache.
- Addresses: the registry is typed by hand and spells one surgery several
  ways. `etl/address.py` gives each one spelling — tidying (capitals, street
  type, house number) is separate from merging (same place, one label), both
  registries are resolved in one pass, and the entry keeps the registry's own
  wording in `addressRaw`. Decisions are pinned in `etl/address_cache.json`
  (git-tracked, like the geocode cache) so a monthly run only resolves what is
  new; `etl/address_overrides.json` holds corrections by hand.
  `python etl/address.py --report` shows what the current data would become.

## Data sources (canonical list — do not invent others)

| ID | Source | Format | Cadence |
|----|--------|--------|---------|
| A | NEAK Betöltetlen fogorvosi szolgálatok | PDF | monthly |
| B | NEAK Betöltetlen háziorvosi szolgálatok | PDF | monthly (v1) |
| C | NEAK szerződött szolgáltatók (registry = denominator) | XLS/PDF | monthly |
| D | NEAK havi finanszírozási adatok (performance) | XLS | monthly (v1) |
| E | OKFŐ tartósan betöltetlen körzetek | HTML/PDF | cross-check |
| F | KSH settlement population (Helységnévtár) | XLS | yearly |
| F2 | KSH 2022 census age composition (settlement level, CC BY 4.0) | REST JSON | one-off |
| G | Settlement/district/county boundaries (OSM/KSH) | GeoJSON | static |
| H | EESZT törzspublikáció (NEAK_FINSZOLG, EUSZOLG_PUBLIKUS, EUSZOLG_ENGEDELY_PUBLIKUS, NEAK_FINSZOLG_EXT, GYSE_FORGALMAZO) | REST JSON | supplement (monthly) |
| I | NEAK fekvő- és járóbeteg-szakellátó intézmények (XLSX only — the outpatient PDF is truncated) | XLSX | monthly |
| J | OpenStreetMap Hungary extract (Geofabrik, ODbL) — the drivable road graph | PBF | on demand |
| K | Volánbusz national GTFS (MÁV Sz. Zrt. via gtfs.kti.hu, CC0) — scheduled buses; MÁV rail is registration-only and therefore absent | ZIP | monthly |
| L | 290/2014. (XI. 26.) Korm. rendelet — the járás development ranking (komplex mutató, 2014) and 105/2015. (IV. 23.) Korm. rendelet — the lagging settlements, both from njt.hu | HTML | on demand |
| M | NNGYK Halandósági adatbázis (nngyk.gov.hu) — SHA (direct, 2013 European Standard Population) and SHH (indirect, 100 = national) per járás and county, by sex: 10 cause groups and Eurostat's avoidable mortality split into treatable-only / preventable-only / both | HTML (htmlwidgets; the JSON payload is archived, the base64 map geometry is not) | yearly |
| N | KSH TIMEA (map.ksh.hu ArcGIS service, NAV/KSH data) — SZJA-alapot képező jövedelem per resident and per taxpayer, taxpayers, natural change, births, deaths, domestic migration balance, a GP's yearly patient count, GP-registered diabetes / hypertension / ischaemic heart disease (járás), ageing index; settlement, járás and county layers, the capital as one | REST JSON | yearly |
| O | NFSZ településsoros adatai — registered jobseekers per settlement and kerület (total, > 1 year, benefit, assistance, supported, working-age population) | XLSX | monthly (quarterly before 2024, back to 2019) |

NEAK source URLs are configured in `etl/sources.py` — update there only. The
other sources keep their URL as a constant in the one module that reads them
(`district_development.py`, `nngyk_mortality.py`, `ksh_timea.py`,
`nfsz_jobseekers.py`, …), with the source described in that module's
docstring.
NEAK data is "tájékoztató jellegű"; this disclaimer must appear in the UI footer.

## Key data model

The district denominator is the registry filtered to `Ellátási szint =
Alapellátás` AND a district service type (Felnőtt/Gyermek/Vegyes/Iskolai) for
dental, and to `ellátási forma = T` for GP. Everything else the registry lists
(Ügyelet, Egyetemi alapellátás, Szakellátás) is NOT a district: it never
enters the vacancy rate and lives in `data/dental_extra.json` instead.

`Praxis.id` = NEAK FIN code (canonical key). Praxis types:
`adult | child | mixed | school`. Status:
`filled | vacant | vacant_longterm | dissolved`. A FIN code disappearing from
the registry means `dissolved`, never silently dropped or counted as filled.

## ETL invariants (validate.py must enforce)

- Row count within ±15% of previous month, else fail with diff report.
- Every vacant praxis has: FIN code, county, ≥1 site address, vacantSince.
- Aggregates: settlement counts sum to district, district to county,
  county to national. Any mismatch = hard fail.
- Failed geocode → settlement-centroid fallback, flagged `geoApprox: true`.

## Testing

- ETL: pytest with fixture PDFs in `etl/tests/fixtures/` (commit one real
  anonym-safe sample per source format version).
- Web: Vitest for logic (aggregation selectors, formatting); pure logic
  separated from presentation (same pattern as the arcade game projects).

## Workflow

- Monthly pipeline: `.github/workflows/monthly-etl.yml` (cron, runs twice
  monthly). On validation failure it opens an issue instead of deploying.
- Local run: `python etl/run.py --month 2026-08` then `cd web && npm run dev`.
- The street-level map on the settlement pages needs a tile provider. The
  style URL lives in the `VITE_MAP_STYLE` environment variable (Vercel
  project settings); without it the map is not built and not offered, and
  everything else works unchanged. MapTiler/Stadia keys are domain-restricted;
  a self-hosted Protomaps file would need no key at all.
- Deploy: **Vercel**, through its GitHub integration — every push to `main`
  builds `web/` and goes live in a minute or two. The site's own domain is
  **https://praxisterkep.hu** (the vercel.app address still serves it);
  `VITE_SITE_URL` overrides what the sitemap writes. `npm run build` runs `scripts/sync-data.mjs` first, so the JSON in
  `data/` reaches `web/public/data/` on the build machine (that directory is
  git-ignored on purpose).
  `.github/workflows/deploy.yml` still targets Cloudflare Pages and fails on
  every push for want of its two secrets; it is dead weight unless Cloudflare
  is actually wanted.
