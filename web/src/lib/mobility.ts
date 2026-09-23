// Getting there: driving time (data/traveltime.json) and scheduled buses
// (data/transit.json). Both answer the same question the straight-line
// kilometres only approximated — how far care actually is — and they answer
// it for two different households: one with a car and one without.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';

export type Layer = 'gp' | 'dental' | 'oncall' | 'ambulance' | 'inpatient' | 'outpatient';

export interface TravelSettlement {
  kshId: string;
  settlement: string;
  county: string;
  district: string;
  population: number;
  snapKm: number;
  [key: string]: string | number | null;
}

export interface LayerStats {
  points: number;
  medianMin: number | null;
  meanMin: number | null;
  maxMin: number | null;
  unreachable: number;
  counts: Record<string, number>;
  population: Record<string, number>;
  populationBeyond30: number;
}

export interface DetourEntry {
  settlement: string;
  county: string;
  population: number;
  km: number | null;
  minutes: number | null;
  detour: number;
}

export interface TravelRaw {
  schemaVersion: number;
  roadSource: string;
  comparison: Record<string, { medianDetour: number; meanDetour: number; worst: DetourEntry[] }>;
  bands: string[];
  layers: Layer[];
  stats: Record<string, LayerStats | number>;
  counties: Record<string, string | number | null>[];
  settlements: TravelSettlement[];
  districts: Record<string, string | number | boolean | null>[];
}

export interface TransitSettlement {
  kshId: string;
  settlement: string;
  county: string;
  district: string;
  population: number;
  capital: boolean;
  stops: number | null;
  departures: number | null;
  reachable: number | null;
  [key: string]: string | number | boolean | null;
}

export interface TransitRaw {
  schemaVersion: number;
  feedVersion: string;
  feedStart: string;
  feedEnd: string;
  referenceDay: number;
  source: string;
  licence: string;
  railIncluded: boolean;
  stats: {
    settlements: number;
    capitalDistricts: number;
    withService: number;
    withoutService: number;
    populationWithoutService: number;
    medianDepartures: number;
  } & Record<string, unknown>;
  counties: Record<string, string | number>[];
  settlements: TransitSettlement[];
}

