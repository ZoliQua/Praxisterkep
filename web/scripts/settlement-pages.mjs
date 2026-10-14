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
import { loadEnv } from 'vite';
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
  jaras: readGeo('jaras.geojson'),
  byKsh: new Map(),
  byName: new Map(),
};
// which county a town belongs to, so a map labels its own towns and not
// whichever neighbour happens to fall inside the frame
geo.countyOfTown = new Map(
  geo.settlements.features.map((f) => [f.properties.name, f.properties.county]),
);
// which county a járás belongs to, so a map draws its own and not the
// neighbours' lines
// a map label that names another settlement is a way to its page
geo.linkOf = (name, county) => {
  const slug = slugOf.get(`${name}|${county}`) ?? slugOf.get(name);
  return slug ? `/telepules/${slug}/` : '';
};
geo.countyOfJaras = new Map(
  geo.settlements.features.map((f) => [f.properties.district, f.properties.county]),
);
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
const env = loadEnv('production', join(here, '..'), 'VITE_');
const streetFile = env.VITE_MAP_STYLE
  ? readdirSync(join(dist, 'assets')).find((f) => /^streetmap-.*\.js$/.test(f))
  : null;

const STREET_LABELS = {
  gp: 'Háziorvosi rendelő', dental: 'Fogorvosi rendelő', pharmacy: 'Gyógyszertár',
  oncall: 'Központi ügyelet', ambulance: 'Mentőállomás', inpatient: 'Kórház',
  outpatient: 'Járóbeteg-szakrendelés', gyse: 'Gyógyászati segédeszköz',
  transport: 'Betegszállítás', dialysis: 'Művese',
};
const STREET_COLORS = {
  gp: '#4fd6c2', dental: '#8ab4ff', pharmacy: '#c88ff0', oncall: '#f0b429',
  ambulance: '#ef8354', inpatient: '#ef6461', outpatient: '#9bd4a5',
  gyse: '#b8a4ff', transport: '#7dd3fc', dialysis: '#f0abfc',
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

function streetBlock(profile, opts = {}) {
  if (!streetFile) return '';
  const all = streetPoints(profile);
  const points = opts.only ? all.filter((p) => opts.only.includes(p.kind)) : all;
  if (!points.length) return '';
  const kinds = [...new Set(points.map((p) => p.kind))];
  // the pharmacy section embeds the same machinery with one layer only
  const wrap = opts.id
    ? (inner) => `<div class="tp-streetwrap">${inner}</div>`
    : (inner) => `<section class="section container" id="elerhetoseg">
  <h2 class="section__subheading">Utcaszinten</h2>
  <p class="section__explain">Hol állnak pontosan: a betöltött rendelők az orvos
    nevével, a gyógyszertárak, és ami még a településen van. A térkép csak
    kattintásra töltődik be, hogy a lap addig is azonnal olvasható maradjon.</p>
  ${inner}</section>`;
  return wrap(`
  <div class="tp-street" data-streetmap>
    <button type="button" class="data-btn data-btn--accent"
      data-loading="Térkép betöltése…" data-failed="A térkép nem töltődött be">
      ${opts.only ? 'Térkép megnyitása' : 'Utcaszintű térkép'} (${num(points.length)} pont)
    </button>
    <p class="tp-maplegend">${kinds.map((k) =>
    `<span><i class="street-pin" style="background:${
      STREET_COLORS[k] ?? '#94a3b8'}"></i>${
    esc(STREET_LABELS[k] ?? k)}</span>`).join('')}</p>
    <div class="tp-street__map" hidden></div>
    <script type="application/json">${
  JSON.stringify(points).replace(/</g, '\\u003c')}</script>
  </div>
  <p class="tp-note">${opts.lead ? `${esc(opts.lead)} ` : ''}A pontok geokódolt címek
    (Nominatim/OpenStreetMap), nem helyszíni felmérés: ahol a cím pontatlan, a
    jelölő a település közepére esik, és ezt a buborék ki is írja. Térkép:
    <a href="https://www.maptiler.com/copyright/" rel="noopener">© MapTiler</a>,
    adat: <a href="https://www.openstreetmap.org/copyright" rel="noopener">©
    OpenStreetMap közreműködők</a>.</p>`);
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
  // the index page has no settlement of its own: its links carry no context
  // rather than someone else's
  if (!profile) return href;
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

/**
 * The age charts, interactive without a line of JavaScript.
 *
 * These pages carry no script, and that is the point of them — they have to
 * work with the network off. So the pointer work is done in CSS: hovering a
 * slice (or a dot, or a bar) reveals its own readout through :has(), and
 * clicking one pins it through :target, because an anchor is a click a static
 * page can hear. Nothing moves that a reader did not ask to move.
 */
