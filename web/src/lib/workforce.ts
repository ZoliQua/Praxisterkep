// Who holds the districts (data/workforce.json): turnover across the archive
// and the physicians who hold more than one district today. No name ever
// leaves the ETL — a physician appears here only as a pseudonymous key, so
// everything below is about how many, never about who.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';
import type { PraxisKind } from '../types';

export interface Portfolio {
  key: string;
  districts: number;
  counties: string[];
  settlements: string[];
  ids: string[];
}

export interface WorkforceDistrict {
  id: string;
  county: string;
  settlement: string;
  changes: number;
  monthsObserved: number;
  firstSeen: string;
  heldToday: boolean;
  portfolioToday: number;
}

export interface WorkforceStats {
  districtsObserved: number;
  districtsHeldToday: number;
  physicians: number;
  multiDistrictPhysicians: number;
  districtsInMultiHands: number;
  largestPortfolio: number;
  districtsWithAChange: number;
  changes: number;
  changeShare: number;
  neverChanged: number;
  crossCountyPhysicians: number;
}

export interface WorkforceKind {
  months: string[];
  archiveMonths: number;
  stats: WorkforceStats;
  counties: {
    county: string; districts: number; changes: number; districtsWithAChange: number;
    changeShare: number; inMultiHands: number; multiShare: number;
  }[];
  portfolioBands: { band: string; physicians: number; districts: number }[];
  portfolios: Portfolio[];
  districts: WorkforceDistrict[];
}

export interface WorkforceRaw {
  schemaVersion: number;
  dataMonth: string;
  kinds: Record<PraxisKind, WorkforceKind>;
}

let cache: WorkforceRaw | null = null;
let pending: Promise<WorkforceRaw | null> | null = null;

export function useWorkforce(): WorkforceRaw | null {
  const [data, setData] = useState<WorkforceRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/workforce.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WorkforceRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const BAND_COLORS: Record<string, string> = {
  '1': '#4fd6c2', '2': '#ffb454', '3': '#ff7a59', '4+': '#e05b8a',
};

export const PORTFOLIO_COLUMNS: ColDef[] = [
  { key: 'districts', labelKey: 'workforce.colDistricts', type: 'number', visible: true },
  { key: 'counties', labelKey: 'vedono.colCounties', type: 'text', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'text', visible: true },
  { key: 'ids', labelKey: 'workforce.colIds', type: 'text', visible: true },
  { key: 'key', labelKey: 'workforce.colKey', type: 'text', visible: false },
];

export const DISTRICT_COLUMNS: ColDef[] = [
  { key: 'id', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'changes', labelKey: 'workforce.colChanges', type: 'number', visible: true },
  { key: 'monthsObserved', labelKey: 'workforce.colMonths', type: 'number', visible: true },
  { key: 'portfolioToday', labelKey: 'workforce.colPortfolio', type: 'number', visible: true },
  { key: 'heldToday', labelKey: 'workforce.colHeld', type: 'bool', visible: true },
  { key: 'firstSeen', labelKey: 'workforce.colFirstSeen', type: 'text', visible: false },
];

export const COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'districts', labelKey: 'workforce.colDistricts', type: 'number', visible: true },
  { key: 'changes', labelKey: 'workforce.colChanges', type: 'number', visible: true },
  { key: 'districtsWithAChange', labelKey: 'workforce.colChanged', type: 'number', visible: true },
  { key: 'changeSharePct', labelKey: 'workforce.colChangeShare', type: 'number', visible: true },
  { key: 'inMultiHands', labelKey: 'workforce.colMulti', type: 'number', visible: true },
  { key: 'multiSharePct', labelKey: 'workforce.colMultiShare', type: 'number', visible: false },
];

export function portfolioRows(data: WorkforceRaw | null, kind: PraxisKind): Row[] {
  return (data?.kinds?.[kind]?.portfolios ?? []).map((p) => ({
    key: p.key,
    districts: p.districts,
    counties: p.counties.join(', '),
    settlements: p.settlements.join(', '),
    ids: p.ids.join(', '),
  }));
}

export function districtRows(data: WorkforceRaw | null, kind: PraxisKind): Row[] {
  return (data?.kinds?.[kind]?.districts ?? []).map((d) => ({ ...d }));
}

export function countyRows(data: WorkforceRaw | null, kind: PraxisKind): Row[] {
  return (data?.kinds?.[kind]?.counties ?? []).map((c) => ({
    ...c,
    changeSharePct: Math.round(c.changeShare * 1000) / 10,
    multiSharePct: Math.round(c.multiShare * 1000) / 10,
  }));
}

export function bandLabel(band: string): string {
  return t(`workforce.band.${band === '4+' ? 'four' : band}`);
}
