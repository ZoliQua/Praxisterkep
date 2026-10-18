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

// the járás this settlement sits in, for the comparisons: a number on its own
// ("4,1 perc") says nothing until it is held against the járás it belongs to
// and the country as a whole
const districts = (() => {
  try {
    const raw = JSON.parse(
      readFileSync(join(here, '..', '..', 'data', 'districts.json'), 'utf8'));
    return {
      byName: new Map((raw.districts ?? []).map((d) => [d.name, d])),
      benchmarks: raw.benchmarks ?? null,
    };
  } catch {
    return { byName: new Map(), benchmarks: null };
  }
})();
// the country's median of each measure, from the járás rows
const national = (() => {
  const med = (pick) => {
    const v = [...districts.byName.values()].map(pick)
      .filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  return {
    gpMin: med((d) => d.medianGpMinutes),
    oncallMin: med((d) => d.medianOncallMinutes),
    index: med((d) => d.medianIndex),
  };
})();

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
  return slug ? pagePath(slug) : '';
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

// The EESZT licence register, as a second opinion on every filled district:
// does the authority that licenses surgeries know of one behind this NEAK
// code, and is it at the address NEAK publishes? It is a supplement, so a
// missing file must not take the pages down with it.
const eeszt = (() => {
  try {
    return JSON.parse(readFileSync(join(here, '..', '..', 'data', 'eeszt.json'), 'utf8'));
  } catch {
    return null;
  }
})();
const eesztReason = (key) => S(`eeszt.reason.${key}`, {}, key);

// The cross-check: where the automatic pairing found no licence under the
// district's own unit code, it looks again — the same address under another
// unit, the same provider's tax number, the same street. Where it comes back
// with a verdict, the surgery is known to the licence register after all,
// and saying "nincs működési engedély" would be wrong.
const crosscheck = (() => {
  try {
    const raw = JSON.parse(
      readFileSync(join(here, '..', '..', 'data', 'crosscheck.json'), 'utf8'));
    return new Map((raw.records ?? [])
      .filter((r) => r.verdict && r.verdict !== 'none')
      .map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
})();
const crosscheckVerdict = (key) => S(`eeszt.verdict.${key}`, {}, key);

/**
 * What the licence register says about one district.
 *
 * `ok` is for sorting and for the tick; `label` is what the cell says; `title`
 * is the detail a hover gives. A district with a licence at a different
 * settlement is not an error — a surgery may sit in the next village — so it
 * is marked rather than denied.
 */
function eesztLicence(fin) {
  if (!eeszt) return null;
  const e = eeszt.praxes?.[fin];
  if (e?.l) {
    const [postalCode, settlement, address, , , flags] = e.l;
    const settlementMatch = (flags & 1) !== 0;
    const where = [postalCode, settlement, address].filter(Boolean).join(' ');
    return settlementMatch
      ? { ok: 0, label: S('eeszt.has'), title: S('eeszt.siteTitle', { where }) }
      : { ok: 1, label: S('eeszt.hasElsewhere'), title: S('eeszt.siteTitle', { where }) };
  }
  const match = crosscheck.get(fin);
  if (match) {
    const basis = crosscheckVerdict(match.verdict);
    const where = match.candidates?.[0]
      ? S('eeszt.suggested', { where: [match.candidates[0].settlement,
        match.candidates[0].address].filter(Boolean).join(', ')
        .replace(/\s+/g, ' ').replace(/\.*$/, '') }) : '';
    return { ok: 2, label: S('eeszt.matched'), title: S('eeszt.matchedTitle', { basis, where }) };
  }
  const un = eeszt.unmatched?.[fin];
  if (un) {
    const reason = eesztReason(un[1]);
    return { ok: 3, label: reason, title: S('eeszt.unmatchedTitle', { reason }) };
  }
  return { ok: 4, label: '–', title: S('eeszt.noData') };
}

// how far back the tenure claim can reach: the oldest monthly snapshot the
// archive holds a registry for
const tenureData = JSON.parse(
  readFileSync(join(here, '..', '..', 'data', 'tenure.json'), 'utf8'),
);
const archiveFrom = Object.values(tenureData.stats)
  .map((s) => s.from).sort()[0];

const [year, month] = profiles.dataMonth.split('-').map(Number);
// "2026. október" in Hungarian, "October 2026" in English
const monthName = (y, m) => (LANG === 'en' ? `${DICT.static.months[m - 1]} ${y}`
  : `${y}. ${DICT.static.months[m - 1]}`);
const monthLabelNow = () => monthName(year, month);

// the built stylesheet carries a content hash, so it is looked up, not guessed
const cssFile = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.css'))
  .sort((a, b) => b.length - a.length)[0];

// the street map is written only when a tile provider is configured: without
// VITE_MAP_STYLE the bundle would have nothing to draw on, so the button is
// not offered at all (src/streetmap.ts makes the same check at runtime)
const env = loadEnv('production', join(here, '..'), 'VITE_');
// the same consent-gated analytics the app pages carry: these 3177 pages are
// where a search engine sends people, so leaving them out would measure the
// site's least-used half
const gaId = /^[A-Za-z0-9_-]{4,32}$/.test((env.VITE_GA_ID || '').trim())
  ? env.VITE_GA_ID.trim() : '';
const gaMeta = gaId ? `\n<meta name="ga-id" content="${gaId}">` : '';
const consentScript = gaId ? '\n<script src="/consent.js" defer></script>' : '';
// where the site lives, for the sitemap; VITE_SITE_URL overrides it
const site = (env.VITE_SITE_URL || 'https://praxisterkep.hu').replace(/\/$/, '');
const streetFile = env.VITE_MAP_STYLE
  ? readdirSync(join(dist, 'assets')).find((f) => /^streetmap-.*\.js$/.test(f))
  : null;

const streetLabel = (kind) => S(`street.label.${kind}`, {}, kind);
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
        name: s2.doctor || streetLabel(s2.kind),
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
      name: pl.name || streetLabel(pl.kind),
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
  <h2 class="section__subheading">${esc(S('street.heading'))}</h2>
  <p class="section__explain">${esc(S('street.explain'))}</p>
  ${inner}</section>`;
  return wrap(`
  <div class="tp-street" data-streetmap>
    <button type="button" class="data-btn data-btn--accent"
      data-loading="${esc(S('street.loading'))}" data-failed="${esc(S('street.failed'))}">
      ${esc(S(opts.only ? 'street.open' : 'street.full'))} (${esc(S('street.points', { n: num(points.length) }))})
    </button>
    <p class="tp-maplegend">${kinds.map((k) =>
    `<span><i class="street-pin" style="background:${
      STREET_COLORS[k] ?? '#94a3b8'}"></i>${
    esc(streetLabel(k))}</span>`).join('')}</p>
    <div class="tp-street__map" hidden></div>
    <script type="application/json">${
  JSON.stringify(points).replace(/</g, '\\u003c')}</script>
  </div>
  <p class="tp-note">${opts.lead ? `${esc(opts.lead)} ` : ''}${H('street.note', {
    maptiler: '<a href="https://www.maptiler.com/copyright/" rel="noopener">© MapTiler</a>',
    osm: `<a href="https://www.openstreetmap.org/copyright" rel="noopener">${esc(S('street.osm'))}</a>` })}</p>`);
}

// the site-wide context (lib/context.ts) written into a static link: ?tel=
// is the settlement slug, ?m= its county, and the SPA picks both up on load
// the one menu (src/lib/siteNav.json) and its Hungarian labels, so these
// 3177 static pages cannot disagree with the app about which pages exist
const nav = JSON.parse(readFileSync(join(here, '..', 'src', 'lib', 'siteNav.json'), 'utf8'));
const hu = JSON.parse(readFileSync(join(here, '..', 'src', 'i18n', 'hu.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(here, '..', 'src', 'i18n', 'en.json'), 'utf8'));
const DICTS = { hu, en };
// the same list the Footer component renders: one file, two renderers
const sources = JSON.parse(
  readFileSync(join(here, '..', 'src', 'lib', 'sources.json'), 'utf8'));
// Every page is written twice, in Hungarian and in English: LANG is the
// language being written, DICT its locale file. Every word on a page comes
// from web/src/i18n through S() (the static.* block) or label() (the rest).
let LANG = 'hu';
let DICT = hu;
const pick = (root, key) => key.split('.').reduce((o, k) => (o ?? {})[k], root);
const fill = (text, vars) => Object.entries(vars).reduce(
  (t, [k, v]) => t.replaceAll(`{${k}}`, String(v)), text);
const label = (key) => pick(DICT, key) ?? pick(hu, key) ?? key;
/** A static.* string, with {placeholders} filled. Escape it where it lands. */
const S = (key, vars = {}, fallback) => fill(
  pick(DICT.static, key) ?? pick(hu.static, key) ?? fallback ?? key, vars);
/** The same, for the few strings that carry their own markup (<strong>) and
 *  take pre-built HTML in their placeholders: the text is ours, not input. */
const H = (key, vars = {}) => S(key, vars);
const decSep = () => (LANG === 'en' ? '.' : ',');
/** Where a page of this language lives: /telepules/x/ or /en/telepules/x/. */
const pagePath = (slug) => `${LANG === 'en' ? '/en' : ''}/telepules/${slug ? `${slug}/` : ''}`;

const navBar = (profile) => nav.entries.map((e) => {
  const grouped = (e.children ?? []).some((c) => c[2] === 'group');
  // a heading and its links stay together in one column, as in the app
  const cols = [];
  for (const c of e.children ?? []) {
    if (c[2] === 'group' || !cols.length) cols.push([]);
    cols[cols.length - 1].push(c);
  }
  const children = cols.map((col) => `<div class="topnav__subcol">${col.map(([href, key, kind]) =>
    `<a href="${esc(ctx(href, profile))}"${kind === 'group' ? ' class="topnav__subhead"' : ''}>${
      esc(label(key))}</a>`).join('')}</div>`).join('');
  return `<div class="topnav__group"><a href="${esc(ctx(e.href, profile))}">${
    esc(label(e.labelKey))}${children ? '<i class="topnav__caret" aria-hidden="true"></i>' : ''
  }</a>${children ? `<div class="topnav__submenu${grouped ? ' is-grouped' : ''}" hidden>${
    children}</div>` : ''}</div>`;
}).join('\n    ');

const ctx = (href, profile) => {
  // the index page has no settlement of its own: its links carry no context
  // rather than someone else's
  if (!profile) return appHref(href);
  const [base, hash] = href.includes('#') ? [href.slice(0, href.indexOf('#')),
    href.slice(href.indexOf('#'))] : [href, ''];
  // a link that already has a query keeps it: "/jaras.html?jar=X" once came
  // out as "?jar=X?m=…", and the járás page read "X?m=…" as the járás
  const [path, query = ''] = base.split('?');
  const q = new URLSearchParams(query);
  q.set('m', profile.county);
  q.set('tel', profile.slug);
  // an English page sends its reader on in English
  if (LANG === 'en') q.set('lang', 'en');
  return `${path}?${q}${hash}`;
};

/** A link into the app with no settlement context, in the page's language. */
function appHref(href) {
  if (LANG !== 'en' || !href.startsWith('/') || href.startsWith('/telepules')) return href;
  const [base, hash = ''] = href.split('#');
  return `${base}${base.includes('?') ? '&' : '?'}lang=en${hash ? `#${hash}` : ''}`;
}

/** The HU ⇄ EN switch of a static page: the same page in the other language. */
function langSwitch(slug) {
  const other = LANG === 'en' ? `/telepules/${slug ? `${slug}/` : ''}` : `/en/telepules/${slug ? `${slug}/` : ''}`;
  return `<a class="topnav__lang" href="${esc(other)}" hreflang="${LANG === 'en' ? 'hu' : 'en'}"
    lang="${LANG === 'en' ? 'hu' : 'en'}" aria-label="${esc(S('page.langLabel'))}">${esc(S('page.lang'))}</a>`;
}

/** rel=alternate links, so search engines know the two are one page. */
function alternates(slug) {
  const tail = slug ? `${slug}/` : '';
  return `<link rel="alternate" hreflang="hu" href="${site}/telepules/${tail}">
<link rel="alternate" hreflang="en" href="${site}/en/telepules/${tail}">
<link rel="alternate" hreflang="x-default" href="${site}/telepules/${tail}">`;
}

const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const num = (n) => (n === null || n === undefined ? '–'
  : new Intl.NumberFormat(LANG === 'en' ? 'en-GB' : 'hu-HU').format(n));
const pct = (r) => (r === null || r === undefined ? '–'
  : `${(r * 100).toFixed(1).replace('.', decSep())}%`);
const minutes = (m) => (m === null || m === undefined ? '–'
  : `${String(m).replace('.', decSep())} ${S('unit.min')}`);

// "a 1407." is wrong in Hungarian: ezernégyszázhét begins with a vowel, so
// it takes "az". The article follows the first spoken word of the number.
// English needs none.
const article = (n) => {
  if (LANG === 'en') return '';
  if (n >= 1000 && n < 2000) return 'az';        // ezer…
  if (n >= 2000) return Math.floor(n / 1000) === 5 ? 'az' : 'a';
  if (n >= 100) return Math.floor(n / 100) === 5 ? 'az' : 'a';
  if (n >= 10) return Math.floor(n / 10) === 5 ? 'az' : 'a';
  return n === 1 || n === 5 ? 'az' : 'a';
};

// The state as its two halves, so a settlement that has both reads as both:
// "Van betöltött körzete." in green and "Van betöltetlen körzete." in red on
// one line says more than one sentence that merges them.
const stateParts = (state) => ({
  filled: [[S('state.filled'), 'ok']],
  partial: [[S('state.filled'), 'ok'], [S('state.vacant'), 'bad']],
  vacantOnly: [[S('state.vacantOnly'), 'bad']],
  absent: [[S('state.absent'), 'dim']],
})[state];
const CARD_TONE = {
  filled: 'ok', partial: 'warn', vacantOnly: 'bad', absent: 'dim',
};
const BAND_TONE = { kiemelt: 'bad', magas: 'warn', kozepes: 'mid', alacsony: 'ok' };
const band = (key) => (BAND_TONE[key] ? [S(`band.${key}`), BAND_TONE[key]] : null);
const LAYER_KEYS = ['gp', 'dental', 'oncall', 'ambulance', 'inpatient', 'outpatient', 'gyse',
  'pharmacy', 'sbo'];
const layers = () => LAYER_KEYS.map((k) => [k,
  k === 'sbo' ? label('outcomes.settlement.sboLayer') : S(`layer.${k}`)]);

// name -> slug, so every settlement named anywhere on the page can be opened
const slugOf = new Map();
for (const p of profiles.settlements) {
  slugOf.set(`${p.settlement}|${p.county}`, p.slug);
  if (!slugOf.has(p.settlement)) slugOf.set(p.settlement, p.slug);
}
const settlementLink = (name, county, text = name) => {
  const slug = slugOf.get(`${name}|${county}`) ?? slugOf.get(name);
  return slug ? `<a href="${esc(pagePath(slug))}">${esc(text)}</a>` : esc(text);
};

function branchCard(title, branch) {
  if (!branch) {
    return `<div class="tp-card tp-card--dim"><h3>${esc(title)}</h3>
      <p>${esc(S('branch.noData'))}</p></div>`;
  }
  const parts = stateParts(branch.state) ?? [['–', 'dim']];
  const tone = CARD_TONE[branch.state] ?? 'dim';
  const detail = branch.state === 'absent'
    ? S('branch.absentDetail')
    : S('branch.detail', { filled: num(branch.filled), vacant: num(branch.vacant) });
  return `<div class="tp-card tp-card--${tone}">
    <h3>${esc(title)}</h3>
    <p class="tp-card__state">${parts.map(([text, part]) =>
    `<span class="tp-state tp-state--${part}">${esc(text)}</span>`).join(' ')}</p>
    <p>${esc(detail)}</p>
    ${branch.isSeat ? `<p class="tp-note">${esc(S('branch.seat'))}</p>` : ''}
  </div>`;
}

function travelRows(profile) {
  const travel = profile.travel ?? {};
  return layers().map(([key, label]) => {
    const t = travel[key];
    if (!t) return '';
    const where = t.at && t.at !== profile.settlement
      ? settlementLink(t.at, profile.county) : `<em>${esc(S('here'))}</em>`;
    return `<tr><td>${esc(label)}</td><td class="is-num">${esc(minutes(t.minutes))}</td>
      <td class="is-num">${t.km === null || t.km === undefined ? '–' : `${esc(String(t.km).replace('.', decSep()))} km`}</td>
      <td>${where}</td></tr>`;
  }).join('\n');
}

const AGE_COLORS = { young: '#4fd6c2', working: '#6ea8ff', old: '#f0b429' };
const ageLabel = (key) => S(`age.${key}`);

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
        stroke-width="1"><title>${esc(ageLabel(key))}: ${num(split[key])} (${
  pct(shares[i])})</title></path></a>`;
  };
  const readouts = keys.map((key, i) => `<g id="${prefix}-${key}"
    class="agepie__readout agepie__readout--${key}">
    <text x="${r}" y="${r - 2}" text-anchor="middle" font-size="15"
      font-weight="700" fill="${AGE_COLORS[key]}">${esc(pct(shares[i]))}</text>
    <text x="${r}" y="${r + 14}" text-anchor="middle" font-size="10"
      fill="#94a3b8">${num(split[key])} ${esc(S('unit.people'))}</text>
  </g>`).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"
    role="img" aria-label="${esc(S('age.aria'))}" class="agepie">
    <g class="agepie__wedges">${keys.map(wedge).join('')}</g>
    <circle cx="${r}" cy="${r}" r="${(r * 0.46).toFixed(1)}" fill="#101823"/>
    ${readouts}
    <text class="agepie__hint" x="${r}" y="${r + 4}" text-anchor="middle"
      font-size="9.5" fill="#64748b">${esc(S('age.hover'))}</text>
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
    role="img" aria-label="${esc(S('age.hundredAria'))}">
    ${dots.map((key, i) => {
    const x = (i % cols) * (r * 2 + gap) + r;
    const y = Math.floor(i / cols) * (r * 2 + gap) + r;
    return `<a href="#${prefix}-${key}"><circle class="hundred__dot hundred__dot--${key}"
      cx="${x}" cy="${y}" r="${r}" fill="${AGE_COLORS[key]}"><title>${
  esc(ageLabel(key))}</title></circle></a>`;
  }).join('')}
  </svg>
  <p class="tp-note">${esc(S('age.hundredNote'))}</p>`;
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
      <span class="comparebar__label">${esc(ageLabel(key))}</span>
      <span class="comparebar__track">
        <span class="comparebar__fill" style="width:${(here / max * 100).toFixed(1)}%;
          background:${AGE_COLORS[key]}"></span>
        <span class="comparebar__national" style="left:${(there / max * 100).toFixed(1)}%"
          title="${esc(S('age.nationalTitle', { v: pct(there) }))}"></span>
      </span>
      <span class="comparebar__value">${esc(pct(here))}
        <em class="${diff > 0 ? 'is-more' : ''}">${diff > 0 ? '+' : '−'}${
  esc(pct(Math.abs(diff)))}</em></span>
    </div>`;
  }).join('')}
  <p class="tp-note">${esc(S('age.compareNote'))}</p></div>`;
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
        <span class="agelegend__label">${esc(ageLabel(key))}</span>
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
        height="${band}" fill="#6ea8ff" rx="2"><title>${esc(S('age.maleTitle', {
  group: ageLabel(key), n: num(m), share: pct(sum ? m / sum : 0) }))}</title></rect>
      <rect x="${half + 86}" y="${y}" width="${fw.toFixed(1)}" height="${band}"
        fill="#f0abfc" rx="2"><title>${esc(S('age.femaleTitle', {
  group: ageLabel(key), n: num(f), share: pct(sum ? f / sum : 0) }))}</title></rect>
      <text x="${half + 43}" y="${y + band / 2 + 4}" text-anchor="middle"
        font-size="11" fill="#94a3b8">${esc(ageLabel(key))}</text>
      <text x="${(half - mw - 6).toFixed(1)}" y="${y + band / 2 + 4}" text-anchor="end"
        font-size="11" fill="#cbd5e1">${num(m)}</text>
      <text x="${(half + 86 + fw + 6).toFixed(1)}" y="${y + band / 2 + 4}"
        font-size="11" fill="#cbd5e1">${num(f)}</text>
    </a>`;
  }).join('');
  return `<svg class="tp-pyramid" viewBox="0 0 ${width} ${height}" width="100%"
    height="auto" role="img" aria-label="${esc(S('age.pyramidAria'))}">${bars}</svg>`;
}

