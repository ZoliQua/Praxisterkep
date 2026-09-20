// How far the nearest operating surgery is from a district that has no
// contracted physician (data/access.json). A distance is an accessibility
// proxy, never a claim that the district is unserved — substitution does not
// appear in the published data (CLAUDE.md rule 4).
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';
import type { PraxisKind } from '../types';

export interface AccessDistrict {
  id: string;
  kind: PraxisKind;
  status: string;
  settlement: string;
  county: string;
  type: string;
  population: number | null;
  km: number;
  band: string;
  nearestId: string;
  nearestSettlement: string;
  sameSettlement: boolean;
  geoApprox: boolean;
  lat: number;
  lon: number;
}

export interface AccessStats {
  subjects: number;
  measured: number;
  missingGeo: number;
  operating: number;
  operatingWithoutGeo: number;
  counts: Record<string, number>;
  population: Record<string, number>;
  medianKm: number | null;
  maxKm: number | null;
  sameSettlement: number;
}

export interface AccessRaw {
  schemaVersion: number;
  asOf: string;
  dataMonth: string;
  bands: { key: string; maxKm: number | null }[];
  stats: Record<PraxisKind, AccessStats>;
  districts: AccessDistrict[];
}

export const BAND_COLORS: Record<string, string> = {
  '0-5': '#4fd6c2',
  '5-10': '#c98500',
  '10-20': '#ff7a59',
  '20+': '#e05b8a',
};

let cache: AccessRaw | null = null;
let pending: Promise<AccessRaw | null> | null = null;

export function loadAccess(): Promise<AccessRaw | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch(`${import.meta.env.BASE_URL}data/access.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: AccessRaw | null) => { cache = d; return d; })
    .catch(() => null);
  return pending;
}

export function useAccess(): AccessRaw | null {
  const [data, setData] = useState<AccessRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadAccess().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export function bandLabel(key: string): string {
  return t(`access.band.${key}`);
}

export const ACCESS_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'type', labelKey: 'stats.thType', type: 'enum', visible: false },
  { key: 'status', labelKey: 'stats.thStatus', type: 'enum', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'km', labelKey: 'access.colKm', type: 'number', visible: true },
  { key: 'bandLabel', labelKey: 'access.colBand', type: 'enum', visible: true },
  { key: 'nearestSettlement', labelKey: 'access.colNearest', type: 'text', visible: true },
  { key: 'sameSettlement', labelKey: 'access.colSameSettlement', type: 'bool', visible: true },
  { key: 'nearestId', labelKey: 'access.colNearestId', type: 'text', visible: false },
  { key: 'geoApprox', labelKey: 'eeszt.colGeoApprox', type: 'bool', visible: false },
];

/** rows for the table and the map (the map colours by `type`) */
export function accessRows(data: AccessRaw | null, kind: PraxisKind): Row[] {
  if (!data) return [];
  return data.districts.filter((d) => d.kind === kind).map((d) => ({
    fin: d.id,
    settlement: d.settlement,
    county: d.county,
    type: bandLabel(d.band),          // the map's colour category
    praxisType: t(`praxisTypes.${d.type}`),
    status: d.status === 'dissolved' ? t('stats.statusDissolved') : t('stats.statusVacant'),
    population: d.population,
    km: d.km,
    bandLabel: bandLabel(d.band),
    nearestSettlement: d.nearestSettlement,
    sameSettlement: d.sameSettlement,
    nearestId: d.nearestId,
    geoApprox: d.geoApprox,
    lat: d.lat,
    lon: d.lon,
    unitCode: null,
    licenceId: null,
    providerId: null,
  }));
}

export function bandBreakdown(
  data: AccessRaw | null, kind: PraxisKind,
): { band: string; count: number; population: number }[] {
  const st = data?.stats?.[kind];
  if (!data || !st) return [];
  return data.bands.map((b) => ({
    band: b.key,
    count: st.counts[b.key] ?? 0,
    population: st.population[b.key] ?? 0,
  }));
}

/** people living in districts whose nearest operating surgery is beyond `km` */
export function populationBeyond(
  data: AccessRaw | null, kind: PraxisKind, km: number,
): number {
  if (!data) return 0;
  return data.districts
    .filter((d) => d.kind === kind && d.km >= km)
    .reduce((sum, d) => sum + (d.population ?? 0), 0);
}

/* ---------------- county summary ---------------- */

export interface CountyAccess {
  county: string;
  districts: number;
  medianKm: number;
  meanKm: number;
  maxKm: number;
  within5: number;
  beyond10: number;
  population: number;
  populationBeyond10: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** per-county distances of the districts without a contracted physician */
export function countyAccess(data: AccessRaw | null, kind: PraxisKind): CountyAccess[] {
  if (!data) return [];
  const byCounty = new Map<string, AccessDistrict[]>();
  for (const d of data.districts) {
    if (d.kind !== kind) continue;
    const list = byCounty.get(d.county) ?? [];
    list.push(d);
    byCounty.set(d.county, list);
  }
  return [...byCounty.entries()]
    .map(([county, list]) => {
      const km = list.map((d) => d.km);
      return {
        county,
        districts: list.length,
        medianKm: Math.round(median(km) * 10) / 10,
        meanKm: Math.round((km.reduce((a, b) => a + b, 0) / km.length) * 10) / 10,
        maxKm: Math.round(Math.max(...km) * 10) / 10,
        within5: list.filter((d) => d.km < 5).length,
        beyond10: list.filter((d) => d.km >= 10).length,
        population: list.reduce((a, d) => a + (d.population ?? 0), 0),
        populationBeyond10: list
          .filter((d) => d.km >= 10)
          .reduce((a, d) => a + (d.population ?? 0), 0),
      };
    })
    .sort((a, b) => b.meanKm - a.meanKm);
}

export const COUNTY_ACCESS_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'districts', labelKey: 'access.colDistricts', type: 'number', visible: true },
  { key: 'meanKm', labelKey: 'access.colMeanKm', type: 'number', visible: true },
  { key: 'medianKm', labelKey: 'access.colMedianKm', type: 'number', visible: true },
  { key: 'maxKm', labelKey: 'access.colMaxKm', type: 'number', visible: true },
  { key: 'within5', labelKey: 'access.colWithin5', type: 'number', visible: true },
  { key: 'beyond10', labelKey: 'access.colBeyond10', type: 'number', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: false },
  { key: 'populationBeyond10', labelKey: 'access.colPopBeyond10', type: 'number', visible: true },
];

export function countyAccessRows(data: AccessRaw | null, kind: PraxisKind): Row[] {
  return countyAccess(data, kind).map((c) => ({ ...c }));
}
