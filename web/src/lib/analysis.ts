// The three analyses that sit next to the risk model on the analysis page:
// how long vacancies last (data/survival.json), what the country looks like
// when coverage is read at settlement level instead of district seats
// (data/coverage.json), and where several public indicators point the same
// way at once (data/composite.json).
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';
import type { PraxisKind } from '../types';

/* ------------------------------ survival ------------------------------ */

export interface CurvePoint { month: number; survival: number; atRisk: number; refilled: number }

export interface Curve {
  key?: string;
  spells: number;
  refilled: number;
  stillOpen: number;
  truncated: number;
  median: number | null;
  survival12: number | null;
  survival24: number | null;
  survival60: number | null;
  points: CurvePoint[];
}

export interface SurvivalSpell {
  fin: string;
  start: string;
  end: string | null;
  months: number;
  censored: boolean;
  county: string;
  settlement: string;
  type: string;
  population: number | null;
  benefit: boolean;
  truncated: boolean;
}

export interface SurvivalKind {
  months: string[];
  gapMonths: { min: number; max: number; median: number };
  overall: Curve;
  byCounty: Curve[];
  byPopulation: Curve[];
  byType: Curve[];
  byBenefit: Curve[];
  spells: SurvivalSpell[];
}

export interface SurvivalRaw {
  schemaVersion: number;
  maxMonths: number;
  kinds: Record<PraxisKind, SurvivalKind>;
}

/* ------------------------------ coverage ------------------------------ */

export type CoverageClass = 'filled' | 'partial' | 'vacantOnly' | 'absent';

export interface CoverageSettlement {
  kshId: string;
  settlement: string;
  county: string;
  district: string;
  population: number;
  filled: number;
  vacant: number;
  dissolved: number;
  class: CoverageClass;
  isSeat: boolean;
  youngShare: number | null;
  oldShare: number | null;
  old: number | null;
}

export interface CoverageStats {
  settlements: number;
  population: number;
  byClass: Record<CoverageClass, number>;
  populationByClass: Record<CoverageClass, number>;
  seatSettlements: number;
  seatPopulation: number;
  affectedSettlements: number;
  affectedPopulation: number;
  affectedOld: number;
  vacantOnlyOld: number;
}

export interface CoverageCounty {
  county: string;
  settlements: number;
  population: number;
  filled: number;
  partial: number;
  vacantOnly: number;
  absent: number;
  affectedSettlements: number;
  affectedPopulation: number;
  affectedShare: number;
}

export interface CoverageRaw {
  schemaVersion: number;
  dataMonth: string;
  kinds: Record<PraxisKind, {
    servedListPublished: boolean;
    stats: CoverageStats;
    counties: CoverageCounty[];
    settlements: CoverageSettlement[];
  }>;
}

/* ------------------------------ composite ----------------------------- */

export interface CompositeSettlement {
  kshId: string;
  settlement: string;
  county: string;
  district: string;
  population: number;
  lat: number;
  lon: number;
  gpClass: CoverageClass;
  dentalClass: CoverageClass;
  raw: Record<string, number | null>;
  parts: Record<string, number | null>;
  missing: string[];
  index: number;
  band: string;
}

export interface CompositeRaw {
  schemaVersion: number;
  dataMonth: string;
  weights: Record<string, number>;
  bands: string[];
  thresholds: Record<string, number>;
  stats: {
    settlements: number;
    population: number;
    byBand: Record<string, number>;
    populationByBand: Record<string, number>;
    atRiskSettlements: number;
    atRiskPopulation: number;
    meanIndex: number;
  };
  counties: {
    county: string; settlements: number; population: number; atRisk: number;
    atRiskPopulation: number; share: number; meanIndex: number;
  }[];
  settlements: CompositeSettlement[];
}

/* ------------------------------- loading ------------------------------ */

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

export const useSurvival = loader<SurvivalRaw>('survival.json');
export const useCoverage = loader<CoverageRaw>('coverage.json');
export const useComposite = loader<CompositeRaw>('composite.json');

/* ------------------------------ selectors ----------------------------- */

export const CLASS_COLORS: Record<CoverageClass, string> = {
  filled: '#4fd6c2',
  partial: '#ffb454',
  vacantOnly: '#ff7a59',
  absent: '#8899ad',
};

export const BAND_COLORS: Record<string, string> = {
  kiemelt: '#e05b8a',
  magas: '#ff7a59',
  kozepes: '#c98500',
  alacsony: '#4fd6c2',
};

export const CURVE_COLORS = ['#4fd6c2', '#ff7a59', '#ffb454', '#b8b0f5', '#e05b8a'];

export const SPELL_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'type', labelKey: 'stats.thType', type: 'enum', visible: false },
  { key: 'start', labelKey: 'survival.colStart', type: 'text', visible: true },
  { key: 'end', labelKey: 'survival.colEnd', type: 'text', visible: true },
  { key: 'months', labelKey: 'survival.colMonths', type: 'number', visible: true },
  { key: 'open', labelKey: 'survival.colOpen', type: 'bool', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: false },
  { key: 'benefit', labelKey: 'benefit.column', type: 'bool', visible: false },
];

export const COVERAGE_COLUMNS: ColDef[] = [
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'district', labelKey: 'vedono.colDistrict', type: 'enum', visible: false },
  { key: 'state', labelKey: 'coverage.colClass', type: 'enum', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'old', labelKey: 'coverage.colOld', type: 'number', visible: true },
  { key: 'oldSharePct', labelKey: 'coverage.colOldShare', type: 'number', visible: true },
  { key: 'youngSharePct', labelKey: 'coverage.colYoungShare', type: 'number', visible: false },
  { key: 'filled', labelKey: 'coverage.colFilled', type: 'number', visible: true },
  { key: 'vacant', labelKey: 'coverage.colVacant', type: 'number', visible: true },
  { key: 'isSeat', labelKey: 'coverage.colSeat', type: 'bool', visible: false },
];