function ageBlock(profile) {
  const a = profile.age;
  if (!a || a.censusTotal === undefined) {
    return `<p class="tp-note">${esc(S('age.suppressed'))}</p>`;
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
      value: `${Math.round(oldRatio)}`, per: S('age.perWorking'),
      label: S('age.oldLabel'),
      note: nationalOldRatio === null ? '' :
        S('age.nationally', { n: Math.round(nationalOldRatio) }),
    },
    youthRatio === null ? null : {
      value: `${Math.round(youthRatio)}`, per: S('age.perWorking'),
      label: S('age.youngLabel'), note: '',
    },
    ageingIndex === null ? null : {
      value: `${Math.round(ageingIndex)}`, per: S('age.perChild'),
      label: S('age.ageingLabel'),
      note: S(ageingIndex > 100 ? 'age.moreOld' : 'age.moreYoung'),
    },
    femaleShare === null ? null : {
      value: pct(femaleShare), per: '', label: S('age.femaleLabel'),
      note: a.male && a.female ? S('age.sexSplit', { m: num(a.male), f: num(a.female) }) : '',
    },
  ].filter(Boolean);

  return `<div class="tp-ages">
    <figure class="tp-age">
      ${agePie(split, 132)}
      <figcaption>${esc(S('age.groupsCaption', { name: profile.settlement }))}</figcaption>
      ${ageLegend(split, national)}
    </figure>
    ${a.bySex ? `<figure class="tp-age tp-age--pyramid">
      ${pyramid(a.bySex)}
      <figcaption>${esc(S('age.pyramidCaption'))}</figcaption>
      <p class="tp-note">${esc(S('age.pyramidNote'))}</p>
    </figure>` : ''}
  </div>
  <div class="tp-ages">
    <figure class="tp-age tp-age--hundred">
      <figcaption>${esc(S('age.hundredCaption'))}</figcaption>
      ${hundredDots(split)}
    </figure>
    <figure class="tp-age tp-age--compare">
      <figcaption>${esc(S('age.compareCaption'))}</figcaption>
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
  <p class="tp-note">${esc(S('age.source', { census: num(total), pop: num(profile.population) }))}</p>`;
}

