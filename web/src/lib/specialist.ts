// Contracted specialist care (data/specialist.json): the inpatient and
// outpatient institution lists NEAK publishes in the same directory as the
// district registries. Primary care ends where these begin, so nothing here
// touches a vacancy rate — this is the context around it: what exists, where,
// and how thinly some professions are spread.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';

export type Care = 'inpatient' | 'outpatient';

export interface SpecialistRow {
  care: Care;
  fin: string;
  neakCode: string;
  institution: string;
  county: string;
  unit: string;
  professionCode: string;
  profession: string;
  settlement: string;
  postalCode: string;
  address: string;
  seatSettlement: string;
  seatAddress: string;
  lat: number | null;
  lon: number | null;
  geoApprox: boolean | null;
}

export interface CareStats {
  rows: number;
  institutions: number;
  units: number;
  professions: number;
  sites: number;
  settlements: number;
  counties: number;
  geocoded: number;
  population: number;
  residentsPerInstitution: number;
}

export interface SpecialistCounty {
  county: string;
  population: number;
  inpatientInstitutions: number;
  inpatientDepartments: number;
  outpatientInstitutions: number;
  outpatientRooms: number;
  professions: number;
  inpatientProfessions: number;
  outpatientProfessions: number;
  settlements: number;
  residentsPerOutpatientRoom: number;
}

export interface SpecialistProfession {
  care: Care;
  code: string;
  profession: string;
  units: number;
  institutions: number;
  counties: number;
  countyList: string[];
  settlements: number;
}

export interface SpecialistInstitution {
  care: Care;
  neakCode: string;
  institution: string;
  county: string;
  seatSettlement: string;
  seatAddress: string;
  units: number;
  professions: number;
  sites: number;
  settlements: number;
}

export interface SpecialistSite {
  care: Care;
  neakCode: string;
  institution: string;
  county: string;
  settlement: string;
  postalCode: string;
  address: string;
  units: number;
  professions: number;
  lat: number | null;
  lon: number | null;
  geoApprox: boolean | null;
}

export interface SpecialistRaw {
  schemaVersion: number;
  dataMonth: string;
  stats: Record<Care, CareStats>;
  counties: SpecialistCounty[];
  professions: SpecialistProfession[];
  institutions: SpecialistInstitution[];
  sites: SpecialistSite[];
  rows: SpecialistRow[];
}

export const CARE_COLORS: Record<Care, string> = {
  inpatient: '#b8b0f5',
  outpatient: '#4fd6c2',
};

let cache: SpecialistRaw | null = null;
let pending: Promise<SpecialistRaw | null> | null = null;

