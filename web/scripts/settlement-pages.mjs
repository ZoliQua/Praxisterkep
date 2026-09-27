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

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const profiles = JSON.parse(
  readFileSync(join(here, '..', '..', 'data', 'settlements.json'), 'utf8'),
);

const HU_MONTHS = ['január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
const [year, month] = profiles.dataMonth.split('-').map(Number);
const monthLabel = `${year}. ${HU_MONTHS[month - 1]}`;

// the built stylesheet carries a content hash, so it is looked up, not guessed
const cssFile = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.css'))
  .sort((a, b) => b.length - a.length)[0];

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
];

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
      ? esc(t.at) : '<em>helyben</em>';
    return `<tr><td>${esc(label)}</td><td class="is-num">${esc(minutes(t.minutes))}</td>
      <td class="is-num">${t.km === null || t.km === undefined ? '–' : `${esc(String(t.km).replace('.', ','))} km`}</td>
      <td>${where}</td></tr>`;
  }).join('\n');
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

function page(profile) {
  const { settlement, county, district } = profile;
  const title = `${settlement} — alapellátás egy helyen`;
  const gpState = profile.gp ? (STATE[profile.gp.state] ?? [''])[0] : '';
  const drive = profile.travel?.gp;
  const desc = [
    `${settlement} (${county}${district ? `, ${district} járás` : ''}), ${num(profile.population)} lakos.`,
    gpState ? `Háziorvos: ${gpState.toLowerCase()}.` : '',
    drive ? `A legközelebbi háziorvosi rendelő ${minutes(drive.minutes)}.` : '',
    `Praxistérkép, ${monthLabel}.`,
  ].filter(Boolean).join(' ');

  const age = profile.age;
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
<link rel="stylesheet" href="/assets/${esc(cssFile)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..900&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap&subset=latin-ext" rel="stylesheet">
</head>
<body>
<nav class="topnav"><div class="topnav__inner">
  <a class="topnav__brand" href="/">PRAXISTÉRKÉP</a>
  <div class="topnav__links">
    <div class="topnav__group"><a href="/">Főoldal</a></div>
    <div class="topnav__group"><a href="/telepules/">Települések</a></div>
    <div class="topnav__group"><a href="/elemzo.html">Elemző</a></div>
    <div class="topnav__group"><a href="/szakellato.html">Szakellátás</a></div>
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
  <h2 class="section__subheading">Van-e orvos?</h2>
  <div class="tp-cards">
    ${branchCard('Háziorvosi ellátás', profile.gp)}
    ${branchCard('Fogorvosi ellátás', profile.dental)}
  </div>
  ${profile.vedono ? `<p class="tp-note">Védőnői szolgálat telephelye a településen:
    ${num(profile.vedono.territorial)} területi, ${num(profile.vedono.school)} iskolai.</p>` : ''}
  <p class="tp-note">A betöltetlenség nem azonos az ellátatlansággal: a helyettesítés a
    nyilvános adatokban nem látszik.</p>
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
  <h2 class="section__subheading">Busszal is elérhető?</h2>
  ${transitBlock(profile)}
</section>

${age ? `<section class="section container">
  <h2 class="section__subheading">Kik laknak itt?</h2>
  <p>${num(profile.population)} lakosból <strong>${num(age.young)}</strong> gyermek
    (0–14 éves, ${pct(age.youngShare)}) és <strong>${num(age.old)}</strong> idős
    (65 év feletti, ${pct(age.oldShare)}).</p>
  <p class="tp-note">Korösszetétel: KSH, 2022. évi népszámlálás (CC BY 4.0), a mai
    lakosságra vetítve.</p>
</section>` : ''}

<section class="section container">
  <h2 class="section__subheading">Összetett ellátási kockázati index</h2>
  ${indexBlock(profile)}
  ${cluster ? `<p>Ez a település egy <strong>összefüggő ellátási hiányterület</strong> része
    (${esc(cluster.name)} környéke: ${num(cluster.settlements)} település,
    ${num(cluster.population)} lakos).</p>` : ''}
  <p class="tp-note">Az index nyolc nyilvános mutató súlyozott átlaga, országos
    rangsorszázalékokból. Összehasonlítás, nem ítélet: a magas érték azt jelenti, hogy több
    mutató mutat ugyanabba az irányba — nem azt, hogy ott nincs ellátás.
    <a href="/elemzo.html#index">A módszer részletesen</a>.</p>
</section>

<footer class="section container tp-footer">
  <p>Adatállapot: ${esc(monthLabel)}. Források: NEAK szerződött szolgáltatók és betöltetlen
    körzetek, EESZT törzspublikáció, KSH Helységnévtár és 2022. évi népszámlálás,
    OpenStreetMap, Volánbusz menetrend. A NEAK adatai tájékoztató jellegűek.</p>
  <p><a href="/">Vissza a térképhez</a> · <a href="/telepules/">Minden település</a> ·
    <a href="/elemzo.html">Elemző</a> · <a href="/#adatok">Adat export</a></p>
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
  .map(([county, list]) => `<section class="section container">
    <h2 class="section__subheading">${esc(county)}</h2>
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
  <p class="section__lead">Mind a ${profiles.settlements.length} település adatlapja, vármegyénként.</p>
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
