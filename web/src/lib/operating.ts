// "Működési szint" (data/operating.json): one row per contracted praxis that
// has a physician — which licence it works under, in which organisational
// unit, at which premises. Vacant and dissolved districts are not here: with
// no contracted physician there is no operating licence to show.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';

export interface OperatingLicence {
  unit: string;
  licenceId: string;
  settlement: string;
  address: string;
  profession: string;
  publicFunded: boolean;
}

export interface OperatingRow {
  fin: string;
  group: string;
  settlement: string;
  county: string;
  neakCode: string;
  provider: string;
  providerSource: 'official' | 'neak';
  tax: string;
  euszolgId: string;
  units: string[];
  unitCount: number;
  licences: OperatingLicence[];
  licenceSource: 'code' | 'crosscheck' | 'none';
}

export interface OperatingRaw {
  schemaVersion: number;
  asOf: string;
  dataMonth: string;
  professions: Record<string, string>;
  stats: {
    praxes: number;
    withLicence: number;
    fromCode: number;
    fromCrosscheck: number;
    noLicence: number;
    byGroup: Record<string, number>;
    multiSite: number;
  };
  rows: OperatingRow[];
}

let cache: OperatingRaw | null = null;
let pending: Promise<OperatingRaw | null> | null = null;

export function loadOperating(): Promise<OperatingRaw | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch(`${import.meta.env.BASE_URL}data/operating.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: OperatingRaw | null) => { cache = d; return d; })
    .catch(() => null);
  return pending;
}

export function useOperating(): OperatingRaw | null {
  const [data, setData] = useState<OperatingRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadOperating().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const OPERATING_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'operating.colFin', type: 'text', visible: true },
  { key: 'group', labelKey: 'operating.colGroup', type: 'enum', visible: true },
  { key: 'provider', labelKey: 'operating.colProvider', type: 'text', visible: true },
  { key: 'tax', labelKey: 'operating.colTax', type: 'text', visible: true },
  { key: 'neakCode', labelKey: 'operating.colNeakCode', type: 'text', visible: true },
  { key: 'euszolgId', labelKey: 'operating.colEuszolgId', type: 'text', visible: true },
  { key: 'unitCount', labelKey: 'operating.colUnitCount', type: 'number', visible: true },
  { key: 'licences', labelKey: 'operating.colLicences', type: 'text', visible: true },
  { key: 'settlement', labelKey: 'operating.colNeakSettlement', type: 'text', visible: false },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: false },
  { key: 'units', labelKey: 'operating.colUnits', type: 'text', visible: false },
  { key: 'licenceCount', labelKey: 'operating.colLicenceCount', type: 'number', visible: false },
  { key: 'profession', labelKey: 'eeszt.colProfession', type: 'enum', visible: false },
  { key: 'source', labelKey: 'operating.colSource', type: 'enum', visible: true },
];

/** "000031140 → Sásd, Rákóczi utca 41." per licence, one line each */
export function licenceText(row: OperatingRow): string {
  if (!row.licences.length) return t('operating.noMatch');
  return row.licences
    .map((l) => `${l.unit} → ${[l.settlement, l.address].filter(Boolean).join(', ')}`)
    .join(' · ');
}

export function operatingRows(data: OperatingRaw | null): Row[] {
  if (!data) return [];
  return data.rows.map((r) => ({
    fin: r.fin,
    group: t(`operating.group.${r.group}`),
    provider: r.provider || null,
    tax: r.tax || null,
    neakCode: r.neakCode || null,
    euszolgId: r.euszolgId || null,
    unitCount: r.unitCount,
    units: r.units.join(', ') || null,
    licences: licenceText(r),
    licenceCount: r.licences.length,
    profession: r.licences.length
      ? [...new Set(r.licences.map((l) => data.professions[l.profession] ?? l.profession))]
        .join(', ')
      : null,
    settlement: r.settlement,
    county: r.county,
    source: t(`operating.source.${r.licenceSource}`),
    // the first licence's codes, so the EESZT deep links still work
    licenceId: r.licences[0]?.licenceId ?? null,
    unitCode: r.licences[0]?.unit ?? null,
  }));
}
