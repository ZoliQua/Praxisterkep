// A short content hash of every file served under /data, for vite.config.ts
// to hand the app as __DATA_VERSIONS__. The app asks for data/x.json?v=<hash>
// (src/lib/dataUrl.ts), so vercel.json can let browsers keep a versioned
// file for good: a new release names new hashes, and a page can never pair
// this release's code with last month's data from the browser cache.
// Without public/data (a test run before any sync) the map is simply empty
// and every URL stays unversioned.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export function dataVersions(dir) {
  const out = {};
  if (!existsSync(dir)) return out;
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(geo)?json$/.test(name)) {
        const key = relative(dir, full).split(sep).join('/');
        out[key] = createHash('sha256').update(readFileSync(full)).digest('hex').slice(0, 10);
      }
    }
  };
  walk(dir);
  return out;
}
