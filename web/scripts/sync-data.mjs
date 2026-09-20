// Copy the ETL outputs into public/data so Vite serves/bundles them.
// Fails loudly if the pipeline has not produced data yet (no fallback data —
// the app must never show numbers that don't trace to a source file).
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
];
// optional supplements — copied only when present
const optional = [
  [join(repo, 'data', 'eeszt.json'), join(out, 'eeszt.json')],
  [join(repo, 'data', 'dental_extra.json'), join(out, 'dental_extra.json')],
  [join(repo, 'data', 'crosscheck.json'), join(out, 'crosscheck.json')],
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