function agePie(split, size = 132, prefix = 'kor') {
  const total = split.young + split.working + split.old;
  if (!total) return '';
  const r = size / 2;
  const keys = ['young', 'working', 'old'];
  const shares = keys.map((k) => split[k] / total);
  const starts = shares.reduce((acc, share, i) => [...acc, acc[i] + share * Math.PI * 2],
    [-Math.PI / 2]);
  const wedge = (key, i) => {
    const from = starts[i];
    const to = starts[i + 1];
    const p = (a) => [r + r * Math.cos(a), r + r * Math.sin(a)];
    const [x1, y1] = p(from);
    const [x2, y2] = p(to);
    const big = to - from > Math.PI ? 1 : 0;
    return `<a href="#${prefix}-${key}" class="agepie__slice agepie__slice--${key}">
      <path d="M${r} ${r}L${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${big} 1 ${
  x2.toFixed(2)} ${y2.toFixed(2)}Z" fill="${AGE_COLORS[key]}" stroke="#0b1016"
        stroke-width="1"><title>${esc(AGE_LABELS[key])}: ${num(split[key])} (${
  pct(shares[i])})</title></path></a>`;
  };
  const readouts = keys.map((key, i) => `<g id="${prefix}-${key}"
    class="agepie__readout agepie__readout--${key}">
    <text x="${r}" y="${r - 2}" text-anchor="middle" font-size="15"
      font-weight="700" fill="${AGE_COLORS[key]}">${esc(pct(shares[i]))}</text>
    <text x="${r}" y="${r + 14}" text-anchor="middle" font-size="10"
      fill="#94a3b8">${num(split[key])} fő</text>
  </g>`).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"
    role="img" aria-label="Korösszetétel" class="agepie">
    <g class="agepie__wedges">${keys.map(wedge).join('')}</g>
    <circle cx="${r}" cy="${r}" r="${(r * 0.46).toFixed(1)}" fill="#101823"/>
    ${readouts}
    <text class="agepie__hint" x="${r}" y="${r + 4}" text-anchor="middle"
      font-size="9.5" fill="#64748b">vidd rá</text>
  </svg>`;
}

/**
 * A hundred residents as a hundred dots. The pie says the proportion; this
 * says what the proportion is made of, which is the thing people can picture.
 */
function hundredDots(split, prefix = 'kor') {
  const total = split.young + split.working + split.old;
  if (!total) return '';
  const keys = ['young', 'working', 'old'];
  const counts = keys.map((k) => Math.round((split[k] / total) * 100));
  // rounding must still leave a hundred dots
  const drift = 100 - counts.reduce((a, b) => a + b, 0);
  counts[1] += drift;
  const dots = keys.flatMap((key, i) => Array.from({ length: Math.max(counts[i], 0) },
    () => key));
  const cols = 20;
  const r = 5;
  const gap = 3.4;
  const w = cols * (r * 2 + gap);
  const rows = Math.ceil(dots.length / cols);
  const h = rows * (r * 2 + gap);
  return `<svg class="hundred" viewBox="0 0 ${w} ${h}" width="100%" height="auto"
    role="img" aria-label="Száz lakosból hány esik az egyes korcsoportokba">
    ${dots.map((key, i) => {
    const x = (i % cols) * (r * 2 + gap) + r;
    const y = Math.floor(i / cols) * (r * 2 + gap) + r;
    return `<a href="#${prefix}-${key}"><circle class="hundred__dot hundred__dot--${key}"
      cx="${x}" cy="${y}" r="${r}" fill="${AGE_COLORS[key]}"><title>${
  esc(AGE_LABELS[key])}</title></circle></a>`;
  }).join('')}
  </svg>
  <p class="tp-note">Száz lakosból ennyi esik az egyes korcsoportokba. Vidd rá az
    egeret vagy kattints rá: a kördiagram közepén kiírja a pontos számot.</p>`;
}

/** The settlement against the country, as two bars per age group. */
function compareBars(split, national) {
  if (!national) return '';
  const total = split.young + split.working + split.old;
  const nTotal = national.young + national.working + national.old;
  if (!total || !nTotal) return '';
  const keys = ['young', 'working', 'old'];
  const max = Math.max(...keys.flatMap((k) => [split[k] / total, national[k] / nTotal]));
  return `<div class="comparebars">${keys.map((key) => {
    const here = split[key] / total;
    const there = national[key] / nTotal;
    const diff = here - there;
    return `<div class="comparebar">
      <span class="comparebar__label">${esc(AGE_LABELS[key])}</span>
      <span class="comparebar__track">
        <span class="comparebar__fill" style="width:${(here / max * 100).toFixed(1)}%;
          background:${AGE_COLORS[key]}"></span>
        <span class="comparebar__national" style="left:${(there / max * 100).toFixed(1)}%"
          title="országos: ${esc(pct(there))}"></span>
      </span>
      <span class="comparebar__value">${esc(pct(here))}
        <em class="${diff > 0 ? 'is-more' : ''}">${diff > 0 ? '+' : '−'}${
  esc(pct(Math.abs(diff)))}</em></span>
    </div>`;
  }).join('')}
  <p class="tp-note">A sötét vonal az országos arány — ahol a sáv túlnyúlik rajta,
    ott a településen több.</p></div>`;
}

function ageLegend(split, compare, prefix = 'kor') {
  const total = split.young + split.working + split.old;
  const cTotal = compare ? compare.young + compare.working + compare.old : 0;
  return `<ul class="agelegend">${['young', 'working', 'old'].map((key) => {
    const share = total ? split[key] / total : 0;
    const diff = cTotal ? share - compare[key] / cTotal : null;
    return `<li class="agelegend__row agelegend__row--${key}">
      <a href="#${prefix}-${key}">
        <i style="background:${AGE_COLORS[key]}"></i>
        <span class="agelegend__label">${esc(AGE_LABELS[key])}</span>
        <strong>${esc(pct(share))}</strong>
        <span class="agelegend__count">${num(split[key])}</span>${diff === null ? '' :
  `<span class="agelegend__diff${diff > 0 ? ' is-more' : ''}">${
    diff > 0 ? '+' : '−'}${esc(pct(Math.abs(diff)))}</span>`}
      </a></li>`;
  }).join('')}</ul>`;
}

/**
 * A population pyramid: three bands, men left, women right.
 *
 * The census answers by sex and we were only ever adding the two halves up.
 * The halves are the interesting part — a village with twice as many women
 * over 65 as men is a different place from one with an even split.
 */
function pyramid(bySex, { width = 300, band = 26, gap = 4 } = {}) {
  const rows = ['old', 'working', 'young'];
  const max = Math.max(...rows.flatMap((k) => [
    (bySex[k] || {}).male || 0, (bySex[k] || {}).female || 0]), 1);
  const half = (width - 86) / 2;
  const height = rows.length * (band + gap);
  const bars = rows.map((key, i) => {
    const y = i * (band + gap);
    const m = (bySex[key] || {}).male || 0;
    const f = (bySex[key] || {}).female || 0;
    const mw = (m / max) * half;
    const fw = (f / max) * half;
    const sum = m + f;
    return `<a href="#kor-${key}" class="pyramid__row">
      <rect x="${(half - mw).toFixed(1)}" y="${y}" width="${mw.toFixed(1)}"
        height="${band}" fill="#6ea8ff" rx="2"><title>${esc(AGE_LABELS[key])} · férfi: ${
  num(m)} (${pct(sum ? m / sum : 0)} a korcsoporton belül)</title></rect>
      <rect x="${half + 86}" y="${y}" width="${fw.toFixed(1)}" height="${band}"
        fill="#f0abfc" rx="2"><title>${esc(AGE_LABELS[key])} · nő: ${num(f)} (${
  pct(sum ? f / sum : 0)} a korcsoporton belül)</title></rect>
      <text x="${half + 43}" y="${y + band / 2 + 4}" text-anchor="middle"
        font-size="11" fill="#94a3b8">${esc(AGE_LABELS[key])}</text>
      <text x="${(half - mw - 6).toFixed(1)}" y="${y + band / 2 + 4}" text-anchor="end"
        font-size="11" fill="#cbd5e1">${num(m)}</text>
      <text x="${(half + 86 + fw + 6).toFixed(1)}" y="${y + band / 2 + 4}"
        font-size="11" fill="#cbd5e1">${num(f)}</text>
    </a>`;
  }).join('');
  return `<svg class="tp-pyramid" viewBox="0 0 ${width} ${height}" width="100%"
    height="auto" role="img" aria-label="Korfa nemek szerint">${bars}</svg>`;
}

function ageBlock(profile) {
  const a = profile.age;
  if (!a || a.censusTotal === undefined) {
    return '<p class="tp-note">A népszámlálás erre a településre nem közöl korcsoportos bontást (kis lélekszámnál elhagyja).</p>';
  }
  const split = { young: a.censusYoung, working: a.censusWorking, old: a.censusOld };
  const national = profiles.national?.age;
  const total = a.censusTotal;
  // the standard KSH ratios: how many dependants per hundred of working age
  const youthRatio = a.censusWorking ? (a.censusYoung / a.censusWorking) * 100 : null;
  const oldRatio = a.censusWorking ? (a.censusOld / a.censusWorking) * 100 : null;
  const nationalOldRatio = national && national.working
    ? (national.old / national.working) * 100 : null;
  const ageingIndex = a.censusYoung ? (a.censusOld / a.censusYoung) * 100 : null;
  const femaleShare = a.female && total ? a.female / total : null;

  const figures = [
    oldRatio === null ? null : {
      value: `${Math.round(oldRatio)}`, per: '/ 100 munkaképes korú',
      label: 'idős (65 év felett)',
      note: nationalOldRatio === null ? '' :
        `országosan ${Math.round(nationalOldRatio)}`,
    },
    youthRatio === null ? null : {
      value: `${Math.round(youthRatio)}`, per: '/ 100 munkaképes korú',
      label: 'gyermek (0–14 éves)', note: '',
    },
    ageingIndex === null ? null : {
      value: `${Math.round(ageingIndex)}`, per: '/ 100 gyermek',
      label: 'idős — öregedési index',
      note: ageingIndex > 100 ? 'több az idős, mint a gyermek' : 'több a gyermek, mint az idős',
    },
    femaleShare === null ? null : {
      value: pct(femaleShare), per: '', label: 'a lakosság nő',
      note: a.male && a.female ? `${num(a.male)} férfi · ${num(a.female)} nő` : '',
    },
  ].filter(Boolean);

  return `<div class="tp-ages">
    <figure class="tp-age">
      ${agePie(split, 132)}
      <figcaption>${esc(profile.settlement)} korcsoportjai</figcaption>
      ${ageLegend(split, national)}
    </figure>
    ${a.bySex ? `<figure class="tp-age tp-age--pyramid">
      ${pyramid(a.bySex)}
      <figcaption>Korfa: férfiak és nők</figcaption>
      <p class="tp-note">A sávok hossza az adott település legnépesebb
        csoportjához van mérve.</p>
    </figure>` : ''}
  </div>
  <div class="tp-ages">
    <figure class="tp-age tp-age--hundred">
      <figcaption>Száz lakosból</figcaption>
      ${hundredDots(split)}
    </figure>
    <figure class="tp-age tp-age--compare">
      <figcaption>Az országos arányhoz képest</figcaption>
      ${compareBars(split, national)}
    </figure>
  </div>
  <div class="tp-figures">${figures.map((f) => `<div class="tp-figure">
    ${f.per ? '<span class="tp-figure__ghost" aria-hidden="true">/100</span>' : ''}
    <span class="tp-figure__value">${esc(f.value)}</span>
    <span class="tp-figure__label">${esc(f.label)}${f.per
    ? ` <em>${esc(f.per)}</em>` : ''}</span>
    ${f.note ? `<span class="tp-figure__note">${esc(f.note)}</span>` : ''}
  </div>`).join('')}</div>
  <p class="tp-note">Forrás: KSH, 2022. évi népszámlálás (CC BY 4.0). A fenti
    arányok a népszámlálás ${num(total)} fős népességére vonatkoznak; a lap
    tetején szereplő ${num(profile.population)} fő a KSH friss
    helységnévtárából való, ezért a kettő nem azonos.</p>`;
}

const VACANCY_TYPE = {
  adult: 'felnőtt', child: 'gyermek', mixed: 'vegyes', school: 'iskolai',
};

/**
 * The nine-digit NEAK code of a district, as a cell.
 *
 * It is the canonical key of a praxis: the one identifier that survives a
 * change of doctor, of provider and of address, and the one to quote in a
 * letter to NEAK or an authority. Every table that names a district carries
 * it now, in a monospaced column that reads as an identifier rather than a
 * number to be compared.
 */
function finCell(fin) {
  return fin ? `<td class="tp-fin">${esc(fin)}</td>` : '<td class="tp-fin">–</td>';
}

function vacancyTable(profile) {
  const rows = profile.vacant ?? [];
  if (!rows.length) return '';
  return `<details class="tp-details tp-details--vacant" open>
  <summary>
    <svg class="tp-details__ghost" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17h.01"/></svg>
    <span class="tp-details__title">Betöltetlen és megszűnt körzetek, amelyek ide tartoznak</span>
    <span class="tp-details__count">${num(rows.length)}</span>
  </summary>
  <table class="info-table">
    <thead><tr><th>NEAK kód</th><th>Ág</th><th>Körzet</th><th>Állapot</th><th>Mióta</th>
      <th>Székhely</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      ${finCell(r.fin)}
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
    adatokban nem látszik.</p>
  </details>`;
}

function sinceLabel(value) {
  // the parameter used to be called `month`, which shadowed the data month
  // this function subtracts from — every duration came out as NaN
  if (!value) return '–';
  const [y, m] = value.split('-').map(Number);
  if (!y) return '–';
  const months = (year - y) * 12 + (month - m);
  const years = Math.floor(months / 12);
  const label = `${y}. ${HU_MONTHS[(m || 1) - 1]}`;
  if (years < 1) return `${label} (< 1 éve)`;
  return `${label} (${years} éve)`;
}

/**
 * The health visitors' services, with their premises.
 *
 * Not their names: no public register carries them. The NEAK registry names
 * a contracted physician, and that is the only name this site shows; the
 * health-visitor branch is published as services and providers only.
 */
function vedonoBlock(profile) {
  const v = profile.vedono;
  // the index carries a row for settlements with none at all; a heading that
  // says "0 and 0" is worse than no heading
  if (!v || (!v.territorial && !v.school && !(v.sites ?? []).length)) return '';
  const sites = v.sites ?? [];
  const seen = new Map();
  for (const site of sites) {
    const key = `${site.postalCode} ${site.address}`;
    if (!seen.has(key)) seen.set(key, { ...site, count: 0 });
    seen.get(key).count += 1;
  }
  const rows = [...seen.values()];
  return `<details class="tp-details tp-details--vedono" open>
  <summary>
    <svg class="tp-details__ghost" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="7" r="3.2"/><path d="M5 20c.6-3.6 3.4-5.6 7-5.6s6.4 2 7 5.6"/>
      <path d="M16.5 10.5c1.6.6 2.6 1.8 3 3.5"/></svg>
    <span class="tp-details__title">Védőnői szolgálat</span>
    <span class="tp-details__count">${num(v.territorial + v.school)}</span>
    <span class="tp-details__preview">${num(v.territorial)} területi · ${
  num(v.school)} iskolai</span>
  </summary>
  ${rows.length ? `<table class="info-table">
    <thead><tr><th>Cím</th><th>Fenntartó</th><th class="is-num">Szolgálat</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${esc([r.postalCode, profile.settlement].filter(Boolean).join(' '))}${
  r.address ? `, ${esc(r.address)}` : ''}</td>
      <td>${esc(r.provider || '–')}</td>
      <td class="is-num">${num(r.count)}</td>
    </tr>`).join('')}</tbody>
  </table>` : ''}
  <p class="tp-note">A védőnő nevét egyetlen nyilvános nyilvántartás sem közli —
    a szolgálat és a fenntartó igen, a személy nem. (Orvosnevet is csak betöltött
    körzetnél, a NEAK saját közzétételéből mutatunk.)</p>
  </details>`;
}

