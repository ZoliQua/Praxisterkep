// The dental services outside the district map (data/dental_extra.json):
// on-call, university primary care and every Szakellátás service, each with
// its EESZT licence match. Loaded lazily — the districts never wait for it.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { Cell, ColDef, Row } from './eesztTable';

export type ExtraGroup = 'oncall' | 'university' | 'specialist';

export interface ExtraSite {
  postalCode: string;
  settlement: string;
  address: string;
}

export interface ExtraService {
  id: string;
  group: ExtraGroup;
  level: string;
  unitType: string;
  county: string;
  settlement: string;
  postalCode: string;
  address: string;
  rows: number;
  sites?: ExtraSite[];
  /** contracted physicians as published by NEAK; absent when it names none */
  doctors?: string[];
  neakCode?: string;
  provider?: string;
  licence?: {
    postalCode: string;
    settlement: string;
    address: string;
    profession: string;
    settlementMatch: boolean;
    providerMatch: boolean;
    publicFunded: boolean;
    onCall: number;
    licenceCount: number;
  };
  trace?: { units: string; licenceId: string; providerId: string };
  geo?: { lat: number; lon: number; approx: boolean; from: string };
}

export interface DentalExtraRaw {
  schemaVersion: number;
  asOf: string;
  dataMonth: string;
  source: string;
  eesztSources: Record<string, string>;
  types: Record<string, ExtraGroup>;
  professions: Record<string, string>;
  onCall: string[];
  stats: Record<ExtraGroup, Record<string, number>>;
  services: ExtraService[];
  unmatched: Record<string, [string, string]>;
  unmatchedDetails: Record<string, [string, string, string, string, string, string, number, number][]>;
}

let cache: DentalExtraRaw | null = null;
let pending: Promise<DentalExtraRaw | null> | null = null;

