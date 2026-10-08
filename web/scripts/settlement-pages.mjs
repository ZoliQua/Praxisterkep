// One static page per settlement, written into dist/telepules/<slug>/.
//
// The site had twelve analyses and no way to ask the one question a
// resident has: "and here?". These pages answer it — is there a doctor in
// the districts that serve this place, how far the nearest surgery, on-call
// point and hospital are by road, whether a bus goes there, who lives here,
// and where the settlement stands in the composite index.
//
// They are plain HTML with the numbers baked in: no JavaScript, no data
// fetching, nothing to wait for. The stylesheet is the one the app already
// builds, so they look like the rest of the site without repeating it.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { countyMap, countyThumb } from './county-map.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const profiles = JSON.parse(
  readFileSync(join(here, '..', '..', 'data', 'settlements.json'), 'utf8'),
);

// the geometry the little county map is drawn from; all three are files the
// pipeline already produces and the build already copies to public/data
const geoDir = join(here, '..', '..', 'data', 'geo');
const readGeo = (name) => JSON.parse(readFileSync(join(geoDir, name), 'utf8'));
const geo = {
  counties: readGeo('counties.geojson'),
  cities: readGeo('cities.geojson'),
  settlements: readGeo('settlements.geojson'),
  budapest: readGeo('budapest.geojson'),
  byKsh: new Map(),
  byName: new Map(),
};
for (const f of geo.settlements.features) {
  geo.byKsh.set(f.properties.kshId, f.geometry.coordinates);
  // a name alone can collide, so the county-qualified key wins when it is known
  geo.byName.set(`${f.properties.name}|${f.properties.county}`, f.geometry.coordinates);
  if (!geo.byName.has(f.properties.name)) {
    geo.byName.set(f.properties.name, f.geometry.coordinates);
  }
}

// how far back the tenure claim can reach: the oldest monthly snapshot the
// archive holds a registry for
const tenureData = JSON.parse(
  readFileSync(join(here, '..', '..', 'data', 'tenure.json'), 'utf8'),
);
const archiveFrom = Object.values(tenureData.stats)
  .map((s) => s.from).sort()[0];