/**
 * Which dental district serves a settlement that is not a district seat.
 *
 * NEAK does not publish it. The GP registry names every settlement a district
 * serves; the dental registry names only the seat, so for two thirds of the
 * country the official answer is not in any public file. What can be said
 * honestly is what is nearby — and that is what this says, in those words.
 */
function dentalCatchment(profile) {
  if ((profile.dental || {}).state !== 'absent') return '';
  const drive = profile.travel?.dental;
  return `<h3 class="tp-subhead">Melyik fogászati körzethez tartozik?</h3>
  <p class="section__explain">Ezt a települést egyetlen fogászati körzet listája sem
    nevezi meg. Nem azért, mert nincs ellátása, hanem mert a <strong>NEAK a fogászatnál
    csak a körzet székhelyét közli</strong>, a hozzá tartozó településeket nem — a
    háziorvosi nyilvántartásban ez szerepel, a fogászatiban nem. A tényleges
    körzethatárt önkormányzati rendelet mondja ki, ami nincs központi, gépi
    feldolgozásra alkalmas formában közzétéve.</p>
  ${drive ? `<p>A legközelebbi fogorvosi rendelő
    <strong>${settlementLink(drive.at, profile.county)}</strong> településen van,
    ${esc(minutes(drive.minutes))} autóval. Ez a legközelebbi, nem feltétlenül az,
    amelyikhez a település hivatalosan tartozik.</p>` : ''}`;
}

