// Shareable map state <-> URL query codec. Only non-default values are
// written; unknown query params are preserved untouched.
import type { PraxisKind, PraxisType } from '../types';

export interface MapUrlState {
  kind?: PraxisKind;
  county?: string;
  type?: PraxisType | 'all';
  view?: 'points' | 'columns';
  metric?: 'rate' | 'population';
  month?: string;      // YYYY-MM (archive month)
  minYears?: number;   // duration filter
  colorMode?: 'status' | 'age';
}

const KEYS = {
  kind: 'k', county: 'm', type: 't', view: 'v',
  metric: 'mt', month: 'ho', minYears: 'kor', colorMode: 'szin',
} as const;

export function readMapState(search: string): MapUrlState {
  const p = new URLSearchParams(search);
  const out: MapUrlState = {};
  if (p.get(KEYS.kind) === 'gp') out.kind = 'gp';
  if (p.get(KEYS.kind) === 'dental') out.kind = 'dental';
  const county = p.get(KEYS.county);
  if (county) out.county = county;
  const type = p.get(KEYS.type);
  if (type && ['adult', 'child', 'mixed', 'school'].includes(type)) {
    out.type = type as PraxisType;
  }
  if (p.get(KEYS.view) === 'columns') out.view = 'columns';
  if (p.get(KEYS.metric) === 'population') out.metric = 'population';
  const month = p.get(KEYS.month);
  if (month && /^\d{4}-\d{2}$/.test(month)) out.month = month;
  const years = Number(p.get(KEYS.minYears));
  if (Number.isInteger(years) && years > 0) out.minYears = years;
  if (p.get(KEYS.colorMode) === 'age') out.colorMode = 'age';
  return out;
}

export function writeMapState(search: string, s: MapUrlState): string {
  const p = new URLSearchParams(search);
  const setOr = (key: string, value: string | undefined | null) => {
    if (value) p.set(key, value);
    else p.delete(key);
  };
  setOr(KEYS.kind, s.kind === 'gp' ? 'gp' : undefined);
  setOr(KEYS.county, s.county);
  setOr(KEYS.type, s.type && s.type !== 'all' ? s.type : undefined);
  setOr(KEYS.view, s.view === 'columns' ? 'columns' : undefined);
  setOr(KEYS.metric, s.metric === 'population' ? 'population' : undefined);
  setOr(KEYS.month, s.month);
  setOr(KEYS.minYears, s.minYears ? String(s.minYears) : undefined);
  setOr(KEYS.colorMode, s.colorMode === 'age' ? 'age' : undefined);
  const q = p.toString();
  return q ? `?${q}` : '';
}