export function loadSpecialist(): Promise<SpecialistRaw | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch(`${import.meta.env.BASE_URL}data/specialist.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: SpecialistRaw | null) => { cache = d; return d; })
    .catch(() => null);
  return pending;
}

export function useSpecialist(): SpecialistRaw | null {
  const [data, setData] = useState<SpecialistRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadSpecialist().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const SITE_COLUMNS: ColDef[] = [
  { key: 'care', labelKey: 'specialist.colCare', type: 'enum', visible: true },
  { key: 'institution', labelKey: 'specialist.colInstitution', type: 'text', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'address', labelKey: 'eeszt.colAddress', type: 'text', visible: true },
  { key: 'units', labelKey: 'specialist.colUnits', type: 'number', visible: true },
  { key: 'professions', labelKey: 'specialist.colProfessions', type: 'number', visible: true },
  { key: 'neakCode', labelKey: 'operating.colNeakCode', type: 'text', visible: false },
  { key: 'geoApprox', labelKey: 'eeszt.colApprox', type: 'bool', visible: false },
];

export const ROW_COLUMNS: ColDef[] = [
  { key: 'care', labelKey: 'specialist.colCare', type: 'enum', visible: true },
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'institution', labelKey: 'specialist.colInstitution', type: 'text', visible: true },
  { key: 'unit', labelKey: 'specialist.colUnit', type: 'text', visible: true },
  { key: 'profession', labelKey: 'specialist.colProfession', type: 'enum', visible: true },
  { key: 'professionCode', labelKey: 'specialist.colProfessionCode', type: 'text', visible: false },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'address', labelKey: 'eeszt.colAddress', type: 'text', visible: false },
  { key: 'neakCode', labelKey: 'operating.colNeakCode', type: 'text', visible: false },
  { key: 'seatSettlement', labelKey: 'specialist.colSeat', type: 'text', visible: false },
];

export const COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'inpatientInstitutions', labelKey: 'specialist.colInpInst', type: 'number', visible: true },
  { key: 'inpatientDepartments', labelKey: 'specialist.colInpDept', type: 'number', visible: true },
  { key: 'outpatientInstitutions', labelKey: 'specialist.colOutInst', type: 'number', visible: true },
  { key: 'outpatientRooms', labelKey: 'specialist.colOutRoom', type: 'number', visible: true },
  { key: 'professions', labelKey: 'specialist.colProfessions', type: 'number', visible: true },
  { key: 'residentsPerOutpatientRoom', labelKey: 'specialist.colPerRoom', type: 'number', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: false },
];

export const PROFESSION_COLUMNS: ColDef[] = [
  { key: 'care', labelKey: 'specialist.colCare', type: 'enum', visible: true },
  { key: 'profession', labelKey: 'specialist.colProfession', type: 'text', visible: true },
  { key: 'code', labelKey: 'specialist.colProfessionCode', type: 'text', visible: false },
  { key: 'units', labelKey: 'specialist.colUnits', type: 'number', visible: true },
  { key: 'institutions', labelKey: 'specialist.colInstitutions', type: 'number', visible: true },
  { key: 'counties', labelKey: 'specialist.colCounties', type: 'number', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: true },
  { key: 'countyList', labelKey: 'specialist.colCountyList', type: 'text', visible: false },
];

export const INSTITUTION_COLUMNS: ColDef[] = [
  { key: 'care', labelKey: 'specialist.colCare', type: 'enum', visible: true },
  { key: 'institution', labelKey: 'specialist.colInstitution', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'seatSettlement', labelKey: 'specialist.colSeat', type: 'text', visible: true },
  { key: 'units', labelKey: 'specialist.colUnits', type: 'number', visible: true },
  { key: 'professions', labelKey: 'specialist.colProfessions', type: 'number', visible: true },
  { key: 'sites', labelKey: 'specialist.colSites', type: 'number', visible: true },
  { key: 'neakCode', labelKey: 'operating.colNeakCode', type: 'text', visible: false },
];

const careLabel = (care: Care) => t(`specialist.care.${care}`);

export function siteRows(data: SpecialistRaw | null, care: Care | 'all'): Row[] {
  return (data?.sites ?? [])
    .filter((s) => care === 'all' || s.care === care)
    .map((s) => ({
      ...s,
      care: careLabel(s.care),
      // the map colours by `type` and needs the district fields to exist
      type: careLabel(s.care),
      fin: s.neakCode,
      status: '',
      settlementMatch: null,
      unitCode: null,
      licenceId: null,
      providerId: null,
    }));
}

export function rowRows(data: SpecialistRaw | null, care: Care | 'all'): Row[] {
  return (data?.rows ?? [])
    .filter((r) => care === 'all' || r.care === care)
    .map((r) => ({ ...r, care: careLabel(r.care) }));
}

export function countyRows(data: SpecialistRaw | null): Row[] {
  return (data?.counties ?? []).map((c) => ({ ...c }));
}

export function professionRows(data: SpecialistRaw | null, care: Care | 'all'): Row[] {
  return (data?.professions ?? [])
    .filter((p) => care === 'all' || p.care === care)
    .map((p) => ({ ...p, care: careLabel(p.care), countyList: p.countyList.join(', ') }));
}

export function institutionRows(data: SpecialistRaw | null, care: Care | 'all'): Row[] {
  return (data?.institutions ?? [])
    .filter((i) => care === 'all' || i.care === care)
    .map((i) => ({ ...i, care: careLabel(i.care) }));
}

/**
 * Professions present in at most this many counties — the thin end of the
 * country: where a profession exists in three counties, the other seventeen
 * travel for it.
 */
export function rareProfessions(
  data: SpecialistRaw | null, care: Care, maxCounties = 3,
): SpecialistProfession[] {
  return (data?.professions ?? [])
    .filter((p) => p.care === care && p.counties <= maxCounties)
    .sort((a, b) => a.counties - b.counties || b.units - a.units);
}

/** how many of the country's professions each county actually has */
export function professionCoverage(
  data: SpecialistRaw | null, care: Care,
): { county: string; present: number; total: number; share: number }[] {
  const all = (data?.professions ?? []).filter((p) => p.care === care);
  const total = all.length;
  const counties = new Map<string, number>();
  for (const p of all) {
    for (const c of p.countyList) counties.set(c, (counties.get(c) ?? 0) + 1);
  }
  return [...counties.entries()]
    .map(([county, present]) => ({
      county, present, total, share: total ? present / total : 0,
    }))
    .sort((a, b) => b.share - a.share);
}

export function coverageRows(
  list: { county: string; present: number; total: number; share: number }[],
): Row[] {
  return list.map((c) => ({
    county: c.county,
    present: c.present,
    missing: c.total - c.present,
    share: Math.round(c.share * 1000) / 10,
  }));
}

export const COVERAGE_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'present', labelKey: 'specialist.colPresent', type: 'number', visible: true },
  { key: 'missing', labelKey: 'specialist.colMissing', type: 'number', visible: true },
  { key: 'share', labelKey: 'specialist.colShare', type: 'number', visible: true },
];
