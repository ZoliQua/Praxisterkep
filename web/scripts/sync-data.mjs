// Copy the ETL outputs into public/data so Vite serves/bundles them.
// Fails loudly if the pipeline has not produced data yet (no fallback data —
// the app must never show numbers that don't trace to a source file).
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const out = resolve(here, '..', 'public', 'data');

const files = [
  [join(repo, 'data', 'latest.json'), join(out, 'latest.json')],
  [join(repo, 'data', 'timeseries.json'), join(out, 'timeseries.json')],
  [join(repo, 'data', 'history.json'), join(out, 'history.json')],
  [join(repo, 'data', 'geo', 'counties.geojson'), join(out, 'counties.geojson')],
  [join(repo, 'data', 'geo', 'jaras.geojson'), join(out, 'jaras.geojson')],
  [join(repo, 'data', 'geo', 'cities.geojson'), join(out, 'cities.geojson')],
  [join(repo, 'data', 'geo', 'budapest.geojson'), join(out, 'budapest.geojson')],
];
// optional supplements — copied only when present
const optional = [
  [join(repo, 'data', 'eeszt.json'), join(out, 'eeszt.json')],
  [join(repo, 'data', 'dental_extra.json'), join(out, 'dental_extra.json')],
  [join(repo, 'data', 'crosscheck.json'), join(out, 'crosscheck.json')],
  [join(repo, 'data', 'access.json'), join(out, 'access.json')],
  [join(repo, 'data', 'providers.json'), join(out, 'providers.json')],
  [join(repo, 'data', 'operating.json'), join(out, 'operating.json')],
  [join(repo, 'data', 'kedvezmenyezett.json'), join(out, 'kedvezmenyezett.json')],
  [join(repo, 'data', 'risk.json'), join(out, 'risk.json')],
];

mkdirSync(out, { recursive: true });
// monthly snapshots for the map time slider
const dataDir = join(repo, 'data');
for (const dir of readdirSync(dataDir)) {
  if (!/^\d{4}-\d{2}$/.test(dir)) continue;
  for (const kind of ['dental', 'gp']) {
    const src = join(dataDir, dir, `${kind}.json`);
    if (!existsSync(src)) continue;
    const dstDir = join(out, 'months', dir);
    mkdirSync(dstDir, { recursive: true });
    copyFileSync(src, join(dstDir, `${kind}.json`));
  }
}
console.log('synced monthly snapshots');
for (const [src, dst] of files) {
  if (!existsSync(src)) {
    console.error(`missing ${src} — run the ETL first: python etl/run.py --month YYYY-MM`);
    process.exit(1);
  }
  copyFileSync(src, dst);
  console.log(`synced ${dst}`);
}
for (const [src, dst] of optional) {
  if (!existsSync(src)) continue;
  copyFileSync(src, dst);
  console.log(`synced ${dst}`);
}

// a manifest of everything served under /data, for the public download page:
// the page never hardcodes a file list, so it cannot advertise a missing file
const manifest = [];
for (const [, dst] of [...files, ...optional]) {
  if (!existsSync(dst)) continue;
  const stat = statSync(dst);
  manifest.push({
    path: dst.slice(out.length + 1).split(sep).join('/'),
    bytes: stat.size,
    modified: stat.mtime.toISOString().slice(0, 10),
  });
}
const monthsDir = join(out, 'months');
if (existsSync(monthsDir)) {
  const months = readdirSync(monthsDir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort();
  const bytes = months.reduce((sum, m) => sum + readdirSync(join(monthsDir, m))
    .reduce((s2, f) => s2 + statSync(join(monthsDir, m, f)).size, 0), 0);
  manifest.push({
    path: 'months/', bytes, modified: months.at(-1) ?? '',
    count: months.length, from: months[0] ?? '', to: months.at(-1) ?? '',
  });
}
manifest.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(join(out, 'manifest.json'),
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), files: manifest }, null, 1));
console.log(`wrote manifest: ${manifest.length} entries`);
