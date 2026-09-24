// NEAK's own FIN → provider link (data/officialmap.json), held up against
// the one the cross-check works out from addresses and names. Neither
// replaces the other: the site keeps publishing its own chain, and this
// says how often the two agree — and where they do not.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';

export type Verdict = 'agree' | 'differ' | 'onlyOfficial' | 'onlyOurs' | 'neither';

export interface OfficialRow {
  fin: string;
  group: string;
  settlement: string;
  county: string;
  neakCode: string;
  licenceSource: string;
  ourProviderIds: string[];
  ourProvider: string;
  ourLicenceIds: string[];
  ourUnits: string[];
  officialProviderIds: string[];
  officialProvider: string;
  officialTax: string;
  officialUnits: string[];
  officialUnitHasLicence: boolean;
  verdict: Verdict;
}

export interface OfficialRaw {
  schemaVersion: number;
  asOf: string;
  licenceAsOf: string;
  dataMonth: string;
  verdicts: Verdict[];
  stats: {
    praxes: number;
    withOfficial: number;
    decidable: number;
    agreement: number;
    rescuable: number;
    bySource: Record<string, Record<string, number>>;
  } & Record<Verdict, number>;
  counties: ({ county: string; praxes: number; agreement: number } & Record<Verdict, number>)[];
  rows: OfficialRow[];
}

export const VERDICT_COLORS: Record<Verdict, string> = {
  agree: '#4fd6c2',
  differ: '#ff7a59',
  onlyOfficial: '#ffb454',
  onlyOurs: '#b8b0f5',
  neither: '#8899ad',
};

let cache: OfficialRaw | null = null;
let pending: Promise<OfficialRaw | null> | null = null;

export function useOfficialMap(): OfficialRaw | null {
  const [data, setData] = useState<OfficialRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/officialmap.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: OfficialRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const OFFICIAL_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'verdictLabel', labelKey: 'officialmap.colVerdict', type: 'enum', visible: true },
  { key: 'sourceLabel', labelKey: 'officialmap.colSource', type: 'enum', visible: true },
  { key: 'ourProvider', labelKey: 'officialmap.colOurs', type: 'text', visible: true },
  { key: 'officialProvider', labelKey: 'officialmap.colOfficial', type: 'text', visible: true },
  { key: 'ourProviderId', labelKey: 'officialmap.colOurId', type: 'text', visible: false },
  { key: 'officialProviderId', labelKey: 'officialmap.colOfficialId', type: 'text', visible: false },
  { key: 'ourLicence', labelKey: 'eeszt.colLicence', type: 'text', visible: false },
  { key: 'officialTax', labelKey: 'operating.colTax', type: 'text', visible: false },
  { key: 'groupLabel', labelKey: 'operating.colGroup', type: 'enum', visible: false },
];

export const OFFICIAL_COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'praxes', labelKey: 'officialmap.colPraxes', type: 'number', visible: true },
  { key: 'agree', labelKey: 'officialmap.verdict.agree', type: 'number', visible: true },
  { key: 'differ', labelKey: 'officialmap.verdict.differ', type: 'number', visible: true },
  { key: 'agreementPct', labelKey: 'officialmap.colAgreement', type: 'number', visible: true },
];

export function officialRows(data: OfficialRaw | null, only?: Verdict): Row[] {
  return (data?.rows ?? [])
    .filter((r) => !only || r.verdict === only)
    .map((r) => ({
      fin: r.fin,
      settlement: r.settlement,
      county: r.county,
      verdictLabel: t(`officialmap.verdict.${r.verdict}`),
      sourceLabel: t(`officialmap.source.${r.licenceSource}`),
      ourProvider: r.ourProvider,
      officialProvider: r.officialProvider,
      ourProviderId: r.ourProviderIds.join(', '),
      officialProviderId: r.officialProviderIds.join(', '),
      ourLicence: r.ourLicenceIds.join(', '),
      officialTax: r.officialTax,
      groupLabel: r.group,
    }));
}

export function officialCountyRows(data: OfficialRaw | null): Row[] {
  return (data?.counties ?? []).map((c) => ({
    county: c.county,
    praxes: c.praxes,
    agree: c.agree,
    differ: c.differ,
    agreementPct: Math.round(c.agreement * 1000) / 10,
  }));
}
