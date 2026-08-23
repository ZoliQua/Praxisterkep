// Pure derivation logic over the snapshot — kept free of presentation so it
// can be unit-tested (see selectors.test.ts).
import type { Praxis, PraxisType, SettlementEntry, Snapshot } from '../types';
import { monthsBetween } from './format';

export const SZOMBATHELY_POPULATION = 75_000; // KSH nagyságrend, kontextushoz

export type TypeFilter = PraxisType | 'all';

export function filterPraxes(praxes: Praxis[], type: TypeFilter): Praxis[] {
  return type === 'all' ? praxes : praxes.filter((p) => p.type === type);
}

export function medianVacancyMonths(praxes: Praxis[], month: string): number {
  const durations = praxes
    .map((p) => monthsBetween(p.vacantSince, month))
    .sort((a, b) => a - b);
  if (durations.length === 0) return 0;
  const mid = Math.floor(durations.length / 2);
  return durations.length % 2
    ? durations[mid]
    : Math.round((durations[mid - 1] + durations[mid]) / 2);
}

export function longestVacant(praxes: Praxis[]): Praxis | undefined {
  return [...praxes].sort((a, b) => a.vacantSince.localeCompare(b.vacantSince))[0];
}

export interface CountyRankingRow {
  name: string;
  rate: number;
  vacantAll: number;
  total: number;
}

/** County ranking; `minMonths` keeps only districts vacant at least that
 * long (0 = every vacant/dissolved district, matching the aggregates). */
export function countyRanking(snapshot: Snapshot, minMonths = 0): CountyRankingRow[] {
  const counts = new Map<string, number>();
  for (const p of snapshot.praxes) {
    if (monthsBetween(p.vacantSince, snapshot.month) < minMonths) continue;
    counts.set(p.county, (counts.get(p.county) ?? 0) + 1);
  }
  return snapshot.counties
    .map((c) => {
      const vacantAll = counts.get(c.name) ?? 0;
      return {
        name: c.name,
        rate: c.total ? vacantAll / c.total : 0,
        vacantAll,
        total: c.total ?? 0,
      };
    })
    .sort((a, b) => b.rate - a.rate);
}

export type PraxisSortKey =
  | 'settlement' | 'county' | 'district' | 'type' | 'vacantSince' | 'population';

/** Sortable rows for the full vacancy table (one row per praxis). */
export function praxisTableRows(snapshot: Snapshot) {
  return snapshot.praxes.map((p) => {
    const site = primarySite(p);
    return {
      id: p.id,
      status: p.status,
      settlement: site?.settlement ?? '',
      county: p.county,
      district: site?.district ?? '',
      type: p.type,
      vacantSince: p.vacantSince,
      months: monthsBetween(p.vacantSince, snapshot.month),
      population: p.population,
    };
  });
}

export type PraxisTableRow = ReturnType<typeof praxisTableRows>[number];

export function sortPraxisRows(
  rows: PraxisTableRow[], key: PraxisSortKey, dir: 'asc' | 'desc',
): PraxisTableRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    if (typeof av === 'number' || typeof bv === 'number') {
      return sign * (Number(av ?? 0) - Number(bv ?? 0));
    }
    return sign * String(av).localeCompare(String(bv), 'hu');
  });
}

export function searchSettlements(
  settlements: SettlementEntry[],
  query: string,
  limit = 8,
): SettlementEntry[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const starts = settlements.filter((s) => normalize(s.name).startsWith(q));
  const contains = settlements.filter(
    (s) => !normalize(s.name).startsWith(q) && normalize(s.name).includes(q),
  );
  return [...starts, ...contains].slice(0, limit);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function praxesById(snapshot: Snapshot): Map<string, Praxis> {
  return new Map(snapshot.praxes.map((p) => [p.id, p]));
}

/** First surgery site (skips headquarters when a real surgery exists). */
export function primarySite(praxis: Praxis) {
  return praxis.sites.find((s) => !s.isHeadquarters) ?? praxis.sites[0];
}
