// What a vacancy goes with — the shape of data/outcomes.json and the
// registry of every measure the outcome charts can show.
//
// The registry is the one place a measure's unit, direction and colour live,
// so the map, the scatter, the yardsticks on the járás page and the matrix
// all agree on what "worse" means. Labels are i18n keys, never text.
import { useEffect, useState } from 'react';
import { locale } from './i18n';
import { formatDecimal } from './format';
import { contextHref, currentContext } from './context';

export interface OutcomeDistrict {
  name: string;
  slug: string;
  county: string;
  capital: boolean;
  population: number;
  gpRate: number | null;
  gpLongTerm: number | null;
  gpVacant: number | null;
  gpTotal: number | null;
  dentalRate: number | null;
  gpMinutes: number | null;
  noBusShare: number | null;
  development: number | null;
  avoidable: number | null;
  amenable: number | null;
  treatable: number | null;
  preventable: number | null;
  both: number | null;
  allCause: number | null;
  avoidableMen: number | null;
  avoidableWomen: number | null;
  shh: Record<string, number | null>;
  income: number | null;
  incomeIndex: number | null;
  incomeIndex2012: number | null;
  taxpayers: number | null;
  naturalChange: number | null;
  migration: number | null;
  diabetes: number | null;
  hypertension: number | null;
  ischaemic: number | null;
  gpLoad: number | null;
  ageing: number | null;
  jobseekers: number | null;
  jobseekersLongShare: number | null;
  jobseekersTrend: number | null;
  /** the TIMEA fields of a kerület are the capital's, not its own */
  capitalWide: boolean;
}

export interface OutcomeCounty {
  name: string;
  slug?: string;
  avoidable: number | null;
  amenable: number | null;
  allCause: number | null;
  income: number | null;
  naturalChange: number | null;
  migration: number | null;
  jobseekers: number | null;
}

export interface Pair {
  x: string; y: string; n: number; r: number; rho: number; p: number;
  slope: number; intercept: number;
}

export interface Partial {
  x: string; y: string; control: string; n: number; r: number; partial: number; p: number;
}

export interface GridCell { n: number; median: number | null; districts: string[] }

export interface Grid {
  outcome: string;
  incomeCuts: [number, number];
  vacancyCuts: [number, number];
  cells: GridCell[][];
}

export interface YearSeries {
  years: string[];
  counties: Record<string, (number | null)[]>;
  medianDistrict: (number | null)[];
}

export interface CrossPoint {
  slug: string; name: string; county: string; population: number;
  state: string; months: number; minutes: number | null;
  bus: boolean | null; busMinutes: number | null; old: number | null;
}

export interface AgeBand {
  from: number; to: number; settlements: number; population: number;
  vacantOnly: number; partial: number;
}

export interface OutcomesRaw {
  schemaVersion: number;
  dataMonth: string;
  sources: {
    mortality: { year: number; url: string };
    territorial: { years: [string, string]; incomeYear: string; url: string };
    jobseekers: { latest: string; first: string; url: string };
  };
  smoothYears: string[];
  districts: OutcomeDistrict[];
  counties: OutcomeCounty[];
  correlations: { population: string; pairs: Pair[]; partials: Partial[] };
  grid: Record<'avoidable' | 'amenable', Grid>;
  series: {
    incomePerResident: YearSeries;
    naturalChange: YearSeries;
    migration: YearSeries;
    births: YearSeries;
    deaths: YearSeries;
    jobseekers: {
      months: string[];
      national: (number | null)[];
      nationalCount: number[];
      nationalLong: number[];
      counties: Record<string, (number | null)[]>;
    };
  };
  cross: {
    dataMonth: string;
    durationTravel: CrossPoint[];
    ageBands: AgeBand[];
    bus: {
      vacantOnly: number; vacantOnlyPopulation: number;
      noDirectBus: number; noDirectBusPopulation: number;
      stranded: { slug: string; name: string; county: string; population: number;
        months: number; minutes: number | null }[];
    };
    deserts: { stats?: Record<string, number> };
  };
}

let cache: OutcomesRaw | null = null;
let pending: Promise<OutcomesRaw | null> | null = null;

