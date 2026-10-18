// The European comparison (europa.html): the data, and the few selectors the
// page needs — the latest value of a country, a ranking inside the chosen
// group, the colour of a value on a map. Everything here is pure, so the
// tests can hold it to the rules the ETL keeps: one source per country, a
// year on every value, nothing ranked that is too old to compare.
import { useEffect, useState } from 'react';
import { locale } from './i18n';
import { formatDecimal, formatNumber } from './format';

export type Better = 'higher' | 'lower' | 'neutral';
export type Branch = 'gp' | 'dental' | 'both';
export type EuSection = 'needs' | 'workforce' | 'access' | 'outcomes' | 'spending' | 'pay';
export type EuUnit = 'per100k' | 'pct' | 'perCapita' | 'pps' | 'ratio' | 'years' | 'pctEu';
export type GroupKey = 'all' | 'cee' | 'v4';
export type Series = Record<string, number>;

export interface EuIndicator {
  section: EuSection;
  branch: Branch;
  better: Better;
  unit: EuUnit;
  source: 'eurostat' | 'oecd';
  dataset: string;
  url: string;
  fetched: string;
  years: string[];
  values: Record<string, Series>;
  eu: Series;
  sourceByGeo: Record<string, 'oecd'>;
  /** the dumbbell this series is one end of (city/rural, poorest/richest) */
  part?: string;
}

export interface EuRegional {
  indicators: Record<string, { better: Better; unit: EuUnit; dataset: string; url: string }>;
  names: Record<string, string>;
  values: Record<string, Record<string, Series>>;
  borderPairs: [string, string][];
  unmapped: string[];
}

export interface EuMigration {
  dataset: string;
  /** who works in a country having trained abroad, by where */
  inflow: Record<string, { year: string; foreign: number; domestic: number | null;
    origins: [string, number][]; other: number }>;
  /** where the doctors a country trained work, as the destinations report */
  outflow: Record<string, { destinations: [string, string, number][]; total: number;
    home: number | null; homeYear: string | null }>;
}

export interface EuropeRaw {
  schemaVersion: number;
  built: string;
  countries: string[];
  eu27: string[];
  groups: Record<GroupKey, string[]>;
  fetched: Record<string, string>;
  indicators: Record<string, EuIndicator>;
  migration: EuMigration;
  regional: EuRegional;
}

export interface EuShape { id: string; name: string; carried?: boolean;
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } }
export interface EuropeGeo { attribution: string; countries: EuShape[]; regions: EuShape[] }

