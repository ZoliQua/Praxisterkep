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

export function countyRanking(snapshot: Snapshot): CountyRankingRow[] {
  return snapshot.counties
    .map((c) => ({
      name: c.name,
      rate: c.vacancyRate ?? 0,
      vacantAll: c.vacant + c.dissolved,
      total: c.total ?? 0,
    }))
    .sort((a, b) => b.rate - a.rate);
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
