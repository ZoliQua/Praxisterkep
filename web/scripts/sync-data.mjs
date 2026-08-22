// Copy the ETL outputs into public/data so Vite serves/bundles them.
// Fails loudly if the pipeline has not produced data yet (no fallback data —
// the app must never show numbers that don't trace to a source file).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const out = resolve(here, '..', 'public', 'data');

const files = [
  [join(repo, 'data', 'latest.json'), join(out, 'latest.json')],
  [join(repo, 'data', 'timeseries.json'), join(out, 'timeseries.json')],
  [join(repo, 'data', 'geo', 'counties.geojson'), join(out, 'counties.geojson')],
];

mkdirSync(out, { recursive: true });
for (const [src, dst] of files) {
  if (!existsSync(src)) {
    console.error(`missing ${src} — run the ETL first: python etl/run.py --month YYYY-MM`);
    process.exit(1);
  }
  copyFileSync(src, dst);
  console.log(`synced ${dst}`);
}