const HU_MONTHS = ['január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
const [year, month] = profiles.dataMonth.split('-').map(Number);
const monthLabel = `${year}. ${HU_MONTHS[month - 1]}`;

// the built stylesheet carries a content hash, so it is looked up, not guessed
const cssFile = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.css'))
  .sort((a, b) => b.length - a.length)[0];

// the street map is written only when a tile provider is configured: without
// VITE_MAP_STYLE the bundle would have nothing to draw on, so the button is
// not offered at all (src/streetmap.ts makes the same check at runtime)
const streetFile = process.env.VITE_MAP_STYLE
  ? readdirSync(join(dist, 'assets')).find((f) => /^streetmap-.*\.js$/.test(f))
  : null;

const STREET_LABELS = {
  gp: 'Háziorvosi rendelő', dental: 'Fogorvosi rendelő', pharmacy: 'Gyógyszertár',
  oncall: 'Központi ügyelet', ambulance: 'Mentőállomás', inpatient: 'Kórház',
  outpatient: 'Járóbeteg-szakrendelés', gyse: 'Gyógyászati segédeszköz',
};

/** Everything in this settlement that has a coordinate, for the street map. */
function streetPoints(profile) {
  const out = [];
  for (const s2 of profile.surgeries ?? []) {
    if (s2.lat && s2.lon) {
      out.push({ lat: s2.lat, lon: s2.lon, kind: s2.kind,
        name: s2.doctor || STREET_LABELS[s2.kind],
        address: `${s2.postalCode} ${profile.settlement}, ${s2.address}`,
        approx: s2.geoApprox === true });
    }
  }
  for (const ph of profile.pharmacies ?? []) {
    if (ph.lat && ph.lon) {
      out.push({ lat: ph.lat, lon: ph.lon, kind: 'pharmacy', name: ph.name,
        address: `${ph.postalCode} ${profile.settlement}, ${ph.address}`,
        approx: ph.geoApprox === true });
    }
  }
  for (const pl of profile.places ?? []) {
    out.push({ lat: pl.lat, lon: pl.lon, kind: pl.kind,
      name: pl.name || STREET_LABELS[pl.kind] || pl.kind,
      address: pl.address, approx: pl.geoApprox === true });
  }
  return out;
}

function streetBlock(profile) {
  if (!streetFile) return '';
  const points = streetPoints(profile);
  if (points.length < 2) return '';
  const kinds = [...new Set(points.map((p) => p.kind))];
  return `<section class="section container">
  <h2 class="section__subheading">Utcaszinten</h2>
  <p class="section__explain">Hol állnak pontosan: a betöltött rendelők az orvos
    nevével, a gyógyszertárak, és ami még a településen van. A térkép csak
    kattintásra töltődik be, hogy a lap addig is azonnal olvasható maradjon.</p>
  <div class="tp-street" data-streetmap>
    <button type="button" class="data-btn data-btn--accent"
      data-loading="Térkép betöltése…" data-failed="A térkép nem töltődött be">
      Utcaszintű térkép (${num(points.length)} pont)
    </button>
    <p class="tp-maplegend">${kinds.map((k) =>
    `<span><i class="street-pin" style="background:${
      { gp: '#4fd6c2', dental: '#8ab4ff', pharmacy: '#c88ff0', oncall: '#f0b429',
        ambulance: '#ef8354', inpatient: '#ef6461', outpatient: '#9bd4a5',
        gyse: '#b8a4ff' }[k] ?? '#94a3b8'}"></i>${
    esc(STREET_LABELS[k] ?? k)}</span>`).join('')}</p>
    <div class="tp-street__map" hidden></div>
    <script type="application/json">${
  JSON.stringify(points).replace(/</g, '\\u003c')}</script>
  </div>
  <p class="tp-note">A pontok geokódolt címek (Nominatim/OpenStreetMap), nem
    helyszíni felmérés: ahol a cím pontatlan, a jelölő a település közepére esik,
    és ezt a buborék ki is írja.</p>
</section>`;
}

// the site-wide context (lib/context.ts) written into a static link: ?tel=
// is the settlement slug, ?m= its county, and the SPA picks both up on load
// the one menu (src/lib/siteNav.json) and its Hungarian labels, so these
// 3177 static pages cannot disagree with the app about which pages exist
const nav = JSON.parse(readFileSync(join(here, '..', 'src', 'lib', 'siteNav.json'), 'utf8'));
const hu = JSON.parse(readFileSync(join(here, '..', 'src', 'i18n', 'hu.json'), 'utf8'));
const label = (key) => key.split('.').reduce((o, k) => (o ?? {})[k], hu) ?? key;

const navBar = (profile) => nav.entries.map((e) => {
  const children = (e.children ?? []).map(([href, key]) =>
    `<a href="${esc(ctx(href, profile))}">${esc(label(key))}</a>`).join('');
  return `<div class="topnav__group"><a href="${esc(ctx(e.href, profile))}">${
    esc(label(e.labelKey))}${children ? '<i class="topnav__caret" aria-hidden="true"></i>' : ''
  }</a>${children ? `<div class="topnav__submenu" hidden>${children}</div>` : ''}</div>`;
}).join('\n    ');

const ctx = (href, profile) => {
  const [path, hash] = href.includes('#') ? [href.slice(0, href.indexOf('#')),
    href.slice(href.indexOf('#'))] : [href, ''];
  const q = new URLSearchParams({ m: profile.county, tel: profile.slug });
  return `${path}?${q}${hash}`;
};

const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const num = (n) => (n === null || n === undefined ? '–'
  : new Intl.NumberFormat('hu-HU').format(n));
const pct = (r) => (r === null || r === undefined ? '–'
  : `${(r * 100).toFixed(1).replace('.', ',')}%`);
const minutes = (m) => (m === null || m === undefined ? '–'
  : `${String(m).replace('.', ',')} perc`);