export function useOutcomes(): OutcomesRaw | null {
  const [data, setData] = useState<OutcomesRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/outcomes.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: OutcomesRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

/* ------------------------------------------------------------------ measures */

export type Direction = 'higherWorse' | 'higherBetter';

export interface MeasureMeta {
  /** i18n key under outcomes.measure.<key> */
  key: string;
  direction: Direction;
  /** colour of the bad end; diverging measures also have a good end */
  color: string;
  /** a measure whose zero (or 100) is the middle, not the floor */
  mid?: number;
  format: (v: number) => string;
  /** a kerület's value is the capital's, so it is left off maps and fits */
  capitalWide?: boolean;
}

const num = (digits: number) => {
  const f = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'hu-HU', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
  return (v: number) => f.format(v);
};
const signed = (digits: number, unit: string) => {
  const f = num(digits);
  return (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${f(Math.abs(v))}${unit}`;
};
const RED = '#ef6461';
const AMBER = '#f2a541';
const VIOLET = '#a78bfa';

export const MEASURES: Record<string, MeasureMeta> = {
  gpRate: { key: 'gpRate', direction: 'higherWorse', color: RED,
    format: (v) => `${num(1)(v * 100)}%` },
  gpLongTerm: { key: 'gpLongTerm', direction: 'higherWorse', color: RED,
    format: (v) => `${num(1)(v * 100)}%` },
  dentalRate: { key: 'dentalRate', direction: 'higherWorse', color: RED,
    format: (v) => `${num(1)(v * 100)}%` },
  gpMinutes: { key: 'gpMinutes', direction: 'higherWorse', color: AMBER,
    format: (v) => `${num(1)(v)} ${locale === 'en' ? 'min' : 'perc'}` },
  avoidable: { key: 'avoidable', direction: 'higherWorse', color: RED, format: num(0) },
  amenable: { key: 'amenable', direction: 'higherWorse', color: RED, format: num(0) },
  treatable: { key: 'treatable', direction: 'higherWorse', color: RED, format: num(0) },
  preventable: { key: 'preventable', direction: 'higherWorse', color: RED, format: num(0) },
  both: { key: 'both', direction: 'higherWorse', color: RED, format: num(0) },
  allCause: { key: 'allCause', direction: 'higherWorse', color: RED, format: num(0) },
  income: { key: 'income', direction: 'higherBetter', color: AMBER, capitalWide: true,
    format: (v) => `${num(2)(v / 1000)} ${locale === 'en' ? 'm Ft' : 'M Ft'}` },
  incomeIndex: { key: 'incomeIndex', direction: 'higherBetter', color: AMBER, mid: 100,
    capitalWide: true, format: (v) => `${num(0)(v)}%` },
  taxpayers: { key: 'taxpayers', direction: 'higherBetter', color: AMBER, capitalWide: true,
    format: num(0) },
  jobseekers: { key: 'jobseekers', direction: 'higherWorse', color: AMBER,
    format: (v) => `${num(1)(v)}%` },
  naturalChange: { key: 'naturalChange', direction: 'higherBetter', color: VIOLET, mid: 0,
    capitalWide: true, format: signed(1, '‰') },
  migration: { key: 'migration', direction: 'higherBetter', color: VIOLET, mid: 0,
    capitalWide: true, format: signed(1, '‰') },
  diabetes: { key: 'diabetes', direction: 'higherWorse', color: VIOLET, capitalWide: true,
    format: num(0) },
  hypertension: { key: 'hypertension', direction: 'higherWorse', color: VIOLET,
    capitalWide: true, format: num(0) },
  ischaemic: { key: 'ischaemic', direction: 'higherWorse', color: VIOLET, capitalWide: true,
    format: num(0) },
  gpLoad: { key: 'gpLoad', direction: 'higherWorse', color: AMBER, capitalWide: true,
    format: num(0) },
  ageing: { key: 'ageing', direction: 'higherWorse', color: VIOLET, capitalWide: true,
    format: (v) => `${num(0)(v)}%` },
  development: { key: 'development', direction: 'higherBetter', color: AMBER,
    format: num(1) },
};

/** The value of a measure for a district row, or null. */
export function valueOf(d: OutcomeDistrict, key: string): number | null {
  if (key.startsWith('shh.')) return d.shh[key.slice(4)] ?? null;
  const v = (d as unknown as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : null;
}

export function metaOf(key: string): MeasureMeta {
  if (key.startsWith('shh.')) {
    return { key, direction: 'higherWorse', color: RED, mid: 100, format: num(0) };
  }
  const m = MEASURES[key];
  if (!m) throw new Error(`unknown outcome measure ${key}`);
  return m;
}

/** Median of the non-capital rows: the yardstick every comparison uses. */
export function ruralMedian(rows: OutcomeDistrict[], key: string): number | null {
  const v = rows.filter((r) => !r.capital).map((r) => valueOf(r, key))
    .filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Where a value falls among the 174 rural járás, 0 = best, 1 = worst. */
export function badnessRank(rows: OutcomeDistrict[], key: string, value: number): number {
  const meta = metaOf(key);
  const v = rows.filter((r) => !r.capital).map((r) => valueOf(r, key))
    .filter((x): x is number => x !== null);
  if (!v.length) return 0.5;
  const worse = v.filter((x) => (meta.direction === 'higherWorse' ? x > value : x < value)).length;
  return 1 - worse / v.length;
}

/** How a correlation is said in words — the same thresholds the járás
 *  analysis has used, so the two sections never disagree. */
export function strengthOf(r: number): 'none' | 'weak' | 'moderate' | 'strong' {
  const a = Math.abs(r);
  if (a < 0.2) return 'none';
  if (a < 0.4) return 'weak';
  if (a < 0.6) return 'moderate';
  return 'strong';
}

export function pairOf(o: OutcomesRaw, x: string, y: string): Pair | null {
  return o.correlations.pairs.find((p) => (p.x === x && p.y === y) || (p.x === y && p.y === x))
    ?? null;
}

export function partialOf(o: OutcomesRaw, x: string, y: string, control = 'income'):
  Partial | null {
  return o.correlations.partials.find((p) => p.x === x && p.y === y && p.control === control)
    ?? null;
}

/* ---------------------------------------------------------- shared helpers */

/** red, amber, teal: worst third to best third, on every outcome chart */
export const GROUP_COLORS = ['#ef6461', '#f2a541', '#5fb3a1'];

export function districtHref(name: string): string {
  return contextHref('jaras.html', { ...currentContext(), district: name });
}

/** income thirds of the rural járás: 0 poorest, 2 richest */
export function incomeThird(rows: OutcomeDistrict[]): (d: OutcomeDistrict) => number | null {
  const v = rows.filter((r) => !r.capital && r.income !== null).map((r) => r.income as number)
    .sort((a, b) => a - b);
  const c1 = v[Math.floor(v.length / 3)];
  const c2 = v[Math.floor((2 * v.length) / 3)];
  return (d) => (d.capital || d.income === null ? null : d.income < c1 ? 0 : d.income < c2 ? 1 : 2);
}

/** "< 0,001" or "= 0,02", so a sentence can read "p {p}". */
export function pValue(p: number): string {
  return p < 0.001 ? '< 0,001' : `= ${formatDecimal(p.toPrecision(2))}`;
}