function loader<T>(file: string): () => T | null {
  let cache: T | null = null;
  let pending: Promise<T | null> | null = null;
  return function useData(): T | null {
    const [data, setData] = useState<T | null>(cache);
    useEffect(() => {
      let alive = true;
      pending ??= fetch(`${import.meta.env.BASE_URL}data/${file}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: T | null) => { cache = d; return d; })
        .catch(() => null);
      void pending.then((d) => { if (alive) setData(d); });
      return () => { alive = false; };
    }, []);
    return data;
  };
}

export const useTravel = loader<TravelRaw>('traveltime.json');
export const useTransit = loader<TransitRaw>('transit.json');

export const BAND_COLORS: Record<string, string> = {
  '0-10': '#4fd6c2',
  '10-20': '#ffb454',
  '20-30': '#ff7a59',
  '30+': '#e05b8a',
};

export const SERVICE_COLORS: Record<string, string> = {
  direct: '#4fd6c2',
  indirect: '#ff7a59',
  none: '#e05b8a',
};

export function layerStats(data: TravelRaw | null, layer: Layer): LayerStats | null {
  const value = data?.stats?.[layer];
  return typeof value === 'object' && value !== null ? value as LayerStats : null;
}

export function travelColumns(layer: Layer): ColDef[] {
  return [
    { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
    { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
    { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
    { key: `${layer}Min`, labelKey: 'travel.colMinutes', type: 'number', visible: true },
    { key: `${layer}Km`, labelKey: 'travel.colKm', type: 'number', visible: true },
    { key: `${layer}Detour`, labelKey: 'travel.colDetour', type: 'number', visible: true },
    { key: `${layer}At`, labelKey: 'travel.colAt', type: 'text', visible: true },
    { key: 'district', labelKey: 'vedono.colDistrict', type: 'enum', visible: false },
  ];
}

export const TRAVEL_COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: true },
  { key: 'gpMedianMin', labelKey: 'travel.colGpMedian', type: 'number', visible: true },
  { key: 'oncallMedianMin', labelKey: 'travel.colOncallMedian', type: 'number', visible: true },
  { key: 'inpatientMedianMin', labelKey: 'travel.colInpMedian', type: 'number', visible: true },
  { key: 'inpatientBeyond30', labelKey: 'travel.colBeyond30', type: 'number', visible: true },
];

export const TRANSIT_COLUMNS: ColDef[] = [
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'departures', labelKey: 'transit.colDepartures', type: 'number', visible: true },
  { key: 'gpState', labelKey: 'transit.colGp', type: 'enum', visible: true },
  { key: 'gpMinutes', labelKey: 'transit.colGpMinutes', type: 'number', visible: true },
  { key: 'oncallState', labelKey: 'transit.colOncall', type: 'enum', visible: true },
  { key: 'oncallMinutes', labelKey: 'transit.colOncallMinutes', type: 'number', visible: false },
  { key: 'inpatientState', labelKey: 'transit.colInpatient', type: 'enum', visible: true },
  { key: 'reachable', labelKey: 'transit.colReachable', type: 'number', visible: false },
  { key: 'gpTarget', labelKey: 'transit.colTarget', type: 'text', visible: false },
];

export const TRANSIT_COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: true },
  { key: 'medianDepartures', labelKey: 'transit.colMedianDepartures', type: 'number', visible: true },
  { key: 'withoutService', labelKey: 'transit.colNoService', type: 'number', visible: true },
  { key: 'noDirectToGp', labelKey: 'transit.colNoDirect', type: 'number', visible: true },
  { key: 'noDirectPopulation', labelKey: 'transit.colNoDirectPop', type: 'number', visible: true },
  { key: 'noDirectSharePct', labelKey: 'transit.colNoDirectShare', type: 'number', visible: true },
];

export function travelRows(data: TravelRaw | null, layer: Layer): Row[] {
  return (data?.settlements ?? []).map((s) => ({
    ...s,
    // the map colours by `type` and needs the district field names
    type: t(`travel.band.${s[`${layer}Band`] || '30+'}`),
    fin: s.kshId,
    status: '',
  } as Row));
}

export function travelCountyRows(data: TravelRaw | null): Row[] {
  return (data?.counties ?? []).map((c) => ({ ...c } as Row));
}

const serviceState = (row: TransitSettlement, layer: string): string => {
  if (row.capital) return t('transit.stateCapital');
  if (!row.departures) return t('transit.stateNone');
  return row[`${layer}Direct`] ? t('transit.stateDirect') : t('transit.stateIndirect');
};

export function transitRows(data: TransitRaw | null): Row[] {
  return (data?.settlements ?? []).map((s) => ({
    ...s,
    gpState: serviceState(s, 'gp'),
    oncallState: serviceState(s, 'oncall'),
    inpatientState: serviceState(s, 'inpatient'),
  } as Row));
}

export function transitCountyRows(data: TransitRaw | null): Row[] {
  return (data?.counties ?? []).map((c) => ({
    ...c,
    noDirectSharePct: Math.round(Number(c.noDirectShare) * 1000) / 10,
  } as Row));
}

/** the three service states of one layer, for the bar breakdown */
export function serviceBreakdown(
  data: TransitRaw | null, layer: string,
): { key: string; n: number; population: number; color: string }[] {
  const rows = (data?.settlements ?? []).filter((s) => !s.capital);
  const groups = { direct: [] as TransitSettlement[], indirect: [] as TransitSettlement[], none: [] as TransitSettlement[] };
  for (const r of rows) {
    if (!r.departures) groups.none.push(r);
    else if (r[`${layer}Direct`]) groups.direct.push(r);
    else groups.indirect.push(r);
  }
  return (['direct', 'indirect', 'none'] as const).map((key) => ({
    key,
    n: groups[key].length,
    population: groups[key].reduce((a, r) => a + r.population, 0),
    color: SERVICE_COLORS[key],
  }));
}
