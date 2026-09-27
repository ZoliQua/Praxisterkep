// Where a settlement's own page lives. The slugs are decided in the ETL
// (accent-stripped names collide — Komló and Kömlő both give "komlo" — so
// the larger settlement keeps the plain slug and the others carry their
// county), and the map of them is small enough to ship.
import { useEffect, useState } from 'react';

type Row = [name: string, county: string, slug: string];

let cache: Map<string, string> | null = null;
let pending: Promise<Map<string, string>> | null = null;

const key = (name: string, county: string) => `${name}|${county}`;

export function useSettlementLinks(): (name: string, county: string) => string | null {
  const [map, setMap] = useState<Map<string, string> | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/settlement_slugs.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { settlements: Row[] } | null) => {
        cache = new Map((d?.settlements ?? []).map(([n, c, s]) => [key(n, c), s]));
        return cache;
      })
      .catch(() => new Map<string, string>());
    void pending.then((m) => { if (alive) setMap(m); });
    return () => { alive = false; };
  }, []);

  return (name: string, county: string) => {
    const slug = map?.get(key(name, county));
    return slug ? `${import.meta.env.BASE_URL}telepules/${slug}/` : null;
  };
}