const typeLabel = (type) => (type ? S(`type.${type}`, {}, type) : '');

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
    <span class="tp-details__title">${esc(S('vacancy.title'))}</span>
    <span class="tp-details__count">${num(rows.length)}</span>
  </summary>
  <table class="info-table">
    <thead><tr>${['fin', 'branch', 'type', 'status', 'since', 'seat']
    .map((k) => `<th>${esc(S(`vacancy.th.${k}`))}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>
      ${finCell(r.fin)}
      <td>${esc(S(r.kind === 'gp' ? 'branch.gpAdj' : 'branch.dentalAdj'))}</td>
      <td>${esc(typeLabel(r.type))}</td>
      <td>${esc(S(r.status === 'dissolved' ? 'vacancy.dissolved'
    : r.longTerm ? 'vacancy.longTerm' : 'vacancy.vacant'))}</td>
      <td>${esc(sinceLabel(r.since))}</td>
      <td>${r.seat && r.seat !== profile.settlement
    ? settlementLink(r.seat, profile.county) : `<em>${esc(S('here'))}</em>`}</td>
    </tr>`).join('')}</tbody>
  </table>
  <p class="tp-note">${esc(S('vacancy.note'))}</p>
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
  const label = monthName(y, m || 1);
  if (years < 1) return S('since.lessThanYear', { label });
  return S('since.years', { label, n: years });
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
    <span class="tp-details__title">${esc(S('vedono.title'))}</span>
    <span class="tp-details__count">${num(v.territorial + v.school)}</span>
    <span class="tp-details__preview">${esc(S('vedono.preview', {
  t: num(v.territorial), s: num(v.school) }))}</span>
  </summary>
  ${rows.length ? `<table class="info-table">
    <thead><tr><th>${esc(S('vedono.th.address'))}</th><th>${esc(S('vedono.th.provider'))}</th><th class="is-num">${esc(S('vedono.th.services'))}</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${esc([r.postalCode, profile.settlement].filter(Boolean).join(' '))}${
  r.address ? `, ${esc(r.address)}` : ''}</td>
      <td>${esc(r.provider || '–')}</td>
      <td class="is-num">${num(r.count)}</td>
    </tr>`).join('')}</tbody>
  </table>` : ''}
  <p class="tp-note">${esc(S('vedono.note'))}</p>
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
  return `<h3 class="tp-subhead">${esc(S('catchment.heading'))}</h3>
  <p class="section__explain">${H('catchment.explain')}</p>
  ${drive ? `<p>${H('catchment.nearest', { where: settlementLink(drive.at, profile.county),
    min: esc(minutes(drive.minutes)) })}</p>` : ''}`;
}

function changeBlock(profile) {
  const change = profile.change;
  if (!change) return '';
  const lines = [];
  const details = [];
  for (const [kind, c] of Object.entries(change.kinds)) {
    const label = S(kind === 'gp' ? 'branch.gpAdj' : 'branch.dentalAdj');
    const delta = c.vacantNow - c.vacant;
    if (delta !== 0 || c.vacantNow) {
      lines.push(delta === 0
        ? `<li class="tp-change tp-change--same">${esc(S('change.same', {
          branch: label, n: num(c.vacantNow) }))}</li>`
        : `<li class="tp-change tp-change--${delta > 0 ? 'bad' : 'ok'}">
          ${delta > 0 ? '▲' : '▼'} ${esc(S('change.moved', {
  branch: label, then: num(c.vacant), now: num(c.vacantNow) }))}</li>`);
    }
    // the districts themselves, where the current snapshot can corroborate it
    for (const row of c.newlyVacant ?? []) {
      details.push({ kind: label, state: 'bad',
        what: S('change.district', { type: typeLabel(row.type) }),
        who: row.seat && row.seat !== profile.settlement
          ? S('change.seatAt', { seat: row.seat }) : S('here'),
        when: row.since, fin: row.fin,
        verb: S(row.status === 'dissolved' ? 'change.dissolved' : 'change.becameVacant') });
    }
    for (const row of c.resolved ?? []) {
      details.push({ kind: label, state: 'ok',
        what: S('change.district', { type: typeLabel(row.type) }),
        who: row.doctor || '', when: '', fin: row.fin, verb: S('change.filled') });
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
    details.push({ kind: S(a.kind === 'gp' ? 'branch.gpAdj' : 'branch.dentalAdj'), state: 'ok',
      what: S('change.district', { type: typeLabel(a.type) }), who: a.doctor,
      when: a.since, fin: a.fin, verb: S('change.newDoctor') });
  }
  if (change.newDoctors) {
    lines.push(`<li class="tp-change tp-change--ok">▲ ${esc(S('change.newDoctors', {
      n: num(change.newDoctors) }))}</li>`);
  }
  if (!lines.length) {
    lines.push(`<li class="tp-change tp-change--same">${esc(S('change.none'))}</li>`);
  }
  return `<section class="section container" id="valtozas">
  <h2 class="section__subheading">${esc(S('change.heading'))}</h2>
  <p class="section__explain">${esc(S('change.explain', { month: change.month }))}</p>
  <ul class="tp-changes">${lines.join('')}</ul>
  ${details.length ? `<details class="tp-details tp-details--change">
    <summary>
      <svg class="tp-details__ghost" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 17h6l4-10 3 6h3"/></svg>
      <span class="tp-details__title">${esc(S('change.detailsTitle'))}</span>
      <span class="tp-details__count">${num(details.length)}</span>
    </summary>
    <table class="info-table">
      <thead><tr>${['fin', 'branch', 'type', 'what', 'who', 'when']
    .map((k) => `<th>${esc(S(`change.th.${k}`))}</th>`).join('')}</tr></thead>
      <tbody>${details.map((d) => `<tr class="tp-row--${d.state}">
        ${finCell(d.fin)}
        <td>${esc(d.kind)}</td>
        <td>${esc(d.what)}</td>
        <td>${esc(d.verb)}</td>
        <td>${esc(d.who || '–')}</td>
        <td>${esc(d.when ? sinceLabel(d.when) : '–')}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="tp-note">${esc(S('change.note'))}</p>
  </details>` : ''}
  <p class="tp-note">${H('change.scope', { link: `<a href="${esc(ctx(
    `/megye.html?m=${encodeURIComponent(profile.county)}#fluktuacio`, profile))}">${esc(S('change.fluct'))}</a>` })}</p>
