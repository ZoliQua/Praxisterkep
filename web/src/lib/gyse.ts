// Medical-aid retailers (data/gyse.json): where a prescription for a walking
// frame, a hearing aid or an orthopaedic shoe can actually be filled. Seven
// licensed activities, of which three dispense a device — a repair shop is
// not a substitute for a supplier, so they are counted apart.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';

export type GyseKind = 'shop' | 'branch' | 'workshop' | 'orthopaedic'
  | 'dentaltech' | 'rental' | 'repair' | 'other';

export const RETAIL: GyseKind[] = ['shop', 'branch', 'workshop'];

export interface GyseSite {
  providerId: string;
  provider: string;
  siteId: string;
  unit: string;
  county: string;
  settlement: string;
  postalCode: string;
  address: string;
  kind: GyseKind;
  professionCode: string;
  profession: string;
  authority: string;
  lat: number | null;
  lon: number | null;
  geoApprox: boolean | null;
}

export interface GyseRaw {
  schemaVersion: number;
  asOf: string;
  stats: {
    sites: number; premises: number; providers: number; settlements: number;
    settlementsTotal: number; counties: number; geocoded: number;
    retail: number; retailPremises: number; retailSettlements: number;
    population: number; residentsPerSite: number;
  } & Record<string, number>;
  counties: { county: string; sites: number; retail: number; providers: number;
    settlements: number; population: number; residentsPerSite: number }[];
  providers: { providerId: string; provider: string; sites: number;
    counties: string[]; settlements: number }[];
  settlements: { settlement: string; county: string; district: string;
    population: number; sites: number; retail: number; providers: number }[];
  sites: GyseSite[];
}

export const KIND_COLORS: Record<string, string> = {
  shop: '#4fd6c2',
  branch: '#7fd8c8',
  workshop: '#b8b0f5',
  orthopaedic: '#ffb454',
  dentaltech: '#c98500',
  rental: '#8899ad',
  repair: '#ff7a59',
};

let cache: GyseRaw | null = null;
let pending: Promise<GyseRaw | null> | null = null;

export function useGyse(): GyseRaw | null {
  const [data, setData] = useState<GyseRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/gyse.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GyseRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const SITE_COLUMNS: ColDef[] = [
  { key: 'kindLabel', labelKey: 'gyse.colKind', type: 'enum', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'address', labelKey: 'eeszt.colAddress', type: 'text', visible: true },
  { key: 'provider', labelKey: 'vedono.colProvider', type: 'text', visible: true },
  { key: 'siteId', labelKey: 'gyse.colSiteId', type: 'text', visible: false },
  { key: 'authority', labelKey: 'gyse.colAuthority', type: 'text', visible: false },
  { key: 'geoApprox', labelKey: 'eeszt.colApprox', type: 'bool', visible: false },
];

export const COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'sites', labelKey: 'gyse.colSites', type: 'number', visible: true },
  { key: 'retail', labelKey: 'gyse.colRetail', type: 'number', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: true },
  { key: 'providers', labelKey: 'vedono.colProviders', type: 'number', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'residentsPerSite', labelKey: 'gyse.colPerSite', type: 'number', visible: true },
];

export const SETTLEMENT_COLUMNS: ColDef[] = [
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'sites', labelKey: 'gyse.colSites', type: 'number', visible: true },
  { key: 'retail', labelKey: 'gyse.colRetail', type: 'number', visible: true },
  { key: 'district', labelKey: 'vedono.colDistrict', type: 'enum', visible: false },
];

export function siteRows(data: GyseRaw | null, retailOnly: boolean): Row[] {
  return (data?.sites ?? [])
    .filter((s) => !retailOnly || RETAIL.includes(s.kind))
    .map((s) => ({
      ...s,
      kindLabel: t(`gyse.kind.${s.kind}`),
      // the map colours by `type` and wants the district field names
      type: t(`gyse.kind.${s.kind}`),
      fin: s.siteId,
      status: '',
      settlementMatch: null,
      unitCode: s.unit || null,
      licenceId: null,
      providerId: s.providerId || null,
    }));
}

export function countyRows(data: GyseRaw | null): Row[] {
  return (data?.counties ?? []).map((c) => ({ ...c }));
}

export function settlementRows(data: GyseRaw | null, withoutOnly: boolean): Row[] {
  return (data?.settlements ?? [])
    .filter((s) => !withoutOnly || s.retail === 0)
    .map((s) => ({ ...s }));
}

/** the licensed activities, largest first, for the bar breakdown */
export function kindBreakdown(
  data: GyseRaw | null,
): { kind: string; n: number; color: string }[] {
  const stats = data?.stats;
  if (!stats) return [];
  return (['shop', 'branch', 'workshop', 'orthopaedic', 'repair', 'rental', 'dentaltech'] as const)
    .map((kind) => ({ kind, n: stats[kind] ?? 0, color: KIND_COLORS[kind] }))
    .filter((k) => k.n > 0)
    .sort((a, b) => b.n - a.n);
}
