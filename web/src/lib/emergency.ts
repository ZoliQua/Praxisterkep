// On-call and emergency points (data/emergency.json): the other half of
// "vacant is not unserved". Distances from every settlement and from every
// district without a physician to the nearest központi ügyelet and ambulance
// station, all from the EESZT registers the site already downloads.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';

export type EmergencyGroup = 'oncall' | 'ambulance' | 'transport' | 'dialysis';
export const MEASURED: EmergencyGroup[] = ['oncall', 'ambulance'];

export interface EmergencyPoint {
  group: EmergencyGroup;
  fin: string;
  county: string;
  provider: string;
  neakCode: string;
  unit: string;
  licenceId: string;
  profession: string;
  settlement: string;
  postalCode: string;
  address: string;
  lat: number | null;
  lon: number | null;
  geoApprox: boolean | null;
}

export interface EmergencySettlement {
  kshId: string;
  settlement: string;
  county: string;
  district: string;
  population: number;
  lat: number;
  lon: number;
  oncallKm: number | null;
  oncallAt: string;
  oncallBand: string;
  ambulanceKm: number | null;
  ambulanceAt: string;
  ambulanceBand: string;
}

export interface EmergencyDistrict {
  id: string;
  kind: 'dental' | 'gp';
  status: string;
  settlement: string;
  county: string;
  type: string;
  population: number | null;
  longTerm: boolean;
  oncallKm: number | null;
  oncallAt: string;
  oncallBand: string;
  ambulanceKm: number | null;
  ambulanceAt: string;
  ambulanceBand: string;
}

export interface GroupStats {
  services: number;
  located: number;
  sites: number;
  settlements: number;
  providers: number;
  counties: number;
}

export interface DistanceStats {
  medianKm: number | null;
  meanKm: number | null;
  maxKm: number | null;
  counts: Record<string, number>;
  population: Record<string, number>;
  populationBeyond20: number;
  districtMedianKm: number | null;
  districtsBeyond20: number;
}

export interface EmergencyRaw {
  schemaVersion: number;
  asOf: string;
  bands: string[];
  groups: Record<EmergencyGroup, GroupStats>;
  stats: { settlements: number; districts: number } & Record<string, DistanceStats | number>;
  counties: Record<string, string | number | null>[];
  points: EmergencyPoint[];
  settlements: EmergencySettlement[];
  districts: EmergencyDistrict[];
}

export const BAND_COLORS: Record<string, string> = {
  '0-10': '#4fd6c2',
  '10-20': '#ffb454',
  '20-30': '#ff7a59',
  '30+': '#e05b8a',
};

export const GROUP_COLORS: Record<EmergencyGroup, string> = {
  oncall: '#4fd6c2',
  ambulance: '#e05b8a',
  transport: '#ffb454',
  dialysis: '#b8b0f5',
};

let cache: EmergencyRaw | null = null;
let pending: Promise<EmergencyRaw | null> | null = null;

export function useEmergency(): EmergencyRaw | null {
  const [data, setData] = useState<EmergencyRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/emergency.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EmergencyRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export function groupStats(data: EmergencyRaw | null, group: EmergencyGroup): DistanceStats | null {
  const value = data?.stats?.[group];
  return typeof value === 'object' && value !== null ? value as DistanceStats : null;
}

export const POINT_COLUMNS: ColDef[] = [
  { key: 'groupLabel', labelKey: 'emergency.colGroup', type: 'enum', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'address', labelKey: 'eeszt.colAddress', type: 'text', visible: true },
  { key: 'provider', labelKey: 'vedono.colProvider', type: 'text', visible: true },
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: false },
  { key: 'licenceId', labelKey: 'eeszt.colLicence', type: 'text', visible: false },
  { key: 'geoApprox', labelKey: 'eeszt.colApprox', type: 'bool', visible: false },
];

export const SETTLEMENT_COLUMNS: ColDef[] = [
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'oncallKm', labelKey: 'emergency.colOncallKm', type: 'number', visible: true },
  { key: 'oncallAt', labelKey: 'emergency.colOncallAt', type: 'text', visible: true },
  { key: 'ambulanceKm', labelKey: 'emergency.colAmbulanceKm', type: 'number', visible: true },
  { key: 'ambulanceAt', labelKey: 'emergency.colAmbulanceAt', type: 'text', visible: false },
  { key: 'district', labelKey: 'vedono.colDistrict', type: 'enum', visible: false },
];

export const DISTRICT_COLUMNS: ColDef[] = [
  { key: 'id', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'kindLabel', labelKey: 'emergency.colKind', type: 'enum', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'statusLabel', labelKey: 'stats.thStatus', type: 'enum', visible: true },
  { key: 'oncallKm', labelKey: 'emergency.colOncallKm', type: 'number', visible: true },
  { key: 'oncallAt', labelKey: 'emergency.colOncallAt', type: 'text', visible: true },
  { key: 'ambulanceKm', labelKey: 'emergency.colAmbulanceKm', type: 'number', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: false },
  { key: 'longTerm', labelKey: 'emergency.colLongTerm', type: 'bool', visible: false },
];

export const COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: true },
  { key: 'oncallMedianKm', labelKey: 'emergency.colOncallMedian', type: 'number', visible: true },
  { key: 'oncallMaxKm', labelKey: 'emergency.colOncallMax', type: 'number', visible: true },
  { key: 'oncallBeyond20', labelKey: 'emergency.colBeyond20', type: 'number', visible: true },
  { key: 'ambulanceMedianKm', labelKey: 'emergency.colAmbulanceMedian', type: 'number', visible: true },
  { key: 'ambulanceMaxKm', labelKey: 'emergency.colAmbulanceMax', type: 'number', visible: false },
];

const groupLabel = (g: EmergencyGroup) => t(`emergency.group.${g}`);

export function pointRows(data: EmergencyRaw | null, group: EmergencyGroup | 'all'): Row[] {
  return (data?.points ?? [])
    .filter((p) => group === 'all' || p.group === group)
    .map((p) => ({
      ...p,
      groupLabel: groupLabel(p.group),
      // the map colours by `type` and wants the district field names
      type: groupLabel(p.group),
      status: '',
      settlementMatch: null,
      unitCode: p.unit || null,
      providerId: null,
    }));
}

export function settlementRows(data: EmergencyRaw | null): Row[] {
  return (data?.settlements ?? []).map((s) => ({ ...s }));
}

export function districtRows(data: EmergencyRaw | null, kind: 'dental' | 'gp'): Row[] {
  return (data?.districts ?? [])
    .filter((d) => d.kind === kind)
    .map((d) => ({
      ...d,
      kindLabel: t(`kinds.${d.kind}.label`),
      statusLabel: t(`status.${d.status}`),
    }));
}

export function countyRows(data: EmergencyRaw | null): Row[] {
  return (data?.counties ?? []).map((c) => ({ ...c }));
}

/** the distance bands of one group, in the published order */
export function bandBreakdown(
  data: EmergencyRaw | null, group: EmergencyGroup,
): { band: string; n: number; population: number }[] {
  const stats = groupStats(data, group);
  if (!stats) return [];
  return (data?.bands ?? []).map((band) => ({
    band,
    n: stats.counts[band] ?? 0,
    population: stats.population[band] ?? 0,
  }));
}