function changeBlock(profile) {
  const change = profile.change;
  if (!change) return '';
  const lines = [];
  const details = [];
  for (const [kind, c] of Object.entries(change.kinds)) {
    const label = kind === 'gp' ? 'háziorvosi' : 'fogorvosi';
    const delta = c.vacantNow - c.vacant;
    if (delta !== 0 || c.vacantNow) {
      lines.push(delta === 0
        ? `<li class="tp-change tp-change--same">A ${label} ellátásban ${
          num(c.vacantNow)} betöltetlen vagy megszűnt körzet tartozik ide — egy éve ugyanennyi.</li>`
        : `<li class="tp-change tp-change--${delta > 0 ? 'bad' : 'ok'}">
          ${delta > 0 ? '▲' : '▼'} A ${label} ellátásban ${num(c.vacant)} helyett ${
  num(c.vacantNow)} betöltetlen vagy megszűnt körzet tartozik ide.</li>`);
    }
    // the districts themselves, where the current snapshot can corroborate it
    for (const row of c.newlyVacant ?? []) {
      details.push({ kind: label, state: 'bad',
        what: `${VACANCY_TYPE[row.type] ?? row.type} körzet`,
        who: `${row.seat && row.seat !== profile.settlement ? `${row.seat} székhellyel` : 'helyben'}`,
        when: row.since, fin: row.fin,
        verb: row.status === 'dissolved' ? 'megszűnt' : 'betöltetlenné vált' });
    }
    for (const row of c.resolved ?? []) {
      details.push({ kind: label, state: 'ok',
        what: `${VACANCY_TYPE[row.type] ?? row.type} körzet`,
        who: row.doctor || '', when: '', fin: row.fin, verb: 'betöltődött' });
    }
  }
  for (const a of change.arrivals ?? []) {
    // the same district often shows up twice: it left the vacancy list and a
    // physician started in it. One row, with the date the other one lacks.
    const already = details.find((d) => d.fin === a.fin);
    if (already) {
      already.when = already.when || a.since;
      already.who = already.who || a.doctor;
      continue;
    }
    details.push({ kind: a.kind === 'gp' ? 'háziorvosi' : 'fogorvosi', state: 'ok',
      what: `${VACANCY_TYPE[a.type] ?? a.type} körzet`, who: a.doctor,
      when: a.since, fin: a.fin, verb: 'új orvost kapott' });
  }
  if (change.newDoctors) {
    lines.push(`<li class="tp-change tp-change--ok">▲ ${num(change.newDoctors)} körzetben
      új orvos kezdett az elmúlt egy évben.</li>`);
  }
  if (!lines.length) {
    lines.push('<li class="tp-change tp-change--same">Az elmúlt egy évben nem változott, amit a nyilvános adatokból látunk.</li>');
  }
  return `<section class="section container" id="valtozas">
  <h2 class="section__subheading">Mi változott egy év alatt?</h2>
  <p class="section__explain">Az összevetés alapja a ${esc(change.month)} havi
    pillanatkép a saját archívumunkból.</p>
  <ul class="tp-changes">${lines.join('')}</ul>
  ${details.length ? `<details class="tp-details tp-details--change">
    <summary>
      <svg class="tp-details__ghost" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 17h6l4-10 3 6h3"/></svg>
      <span class="tp-details__title">Melyik körzettel mi történt</span>
      <span class="tp-details__count">${num(details.length)}</span>
    </summary>
    <table class="info-table">
      <thead><tr><th>NEAK kód</th><th>Ág</th><th>Körzet</th><th>Mi történt</th>
        <th>Ki / hol</th><th>Mikortól</th></tr></thead>
      <tbody>${details.map((d) => `<tr class="tp-row--${d.state}">
        ${finCell(d.fin)}
        <td>${esc(d.kind)}</td>
        <td>${esc(d.what)}</td>
        <td>${esc(d.verb)}</td>
        <td>${esc(d.who || '–')}</td>
        <td>${esc(d.when ? sinceLabel(d.when) : '–')}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="tp-note">Csak azok a változások szerepelnek, amiket a mai pillanatkép
      meg is erősít: egy körzet akkor „betöltetlenné vált”, ha a betöltetlensége az
      elmúlt egy évben kezdődött, és akkor „betöltődött”, ha ma orvos rendel benne.
      Az archívum egyenetlensége így nem jelenik meg változásnak.</p>
  </details>` : ''}
  <p class="tp-note">Csak azt vetjük össze, amire minden hónapra van adatunk: a
    betöltetlen és megszűnt körzeteket, illetve az orvosváltásokat. A menetidő, a
    buszelérés és a gyógyszertári hálózat visszamenőleg nem áll rendelkezésre,
    ezekre nem mondunk változást. Megyei szinten a
    <a href="${esc(ctx(`/megye.html?m=${encodeURIComponent(profile.county)}#fluktuacio`, profile))}">fluktuáció</a>
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

const BRANCH_GHOST = {
  gp: '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v2.5a4.5 4.5 0 0 0 9 0V12"/><circle cx="19" cy="10" r="2"/>',
  dental: '<path d="M7.5 3.5c-2 0-3.5 1.8-3.5 4.2 0 3 1 4.6 1.6 7.2.5 2.2.8 5.1 2.4 5.1 1.5 0 1.6-3.4 2.4-5.3.3-.8.8-1.2 1.6-1.2s1.3.4 1.6 1.2c.8 1.9.9 5.3 2.4 5.3 1.6 0 1.9-2.9 2.4-5.1.6-2.6 1.6-4.2 1.6-7.2 0-2.4-1.5-4.2-3.5-4.2-1.6 0-2.7.8-4.5.8s-2.9-.8-4.5-.8Z"/>',
};

const TYPE_ORDER = { adult: 0, child: 1, mixed: 2, school: 3 };

/** The address of a surgery, as one string. */
function siteOf(profile, row) {
  return [row.postalCode, profile.settlement].filter(Boolean).join(' ')
    + (row.address ? `, ${row.address}` : '');
}

/**
 * The doctors of one branch: sortable by every column, and groupable by
 * surgery or by physician — all of it in HTML and CSS.
 *
 * Why it matters: a list sorted by name hides the two things worth seeing.
 * Several doctors often share one surgery (they take turns in the same
 * rooms), and one doctor often holds several districts or works at more than
 * one address. Grouping says which, and the list says it in a line.
 *
 * How it works without a script: every row carries its rank for each column
 * in a custom property, the radio buttons decide which rank `order` reads,
 * and the grouped views are rendered beside the list and swapped by the same
 * radios. The column headings are labels for the sort radios, so clicking a
 * heading sorts, the way a table should.
 */
function doctorTable(profile, kind, heading) {
  const rows = (profile.surgeries ?? []).filter((r) => r.kind === kind);
  if (!rows.length) return '';
  const id = `${kind}-${profile.slug}`;
  const names = rows.map((r) => r.doctor).filter(Boolean);

  // the registry writes the same address in several spellings ("Huszár ltp."
  // and "Huszár Ltp."), so grouping goes by a folded key, display by the
  // first spelling seen
  const withSite = rows.map((r) => {
    const site = siteOf(profile, r);
    return { ...r, site, siteKey: site.toLowerCase().replace(/\s+/g, ' ').trim() };
  });
  const rank = (list, key) => {
    const sorted = [...list].map((r, i) => ({ r, i }))
      .sort((a, b) => key(a.r, b.r) || a.i - b.i);
    const out = new Map();
    sorted.forEach(({ r }, i) => out.set(r, i + 1));
    return out;
  };
  const byDoctor = rank(withSite, (a, b) => (a.doctor || '').localeCompare(b.doctor || '', 'hu'));
  const byType = rank(withSite, (a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));
  const bySite = rank(withSite, (a, b) => a.siteKey.localeCompare(b.siteKey, 'hu'));
  const byFin = rank(withSite, (a, b) => (a.fin || '').localeCompare(b.fin || ''));
  const byTenure = rank(withSite, (a, b) => {
    // longest first: a spell that reaches the edge of the archive leads
    if (a.fromStart !== b.fromStart) return a.fromStart ? -1 : 1;
    return (b.months ?? 0) - (a.months ?? 0);
  });

  // the two facts a flat list hides
  const perSite = new Map();
  const perDoctor = new Map();
  const siteLabel = new Map();
  for (const r of withSite) {
    perSite.set(r.siteKey, [...(perSite.get(r.siteKey) ?? []), r]);
    if (!siteLabel.has(r.siteKey)) siteLabel.set(r.siteKey, r.site);
    const key = r.doctor || '—';
    perDoctor.set(key, [...(perDoctor.get(key) ?? []), r]);
  }
  const sharedSites = [...perSite.values()].filter((l) => l.length > 1).length;
  const busyDoctors = [...perDoctor.values()].filter((l) => l.length > 1).length;

  const listRow = (r) => `<div class="dt-row" role="row" style="
      --o-doctor:${byDoctor.get(r)}; --o-type:${byType.get(r)};
      --o-site:${bySite.get(r)}; --o-tenure:${byTenure.get(r)};
      --o-fin:${byFin.get(r)}">
    <span class="dt-cell dt-cell--fin" role="cell">${esc(r.fin || '–')}</span>
    <span class="dt-cell dt-cell--doctor" role="cell">${esc(r.doctor || '–')}${
  (perDoctor.get(r.doctor || '—') ?? []).length > 1
    ? '<i class="dt-flag" title="Több körzetben vagy telephelyen rendel">⧉</i>' : ''}</span>
    <span class="dt-cell" role="cell">${esc(VACANCY_TYPE[r.type] ?? r.type ?? '')}</span>
    <span class="dt-cell" role="cell">${esc(r.site)}${
  (perSite.get(r.siteKey) ?? []).length > 1
    ? '<i class="dt-flag" title="Több orvos rendel ezen a címen">⧉</i>' : ''}</span>
    <span class="dt-cell dt-cell--since" role="cell">${esc(tenureLabel(r))}</span>
  </div>`;

  const groupBlock = (entries, title) => entries.map(([key, list]) => `
    <div class="dt-group">
      <p class="dt-group__head"><strong>${esc(key)}</strong>
        <span>${num(list.length)} ${esc(title)}</span></p>
      ${list.map((r) => `<div class="dt-row dt-row--grouped" role="row">
        <span class="dt-cell dt-cell--fin" role="cell">${esc(r.fin || '–')}</span>
        <span class="dt-cell dt-cell--doctor" role="cell">${esc(r.doctor || '–')}</span>
        <span class="dt-cell" role="cell">${esc(VACANCY_TYPE[r.type] ?? r.type ?? '')}</span>
        <span class="dt-cell" role="cell">${esc(r.site)}</span>
        <span class="dt-cell dt-cell--since" role="cell">${esc(tenureLabel(r))}</span>
      </div>`).join('')}
    </div>`).join('');

  const byName = (list) => [...list]
    .sort((a, b) => (a.doctor || '').localeCompare(b.doctor || '', 'hu'));
  const siteGroups = [...perSite.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'hu'))
    .map(([key, list]) => [siteLabel.get(key) ?? key, byName(list)]);
  const doctorGroups = [...perDoctor.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'hu'))
    .map(([key, list]) => [key, byName(list)]);

  const sortOptions = [
    ['fin', 'NEAK kód'], ['doctor', 'Orvos'], ['type', 'Körzet'],
    ['site', 'Rendelő címe'], ['tenure', 'Mióta'],
  ];

  return `<details class="tp-details tp-details--${kind}">
  <summary>
    <svg class="tp-details__ghost" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">${BRANCH_GHOST[kind] ?? ''}</svg>
    <span class="dt-details__title tp-details__title">${esc(heading)}</span>
    <span class="tp-details__count">${num(rows.length)}</span>
    <span class="tp-details__preview">${esc(names.slice(0, 3).join(' · '))}${
  names.length > 3 ? ` · +${num(names.length - 3)}` : ''}</span>
  </summary>

  <div class="dt" role="table">
    <div class="dt-controls">
      <span class="dt-controls__label">Csoportosítás:</span>
      ${[['list', 'Lista'], ['site', 'Telephely szerint'], ['doctor', 'Orvos szerint']]
    .map(([key, label], i) => `<input type="radio" name="g-${id}" id="g-${id}-${key}"
        class="dt-radio dt-radio--group" data-group="${key}"${i === 0 ? ' checked' : ''}>
      <label for="g-${id}-${key}" class="dt-chip">${esc(label)}</label>`).join('')}
      ${sortOptions.map(([key]) => `<input type="radio" name="s-${id}"
        id="s-${id}-${key}" class="dt-radio dt-radio--sort" data-sort="${key}"${
  key === 'doctor' ? ' checked' : ''}>`).join('')}
    </div>

    ${sharedSites || busyDoctors ? `<p class="dt-hint">${[
    sharedSites ? `${num(sharedSites)} címen több orvos is rendel` : '',
    busyDoctors ? `${num(busyDoctors)} orvos több körzetben vagy telephelyen dolgozik` : '',
  ].filter(Boolean).join(' · ')} — a ⧉ jelöli őket, a csoportosítás megmutatja.</p>` : ''}

    <div class="dt-list">
      <div class="dt-row dt-row--head" role="row">
        ${sortOptions.map(([key, label]) => `<label class="dt-cell dt-sort"
          for="s-${id}-${key}" data-for="${key}">${esc(label)}</label>`).join('')}
      </div>
      ${withSite.map(listRow).join('')}
    </div>

    <div class="dt-grouped dt-grouped--site">
      ${groupBlock(siteGroups, 'orvos')}
    </div>
    <div class="dt-grouped dt-grouped--doctor">
      ${groupBlock(doctorGroups, 'körzet')}
    </div>
  </div>
  </details>`;
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


/**
 * The rail down the left: where you are on the page, and the whole page at a
 * glance. It is a list of anchors — the browser's own scrolling does the
 * work, and :target marks the one that was clicked. On a phone it lies down
 * across the top instead, because a rail would eat a third of the screen.
 */
const SECTIONS = [
  ['elhelyezkedes', 'Elhelyezkedés', 'map'],
  ['lakossag', 'Lakosság', 'people'],
  ['elerhetoseg', 'Elérhetőség', 'pin'],
  ['orvosok', 'Orvosok', 'doctor'],
  ['tavolsag', 'Távolság', 'road'],
  ['gyogyszertar', 'Gyógyszertár', 'pill'],
  ['kozlekedes', 'Közlekedés', 'bus'],
  ['kockazat', 'Kockázati index', 'gauge'],
  ['valtozas', 'Változás', 'delta'],
];

const RAIL_ICONS = {
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z"/><path d="M9 4v13.5M15 6.5V20"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.2"/><path d="M3.5 19c.6-3 2.9-4.6 5.5-4.6S14 16 14.6 19"/><path d="M16 14.6c2 .2 3.6 1.6 4 4.4"/>',
  pin: '<path d="M12 21s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
  doctor: '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v2.5a4.5 4.5 0 0 0 9 0V12"/><circle cx="19" cy="10" r="2"/>',
  road: '<path d="M8 3 5 21M16 3l3 18M12 4v3M12 10v3M12 16v3"/>',
  pill: '<rect x="3" y="9" width="18" height="7" rx="3.5"/><path d="M12 9v7"/>',
  bus: '<rect x="4" y="4" width="16" height="12" rx="2.5"/><path d="M4 10h16"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/>',
  gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17 16 10"/>',
  delta: '<path d="M4 17h6l4-10 3 6h3"/>',
};

const railIcon = (key) => `<svg viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
  stroke-linejoin="round" aria-hidden="true">${RAIL_ICONS[key] ?? ''}</svg>`;

function sectionRail(present) {
  // a rail that points at a section the page does not have is worse than no
  // rail: the blocks decide, not the list
  const items = SECTIONS.filter(([id]) => present.has(id));
  return `<nav class="tp-rail" aria-label="Szakaszok">
    <ul>${items.map(([id, label, icon]) => `<li>
      <a href="#${id}">${railIcon(icon)}<span>${esc(label)}</span></a>
    </li>`).join('')}</ul>
  </nav>`;
}

/** A rule with a word on it, so a long section reads as its parts. */
function divider(label) {
  return `<p class="tp-divider"><span>${esc(label)}</span></p>`;
}

/** A question mark that explains itself on hover and on focus — no script. */
function helpTip(text) {
  return `<span class="tp-help" tabindex="0" role="note"
    aria-label="${esc(text)}">?<span class="tp-help__body">${esc(text)}</span></span>`;
}

const TRAVEL_COLORS = {
  gp: '#4fd6c2', dental: '#8ab4ff', oncall: '#f0b429', ambulance: '#ef8354',
  inpatient: '#ef6461', outpatient: '#9bd4a5', gyse: '#b8a4ff', pharmacy: '#c88ff0',
};

/** The drive to each kind of care, as bars, before the table says it again. */
function travelChart(profile) {
  const travel = profile.travel ?? {};
  const rows = LAYERS
    .map(([key, label]) => ({ key, label, min: (travel[key] || {}).minutes,
      at: (travel[key] || {}).at }))
    .filter((r) => r.min !== null && r.min !== undefined);
  if (!rows.length) return '';
  const max = Math.max(...rows.map((r) => r.min), 1);
  return `<div class="tp-bars">${rows.map((r) => `<div class="tp-bar">
    <span class="tp-bar__label">${esc(r.label)}</span>
    <span class="tp-bar__track">
      <span class="tp-bar__fill" style="width:${Math.max((r.min / max) * 100, 1.5)}%;
        background:${TRAVEL_COLORS[r.key] ?? '#94a3b8'}"
        title="${esc(r.label)}: ${esc(minutes(r.min))}"></span>
    </span>
    <span class="tp-bar__value">${esc(minutes(r.min))}${
  r.at && r.at !== profile.settlement ? ` <em>${esc(r.at)}</em>` : ' <em>helyben</em>'}</span>
  </div>`).join('')}</div>`;
}

/** What the timetable gives this settlement, before the sentences. */
function transitChart(profile) {
  const bus = profile.transit;
  if (!bus) return '';
  const targets = [['gp', 'háziorvos'], ['oncall', 'ügyelet'], ['inpatient', 'kórház']];
  return `<div class="tp-figures tp-figures--compact">
    <div class="tp-figure"><span class="tp-figure__value">${num(bus.departures)}</span>
      <span class="tp-figure__label">indulás a referencianapon</span></div>
    <div class="tp-figure"><span class="tp-figure__value">${num(bus.reachable)}</span>
      <span class="tp-figure__label">átszállás nélkül elérhető település</span></div>
    ${targets.map(([key, label]) => {
    const t = bus[key] || {};
    const ok = t.direct;
    return `<div class="tp-figure tp-figure--${ok ? 'ok' : 'bad'}">
      <span class="tp-figure__value">${ok ? '✓' : '✕'}</span>
      <span class="tp-figure__label">${esc(label)}${ok && t.minutes
    ? ` · ${num(t.minutes)} perc` : ''}</span>
      ${t.target ? `<span class="tp-figure__note">${esc(t.target)}</span>` : ''}
    </div>`;
  }).join('')}
  </div>`;
}

/** Where this settlement sits on the index, against the whole country. */
function indexCompare(profile) {
  const index = profile.index;
  if (!index) return '';
  const percentile = index.of ? 1 - (index.rank - 1) / index.of : null;
  const bands = [['alacsony', 'alacsony'], ['kozepes', 'közepes'],
    ['magas', 'magas'], ['kiemelt', 'kiemelt']];
  return `<div class="tp-indexscale">
    <div class="tp-indexscale__bar">
      ${bands.map(([key, label]) => `<span class="tp-indexscale__band tp-indexscale__band--${key}"
        title="${esc(label)} sáv"></span>`).join('')}
      <span class="tp-indexscale__marker" style="left:${Math.min(Math.max(index.value, 0), 100).toFixed(1)}%">
        <span>${esc(String(index.value).replace('.', ','))}</span>
      </span>
    </div>
    <p class="tp-indexscale__legend">
      <span>0 — a legjobb helyzetű település</span><span>100 — a legrosszabb</span>
    </p>
    <p class="tp-note">${esc(profile.settlement)} a ${num(index.of)} településből a
      <strong>${num(index.rank)}.</strong> helyen áll${percentile === null ? '' :
  ` — az ország ${pct(percentile)}-ánál kedvezőbb a helyzete`}.</p>
  </div>`;
}

function page(profile) {
  const { settlement, county } = profile;
  // Budapest's districts are their own járás ("Budapest 03. ker."), and
  // printing "Budapest 03. ker. járás" under the heading reads like a typo
  const district = profile.district && profile.district !== settlement
    ? profile.district : '';
  const title = `${settlement} — alapellátás egy helyen`;
  // the optional blocks are built first, so the rail can list what exists
  const streetHtml = streetBlock(profile);
  const changeHtml = changeBlock(profile);
  const present = new Set(['elhelyezkedes', 'lakossag', 'orvosok', 'tavolsag',
    'gyogyszertar', 'kozlekedes', 'kockazat']);
  if (streetHtml) present.add('elerhetoseg');
  if (changeHtml) present.add('valtozas');
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

${sectionRail(present)}

<section class="section container" id="elhelyezkedes">
  <h2 class="section__subheading">Hol van ez?</h2>
  ${countyMap(profile, geo)}
</section>

<section class="section container" id="lakossag">
  <h2 class="section__subheading">Kik laknak itt?</h2>
  ${ageBlock(profile)}
</section>

${streetHtml}

<section class="section container" id="orvosok">
  <h2 class="section__subheading">Van-e orvos?</h2>
  <div class="tp-cards">
    ${branchCard('Háziorvosi ellátás', profile.gp)}
    ${branchCard('Fogorvosi ellátás', profile.dental)}
  </div>
  ${doctorTable(profile, 'gp', 'Háziorvosok a településen')}
  ${doctorTable(profile, 'dental', 'Fogorvosok a településen')}
  ${(profile.surgeries ?? []).length ? `<p class="tp-note">Az orvos neve a NEAK
    szerződött szolgáltatói nyilvántartásából való, és csak betöltött körzetnél
    szerepel. A „mióta” a saját archívumunkból jön (${esc(String(archiveFrom))} óta
    őrzött havi NEAK-pillanatképek), nem NEAK által közölt kezdődátum; rendelési
    időt egyik nyilvános forrás sem közöl.</p>` : `<p class="tp-note">A településen
    egyetlen betöltött körzetnek sincs rendelője — alább az látszik, mely körzetek
    tartoznak ide, és hol a legközelebbi ellátás.</p>`}

  ${divider('Ami betöltetlen')}
  <p class="tp-note">A betöltetlenség nem azonos az ellátatlansággal: a helyettesítés a
    nyilvános adatokban nem látszik.</p>
  ${vacancyTable(profile)}
  ${dentalCatchment(profile)}

  ${divider('Védőnői ellátás')}
  ${vedonoBlock(profile)}
</section>

<section class="section container" id="tavolsag">
  <h2 class="section__subheading">Milyen messze?</h2>
  <p class="section__explain">Autóval, szabad forgalom mellett, az OpenStreetMap úthálózatán
    számolva — a légvonalbeli távolság mellette áll, mert a kettő nem ugyanaz.</p>
  ${travelChart(profile)}
  <table class="info-table">
    <thead><tr><th>Ellátás</th><th class="is-num">Menetidő</th><th class="is-num">Légvonal</th><th>Hol</th></tr></thead>
    <tbody>${travelRows(profile)}</tbody>
  </table>
  ${profile.gyse ? `<p class="tp-note">A településen ${num(profile.gyse)} gyógyászati
    segédeszköz-kiadóhely működik.</p>` : ''}
</section>

<section class="section container" id="gyogyszertar">
  <h2 class="section__subheading">Gyógyszertár</h2>
  ${pharmacyBlock(profile)}
  ${streetBlock(profile, { only: ['pharmacy'], id: 'patikaterkep',
    heading: '', lead: 'A gyógyszertárak a térképen, utcaszinten.' })}
</section>

<section class="section container" id="kozlekedes">
  <h2 class="section__subheading">Busszal is elérhető?</h2>
  ${transitChart(profile)}
  ${transitBlock(profile)}
</section>

<section class="section container" id="kockazat">
  <h2 class="section__subheading">Összetett ellátási kockázati index
    ${helpTip('Nyolc nyilvános mutató súlyozott átlaga, mindegyik országos rangsorszázalékra váltva: betöltetlenség, menetidő háziorvoshoz, fogorvoshoz, ügyelethez, járóbeteg- és fekvőbeteg-ellátáshoz, buszelérés, korösszetétel, kockázati előrejelzés és a kedvezményezett települési besorolás. A 100 a legrosszabb helyzetű települést jelenti, nem azt, hogy ott nincs ellátás.')}</h2>
  ${indexCompare(profile)}
  ${indexBlock(profile)}
  ${cluster ? `<p>Ez a település egy <strong>összefüggő ellátási hiányterület</strong> része
    (${esc(cluster.name)} környéke: ${num(cluster.settlements)} település,
    ${num(cluster.population)} lakos).</p>` : ''}
  <p class="tp-note">Az index nyolc nyilvános mutató súlyozott átlaga, országos
    rangsorszázalékokból. Összehasonlítás, nem ítélet: a magas érték azt jelenti, hogy több
    mutató mutat ugyanabba az irányba — nem azt, hogy ott nincs ellátás.
    <a href="${esc(ctx('/elemzo.html#index', profile))}">A módszer részletesen</a>.</p>
</section>

${changeHtml}

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
// Which places are seats, so the index can show the shape of the country
// rather than 3177 names of one size. Both come from the same city layer the
// maps are drawn from (KSH ranks, via OSM): 19 county seats and 151 district
// (járás) seats.
const seatRank = new Map(
  geo.cities.features.map((f) => [f.properties.name, f.properties.rank]),
);
const seatClass = (name) => {
  const rank = seatRank.get(name);
  if (rank === 'seat') return ' class="tp-seat tp-seat--county"';
  if (rank === 'jarasSeat') return ' class="tp-seat tp-seat--jaras"';
  return '';
};

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
      .map((p) => `<a href="/telepules/${esc(p.slug)}/"${
  seatClass(p.settlement)}>${esc(p.settlement)}</a>`)
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
  <div class="topnav__links">
    ${navBar(null)}
  </div>
</div></nav>
<header class="section container">
  <h1 class="section__heading">Települések</h1>
  <p class="section__lead">Mind a ${profiles.settlements.length} település adatlapja, megyénként.</p>
  <p class="tp-note"><span class="tp-seat tp-seat--county">Megyeszékhely</span> ·
    <span class="tp-seat tp-seat--jaras">járásszékhely</span> · a többi település</p>
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
