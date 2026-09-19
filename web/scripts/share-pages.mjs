// Generates one static share page per county into dist/megye/<slug>/ —
// crawlers get county-specific OG metadata, humans get redirected to the
// map focused on that county. Runs in postbuild.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const latest = JSON.parse(
  readFileSync(join(here, '..', 'public', 'data', 'latest.json'), 'utf8'),
);

const HU_MONTHS = ['január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
const [y, m] = latest.month.split('-').map(Number);
const monthLabel = `${y}. ${HU_MONTHS[m - 1]}`;

const slugify = (name) => name.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-');

const pct = (r) => `${(r * 100).toFixed(1).replace('.', ',')}%`;
const line = (snapshot, county) => {
  const c = snapshot.counties.find((x) => x.name === county);
  if (!c) return null;
  const all = c.vacant + c.dissolved;
  return c.total ? `${all}/${c.total} (${pct(all / c.total)})` : String(all);
};

const esc = (s) => s.replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const counties = [...new Set([
  ...latest.kinds.dental.counties.map((c) => c.name),
  ...latest.kinds.gp.counties.map((c) => c.name),
])].sort((a, b) => a.localeCompare(b, 'hu'));

for (const county of counties) {
  const dLine = line(latest.kinds.dental, county);
  const gLine = line(latest.kinds.gp, county);
  const desc = [
    dLine ? `Fogorvosi: ${dLine}` : null,
    gLine ? `Háziorvosi: ${gLine}` : null,
    `Praxistérkép, ${monthLabel}`,
  ].filter(Boolean).join(' · ');
  const target = `/?m=${encodeURIComponent(county)}#terkep`;
  const title = `${county} — betöltetlen alapellátási körzetek`;
  const html = `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="description" content="${esc(desc)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<link rel="canonical" href="/">
</head>
<body>
<p><a href="${esc(target)}">${esc(title)}</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>
`;
  const dir = join(dist, 'megye', slugify(county));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}
console.log(`share pages generated for ${counties.length} counties`);