// "a 1407." is wrong in Hungarian: ezernégyszázhét begins with a vowel, so
// it takes "az". The article follows the first spoken word of the number.
const article = (n) => {
  if (n >= 1000 && n < 2000) return 'az';        // ezer…
  if (n >= 2000) return Math.floor(n / 1000) === 5 ? 'az' : 'a';
  if (n >= 100) return Math.floor(n / 100) === 5 ? 'az' : 'a';
  if (n >= 10) return Math.floor(n / 10) === 5 ? 'az' : 'a';
  return n === 1 || n === 5 ? 'az' : 'a';
};

const STATE = {
  filled: ['Van betöltött körzete', 'ok'],
  partial: ['Van betöltött és betöltetlen körzete is', 'warn'],
  vacantOnly: ['Csak betöltetlen körzet tartozik hozzá', 'bad'],
  absent: ['Egyik körzet listáján sem szerepel', 'dim'],
};
const BAND = {
  kiemelt: ['kiemelt kockázat', 'bad'],
  magas: ['magas kockázat', 'warn'],
  kozepes: ['közepes kockázat', 'mid'],
  alacsony: ['alacsony kockázat', 'ok'],
};
const LAYERS = [
  ['gp', 'Háziorvosi rendelő'],
  ['dental', 'Fogorvosi rendelő'],
  ['oncall', 'Központi ügyelet'],
  ['ambulance', 'Mentőállomás'],
  ['inpatient', 'Kórház'],
  ['outpatient', 'Járóbeteg-szakrendelés'],
  ['gyse', 'Gyógyászati segédeszköz'],
  ['pharmacy', 'Gyógyszertár'],
];

// name -> slug, so every settlement named anywhere on the page can be opened
const slugOf = new Map();
for (const p of profiles.settlements) {
  slugOf.set(`${p.settlement}|${p.county}`, p.slug);
  if (!slugOf.has(p.settlement)) slugOf.set(p.settlement, p.slug);
}
const settlementLink = (name, county, text = name) => {
  const slug = slugOf.get(`${name}|${county}`) ?? slugOf.get(name);
  return slug ? `<a href="/telepules/${esc(slug)}/">${esc(text)}</a>` : esc(text);
};

function branchCard(title, branch) {
  if (!branch) {
    return `<div class="tp-card tp-card--dim"><h3>${esc(title)}</h3>
      <p>Erről az ágról nincs adatunk erre a településre.</p></div>`;
  }
  const [label, tone] = STATE[branch.state] ?? ['–', 'dim'];
  const detail = branch.state === 'absent'
    ? 'A nyilvántartás egyetlen körzetnél sem sorolja fel ezt a települést.'
    : `${num(branch.filled)} betöltött, ${num(branch.vacant)} betöltetlen vagy megszűnt körzet szolgálja.`;
  return `<div class="tp-card tp-card--${tone}">
    <h3>${esc(title)}</h3>
    <p class="tp-card__state">${esc(label)}</p>
    <p>${esc(detail)}</p>
    ${branch.isSeat ? '<p class="tp-note">Itt van egy körzet székhelye.</p>' : ''}
  </div>`;
}

function travelRows(profile) {
  const travel = profile.travel ?? {};
  return LAYERS.map(([key, label]) => {
    const t = travel[key];
    if (!t) return '';
    const where = t.at && t.at !== profile.settlement
      ? settlementLink(t.at, profile.county) : '<em>helyben</em>';
    return `<tr><td>${esc(label)}</td><td class="is-num">${esc(minutes(t.minutes))}</td>
      <td class="is-num">${t.km === null || t.km === undefined ? '–' : `${esc(String(t.km).replace('.', ','))} km`}</td>
      <td>${where}</td></tr>`;
  }).join('\n');
}

const AGE_COLORS = { young: '#4fd6c2', working: '#6ea8ff', old: '#f0b429' };
const AGE_LABELS = { young: '0–14 éves', working: '15–64 éves', old: '65 év felett' };

