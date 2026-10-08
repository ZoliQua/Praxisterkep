// The boundary files, fetched once and shared. They are static geometry, so a
// module-level cache per file is all the state they need.
import { useEffect, useState } from 'react';

export interface GeoFile {
  type: string;
  features: { type: string; properties: Record<string, unknown>; geometry: {
    type: string; coordinates: unknown } }[];
}

const cache = new Map<string, GeoFile | null>();
const pending = new Map<string, Promise<GeoFile | null>>();

export function useGeo(name: string): GeoFile | null {
  const [data, setData] = useState<GeoFile | null>(cache.get(name) ?? null);
  useEffect(() => {
    let alive = true;
    if (!pending.has(name)) {
      pending.set(name, fetch(`${import.meta.env.BASE_URL}data/${name}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: GeoFile | null) => { cache.set(name, d); return d; })
        .catch(() => null));
    }
    void pending.get(name)!.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [name]);
  return data;
}
