// GP practices without a district obligation (data/nonterritorial.json):
// the TN rows of NEAK's GP registry, which the district denominator leaves
// out, counted beside the districts in every archived registry.
import { useEffect, useState } from 'react';
import { dataUrl } from './dataUrl';

export const TEK_TYPES = ['adult', 'mixed', 'child'] as const;
export type TekType = typeof TEK_TYPES[number];

interface Counts { total: number; byType: Record<TekType, number> }

export interface TekMonth {
  month: string;
  territorial: Counts;
  nonTerritorial: Counts & { unnamed: number };
}

export interface TekFlows {
  from: string; to: string;
  start: number; end: number; kept: number;
  left: number; new: number; toTerritorial: number; fromTerritorial: number;
}

export interface NonTerritorialRaw {
  months: TekMonth[];
  latest: {
    month: string;
    byCounty: { county: string; n: number }[];
    bySeat: { settlement: string; county: string; n: number }[];
  };
  span: TekFlows;
  pairs: { count: number; left: number; new: number; toTerritorial: number; fromTerritorial: number };
  pairList: { from: string; to: string; left: number; new: number; start: number; end: number }[];
  operators: Record<'now' | 'left' | 'new', Record<Operator, number>>;
  sinceStart: number;
  continuity: Record<'T' | 'TN', { compared: number; same: number }>;
}

/** Who runs a practice, from the provider's name (etl/parse_gp.operator_kind). */
export const OPERATORS = ['state', 'university', 'company', 'sole', 'other', 'unknown'] as const;
export type Operator = typeof OPERATORS[number];

/** Institutions (state bodies, universities) against companies and sole traders. */
export function institutionSplit(c: Record<Operator, number>) {
  return { institutions: c.state + c.university, business: c.company + c.sole + c.other, unknown: c.unknown };
}

export interface TekRow { key: TekType | 'total'; territorial: number; nonTerritorial: number; all: number }

/** The latest registry by type, districts and TN practices side by side, plus the sum. */
export function tekRows(m: TekMonth): TekRow[] {
  const rows: TekRow[] = TEK_TYPES.map((k) => ({
    key: k,
    territorial: m.territorial.byType[k],
    nonTerritorial: m.nonTerritorial.byType[k],
    all: m.territorial.byType[k] + m.nonTerritorial.byType[k],
  }));
  rows.push({
    key: 'total',
    territorial: m.territorial.total,
    nonTerritorial: m.nonTerritorial.total,
    all: m.territorial.total + m.nonTerritorial.total,
  });
  return rows;
}

/** The last archived registry of each year: the series the trend table shows. */
export function yearEnds(months: TekMonth[]): TekMonth[] {
  const byYear = new Map<string, TekMonth>();
  for (const m of months) byYear.set(m.month.slice(0, 4), m); // months are sorted
  return [...byYear.values()];
}

let cache: NonTerritorialRaw | null = null;
let pending: Promise<NonTerritorialRaw | null> | null = null;

export function useNonTerritorial(): NonTerritorialRaw | null {
  const [data, setData] = useState<NonTerritorialRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(dataUrl('nonterritorial.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: NonTerritorialRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}