/** A pie of the three age groups; no JavaScript, so the arcs are written out. */
function agePie(split, size = 118) {
  const total = split.young + split.working + split.old;
  if (!total) return '';
  const r = size / 2;
  let angle = -Math.PI / 2;
  const parts = ['young', 'working', 'old'].map((key) => {
    const from = angle;
    angle += (split[key] / total) * Math.PI * 2;
    const p = (a) => [r + r * Math.cos(a), r + r * Math.sin(a)];
    const [x1, y1] = p(from);
    const [x2, y2] = p(angle);
    const big = angle - from > Math.PI ? 1 : 0;
    return `<path d="M${r} ${r}L${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${big} 1 ${
      x2.toFixed(2)} ${y2.toFixed(2)}Z" fill="${AGE_COLORS[key]}" stroke="#0b1016"
      stroke-width="1"><title>${esc(AGE_LABELS[key])}</title></path>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"
    role="img" aria-label="Korösszetétel"><g>${parts}</g>
    <circle cx="${r}" cy="${r}" r="${(r * 0.46).toFixed(1)}" fill="#101823"/></svg>`;
}

function ageLegend(split, compare) {
  const total = split.young + split.working + split.old;
  const cTotal = compare ? compare.young + compare.working + compare.old : 0;
  return `<ul class="agelegend">${['young', 'working', 'old'].map((key) => {
    const share = total ? split[key] / total : 0;
    const diff = cTotal ? share - compare[key] / cTotal : null;
    return `<li><i style="background:${AGE_COLORS[key]}"></i>
      <span class="agelegend__label">${esc(AGE_LABELS[key])}</span>
      <strong>${esc(pct(share))}</strong>
      <span class="agelegend__count">${num(split[key])}</span>${diff === null ? '' :
  `<span class="agelegend__diff${diff > 0 ? ' is-more' : ''}">${
    diff > 0 ? '+' : '−'}${esc(pct(Math.abs(diff)))}</span>`}</li>`;
  }).join('')}</ul>`;
}

function ageBlock(profile) {
  const a = profile.age;
  if (!a || a.censusTotal === undefined) {
    return '<p class="tp-note">A népszámlálás erre a településre nem közöl korcsoportos bontást (kis lélekszámnál elhagyja).</p>';
  }
  const split = { young: a.censusYoung, working: a.censusWorking, old: a.censusOld };
  const national = profiles.national?.age;
  return `<div class="tp-ages">
    <figure class="tp-age">
      ${agePie(split)}
      <figcaption>${esc(profile.settlement)}</figcaption>
      ${ageLegend(split, national)}
    </figure>
    ${national ? `<figure class="tp-age tp-age--compare">
      ${agePie({ young: national.young, working: national.working, old: national.old })}
      <figcaption>Országos</figcaption>
      ${ageLegend(national)}
    </figure>` : ''}
  </div>
  <p class="tp-note">A százalékok a 2022-es népszámlálásból valók, a jobb oldali
    oszlop az országos aránytól való eltérés. A lakosságszám a KSH friss
    helységnévtárából jön, ezért a kettő összege nem azonos.</p>`;
}

const VACANCY_TYPE = {
  adult: 'felnőtt', child: 'gyermek', mixed: 'vegyes', school: 'iskolai',
};

function vacancyTable(profile) {
  const rows = profile.vacant ?? [];
  if (!rows.length) return '';
  return `<h3 class="tp-subhead">Betöltetlen és megszűnt körzetek, amelyek ide tartoznak</h3>
  <table class="info-table">
    <thead><tr><th>Ág</th><th>Körzet</th><th>Állapot</th><th>Mióta</th>
      <th>Székhely</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${r.kind === 'gp' ? 'háziorvosi' : 'fogorvosi'}</td>
      <td>${esc(VACANCY_TYPE[r.type] ?? r.type ?? '')}</td>
      <td>${r.status === 'dissolved' ? 'megszűnt' : (r.longTerm
    ? 'tartósan betöltetlen' : 'betöltetlen')}</td>
      <td>${esc(sinceLabel(r.since))}</td>
      <td>${r.seat && r.seat !== profile.settlement
    ? settlementLink(r.seat, profile.county) : '<em>helyben</em>'}</td>
    </tr>`).join('')}</tbody>
  </table>
  <p class="tp-note">A „mióta" a NEAK betöltetlenségi listájának kezdő hónapja.
    Betöltetlen körzetet nem nevesítünk orvossal, és a helyettesítés a nyilvános
    adatokban nem látszik.</p>`;
}

function sinceLabel(month) {
  if (!month) return '–';
  const [y, m] = month.split('-').map(Number);
  if (!y) return '–';
  const months = (year - y) * 12 + (month - m);
  const years = Math.floor(months / 12);
  const label = `${y}. ${HU_MONTHS[(m || 1) - 1]}`;
  if (years < 1) return `${label} (< 1 éve)`;
  return `${label} (${years} éve)`;
}

function changeBlock(profile) {
  const change = profile.change;
  if (!change) return '';
  const lines = [];
  for (const [kind, c] of Object.entries(change.kinds)) {
    const label = kind === 'gp' ? 'háziorvosi' : 'fogorvosi';
    const delta = c.vacantNow - c.vacant;
    if (delta === 0 && c.vacantNow === 0) continue;
    lines.push(delta === 0
      ? `<li class="tp-change tp-change--same">A ${label} ellátásban ${
        num(c.vacantNow)} betöltetlen vagy megszűnt körzet tartozik ide — egy éve ugyanennyi.</li>`
      : `<li class="tp-change tp-change--${delta > 0 ? 'bad' : 'ok'}">
        ${delta > 0 ? '▲' : '▼'} A ${label} ellátásban ${num(c.vacant)} helyett ${
  num(c.vacantNow)} betöltetlen vagy megszűnt körzet tartozik ide.</li>`);
  }
  if (change.newDoctors) {
    lines.push(`<li class="tp-change tp-change--ok">▲ ${num(change.newDoctors)} körzetben
      új orvos kezdett az elmúlt egy évben.</li>`);
  }
  if (!lines.length) {
    lines.push('<li class="tp-change tp-change--same">Az elmúlt egy évben nem változott, amit a nyilvános adatokból látunk.</li>');
  }
  return `<section class="section container">
  <h2 class="section__subheading">Mi változott egy év alatt?</h2>
  <p class="section__explain">Az összevetés alapja a ${esc(change.month)} havi
    pillanatkép a saját archívumunkból.</p>
  <ul class="tp-changes">${lines.join('')}</ul>
  <p class="tp-note">Csak azt vetjük össze, amire minden hónapra van adatunk: a
    betöltetlen és megszűnt körzeteket, illetve az orvosváltásokat. A menetidő, a
    buszelérés és a gyógyszertári hálózat visszamenőleg nem áll rendelkezésre,
    ezekre nem mondunk változást. Megyei szinten a
    <a href="/megye.html?m=${encodeURIComponent(profile.county)}#fluktuacio">fluktuáció</a>
    mutatja, mennyire cserélődnek az orvosok.</p>
</section>`;
}

function transitBlock(profile) {
  const bus = profile.transit;
  if (!bus) {
    return `<p class="tp-note">Budapest külön menetrendi adatforrásból működik, ez a rész a fővárosra nem terjed ki.</p>`;
  }
  const targets = [['gp', 'háziorvoshoz'], ['oncall', 'ügyelethez'], ['inpatient', 'kórházhoz']];
  const items = targets.map(([key, label]) => {
    const t = bus[key];
    if (!t || !t.target) return '';
    const state = t.direct
      ? `van közvetlen járat${t.minutes ? ` (${esc(minutes(t.minutes))})` : ''}`
      : 'nincs közvetlen járat, csak átszállással';
    return `<li>${esc(label)} (${esc(t.target)}): <strong>${state}</strong></li>`;
  }).join('\n');
  return `<p>Egy átlagos szerdán <strong>${num(bus.departures)}</strong> menetrend szerinti
    indulás van a településről, és közvetlenül <strong>${num(bus.reachable)}</strong>
    másik település érhető el.</p>
    <ul class="tp-list">${items}</ul>
    <p class="tp-note">Vonat nincs az adatban: a MÁV menetrendje csak regisztrációhoz kötötten
      érhető el. A „nincs közvetlen járat” nem azt jelenti, hogy nem lehet odajutni.</p>`;
}

function indexBlock(profile) {
  const index = profile.index;
  if (!index) return '';
  const [label, tone] = BAND[index.band] ?? ['–', 'dim'];
  return `<div class="tp-index tp-index--${tone}">
    <div class="tp-index__value">${esc(String(index.value).replace('.', ','))}</div>
    <div>
      <p class="tp-index__band">${esc(label)}</p>
      <p>Az ország ${num(index.of)} települése közül ${article(index.rank)}
        <strong>${num(index.rank)}.</strong> legmagasabb összetett ellátási
        kockázati indexszel.</p>
    </div>
  </div>`;
}

const TYPE_LABEL = {
  adult: 'felnőtt', child: 'gyermek', mixed: 'vegyes', school: 'iskolai',
};

/**
 * How long the physician now holding a district has held it, out of our own
 * archive. The archive is the limit of the claim, so a spell that reaches
 * its first snapshot is reported as "or longer" rather than as a date NEAK
 * never published.
 */
function tenureLabel(row) {
  if (row.months === null || row.months === undefined) return '–';
  const years = Math.floor(row.months / 12);
  if (row.fromStart) return `${Math.max(years, 1)}. éve vagy régebben`;
  if (years < 1) return '< 1 éve';
  return `${years} éve`;
}

function surgeryTable(profile, kind, heading) {
  const rows = (profile.surgeries ?? []).filter((r) => r.kind === kind);
  if (!rows.length) return '';
  return `<h3 class="tp-subhead">${esc(heading)}</h3>
  <table class="info-table">
    <thead><tr><th>Orvos</th><th>Körzet</th><th>Rendelő címe</th>
      <th>Mióta ő látja el</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${esc(r.doctor || '–')}</td>
      <td>${esc(TYPE_LABEL[r.type] ?? r.type ?? '')}</td>
      <td>${esc([r.postalCode, profile.settlement].filter(Boolean).join(' '))}${
  r.address ? `, ${esc(r.address)}` : ''}</td>
      <td>${esc(tenureLabel(r))}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function pharmacyBlock(profile) {
  const here_ = profile.pharmacies ?? [];
  const drive = profile.travel?.pharmacy;
  if (here_.length) {
    return `<table class="info-table">
    <thead><tr><th>Gyógyszertár</th><th>Cím</th></tr></thead>
    <tbody>${here_.map((ph) => `<tr>
      <td>${esc(ph.name)}</td>
      <td>${esc([ph.postalCode, profile.settlement].filter(Boolean).join(' '))}${
  ph.address ? `, ${esc(ph.address)}` : ''}</td>
    </tr>`).join('')}</tbody>
  </table>`;
  }
  if (drive && drive.at) {
    return `<p class="tp-note">A településen nincs szerződött gyógyszertár. A legközelebbi
      ${esc(drive.at)} településen van, ${esc(minutes(drive.minutes))} autóval.</p>`;
  }
  return '<p class="tp-note">A településen nincs szerződött gyógyszertár.</p>';
}

function page(profile) {
  const { settlement, county } = profile;
  // Budapest's districts are their own járás ("Budapest 03. ker."), and
  // printing "Budapest 03. ker. járás" under the heading reads like a typo
  const district = profile.district && profile.district !== settlement
    ? profile.district : '';
  const title = `${settlement} — alapellátás egy helyen`;
  const gpState = profile.gp ? (STATE[profile.gp.state] ?? [''])[0] : '';
  const drive = profile.travel?.gp;
  const desc = [
    `${settlement} (${county}${district ? `, ${district} járás` : ''}), ${num(profile.population)} lakos.`,
    gpState ? `Háziorvos: ${gpState.toLowerCase()}.` : '',
    drive ? `A legközelebbi háziorvosi rendelő ${minutes(drive.minutes)}.` : '',
    `Praxistérkép, ${monthLabel}.`,
  ].filter(Boolean).join(' ');

  const cluster = profile.cluster;

  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | Praxistérkép</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="canonical" href="/telepules/${esc(profile.slug)}/">
<link rel="stylesheet" href="/assets/${esc(cssFile)}">${streetFile ? `
<script type="module" src="/assets/${esc(streetFile)}" defer></script>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..900&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap&subset=latin-ext" rel="stylesheet">
</head>
<body>
<nav class="topnav"><div class="topnav__inner">
  <a class="topnav__brand" href="/">PRAXISTÉRKÉP</a>
  <div class="topnav__links">
    ${navBar(profile)}
  </div>
</div></nav>

<header class="section container">
  <p class="tp-kicker">${esc(county)}${district ? ` · ${esc(district)} járás` : ''} · ${num(profile.population)} lakos${profile.benefit ? ' · kedvezményezett település' : ''}</p>
  <h1 class="section__heading">${esc(settlement)}</h1>
  <p class="section__lead">Minden, amit a nyilvános adatokból tudunk erről a településről:
    van-e orvosa, milyen messze az ellátás, eljut-e oda busz, és hol áll az ország
    rangsorában.</p>
</header>

<section class="section container">
  <h2 class="section__subheading">Hol van ez?</h2>
  ${countyMap(profile, geo)}
</section>

<section class="section container">
  <h2 class="section__subheading">Kik laknak itt?</h2>
  ${ageBlock(profile)}
</section>

<section class="section container">
  <h2 class="section__subheading">Van-e orvos?</h2>
  <div class="tp-cards">
    ${branchCard('Háziorvosi ellátás', profile.gp)}
    ${branchCard('Fogorvosi ellátás', profile.dental)}
  </div>
  ${profile.vedono ? `<p class="tp-note">Védőnői szolgálat telephelye a településen:
    ${num(profile.vedono.territorial)} területi, ${num(profile.vedono.school)} iskolai.</p>` : ''}
  <p class="tp-note">A betöltetlenség nem azonos az ellátatlansággal: a helyettesítés a
    nyilvános adatokban nem látszik.</p>
  ${surgeryTable(profile, 'gp', 'Betöltött háziorvosi körzetek a településen')}
  ${surgeryTable(profile, 'dental', 'Betöltött fogorvosi körzetek a településen')}
  ${vacancyTable(profile)}
  ${(profile.surgeries ?? []).length ? `<p class="tp-note">Az orvos neve a NEAK
    szerződött szolgáltatói nyilvántartásából való, és csak betöltött körzetnél
    szerepel. A „mióta" a saját archívumunkból jön (${esc(String(archiveFrom))} óta
    őrzött havi NEAK-pillanatképek), nem NEAK által közölt kezdődátum; rendelési
    időt egyik nyilvános forrás sem közöl.</p>` : ''}
</section>

<section class="section container">
  <h2 class="section__subheading">Milyen messze?</h2>
  <p class="section__explain">Autóval, szabad forgalom mellett, az OpenStreetMap úthálózatán
    számolva — a légvonalbeli távolság mellette áll, mert a kettő nem ugyanaz.</p>
  <table class="info-table">
    <thead><tr><th>Ellátás</th><th class="is-num">Menetidő</th><th class="is-num">Légvonal</th><th>Hol</th></tr></thead>
    <tbody>${travelRows(profile)}</tbody>
  </table>
  ${profile.gyse ? `<p class="tp-note">A településen ${num(profile.gyse)} gyógyászati
    segédeszköz-kiadóhely működik.</p>` : ''}
</section>

<section class="section container">
  <h2 class="section__subheading">Gyógyszertár</h2>
  ${pharmacyBlock(profile)}
</section>

<section class="section container">
  <h2 class="section__subheading">Busszal is elérhető?</h2>
  ${transitBlock(profile)}
</section>

<section class="section container">
  <h2 class="section__subheading">Összetett ellátási kockázati index</h2>
  ${indexBlock(profile)}
  ${cluster ? `<p>Ez a település egy <strong>összefüggő ellátási hiányterület</strong> része
    (${esc(cluster.name)} környéke: ${num(cluster.settlements)} település,
    ${num(cluster.population)} lakos).</p>` : ''}
  <p class="tp-note">Az index nyolc nyilvános mutató súlyozott átlaga, országos
    rangsorszázalékokból. Összehasonlítás, nem ítélet: a magas érték azt jelenti, hogy több
    mutató mutat ugyanabba az irányba — nem azt, hogy ott nincs ellátás.
    <a href="${esc(ctx('/elemzo.html#index', profile))}">A módszer részletesen</a>.</p>
</section>

${streetBlock(profile)}

${changeBlock(profile)}

<footer class="section container tp-footer">
  <p>Adatállapot: ${esc(monthLabel)}. Források: NEAK szerződött szolgáltatók és betöltetlen
    körzetek, EESZT törzspublikáció, KSH Helységnévtár és 2022. évi népszámlálás,
    OpenStreetMap, Volánbusz menetrend. A NEAK adatai tájékoztató jellegűek.</p>
  <p><a href="${esc(ctx('/', profile))}">Vissza a térképhez</a> ·
    <a href="/telepules/">Minden település</a> ·
    <a href="${esc(ctx('/elemzo.html', profile))}">Elemző</a> ·
    <a href="/#adatok">Adat export</a></p>
</footer>
</body>
</html>
`;
}

let written = 0;
for (const profile of profiles.settlements) {
  const dir = join(dist, 'telepules', profile.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page(profile), 'utf8');
  written += 1;
}

// an index of every settlement, grouped by county — for people and crawlers
const byCounty = new Map();
for (const p of profiles.settlements) {
  if (!byCounty.has(p.county)) byCounty.set(p.county, []);
  byCounty.get(p.county).push(p);
}
const countyBlocks = [...byCounty.entries()]
  .sort((a, b) => a[0].localeCompare(b[0], 'hu'))
  .map(([county, list]) => `<section class="section container tp-index-county">
    <div class="tp-index-head">
      ${countyThumb(county, geo)}
      <div>
        <h2 class="section__subheading">${esc(county)}</h2>
        <p class="tp-note">${num(list.length)} település ·
          <a href="/megye.html?m=${encodeURIComponent(county)}">a megye adatai</a></p>
      </div>
    </div>
    <p class="tp-index-list">${list
      .sort((a, b) => a.settlement.localeCompare(b.settlement, 'hu'))
      .map((p) => `<a href="/telepules/${esc(p.slug)}/">${esc(p.settlement)}</a>`)
      .join(' · ')}</p>
  </section>`).join('\n');

writeFileSync(join(dist, 'telepules', 'index.html'), `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Települések — Praxistérkép</title>
<meta name="description" content="Mind a ${profiles.settlements.length} magyar település alapellátási adatlapja: van-e orvos, milyen messze az ellátás, eljut-e oda busz.">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/assets/${esc(cssFile)}">
</head>
<body>
<nav class="topnav"><div class="topnav__inner">
  <a class="topnav__brand" href="/">PRAXISTÉRKÉP</a>
</div></nav>
<header class="section container">
  <h1 class="section__heading">Települések</h1>
  <p class="section__lead">Mind a ${profiles.settlements.length} település adatlapja, megyénként.</p>
</header>
${countyBlocks}
</body>
</html>
`, 'utf8');

// a sitemap, so the pages are findable at all
const urls = ['/', '/elemzo.html', '/eeszt.html', '/szakellato.html', '/telepules/']
  .concat(profiles.settlements.map((p) => `/telepules/${p.slug}/`));
writeFileSync(join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + urls.map((u) => `<url><loc>https://oep-ellatas.vercel.app${u}</loc></url>`).join('\n')
  + '\n</urlset>\n', 'utf8');

console.log(`settlement pages generated: ${written} + index + sitemap (${urls.length} urls)`);
