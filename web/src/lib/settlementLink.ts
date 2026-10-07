// Where a settlement's own page lives. The slugs are decided in the ETL
// (accent-stripped names collide — Komló and Kömlő both give "komlo" — so
// the larger settlement keeps the plain slug and the others carry their
// county), and the map of them is small enough to ship.
import { useEffect, useState } from 'react';

type Row = [name: string, county: string, slug: string];

export interface SettlementIndex {
  /** "name|county" -> slug */
  bySlugKey: Map<string, string>;
  /** slug -> name and county, for showing what a bare slug in a link means */
  bySlug: Map<string, { name: string; county: string }>;
}

let cache: SettlementIndex | null = null;
let pending: Promise<SettlementIndex> | null = null;

const key = (name: string, county: string) => `${name}|${county}`;
const empty = (): SettlementIndex => ({ bySlugKey: new Map(), bySlug: new Map() });

export function useSettlementIndex(): SettlementIndex | null {
  const [index, setIndex] = useState<SettlementIndex | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/settlement_slugs.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { settlements: Row[] } | null) => {
        const out = empty();
        for (const [name, county, slug] of d?.settlements ?? []) {
          out.bySlugKey.set(key(name, county), slug);
          out.bySlug.set(slug, { name, county });
        }
        cache = out;
        return out;
      })
      .catch(empty);
    void pending.then((m) => { if (alive) setIndex(m); });
    return () => { alive = false; };
  }, []);
  return index;
}

export function settlementHref(slug: string): string {
  return `${import.meta.env.BASE_URL}telepules/${slug}/`;
}

export function useSettlementLinks(): (name: string, county: string) => string | null {
  const index = useSettlementIndex();
  return (name: string, county: string) => {
    const slug = index?.bySlugKey.get(key(name, county));
    return slug ? settlementHref(slug) : null;
  };
}

/** What a slug in the address bar stands for — null while the index loads. */
export function useSettlementBySlug(slug: string | null): { name: string; county: string } | null {
  const index = useSettlementIndex();
  return slug ? index?.bySlug.get(slug) ?? null : null;
}