export const COVERAGE_COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: true },
  { key: 'affectedSettlements', labelKey: 'coverage.colAffected', type: 'number', visible: true },
  { key: 'affectedPopulation', labelKey: 'coverage.colAffectedPop', type: 'number', visible: true },
  { key: 'affectedSharePct', labelKey: 'coverage.colAffectedShare', type: 'number', visible: true },
  { key: 'vacantOnly', labelKey: 'coverage.classVacantOnly', type: 'number', visible: true },
  { key: 'partial', labelKey: 'coverage.classPartial', type: 'number', visible: false },
  { key: 'absent', labelKey: 'coverage.classAbsent', type: 'number', visible: false },
];

export const COMPOSITE_COLUMNS: ColDef[] = [
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'district', labelKey: 'vedono.colDistrict', type: 'enum', visible: false },
  { key: 'index', labelKey: 'composite.colIndex', type: 'number', visible: true },
  { key: 'band', labelKey: 'composite.colBand', type: 'enum', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'gpKm', labelKey: 'composite.colGpKm', type: 'number', visible: true },
  { key: 'dentalKm', labelKey: 'composite.colDentalKm', type: 'number', visible: false },
  { key: 'outpatientKm', labelKey: 'composite.colOutKm', type: 'number', visible: false },
  { key: 'inpatientKm', labelKey: 'composite.colInpKm', type: 'number', visible: true },
  { key: 'oldSharePct', labelKey: 'coverage.colOldShare', type: 'number', visible: true },
  { key: 'riskPct', labelKey: 'composite.colRisk', type: 'number', visible: false },
  { key: 'deprivation', labelKey: 'composite.colBenefit', type: 'bool', visible: true },
  { key: 'gpState', labelKey: 'composite.colGpClass', type: 'enum', visible: false },
  { key: 'dentalState', labelKey: 'composite.colDentalClass', type: 'enum', visible: false },
];

export const COMPOSITE_COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: true },
  { key: 'meanIndex', labelKey: 'composite.colMeanIndex', type: 'number', visible: true },
  { key: 'atRisk', labelKey: 'composite.colAtRisk', type: 'number', visible: true },
  { key: 'sharePct', labelKey: 'composite.colShare', type: 'number', visible: true },
  { key: 'atRiskPopulation', labelKey: 'composite.colAtRiskPop', type: 'number', visible: true },
];

export function spellRows(data: SurvivalRaw | null, kind: PraxisKind): Row[] {
  return (data?.kinds?.[kind]?.spells ?? []).map((s) => ({
    fin: s.fin,
    settlement: s.settlement,
    county: s.county,
    type: s.type ? t(`praxisTypes.${s.type}`) : '',
    start: s.start,
    end: s.end ?? '–',
    months: s.months,
    open: s.censored,
    population: s.population,
    benefit: s.benefit,
  }));
}

export function coverageRows(data: CoverageRaw | null, kind: PraxisKind): Row[] {
  return (data?.kinds?.[kind]?.settlements ?? []).map((s) => ({
    ...s,
    state: t(`coverage.class${s.class[0].toUpperCase()}${s.class.slice(1)}`),
    oldSharePct: s.oldShare === null ? null : Math.round(s.oldShare * 1000) / 10,
    youngSharePct: s.youngShare === null ? null : Math.round(s.youngShare * 1000) / 10,
  }));
}

export function coverageCountyRows(data: CoverageRaw | null, kind: PraxisKind): Row[] {
  return (data?.kinds?.[kind]?.counties ?? []).map((c) => ({
    ...c,
    affectedSharePct: Math.round(c.affectedShare * 1000) / 10,
  }));
}

export function compositeRows(data: CompositeRaw | null): Row[] {
  return (data?.settlements ?? []).map((s) => ({
    kshId: s.kshId,
    settlement: s.settlement,
    county: s.county,
    district: s.district,
    index: s.index,
    band: t(`composite.band.${s.band}`),
    population: s.population,
    gpKm: s.raw.gpKm,
    dentalKm: s.raw.dentalKm,
    outpatientKm: s.raw.outpatientKm,
    inpatientKm: s.raw.inpatientKm,
    oldSharePct: s.raw.ageing === null ? null : Math.round(s.raw.ageing * 1000) / 10,
    riskPct: s.raw.risk === null ? null : Math.round(s.raw.risk * 1000) / 10,
    deprivation: s.raw.deprivation === 1,
    gpState: t(`coverage.class${s.gpClass[0].toUpperCase()}${s.gpClass.slice(1)}`),
    dentalState: t(`coverage.class${s.dentalClass[0].toUpperCase()}${s.dentalClass.slice(1)}`),
    // the map needs these
    lat: s.lat,
    lon: s.lon,
    type: t(`composite.band.${s.band}`),
    fin: s.kshId,
    status: '',
  }));
}

export function compositeCountyRows(data: CompositeRaw | null): Row[] {
  return (data?.counties ?? []).map((c) => ({
    ...c,
    sharePct: Math.round(c.share * 1000) / 10,
  }));
}

/** the components of one settlement, biggest contribution first */
export function componentList(
  data: CompositeRaw | null, row: CompositeSettlement,
): { key: string; part: number | null; weight: number; raw: number | null }[] {
  const weights = data?.weights ?? {};
  return Object.keys(weights)
    .map((key) => ({
      key, part: row.parts[key] ?? null, weight: weights[key], raw: row.raw[key] ?? null,
    }))
    .sort((a, b) => (b.part ?? 0) * b.weight - (a.part ?? 0) * a.weight);
}