export function loadDentalExtra(): Promise<DentalExtraRaw | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch(`${import.meta.env.BASE_URL}data/dental_extra.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: DentalExtraRaw | null) => {
      cache = d;
      return d;
    })
    .catch(() => null);
  return pending;
}

/** re-renders once the supplement has loaded; null while it hasn't */
export function useDentalExtra(): DentalExtraRaw | null {
  const [data, setData] = useState<DentalExtraRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadDentalExtra().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

/* ---------------- table rows ---------------- */

export type ExtraRow = Row & {
  fin: string;
  unitType: string;
  settlement: string;
  county: string;
  status: string;
  type: string;
  lat: number | null;
  lon: number | null;
  geoApprox: boolean | null;
  settlementMatch: boolean | null;
  unitCode: string | null;
  licenceId: string | null;
  providerId: string | null;
};

export const EXTRA_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'extra.colCode', type: 'text', visible: true },
  { key: 'unitType', labelKey: 'extra.colUnitType', type: 'enum', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'postalCode', labelKey: 'eeszt.colPostal', type: 'text', visible: false },
  { key: 'address', labelKey: 'extra.colAddress', type: 'text', visible: true },
  { key: 'doctorCount', labelKey: 'extra.colDoctorCount', type: 'number', visible: true },
  { key: 'doctors', labelKey: 'extra.colDoctors', type: 'text', visible: true },
  { key: 'provider', labelKey: 'eeszt.provider', type: 'text', visible: false },
  { key: 'neakCode', labelKey: 'eeszt.colNeakCode', type: 'text', visible: false },
  { key: 'eesztState', labelKey: 'eeszt.colState', type: 'enum', visible: true },
  { key: 'profession', labelKey: 'eeszt.colProfession', type: 'enum', visible: true },
  { key: 'licSettlement', labelKey: 'eeszt.colLicSettlement', type: 'text', visible: false },
  { key: 'licAddress', labelKey: 'eeszt.colLicAddress', type: 'text', visible: false },
  { key: 'settlementMatch', labelKey: 'eeszt.colSettlementMatch', type: 'bool', visible: false },
  { key: 'providerMatch', labelKey: 'eeszt.colProviderMatch', type: 'bool', visible: false },
  { key: 'publicFunded', labelKey: 'eeszt.thFunded', type: 'bool', visible: true },
  { key: 'onCall', labelKey: 'eeszt.onCall', type: 'enum', visible: false },
  { key: 'licenceCount', labelKey: 'eeszt.colLicenceCount', type: 'number', visible: false },
  { key: 'reason', labelKey: 'eeszt.colReason', type: 'enum', visible: false },
  { key: 'geoApprox', labelKey: 'eeszt.colGeoApprox', type: 'bool', visible: false },
  { key: 'geoFrom', labelKey: 'extra.colGeoFrom', type: 'enum', visible: false },
  { key: 'unitCode', labelKey: 'eeszt.colUnit', type: 'text', visible: false },
  { key: 'licenceId', labelKey: 'eeszt.colLicenceId', type: 'text', visible: false },
  { key: 'providerId', labelKey: 'eeszt.colProviderId', type: 'text', visible: false },
];

/** the on-call and university tables never vary by service type */
export function extraColumns(group: ExtraGroup): ColDef[] {
  return group === 'specialist'
    ? EXTRA_COLUMNS
    : EXTRA_COLUMNS.filter((c) => c.key !== 'unitType');
}

export function extraRows(data: DentalExtraRaw | null, group: ExtraGroup): ExtraRow[] {
  if (!data) return [];
  return data.services.filter((s) => s.group === group).map((s) => {
    const lic = s.licence;
    const reason = data.unmatched[s.id];
    const sites = s.sites ?? [{ postalCode: s.postalCode, settlement: s.settlement, address: s.address }];
    return {
      fin: s.id,
      unitType: s.unitType,
      settlement: [...new Set(sites.map((x) => x.settlement))].join(', '),
      county: s.county,
      postalCode: [...new Set(sites.map((x) => x.postalCode))].join(', '),
      address: [...new Set(sites.map((x) => x.address))].join(' · '),
      // the map and the shared cell renderer read these two
      type: s.unitType,
      status: s.level,
      doctorCount: s.doctors?.length ?? 0,
      doctors: s.doctors?.join(', ') ?? null,
      provider: s.provider ?? null,
      neakCode: s.neakCode ?? null,
      eesztState: lic ? t('eeszt.stateLicence') : t('eeszt.noLicence'),
      profession: lic ? data.professions[lic.profession] ?? lic.profession : null,
      licSettlement: lic?.settlement || null,
      licAddress: lic?.address || null,
      settlementMatch: lic ? lic.settlementMatch : null,
      providerMatch: lic ? lic.providerMatch : null,
      publicFunded: lic ? lic.publicFunded : null,
      onCall: lic ? data.onCall[lic.onCall] ?? '' : null,
      licenceCount: lic ? lic.licenceCount : null,
      reason: reason ? t(`eeszt.reason.${reason[0]}`) : null,
      geoApprox: s.geo ? s.geo.approx : null,
      geoFrom: s.geo ? t(`extra.geoFrom.${s.geo.from}`) : null,
      lat: s.geo?.lat ?? null,
      lon: s.geo?.lon ?? null,
      unitCode: s.trace?.units || null,
      licenceId: s.trace?.licenceId || null,
      providerId: s.trace?.providerId || null,
    };
  });
}

/* ---------------- summaries ---------------- */

export interface TypeCount {
  type: string;
  services: number;
  rows: number;
}

/** service types of a group with their counts, biggest first */
export function typeBreakdown(data: DentalExtraRaw | null, group: ExtraGroup): TypeCount[] {
  if (!data) return [];
  const out = new Map<string, TypeCount>();
  for (const s of data.services) {
    if (s.group !== group) continue;
    const cur = out.get(s.unitType) ?? { type: s.unitType, services: 0, rows: 0 };
    cur.services += 1;
    cur.rows += s.rows;
    out.set(s.unitType, cur);
  }
  return [...out.values()].sort((a, b) => b.services - a.services);
}

export function groupStat(data: DentalExtraRaw | null, group: ExtraGroup, key: string): number {
  return data?.stats?.[group]?.[key] ?? 0;
}

/** counties ranked by service count — the "where are they" summary */
export function countyBreakdown(data: DentalExtraRaw | null, group: ExtraGroup): [string, number][] {
  if (!data) return [];
  const out = new Map<string, number>();
  for (const s of data.services) {
    if (s.group !== group) continue;
    out.set(s.county, (out.get(s.county) ?? 0) + 1);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'hu'));
}

export function cellOf(row: ExtraRow, key: string): Cell {
  return row[key] ?? null;
}
