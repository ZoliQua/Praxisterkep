// Pure transforms from history.json entries to chart-ready series.
// Kept presentation-free so Vitest can cover them (see statsSelectors.test.ts).
import type { PraxisType } from '../types';

export interface HistoryEntry {
  month: string;
  totalDistricts: number | null;
  vacant: number;
  dissolved: number;
  vacancyRate: number | null;
  populationVacant: number;
  populationDissolved: number;
  medianVacancyMonths: number | null;
  durationBuckets: Record<string, number>;
  byType: Record<string, { total: number | null; vacant: number }>;
  byCounty: Record<
    string,
    { vacant: number; dissolved: number; populationVacant: number; total: number | null }
  >;
  flow: { sincePrevMonth: string; entered: number; left: number } | null;
}

export interface Persistence {
  firstMonth: string;
  lastMonth: string;
  firstVacant: number;
  stillVacant: number;
}

export interface KindHistory {
  months: HistoryEntry[];
  persistence: Persistence | null;
}

export interface History {
  schemaVersion: number;
  kinds: Partial<Record<'dental' | 'gp', KindHistory>>;
}

/** '2026-08' -> Date(2026, 7, 1) — chart x-positions on a true time axis */
export function monthToDate(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

export interface SeriesPoint {
  month: string;
  value: number;
}

/** {month, vacant count} for every archived month. */
export function vacantSeries(entries: HistoryEntry[]): SeriesPoint[] {
  return entries.map((e) => ({ month: e.month, value: e.vacant }));
}

/** Rate points only where the denominator is known — gaps stay gaps. */
export function rateSeries(entries: HistoryEntry[]): SeriesPoint[] {
  return entries
    .filter((e) => e.vacancyRate !== null)
    .map((e) => ({ month: e.month, value: e.vacancyRate as number }));
}

export function medianSeries(entries: HistoryEntry[]): SeriesPoint[] {
  return entries
    .filter((e) => e.medianVacancyMonths !== null)
    .map((e) => ({ month: e.month, value: e.medianVacancyMonths as number }));
}

export function populationSeries(entries: HistoryEntry[]): SeriesPoint[] {
  return entries.map((e) => ({
    month: e.month,
    value: e.populationVacant + e.populationDissolved,
  }));
}

/** Per-type vacant counts; only types that ever appear. */
export function typeSeries(entries: HistoryEntry[]): Map<PraxisType, SeriesPoint[]> {
  const out = new Map<PraxisType, SeriesPoint[]>();
  for (const e of entries) {
    for (const [type, counts] of Object.entries(e.byType)) {
      if (!out.has(type as PraxisType)) out.set(type as PraxisType, []);
      out.get(type as PraxisType)!.push({ month: e.month, value: counts.vacant });
    }
  }
  for (const [type, points] of out) {
    if (points.every((p) => p.value === 0)) out.delete(type);
  }
  return out;
}

export function countySeries(entries: HistoryEntry[], county: string): SeriesPoint[] {
  return entries.map((e) => ({
    month: e.month,
    value: e.byCounty[county]?.vacant ?? 0,
  }));
}

export function countyNames(entries: HistoryEntry[]): string[] {
  const names = new Set<string>();
  for (const e of entries) for (const name of Object.keys(e.byCounty)) names.add(name);
  return [...names].sort((a, b) => a.localeCompare(b, 'hu'));
}

export interface FlowPoint {
  month: string;
  sincePrevMonth: string;
  entered: number;
  left: number;
}

export function flowPoints(entries: HistoryEntry[]): FlowPoint[] {
  return entries
    .filter((e) => e.flow !== null)
    .map((e) => ({ month: e.month, ...e.flow! }));
}

/** Overall change between the first and last archived month. */
export function overallChange(entries: HistoryEntry[]) {
  if (entries.length < 2) return null;
  const first = entries[0];
  const last = entries[entries.length - 1];
  return {
    firstMonth: first.month,
    lastMonth: last.month,
    firstVacant: first.vacant,
    lastVacant: last.vacant,
    delta: last.vacant - first.vacant,
    ratio: first.vacant === 0 ? null : (last.vacant - first.vacant) / first.vacant,
  };
}

export interface CountyChangeRow {
  county: string;
  firstValue: number;
  lastValue: number;
}

/** First vs latest archived month per county, sorted by latest desc. */
export function countyChange(entries: HistoryEntry[]): CountyChangeRow[] {
  if (entries.length < 2) return [];
  const first = entries[0];
  const last = entries[entries.length - 1];
  const names = new Set([...Object.keys(first.byCounty), ...Object.keys(last.byCounty)]);
  return [...names]
    .map((county) => ({
      county,
      firstValue: first.byCounty[county]?.vacant ?? 0,
      lastValue: last.byCounty[county]?.vacant ?? 0,
    }))
    .sort((a, b) => b.lastValue - a.lastValue);
}