function loader<T>(file: string): () => T | null {
  let cache: T | null = null;
  let pending: Promise<T | null> | null = null;
  const load = (): Promise<T | null> => {
    if (cache) return Promise.resolve(cache);
    pending ??= fetch(`${import.meta.env.BASE_URL}data/${file}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: T | null) => { cache = d; return d; })
      .catch(() => null);
    return pending;
  };
  return function useData(): T | null {
    const [data, setData] = useState<T | null>(cache);
    useEffect(() => {
      let alive = true;
      void load().then((d) => { if (alive) setData(d); });
      return () => { alive = false; };
    }, []);
    return data;
  };
}

export const useEurope = loader<EuropeRaw>('europe.json');
export const useEuropeGeo = loader<EuropeGeo>('europe_geo.json');

/* ------------------------------ selectors ----------------------------- */

/** Which indicators a section shows for the chosen branch, in file order;
 *  the ends of a dumbbell are drawn by the dumbbell, not as chips. */
export function sectionIndicators(raw: EuropeRaw, section: EuSection, kind: 'gp' | 'dental'): string[] {
  return Object.entries(raw.indicators)
    .filter(([, i]) => i.section === section && !i.part && (i.branch === kind || i.branch === 'both'))
    .map(([k]) => k);
}

export interface Latest { year: string; value: number }

export function latest(series: Series | undefined): Latest | null {
  if (!series) return null;
  const years = Object.keys(series);
  if (!years.length) return null;
  const year = years.reduce((a, b) => (b > a ? b : a));
  return { year, value: series[year] };
}

/** A value more than this many years older than the newest one published
 *  for the indicator is shown, marked, and left out of the ranking. */
export const STALE_YEARS = 5;

export interface RankRow {
  geo: string;
  year: string;
  value: number;
  stale: boolean;
  /** 1 = best in the group; null for neutral measures and stale values */
  rank: number | null;
  oecd: boolean;
}

/** The newest year any country of `members` has for this indicator. */
export function newestYear(ind: EuIndicator, members: string[]): string | null {
  let best: string | null = null;
  for (const g of members) {
    const l = latest(ind.values[g]);
    if (l && (!best || l.year > best)) best = l.year;
  }
  return best;
}

/**
 * The members that have a value, best first (or highest first when the
 * measure has no good direction). Stale values come last, unranked.
 */
export function ranking(ind: EuIndicator, members: string[]): RankRow[] {
  const newest = newestYear(ind, members);
  const rows: RankRow[] = [];
  for (const geo of members) {
    const l = latest(ind.values[geo]);
    if (!l) continue;
    const stale = newest !== null && Number(newest) - Number(l.year) > STALE_YEARS;
    rows.push({ geo, year: l.year, value: l.value, stale, rank: null,
      oecd: ind.sourceByGeo[geo] === 'oecd' });
  }
  const sign = ind.better === 'lower' ? 1 : -1;
  rows.sort((a, b) => Number(a.stale) - Number(b.stale) || sign * (a.value - b.value));
  if (ind.better !== 'neutral') {
    let n = 0;
    for (const r of rows) if (!r.stale) r.rank = ++n;
  }
  return rows;
}

export interface Standing { rank: number; of: number; row: RankRow }

/** Where one country stands among the ranked members, if it is ranked. */
export function standing(rows: RankRow[], geo: string): Standing | null {
  const row = rows.find((r) => r.geo === geo);
  if (!row || row.rank === null) return null;
  return { rank: row.rank, of: rows.filter((r) => r.rank !== null).length, row };
}

/** The EU-27 aggregate as Eurostat publishes it, else the members' median —
 *  said which, because a median of countries is not the EU's own figure. */
export function reference(ind: EuIndicator, rows: RankRow[]): { value: number; year: string; kind: 'eu' | 'median' } | null {
  const eu = latest(ind.eu);
  if (eu) return { ...eu, kind: 'eu' };
  const live = rows.filter((r) => !r.stale).map((r) => r.value).sort((a, b) => a - b);
  if (!live.length) return null;
  const mid = live.length / 2;
  const value = live.length % 2 ? live[Math.floor(mid)] : (live[mid - 1] + live[mid]) / 2;
  const year = rows.filter((r) => !r.stale).map((r) => r.year).sort().pop() ?? '';
  return { value, year, kind: 'median' };
}

/** 0 = the worst value drawn, 1 = the best; neutral measures read low → high. */
export function goodness(better: Better, value: number, lo: number, hi: number): number {
  if (hi <= lo) return 0.5;
  const s = (value - lo) / (hi - lo);
  return better === 'lower' ? 1 - s : s;
}

/** Years every series of the chart can be placed on, oldest first. */
export function yearAxis(ind: EuIndicator, members: string[]): string[] {
  const ys = new Set<string>();
  for (const g of members) for (const y of Object.keys(ind.values[g] ?? {})) ys.add(y);
  for (const y of Object.keys(ind.eu)) ys.add(y);
  return [...ys].sort();
}

/** A value in the unit it is published in. */
export function formatValue(unit: EuUnit, v: number): string {
  switch (unit) {
    case 'pct': return `${formatDecimal(v.toFixed(v < 10 ? 1 : 0))}%`;
    case 'pctEu': return `${formatNumber(Math.round(v))}`;
    case 'per100k': return formatNumber(Math.round(v));
    case 'perCapita': return formatDecimal(v.toFixed(1));
    case 'pps': return formatNumber(Math.round(v));
    case 'ratio': return `${formatDecimal(v.toFixed(1))}×`;
    case 'years': return formatDecimal(v.toFixed(1));
    default: return String(v);
  }
}

/** The groups in the order the picker offers them. */
export const GROUP_KEYS: GroupKey[] = ['all', 'cee', 'v4'];

/** ?orszagok=v4 — the group survives a reload and a shared link. */
export function groupFromUrl(search: string): GroupKey {
  const g = new URLSearchParams(search).get('orszagok');
  return g === 'cee' || g === 'v4' || g === 'all' ? g : 'cee';
}

/** Countries sorted by their name in the page's language. */
export function byName(geos: string[], name: (g: string) => string): string[] {
  return [...geos].sort((a, b) => name(a).localeCompare(name(b), locale));
}

/* ------------------------------ page parts ---------------------------- */

/** The element id each section of europa.html answers to. */
export const SECTION_IDS: Record<EuSection, string> = {
  needs: 'igeny', workforce: 'munkaero', access: 'hozzaferes', outcomes: 'eredmeny', spending: 'kiadas', pay: 'berek',
};

export interface PairRow { geo: string; year: string; a: number; b: number }

/** Two ends of one measure per country, at the latest year both report,
 *  the widest gap first. */
export function pairRows(a: EuIndicator, b: EuIndicator, members: string[]): PairRow[] {
  const out: PairRow[] = [];
  for (const geo of members) {
    const sa = a.values[geo] ?? {};
    const sb = b.values[geo] ?? {};
    const common = Object.keys(sa).filter((y) => y in sb).sort();
    const year = common[common.length - 1];
    if (year) out.push({ geo, year, a: sa[year], b: sb[year] });
  }
  return out.sort((p, q) => Math.abs(q.a - q.b) - Math.abs(p.a - p.b));
}

export interface ChangeRow { geo: string; fromYear: string; from: number; toYear: string; to: number }

/**
 * Each member's latest value beside its value about `span` years earlier —
 * the year exactly, else the nearest one within two years of it, so a
 * country that skipped a year still has a start. No start, no row.
 */
export function changeRows(ind: EuIndicator, members: string[], span = 10): ChangeRow[] {
  const out: ChangeRow[] = [];
  for (const geo of members) {
    const series = ind.values[geo];
    const l = latest(series);
    if (!series || !l) continue;
    const target = Number(l.year) - span;
    const start = Object.keys(series).map(Number)
      .filter((y) => Math.abs(y - target) <= 2)
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
    if (start === undefined) continue;
    out.push({ geo, fromYear: String(start), from: series[String(start)], toYear: l.year, to: l.value });
  }
  const sign = ind.better === 'lower' ? 1 : -1;
  return out.sort((a, b) => sign * (a.to - b.to));
}

export interface ProfileRow { key: string; section: EuSection; rank: number; of: number; score: number }

/**
 * Where one country stands on every ranked measure of a branch: 1 = best of
 * the group, 0 = worst. Neutral and stale measures are left out — they have
 * no "better" to stand on.
 */
export function profile(raw: EuropeRaw, kind: 'gp' | 'dental', members: string[], geo: string): ProfileRow[] {
  const out: ProfileRow[] = [];
  for (const [key, ind] of Object.entries(raw.indicators)) {
    if (ind.part || ind.better === 'neutral' || (ind.branch !== kind && ind.branch !== 'both')) continue;
    const rows = ranking(ind, members);
    const st = standing(rows, geo);
    if (!st || st.of < 3) continue;
    out.push({ key, section: ind.section, rank: st.rank, of: st.of, score: 1 - (st.rank - 1) / (st.of - 1) });
  }
  return out.sort((a, b) => b.score - a.score);
}