</section>`;
}

function transitBlock(profile) {
  const bus = profile.transit;
  if (!bus) {
    return `<p class="tp-note">${esc(S('transit.capital'))}</p>`;
  }
  const targets = ['gp', 'oncall', 'inpatient'].map((k) => [k, S(`transit.to.${k}`)]);
  const items = targets.map(([key, label]) => {
    const t = bus[key];
    if (!t || !t.target) return '';
    const state = t.direct
      ? esc(S('transit.direct', { m: t.minutes ? ` (${minutes(t.minutes)})` : '' }))
      : esc(S('transit.indirect'));
    return `<li>${esc(label)} (${esc(t.target)}): <strong>${state}</strong></li>`;
  }).join('\n');
  return `<p>${H('transit.lead', { dep: num(bus.departures), reach: num(bus.reachable) })}</p>
    <ul class="tp-list">${items}</ul>
    <p class="tp-note">${esc(S('transit.train'))}</p>`;
}

/**
 * Where this settlement stands against its járás and the country.
 *
 * Every number on this page is about one place, and one place has nothing to
 * be read against. Three bars fix that: what the settlement is, what the
 * járás around it typically is, and what the country's middle looks like.
 * No script — the bar is a width, the marker is a left offset.
 */
function benchBlock(profile) {
  const district = districts.byName.get(profile.district);
  if (!district) return '';
  const avgSettlement = district.settlements
    ? Math.round(district.population / district.settlements) : null;
  const rows = [
    avgSettlement ? {
      label: S('bench.population'),
      value: profile.population,
      ref: avgSettlement,
      refLabel: S('bench.avgSettlement', { district: profile.district }),
      format: (v) => num(Math.round(v)),
    } : null,
    profile.travel?.gp?.minutes != null && district.medianGpMinutes != null ? {
      label: S('bench.gpMinutes'),
      value: profile.travel.gp.minutes,
      ref: district.medianGpMinutes,
      refLabel: S('bench.districtMedian'),
      format: (v) => minutes(v),
      lowerIsBetter: true,
    } : null,
    profile.index?.value != null && national.index != null ? {
      label: S('bench.index'),
      value: profile.index.value,
      ref: national.index,
      refLabel: S('bench.nationalMedian'),
      format: (v) => String(Math.round(v * 10) / 10).replace('.', decSep()),
      lowerIsBetter: true,
    } : null,
  ].filter(Boolean);
  if (!rows.length) return '';
  return `<div class="tp-bench">
    <p class="tp-bench__title">${esc(S('bench.title'))}</p>
    <ul class="cmpbars">${rows.map((r) => {
    const max = Math.max(r.value, r.ref) || 1;
    const worse = r.lowerIsBetter ? r.value > r.ref : r.value < r.ref;
    return `<li>
      <div class="cmpbars__head"><span class="cmpbars__label">${esc(r.label)}</span>
        <strong>${esc(r.format(r.value))}</strong></div>
      <div class="cmpbars__track">
        <span class="cmpbars__value${worse ? ' is-worse' : ''}"
          style="width:${((r.value / max) * 100).toFixed(1)}%"></span>
        <span class="cmpbars__ref" style="left:${((r.ref / max) * 100).toFixed(1)}%"></span>
      </div>
      <div class="cmpbars__foot"><span>${esc(r.refLabel)}: ${esc(r.format(r.ref))}</span></div>
    </li>`;
  }).join('')}</ul>
  </div>`;
}

function indexBlock(profile) {
  const index = profile.index;
  if (!index) return '';
  const [label, tone] = band(index.band) ?? ['–', 'dim'];
  return `<div class="tp-index tp-index--${tone}">
    <div class="tp-index__value">${esc(String(index.value).replace('.', decSep()))}</div>
    <div>
      <p class="tp-index__band">${esc(label)}</p>
      <p>${H('index.rank', { of: num(index.of), article: article(index.rank), rank: num(index.rank) })}</p>
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
  if (row.fromStart) return S('tenure.fromStart', { n: Math.max(years, 1) });
  if (years < 1) return S('tenure.lessThanYear');
  return S('tenure.years', { n: years });
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
function eesztCell(row) {
  const e = row.eeszt;
  if (!e) return '<span class="dt-cell dt-cell--eeszt" role="cell">–</span>';
  const mark = e.ok === 0 || e.ok === 2 ? '✓' : e.ok === 1 ? '!' : '–';
  return `<span class="dt-cell dt-cell--eeszt dt-eeszt--${e.ok}" role="cell"
    title="${esc(e.title)}"><i aria-hidden="true">${mark}</i> ${esc(e.label)}</span>`;
}

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
    return {
      ...r, site, siteKey: site.toLowerCase().replace(/\s+/g, ' ').trim(),
      eeszt: eesztLicence(r.fin),
    };
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
  const byEeszt = rank(withSite, (a, b) => (a.eeszt?.ok ?? 9) - (b.eeszt?.ok ?? 9));
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
      --o-fin:${byFin.get(r)}; --o-eeszt:${byEeszt.get(r)}">
    <span class="dt-cell dt-cell--fin" role="cell">${esc(r.fin || '–')}</span>
    <span class="dt-cell dt-cell--doctor" role="cell">${esc(r.doctor || '–')}${
  (perDoctor.get(r.doctor || '—') ?? []).length > 1
    ? `<i class="dt-flag" title="${esc(S('doctors.multiFlag'))}">⧉</i>` : ''}</span>
    <span class="dt-cell" role="cell">${esc(typeLabel(r.type))}</span>
    <span class="dt-cell" role="cell"${r.addressRaw
  ? ` title="${esc(S('doctors.raw', { raw: r.addressRaw }))}"` : ''}>${esc(r.site)}${
  (perSite.get(r.siteKey) ?? []).length > 1
    ? `<i class="dt-flag" title="${esc(S('doctors.sharedFlag'))}">⧉</i>` : ''}${
  r.addressRaw ? '<i class="dt-raw" aria-hidden="true">·</i>' : ''}</span>
    <span class="dt-cell dt-cell--since" role="cell">${esc(tenureLabel(r))}</span>
    ${eesztCell(r)}
  </div>`;

  const groupBlock = (entries, title) => entries.map(([key, list]) => `
    <div class="dt-group">
      <p class="dt-group__head"><strong>${esc(key)}</strong>
        <span>${num(list.length)} ${esc(title)}</span></p>
      ${list.map((r) => `<div class="dt-row dt-row--grouped" role="row">
        <span class="dt-cell dt-cell--fin" role="cell">${esc(r.fin || '–')}</span>
        <span class="dt-cell dt-cell--doctor" role="cell">${esc(r.doctor || '–')}</span>
        <span class="dt-cell" role="cell">${esc(typeLabel(r.type))}</span>
        <span class="dt-cell" role="cell"${r.addressRaw
  ? ` title="${esc(S('doctors.raw', { raw: r.addressRaw }))}"` : ''}>${esc(r.site)}</span>
        <span class="dt-cell dt-cell--since" role="cell">${esc(tenureLabel(r))}</span>
        ${eesztCell(r)}
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

  const sortOptions = ['fin', 'doctor', 'type', 'site', 'tenure', 'eeszt']
    .map((k) => [k, S(`doctors.sort.${k}`)]);

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
      <span class="dt-controls__label">${esc(S('doctors.grouping'))}</span>
      ${['list', 'site', 'doctor'].map((k) => [k, S(`doctors.group.${k}`)])
    .map(([key, label], i) => `<input type="radio" name="g-${id}" id="g-${id}-${key}"
        class="dt-radio dt-radio--group" data-group="${key}"${i === 0 ? ' checked' : ''}>
      <label for="g-${id}-${key}" class="dt-chip">${esc(label)}</label>`).join('')}
      ${sortOptions.map(([key]) => `<input type="radio" name="s-${id}"
        id="s-${id}-${key}" class="dt-radio dt-radio--sort" data-sort="${key}"${
  key === 'doctor' ? ' checked' : ''}>`).join('')}
    </div>

    ${sharedSites || busyDoctors ? `<p class="dt-hint">${[
    sharedSites ? S('doctors.sharedSites', { n: num(sharedSites) }) : '',
    busyDoctors ? S('doctors.busyDoctors', { n: num(busyDoctors) }) : '',
  ].filter(Boolean).map(esc).join(' · ')} ${esc(S('doctors.hintTail'))}</p>` : ''}

    <div class="dt-list">
      <div class="dt-row dt-row--head" role="row">
        ${sortOptions.map(([key, label]) => `<label class="dt-cell dt-sort"
          for="s-${id}-${key}" data-for="${key}">${esc(label)}</label>`).join('')}
      </div>
      ${withSite.map(listRow).join('')}
    </div>

    <div class="dt-grouped dt-grouped--site">
      ${groupBlock(siteGroups, S('doctors.groupDoctor'))}
    </div>
    <div class="dt-grouped dt-grouped--doctor">
      ${groupBlock(doctorGroups, S('doctors.groupDistrict'))}
    </div>
  </div>
  </details>`;
}

function pharmacyBlock(profile) {
  const here_ = profile.pharmacies ?? [];
  const drive = profile.travel?.pharmacy;
  if (here_.length) {
    return `<table class="info-table">
    <thead><tr><th>${esc(S('pharmacy.th.name'))}</th><th>${esc(S('pharmacy.th.address'))}</th></tr></thead>
    <tbody>${here_.map((ph) => `<tr>
      <td>${esc(ph.name)}</td>
      <td>${esc([ph.postalCode, profile.settlement].filter(Boolean).join(' '))}${
  ph.address ? `, ${esc(ph.address)}` : ''}</td>
    </tr>`).join('')}</tbody>
  </table>`;
  }
  if (drive && drive.at) {
    return `<p class="tp-note">${esc(S('pharmacy.nearest', { where: drive.at, min: minutes(drive.minutes) }))}</p>`;
  }
  return `<p class="tp-note">${esc(S('pharmacy.none'))}</p>`;
}


/**
 * The rail down the left: where you are on the page, and the whole page at a
 * glance. It is a list of anchors — the browser's own scrolling does the
 * work, and :target marks the one that was clicked. On a phone it lies down
 * across the top instead, because a rail would eat a third of the screen.
 */
const SECTIONS = [
  ['elhelyezkedes', 'map'], ['lakossag', 'people'], ['eletkorulmenyek', 'delta'],
  ['elerhetoseg', 'pin'], ['orvosok', 'doctor'], ['tavolsag', 'road'],
  ['gyogyszertar', 'pill'], ['kozlekedes', 'bus'], ['kockazat', 'gauge'],
  ['valtozas', 'delta'],
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

/**
 * The footer every page carries, static ones included.
 *
 * A reader who lands on one settlement's page from a search engine has to see
 * the same three things as one who came through the landing: that every
 * number comes from data the state itself published, that a vacant district
 * is not an unserved one, and that this is a private analysis and not an
 * official register. The wording is kept in step with web/src/i18n/hu.json by
 * reading it from there — one text, two renderers.
 */
function siteFooter(homeHref, analysisHref) {
  const f = DICT.footer;
  return `<footer class="footer" id="forrasok">
  <div class="container">
    <p class="footer__lead">${esc(f.publicOnly)}</p>
    <details class="footer__fold" id="forrasok-lista"><summary><h3>${esc(f.sources)}</h3></summary>
    <p class="footer__note">${esc(f.sourcesNote)}</p>
    <ul class="footer__sources">${sources.groups.map((g) => {
    const labels = DICT.footer.src[g.key] ?? hu.footer.src[g.key];
    return `<li><strong>${esc(labels.title)}</strong> ${g.items.map((item, i) =>
      `${i ? '<span class="footer__sep"> · </span>' : ''}<a href="${esc(item.href)}"${
        item.href.startsWith('/') ? '' : ' rel="noopener"'}>${esc(labels[item.key])}</a>${
        item.format ? `<span class="footer__format"> ${esc(item.format)}</span>` : ''}`)
      .join('')}</li>`;
  }).join('')}</ul></details>
    <details class="footer__fold"><summary><h3>${esc(f.legal)}</h3></summary>
    <ul class="footer__legal">
      <li>${esc(f.disclaimer)}</li>
      <li>${esc(f.vacantNotUnserved)}</li>
      <li>${esc(f.names)}</li>
      <li>${esc(f.noPersonal)}</li>
      <li>${esc(f.notOfficial)}</li>
      <li>${esc(f.correction)}</li>
    </ul></details>
    <p class="footer__privacy"><a href="${esc(appHref('/adatkezeles.html'))}">${esc(DICT.privacy.navLabel)}</a>
      · <a href="#" data-consent-reopen>${esc(DICT.privacy.reopen)}</a></p>
    <p class="footer__author">${esc(f.authorBy)}
      <a href="https://dulzoltan.hu" rel="noopener">${esc(f.authorName)}</a>${
  esc(f.authorTitle)}</p>
    <p>${esc(f.updated)}: ${esc(monthLabelNow())} · ${esc(f.license)}</p>
    <p class="tp-footer__links"><a href="${esc(homeHref)}">${esc(S('footerLinks.map'))}</a> ·
      <a href="${esc(pagePath(''))}">${esc(S('footerLinks.all'))}</a> ·
      <a href="${esc(analysisHref)}">${esc(S('footerLinks.analysis'))}</a> ·
      <a href="${esc(appHref('/modszertan.html#adatok'))}">${esc(S('footerLinks.data'))}</a></p>
  </div>
  <script>if (location.hash === '#forrasok') document.getElementById('forrasok-lista').open = true;</script>
</footer>`;
}

function sectionRail(present) {
  // a rail that points at a section the page does not have is worse than no
  // rail: the blocks decide, not the list
  const items = SECTIONS.filter(([id]) => present.has(id))
    .map(([id, icon]) => [id, S(`rail.${id}`), icon]);
  // the section being read is lit (and, on a phone, scrolled into the bar):
  // a few lines of script that only add to a rail which works without them
  return `<nav class="tp-rail" aria-label="${esc(S('rail.aria'))}">
    <ul>${items.map(([id, label, icon]) => `<li>
      <a href="#${id}">${railIcon(icon)}<span>${esc(label)}</span></a>
    </li>`).join('')}</ul>
  </nav>
  <script>document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('.topnav');
    function navHeight() {
      if (nav) document.documentElement.style.setProperty('--topnav-h', nav.offsetHeight + 'px');
    }
    navHeight(); window.addEventListener('resize', navHeight);
    var links = [].slice.call(document.querySelectorAll('.tp-rail a'));
    if (!('IntersectionObserver' in window) || !links.length) return;
    var byId = {}; links.forEach(function (a) { byId[a.hash.slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute('aria-current'); });
        var a = byId[e.target.id]; if (!a) return;
        a.setAttribute('aria-current', 'location');
        if (window.innerWidth <= 1100) a.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
    }, { rootMargin: '-35% 0px -55% 0px' });
    Object.keys(byId).forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  });</script>`;
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
  sbo: '#ff4d6d',
};

/** The drive to each kind of care, as bars, before the table says it again. */
function travelChart(profile) {
  const travel = profile.travel ?? {};
  const rows = layers()
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
  r.at && r.at !== profile.settlement ? ` <em>${esc(r.at)}</em>` : ` <em>${esc(S('here'))}</em>`}</span>
  </div>`).join('')}</div>`;
}

/** What the timetable gives this settlement, before the sentences. */
function transitChart(profile) {
  const bus = profile.transit;
  if (!bus) return '';
  const targets = ['gp', 'oncall', 'inpatient'].map((k) => [k, S(`transit.short.${k}`)]);
  return `<div class="tp-figures tp-figures--compact">
    <div class="tp-figure"><span class="tp-figure__value">${num(bus.departures)}</span>
      <span class="tp-figure__label">${esc(S('transit.departures'))}</span></div>
    <div class="tp-figure"><span class="tp-figure__value">${num(bus.reachable)}</span>
      <span class="tp-figure__label">${esc(S('transit.reachable'))}</span></div>
    ${targets.map(([key, label]) => {
    const t = bus[key] || {};
    const ok = t.direct;
    return `<div class="tp-figure tp-figure--${ok ? 'ok' : 'bad'}">
      <span class="tp-figure__value">${ok ? '✓' : '✕'}</span>
      <span class="tp-figure__label">${esc(label)}${ok && t.minutes
    ? ` · ${num(t.minutes)} ${esc(S('unit.min'))}` : ''}</span>
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
  const bands = ['alacsony', 'kozepes', 'magas', 'kiemelt'].map((k) => [k, S(`bandShort.${k}`)]);
  return `<div class="tp-indexscale">
    <div class="tp-indexscale__bar">
      ${bands.map(([key, label]) => `<span class="tp-indexscale__band tp-indexscale__band--${key}"
        title="${esc(S('index.bandTitle', { label }))}"></span>`).join('')}
      <span class="tp-indexscale__marker" style="left:${Math.min(Math.max(index.value, 0), 100).toFixed(1)}%">
        <span>${esc(String(index.value).replace('.', decSep()))}</span>
      </span>
    </div>
    <p class="tp-indexscale__legend">
      <span>${esc(S('index.best'))}</span><span>${esc(S('index.worst'))}</span>
    </p>
    <p class="tp-note">${H('index.place', { name: esc(profile.settlement), of: num(index.of),
    rank: num(index.rank), better: percentile === null ? ''
      : esc(S('index.better', { share: pct(percentile) })) })}</p>
  </div>`;
}


/* ------------------------------------------------------------------
   "Hogyan élnek itt?" — income, work, births and deaths, people
   leaving, and the járás's avoidable mortality. No script: every bar
   and line is drawn here, as HTML or inline SVG. Every word comes from
   i18n (outcomes.settlement.*), read through label().
   ------------------------------------------------------------------ */
const L = (key, vars = {}) => Object.entries(vars).reduce(
  (txt, [k, v]) => txt.replaceAll(`{${k}}`, String(v)), label(`outcomes.settlement.${key}`));
const dec = (v, d = 1) => (v === null || v === undefined ? '–'
  : `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(d).replace('.', decSep())}`);
const signedPm = (v) => (v === null || v === undefined ? '–'
  : `${v > 0 ? '+' : ''}${dec(v)}‰`);
const mFt = (v) => (v === null || v === undefined ? '–' : `${dec(v / 1000, 2)} ${S('unit.mFt')}`);

/** Up to four bars on one scale: the settlement first, then what it is
 *  measured against. Diverging values grow from a centre line. */
function compareRows(rows, fmt, diverging = false) {
  const vals = rows.map((r) => r.v).filter((v) => v !== null && v !== undefined);
  if (!vals.length) return '';
  const span = diverging ? Math.max(...vals.map(Math.abs), 0.0001)
    : Math.max(...vals, 0.0001);
  return `<div class="tp-compare${diverging ? ' is-diverging' : ''}">${rows.map((r) => {
    if (r.v === null || r.v === undefined) return '';
    const w = (Math.abs(r.v) / span) * (diverging ? 50 : 100);
    const style = diverging
      ? (r.v >= 0 ? `left:50%;width:${w.toFixed(1)}%` : `left:${(50 - w).toFixed(1)}%;width:${w.toFixed(1)}%`)
      : `width:${w.toFixed(1)}%`;
    return `<div class="tp-compare__row${r.self ? ' is-self' : ''}">
      <span class="tp-compare__label">${r.href ? `<a href="${esc(r.href)}">${esc(r.label)}</a>` : esc(r.label)}</span>
      <span class="tp-compare__track"><i class="${diverging && r.v < 0 ? 'is-neg' : ''}" style="${style}"></i></span>
      <b>${esc(fmt(r.v))}</b></div>`;
  }).join('')}</div>`;
}

/** The settlement's jobseeker share over time, against the country. */
function jobsLine(js, nat) {
  const W = 520; const H = 120; const P = { l: 34, r: 8, t: 8, b: 18 };
  const mon = (m) => { const [y, mo] = m.split('-').map(Number); return y * 12 + mo - 1; };
  const xs = js.months.map(mon);
  const all = [...js.series, ...(nat ? nat.series : [])].filter((v) => v !== null);
  if (all.length < 3) return '';
  const hi = Math.max(...all) * 1.1 || 1;
  const x = (m) => P.l + ((m - xs[0]) / (xs[xs.length - 1] - xs[0])) * (W - P.l - P.r);
  const y = (v) => H - P.b - (v / hi) * (H - P.t - P.b);
  const path = (series) => series.map((v, i) => (v === null ? '' : `${i && series[i - 1] !== null ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(v).toFixed(1)}`)).join('');
  const years = [];
  for (let yy = Math.ceil(xs[0] / 12); yy * 12 <= xs[xs.length - 1]; yy++) years.push(yy);
  return `<svg class="tp-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L('jobsLineAria'))}">
    <line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" class="tp-line__axis"/>
    ${[hi / 2, hi / 1.1].map((v) => `<text x="${P.l - 4}" y="${y(v) + 3}" text-anchor="end" class="tp-line__tick">${dec(v, 0)}%</text>`).join('')}
    ${years.map((yy) => `<text x="${x(yy * 12).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="tp-line__tick">${yy}</text>`).join('')}
    ${nat ? `<path d="${path(nat.series)}" class="tp-line__nat"/>` : ''}
    <path d="${path(js.series)}" class="tp-line__self"/>
  </svg>`;
}

const formatMonth = (m) => {
  const [y, mo] = String(m).split('-').map(Number);
  return monthName(y, mo || 1);
};
const nationalJobs = profiles.national?.jobseekers ?? null;


/** Five census shares on one dot plot each: this settlement as a dot, the
 *  járás, the county and the country as ticks along the same line. */
function censusPlot(census) {
  const keys = Object.keys(census);
  if (!keys.length) return '';
  const W = 300; const H = 30; const P = 8;
  const rows = keys.map((k) => {
    const c = census[k];
    const vals = [c.value, c.district, c.county, c.country].filter((v) => v !== null && v !== undefined);
    const hi = Math.max(...vals) * 1.15 || 1;
    const x = (v) => P + (v / hi) * (W - 2 * P);
    const tick = (v, cls, lab) => (v === null || v === undefined ? ''
      : `<line x1="${x(v).toFixed(1)}" x2="${x(v).toFixed(1)}" y1="7" y2="23" class="tp-dot__${cls}"><title>${esc(lab)}: ${dec(100 * v)}%</title></line>`);
    return `<div class="tp-dot">
      <span class="tp-dot__label">${esc(L(`census.${k}`))}</span>
      <svg viewBox="0 0 ${W} ${H}" class="tp-dot__svg" role="img" aria-label="${esc(L(`census.${k}`))}: ${dec(100 * c.value)}%">
        <line x1="${P}" x2="${W - P}" y1="15" y2="15" class="tp-dot__axis"/>
        ${tick(c.country, 'country', L('national'))}${tick(c.county, 'county', L('countyWord'))}${tick(c.district, 'district', L('districtSuffix'))}
        <circle cx="${x(c.value).toFixed(1)}" cy="15" r="6" class="tp-dot__self"><title>${dec(100 * c.value)}%</title></circle>
      </svg>
      <b>${dec(100 * c.value)}%</b>
    </div>`;
  }).join('');
  return `<article class="tp-living__item tp-living__item--wide">
    <h3>${esc(L('censusHeading'))}</h3>
    <p class="tp-dot__legend"><span class="is-self">●</span> ${esc(L('thisSettlement'))}
      <span class="is-district">|</span> ${esc(L('districtSuffix'))}
      <span class="is-county">|</span> ${esc(L('countyWord'))}
      <span class="is-country">|</span> ${esc(L('national'))}</p>
    ${rows}
    <p class="tp-note">${esc(L('censusNote'))}</p>
  </article>`;
}

function grantsCard(grants) {
  if (!grants?.length) return '';
  return `<article class="tp-living__item">
    <h3>${esc(L('grantsHeading'))}</h3>
    <ul class="tp-grants">${grants.map((g) => `<li class="is-${esc(g.status ?? 'unknown')}">
      <b>${esc(String(g.year))}</b> · ${esc(L(`grants.${g.kind}.${g.programme}`))}
      <span>${esc(g.contract ? L(`grants.status.${g.status ?? 'unknown'}`) : L('grants.noContract'))}</span>
    </li>`).join('')}</ul>
    <p class="tp-note">${esc(L('grantsNote'))}</p>
  </article>`;
}

/** This settlement a year from now, per branch, as one chance each. */
function hereCard(here) {
  if (!here) return '';
  const rows = ['gp', 'dental'].filter((k) => here[k]).map((k) => {
    const h = here[k];
    const pct = Math.round(100 * h.pAnyVacant);
    // a vacancy the curve gives almost no chance of filling within the year
    const sure = h.vacantNow > 0 && h.pAnyVacant >= 0.995;
    return `<div class="tp-chance">
      <div class="tp-chance__dial" style="--p:${pct}"><b>${sure ? '!' : `${pct}%`}</b></div>
      <div><h4>${esc(L(`here.${k}`))}</h4>
        <p>${esc(sure ? L('here.sure', { n: num(h.vacantNow), of: num(h.districts) })
          : L(h.districts === 1 ? (h.vacantNow ? 'here.chanceOneNow' : 'here.chanceOne')
            : h.vacantNow ? 'here.chanceNow' : 'here.chance',
            { pct, n: num(h.districts), now: num(h.vacantNow) }))}</p>
        ${h.topDecile ? `<p class="tp-note">${esc(L('here.topDecile', { n: num(h.topDecile) }))}</p>` : ''}
      </div>
    </div>`;
  }).join('');
  return `<article class="tp-living__item">
    <h3>${esc(L('here.heading'))}</h3>${rows}
    <p class="tp-note">${esc(L('here.note'))}</p>
  </article>`;
}

function forecastCard(fc, district) {
  if (!fc) return '';
  const max = Math.max(fc.vacantIn12Band[1], fc.vacantNow, 1);
  const w = (v) => `${((v / max) * 100).toFixed(1)}%`;
  return `<article class="tp-living__item">
    <h3>${esc(L('forecastHeading', { district }))}</h3>
    <p class="tp-living__value">${esc(dec(fc.vacantIn12))}<small>${esc(L('forecastUnit', {
      now: num(fc.vacantNow), of: num(fc.districts) }))}</small></p>
    <div class="tp-forecast">
      <div><span>${esc(L('forecastNow'))}</span><span class="tp-forecast__track"><i style="width:${w(fc.vacantNow)}"></i></span><b>${num(fc.vacantNow)}</b></div>
      <div><span>${esc(L('forecastLater'))}</span><span class="tp-forecast__track"><i class="is-later" style="width:${w(fc.vacantIn12)}"></i>
        <em style="left:${w(fc.vacantIn12Band[0])};width:${((fc.vacantIn12Band[1] - fc.vacantIn12Band[0]) / max * 100).toFixed(1)}%"></em></span><b>${esc(dec(fc.vacantIn12))}</b></div>
    </div>
    <p class="tp-note">${esc(L('forecastNote', { add: dec(fc.expectedNew), fill: dec(fc.expectedRefills),
      lo: dec(fc.vacantIn12Band[0]), hi: dec(fc.vacantIn12Band[1]) }))}</p>
  </article>`;
}

function livingBlock(profile, nationalJobs) {
  const l = profile.living;
  if (!l) return '';
  const name = profile.settlement;
  const district = profile.district;
  const county = profile.county;
  const cap = !!l.capitalWide;
  const parts = [];
  const median = L('medianSettlement');
  // the járás and the county a row names are pages of their own
  const dHref = ctx(`/jaras.html?jar=${encodeURIComponent(district)}`, profile);
  const cHref = ctx('/megye.html', profile);
  if (l.income) {
    const i = l.income;
    parts.push(`<article class="tp-living__item">
      <h3>${esc(L('incomeHeading'))}</h3>
      <p class="tp-living__value">${esc(mFt(i.value))}<small>${esc(L('perYear', { year: i.year }))}</small></p>
      ${cap ? `<p class="tp-note">${esc(L('capitalWide'))}</p>` : compareRows([
        { label: name, v: i.value, self: true },
        { label: `${district} ${L('districtSuffix')}`, v: i.district, href: dHref },
        { label: county, v: i.county, href: cHref },
        { label: median, v: i.median },
      ], mFt)}
      ${i.taxpayers ? `<p class="tp-note">${esc(L('taxpayers', { n: dec(i.taxpayers, 0) }))}</p>` : ''}
    </article>`);
  }
  if (l.jobseekers) {
    const j = l.jobseekers;
    parts.push(`<article class="tp-living__item">
      <h3>${esc(L('jobsHeading'))}</h3>
      <p class="tp-living__value">${esc(dec(j.value))}%<small>${esc(L('jobsOf', {
        n: num(j.registered), of: num(j.workingAge), month: formatMonth(j.month) }))}</small></p>
      ${compareRows([
        { label: name, v: j.value, self: true },
        ...(profile.county === 'Budapest' ? [] : [{ label: `${district} ${L('districtSuffix')}`, v: j.district, href: dHref }]),
        { label: county, v: j.county, href: cHref },
        { label: L('national'), v: j.national },
      ], (v) => `${dec(v)}%`)}
      ${j.longShare !== null ? `<p class="tp-note">${esc(L('jobsLong', { share: dec(j.longShare, 0) }))}</p>` : ''}
      ${jobsLine(j, nationalJobs)}
    </article>`);
  }
  for (const key of ['naturalChange', 'migration']) {
    const v = l[key];
    if (!v) continue;
    parts.push(`<article class="tp-living__item">
      <h3>${esc(L(`${key}Heading`))}</h3>
      <p class="tp-living__value">${esc(signedPm(v.value))}<small>${esc(L('perThousand', {
        from: v.years[0], to: v.years[1] }))}</small></p>
      ${cap ? `<p class="tp-note">${esc(L('capitalWide'))}</p>` : compareRows([
        { label: name, v: v.value, self: true },
        { label: `${district} ${L('districtSuffix')}`, v: v.district, href: dHref },
        { label: county, v: v.county, href: cHref },
        { label: median, v: v.median },
      ], signedPm, true)}
      <p class="tp-note">${esc(L(`${key}Text`))}</p>
    </article>`);
  }
  if (l.gpLoad) {
    parts.push(`<article class="tp-living__item">
      <h3>${esc(L('loadHeading'))}</h3>
      <p class="tp-living__value">${esc(num(Math.round(l.gpLoad.value)))}<small>${esc(L('loadUnit', { year: l.gpLoad.year }))}</small></p>
      ${compareRows([
        { label: name, v: l.gpLoad.value, self: true },
        { label: `${district} ${L('districtSuffix')}`, v: l.gpLoad.district, href: dHref },
      ], (v) => num(Math.round(v)))}
      <p class="tp-note">${esc(L('loadText'))}</p>
    </article>`);
  }
  const avoid = l.avoidable ? `<div class="tp-living__avoid">
      <p>${esc(L('avoidable', {
        // "Az Ajkai járás", "A Pápai járás": the article follows the name
        article: /^[aáeéiíoóöőuúüű]/i.test(district) ? 'Az' : 'A',
        district: `${district}${profile.county === 'Budapest' ? '' : ` ${L('districtSuffix')}`}`,
        value: dec(l.avoidable.district, 0), median: dec(l.avoidable.median, 0), year: l.avoidable.year }))}</p>
      <p class="tp-note">${esc(L('avoidableNote'))}
        <a href="${esc(ctx(`/jaras.html?jar=${encodeURIComponent(district)}#egeszseg`, profile))}">${esc(L('avoidableLink'))}</a></p>
    </div>` : '';
  if (l.census) parts.push(censusPlot(l.census));
  parts.push(grantsCard(l.grants));
  parts.push(hereCard(l.forecastHere));
  if (l.forecast) parts.push(forecastCard(l.forecast, `${district}${profile.county === 'Budapest' ? '' : ` ${L('districtSuffix')}`}`));
  return `<div class="tp-living">${parts.join('')}</div>${avoid}
    <p class="tp-note">${esc(L('noise'))}</p>
    <p class="tp-source">${esc(L('source'))}</p>`;
}

function page(profile) {
  const { settlement, county } = profile;
  // Budapest's districts are their own járás ("Budapest 03. ker."), and
  // printing "Budapest 03. ker. járás" under the heading reads like a typo
  const district = profile.district && profile.district !== settlement
    ? profile.district : '';
  const title = S('page.title', { name: settlement });
  // the optional blocks are built first, so the rail can list what exists
  const streetHtml = streetBlock(profile);
  const changeHtml = changeBlock(profile);
  const present = new Set(['elhelyezkedes', 'lakossag', 'orvosok', 'tavolsag',
    'gyogyszertar', 'kozlekedes', 'kockazat']);
  if (streetHtml) present.add('elerhetoseg');
  const livingHtml = livingBlock(profile, nationalJobs);
  if (livingHtml) present.add('eletkorulmenyek');
  if (changeHtml) present.add('valtozas');
  // the meta description wants one sentence, not the two coloured halves
  const gpState = profile.gp
    ? (stateParts(profile.gp.state) ?? []).map(([text]) => text).join(' ') : '';
  const drive = profile.travel?.gp;
  const desc = [
    S('page.desc', { name: settlement, pop: num(profile.population),
      where: district ? S('page.descDistrict', { county, district }) : county }),
    gpState ? S('page.descGp', { state: gpState.toLowerCase() }) : '',
    drive ? S('page.descDrive', { min: minutes(drive.minutes) }) : '',
    S('page.descSite', { month: monthLabelNow() }),
  ].filter(Boolean).join(' ');

  const cluster = profile.cluster;

  return `<!doctype html>
<html lang="${LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | ${esc(label('site.title'))}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">${gaMeta}
<link rel="canonical" href="${site}${esc(pagePath(profile.slug))}">
${alternates(profile.slug)}
<link rel="stylesheet" href="/assets/${esc(cssFile)}">${streetFile ? `
<script type="module" src="/assets/${esc(streetFile)}" defer></script>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..900&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap&subset=latin-ext" rel="stylesheet">
</head>
<body>
<nav class="topnav"><div class="topnav__inner">
  <a class="topnav__brand" href="${esc(appHref('/'))}">${esc(label('site.title').toUpperCase())}</a>
  ${langSwitch(profile.slug)}
  <div class="topnav__links">
    ${navBar(profile)}
  </div>
</div></nav>

<header class="section container">
  <p class="tp-kicker">${esc(county)}${district ? ` · ${esc(S('page.kickerDistrict', { district }))}` : ''} · ${esc(S('page.kickerPop', { n: num(profile.population) }))}${profile.benefit ? ` · ${esc(S('page.kickerBenefit'))}` : ''}</p>
  <h1 class="section__heading">${esc(settlement)}</h1>
  <p class="section__lead">${esc(S('page.lead'))}</p>
</header>

${sectionRail(present)}

<section class="section container" id="elhelyezkedes">
  <h2 class="section__subheading">${esc(S('page.where'))}</h2>
  ${countyMap(profile, geo, (k, v) => S(`map.${k}`, v), LANG)}
</section>

<section class="section container" id="lakossag">
  <h2 class="section__subheading">${esc(S('page.who'))}</h2>
  ${ageBlock(profile)}
</section>

${livingHtml ? `<section class="section container" id="eletkorulmenyek">
  <h2 class="section__subheading">${esc(L('heading'))}</h2>
  <p class="section__explain">${esc(L('lead'))}</p>
  ${livingHtml}
</section>` : ''}

${streetHtml}

<section class="section container" id="orvosok">
  <h2 class="section__subheading">${esc(S('page.doctors'))}</h2>
  <div class="tp-cards">
    ${branchCard(S('branch.gpTitle'), profile.gp)}
    ${branchCard(S('branch.dentalTitle'), profile.dental)}
  </div>
  ${doctorTable(profile, 'gp', S('doctors.gpHeading'))}
  ${doctorTable(profile, 'dental', S('doctors.dentalHeading'))}
  ${(profile.surgeries ?? []).length
    ? `<p class="tp-note">${esc(S('doctors.note', { from: String(archiveFrom) }))}</p>`
    : `<p class="tp-note">${esc(S('doctors.none'))}</p>`}

  ${divider(S('page.vacantDivider'))}
  <p class="tp-note">${esc(S('page.vacantNote'))}</p>
  ${vacancyTable(profile)}
  ${dentalCatchment(profile)}

  ${divider(S('page.vedonoDivider'))}
  ${vedonoBlock(profile)}
</section>

<section class="section container" id="tavolsag">
  <h2 class="section__subheading">${esc(S('page.distance'))}</h2>
  <p class="section__explain">${esc(S('page.distanceExplain'))}</p>
  ${travelChart(profile)}
  <table class="info-table">
    <thead><tr><th>${esc(S('page.th.care'))}</th><th class="is-num">${esc(S('page.th.drive'))}</th><th class="is-num">${esc(S('page.th.air'))}</th><th>${esc(S('page.th.where'))}</th></tr></thead>
    <tbody>${travelRows(profile)}</tbody>
  </table>
  ${profile.gyse ? `<p class="tp-note">${esc(S('page.gyse', { n: num(profile.gyse) }))}</p>` : ''}
</section>

<section class="section container" id="gyogyszertar">
  <h2 class="section__subheading">${esc(S('pharmacy.heading'))}</h2>
  ${pharmacyBlock(profile)}
  ${streetBlock(profile, { only: ['pharmacy'], id: 'patikaterkep',
    heading: '', lead: S('pharmacy.mapLead') })}
</section>

<section class="section container" id="kozlekedes">
  <h2 class="section__subheading">${esc(S('page.bus'))}</h2>
  ${transitChart(profile)}
  ${transitBlock(profile)}
</section>

<section class="section container" id="kockazat">
  <h2 class="section__subheading">${esc(S('index.heading'))}
    ${helpTip(S('index.help'))}</h2>
  ${indexCompare(profile)}
  ${indexBlock(profile)}
  ${benchBlock(profile)}
  ${cluster ? `<p>${H('index.cluster', { name: esc(cluster.name), n: num(cluster.settlements),
    pop: num(cluster.population) })}</p>` : ''}
  <p class="tp-note">${H('index.note', { link: `<a href="${esc(ctx('/elemzo.html#index', profile))}">${esc(S('index.method'))}</a>` })}</p>
</section>

${changeHtml}

${siteFooter(ctx('/', profile), ctx('/elemzo.html', profile))}
${consentScript}
</body>
</html>
`;
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
function writeIndex(root) {
  const countyBlocks = [...byCounty.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'hu'))
    .map(([county, list]) => `<section class="section container tp-index-county">
    <div class="tp-index-head">
      ${countyThumb(county, geo, undefined, undefined, (k, v) => S(`map.${k}`, v))}
      <div>
        <h2 class="section__subheading">${esc(county)}</h2>
        <p class="tp-note">${esc(S('list.settlements', { n: num(list.length) }))} ·
          <a href="${esc(appHref(`/megye.html?m=${encodeURIComponent(county)}`))}">${esc(S('list.countyData'))}</a></p>
      </div>
    </div>
    <p class="tp-index-list">${[...list]
      .sort((a, b) => a.settlement.localeCompare(b.settlement, 'hu'))
      .map((p) => `<a href="${esc(pagePath(p.slug))}"${
  seatClass(p.settlement)}>${esc(p.settlement)}</a>`)
      .join(' · ')}</p>
  </section>`).join('\n');

  writeFileSync(join(root, 'index.html'), `<!doctype html>
<html lang="${LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(S('list.title'))}</title>
<meta name="description" content="${esc(S('list.desc', { n: profiles.settlements.length }))}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">${gaMeta}
<link rel="canonical" href="${site}${pagePath('')}">
${alternates('')}
<link rel="stylesheet" href="/assets/${esc(cssFile)}">
</head>
<body>
<nav class="topnav"><div class="topnav__inner">
  <a class="topnav__brand" href="${esc(appHref('/'))}">${esc(label('site.title').toUpperCase())}</a>
  ${langSwitch('')}
  <div class="topnav__links">
    ${navBar(null)}
  </div>
</div></nav>
<header class="section container">
  <h1 class="section__heading">${esc(S('list.heading'))}</h1>
  <p class="section__lead">${esc(S('list.lead', { n: profiles.settlements.length }))}</p>
  <p class="tp-note"><span class="tp-seat tp-seat--county">${esc(S('list.seatCounty'))}</span> ·
    <span class="tp-seat tp-seat--jaras">${esc(S('list.seatJaras'))}</span> · ${esc(S('list.rest'))}</p>
</header>
${countyBlocks}
${siteFooter(appHref('/'), appHref('/elemzo.html'))}
${consentScript}
</body>
</html>
`, 'utf8');
}

let written = 0;
for (const lang of ['hu', 'en']) {
  LANG = lang;
  DICT = DICTS[lang];
  const root = lang === 'en' ? join(dist, 'en', 'telepules') : join(dist, 'telepules');
  for (const profile of profiles.settlements) {
    const dir = join(root, profile.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), page(profile), 'utf8');
    written += 1;
  }
  writeIndex(root);
}
LANG = 'hu';
DICT = hu;

// a sitemap, so the pages are findable at all
const urls = ['/', '/elemzo.html', '/eeszt.html', '/szakellato.html', '/telepules/', '/en/telepules/']
  .concat(profiles.settlements.map((p) => `/telepules/${p.slug}/`))
  .concat(profiles.settlements.map((p) => `/en/telepules/${p.slug}/`));
writeFileSync(join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + urls.map((u) => `<url><loc>${site}${u}</loc></url>`).join('\n')
  + '\n</urlset>\n', 'utf8');

console.log(`settlement pages generated: ${written} + index + sitemap (${urls.length} urls)`);
