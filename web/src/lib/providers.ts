// One row per contracted provider (data/providers.json): the NEAK trade name
// and code, the official company name, tax number and registered seat from the
// EESZT provider register, and what the provider actually runs.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';

export type ProviderGroup = 'dental' | 'gp' | 'oncall' | 'university' | 'specialist';

export interface Provider {
  neakCode: string;
  neakName: string;
  tax: string;
  match: 'tax' | 'taxAndName' | 'name' | 'none';
  counts: Record<ProviderGroup, number>;
  total: number;
  counties: string[];
  settlements: number;
  euszolgId?: string;
  officialName?: string;
  seatCounty?: string;
  seatPostal?: string;
  seatSettlement?: string;
  seatAddress?: string;
}

export interface ProvidersRaw {
  schemaVersion: number;
  asOf: string;
  dataMonth: string;
  groups: ProviderGroup[];
  stats: {
    providers: number;
    identified: number;
    byMatch: Record<string, number>;
    services: number;
  };
  providers: Provider[];
}

let cache: ProvidersRaw | null = null;
let pending: Promise<ProvidersRaw | null> | null = null;

export function loadProviders(): Promise<ProvidersRaw | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch(`${import.meta.env.BASE_URL}data/providers.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: ProvidersRaw | null) => { cache = d; return d; })
    .catch(() => null);
  return pending;
}

export function useProviders(): ProvidersRaw | null {
  const [data, setData] = useState<ProvidersRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadProviders().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const PROVIDER_COLUMNS: ColDef[] = [
  { key: 'neakCode', labelKey: 'eeszt.colNeakCode', type: 'text', visible: true },
  { key: 'neakName', labelKey: 'providers.colNeakName', type: 'text', visible: true },
  { key: 'officialName', labelKey: 'providers.colOfficialName', type: 'text', visible: true },
  { key: 'tax', labelKey: 'providers.colTax', type: 'text', visible: true },
  { key: 'seat', labelKey: 'providers.colSeat', type: 'text', visible: true },
  { key: 'seatCounty', labelKey: 'providers.colSeatCounty', type: 'enum', visible: false },
  { key: 'total', labelKey: 'providers.colTotal', type: 'number', visible: true },
  { key: 'dental', labelKey: 'providers.colDental', type: 'number', visible: true },
  { key: 'gp', labelKey: 'providers.colGp', type: 'number', visible: true },
  { key: 'specialist', labelKey: 'providers.colSpecialist', type: 'number', visible: false },
  { key: 'oncall', labelKey: 'providers.colOncall', type: 'number', visible: false },
  { key: 'university', labelKey: 'providers.colUniversity', type: 'number', visible: false },
  { key: 'countyCount', labelKey: 'providers.colCounties', type: 'number', visible: false },
  { key: 'counties', labelKey: 'stats.thCounty', type: 'text', visible: false },
  { key: 'settlements', labelKey: 'providers.colSettlements', type: 'number', visible: false },
  { key: 'euszolgId', labelKey: 'providers.colEuszolgId', type: 'text', visible: false },
  { key: 'basis', labelKey: 'providers.colBasis', type: 'enum', visible: true },
];

export function providerRows(data: ProvidersRaw | null): Row[] {
  if (!data) return [];
  return data.providers.map((p) => ({
    neakCode: p.neakCode,
    neakName: p.neakName,
    officialName: p.officialName ?? null,
    tax: p.tax || null,
    seat: p.seatSettlement
      ? [`${p.seatPostal ?? ''} ${p.seatSettlement}`.trim(), p.seatAddress]
        .filter(Boolean).join(', ')
      : null,
    seatCounty: p.seatCounty || null,
    total: p.total,
    dental: p.counts.dental,
    gp: p.counts.gp,
    specialist: p.counts.specialist,
    oncall: p.counts.oncall,
    university: p.counts.university,
    countyCount: p.counties.length,
    counties: p.counties.join(', '),
    settlements: p.settlements,
    euszolgId: p.euszolgId ?? null,
    basis: t(`providers.basis.${p.match}`),
  }));
}

/** the providers running the most services, for the summary */
export function biggestProviders(data: ProvidersRaw | null, n = 5): Provider[] {
  if (!data) return [];
  return [...data.providers].sort((a, b) => b.total - a.total).slice(0, n);
}

/** how many providers run exactly one service, two, three or more */
export function portfolioSpread(data: ProvidersRaw | null): { key: string; n: number }[] {
  if (!data) return [];
  const spread = { '1': 0, '2': 0, '3-5': 0, '6+': 0 };
  for (const p of data.providers) {
    if (p.total === 1) spread['1'] += 1;
    else if (p.total === 2) spread['2'] += 1;
    else if (p.total <= 5) spread['3-5'] += 1;
    else spread['6+'] += 1;
  }
  return Object.entries(spread).map(([key, n]) => ({ key, n }));
}
