// The health-visitor branch (data/vedono.json): what the EESZT master
// publication says about the ~5000 financed health-visitor services — where
// their premises are, who operates them since the 2023 state takeover, how
// many residents fall on one territorial service, and which settlements host
// no health-visitor office at all.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';

export interface VedonoRow {
  fin: string;
  branch: 'territorial' | 'school';
  county: string;
  neakCode: string;
  provider: string;
  unit: string;
  licenceId: string;
  profession: string;
  publicFunded: boolean;
  settlement: string;
  postalCode: string;
  district: string;
  address: string;
  lat: number | null;
  lon: number | null;
  geoApprox: boolean | null;
}

export interface VedonoCounty {
  county: string;
  services: number;
  territorial: number;
  school: number;
  settlements: number;
  providers: number;
  population: number;
  residentsPerTerritorial: number;
}

export interface VedonoProvider {
  neakCode: string;
  provider: string;
  services: number;
  territorial: number;
  school: number;
  counties: string[];
  settlements: number;
}

export interface VedonoSettlement {
  settlement: string;
  county: string;
  district: string;
  population: number;
  services: number;
  territorial: number;
  school: number;
}

export interface VedonoStats {
  services: number;
  territorial: number;
  school: number;
  withLicence: number;
  withoutLicence: number;
  publicFunded: number;
  geocoded: number;
  providers: number;
  settlementsWithPremises: number;
  settlementsTotal: number;
  population: number;
  residentsPerTerritorial: number;
}

export interface VedonoRaw {
  schemaVersion: number;
  asOf: string;
  referenceResidents: number;
  stats: VedonoStats;
  counties: VedonoCounty[];
  providers: VedonoProvider[];
  settlements: VedonoSettlement[];
  rows: VedonoRow[];
}

let cache: VedonoRaw | null = null;
let pending: Promise<VedonoRaw | null> | null = null;

export function loadVedono(): Promise<VedonoRaw | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch(`${import.meta.env.BASE_URL}data/vedono.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: VedonoRaw | null) => { cache = d; return d; })
    .catch(() => null);
  return pending;
}

export function useVedono(): VedonoRaw | null {
  const [data, setData] = useState<VedonoRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadVedono().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const BRANCH_COLORS: Record<string, string> = {
  territorial: '#4fd6c2',
  school: '#ffb454',
};

export const SERVICE_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'branch', labelKey: 'vedono.colBranch', type: 'enum', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'district', labelKey: 'vedono.colDistrict', type: 'enum', visible: false },
  { key: 'address', labelKey: 'eeszt.colAddress', type: 'text', visible: true },
  { key: 'provider', labelKey: 'vedono.colProvider', type: 'text', visible: true },
  { key: 'neakCode', labelKey: 'operating.colNeakCode', type: 'text', visible: false },
  { key: 'unit', labelKey: 'eeszt.colUnit', type: 'text', visible: false },
  { key: 'licenceId', labelKey: 'eeszt.colLicence', type: 'text', visible: false },
  { key: 'publicFunded', labelKey: 'eeszt.colFunded', type: 'bool', visible: false },
  { key: 'geoApprox', labelKey: 'eeszt.colApprox', type: 'bool', visible: false },
];

export const COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'territorial', labelKey: 'vedono.colTerritorial', type: 'number', visible: true },
  { key: 'school', labelKey: 'vedono.colSchool', type: 'number', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'residentsPerTerritorial', labelKey: 'vedono.colPerService', type: 'number', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: false },
  { key: 'providers', labelKey: 'vedono.colProviders', type: 'number', visible: false },
];

export const PROVIDER_COLUMNS: ColDef[] = [
  { key: 'provider', labelKey: 'vedono.colProvider', type: 'text', visible: true },
  { key: 'neakCode', labelKey: 'operating.colNeakCode', type: 'text', visible: false },
  { key: 'services', labelKey: 'vedono.colServices', type: 'number', visible: true },
  { key: 'territorial', labelKey: 'vedono.colTerritorial', type: 'number', visible: true },
  { key: 'school', labelKey: 'vedono.colSchool', type: 'number', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: true },
  { key: 'counties', labelKey: 'vedono.colCounties', type: 'text', visible: true },
];

export const SETTLEMENT_COLUMNS: ColDef[] = [
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'district', labelKey: 'vedono.colDistrict', type: 'enum', visible: false },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'territorial', labelKey: 'vedono.colTerritorial', type: 'number', visible: true },
  { key: 'school', labelKey: 'vedono.colSchool', type: 'number', visible: true },
];

/** the service rows, ready for the table and the map */
export function serviceRows(data: VedonoRaw | null): Row[] {
  return (data?.rows ?? []).map((r) => ({
    ...r,
    branch: t(`vedono.branch.${r.branch}`),
    // the map colours by `type` and needs the district fields to exist
    type: t(`vedono.branch.${r.branch}`),
    status: '',
    settlementMatch: null,
    unitCode: r.unit || null,
    providerId: null,
  }));
}

export function countyRows(data: VedonoRaw | null): Row[] {
  return (data?.counties ?? []).map((c) => ({ ...c }));
}

export function providerRows(data: VedonoRaw | null): Row[] {
  return (data?.providers ?? []).map((p) => ({
    ...p,
    counties: p.counties.join(', '),
  }));
}

/** settlements that host no health-visitor premises, largest first */
export function uncoveredSettlements(data: VedonoRaw | null): VedonoSettlement[] {
  return (data?.settlements ?? []).filter((s) => s.services === 0);
}

export function settlementRows(list: VedonoSettlement[]): Row[] {
  return list.map((s) => ({ ...s }));
}

/** population living in settlements with no health-visitor office */
export function uncoveredPopulation(data: VedonoRaw | null): number {
  return uncoveredSettlements(data).reduce((a, s) => a + s.population, 0);
}

export interface LoadBand { key: string; label: string; n: number; color: string }

/**
 * Counties grouped by how many residents fall on one territorial service.
 * The reference line (data.referenceResidents) comes from the ETL, which
 * takes it from the ministerial decree, not from an opinion.
 */
export function loadBands(data: VedonoRaw | null): LoadBand[] {
  const ref = data?.referenceResidents ?? 2500;
  const counties = data?.counties ?? [];
  const bands: LoadBand[] = [
    { key: 'under', label: t('vedono.bandUnder'), n: 0, color: '#4fd6c2' },
    { key: 'near', label: t('vedono.bandNear'), n: 0, color: '#c98500' },
    { key: 'over', label: t('vedono.bandOver'), n: 0, color: '#ff7a59' },
  ];
  for (const c of counties) {
    const r = c.residentsPerTerritorial;
    if (!r) continue;
    if (r < ref * 0.9) bands[0].n += 1;
    else if (r <= ref * 1.1) bands[1].n += 1;
    else bands[2].n += 1;
  }
  return bands;
}
