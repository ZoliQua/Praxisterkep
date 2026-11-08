// The grant winners one by one (data/grants.json), for the tables of the
// "Megérte?" section. outcomes.json carries the counts the charts draw; the
// list itself — the surgery address NEAK published, the district codes it
// was matched to — is fetched only when a reader opens a table. NEAK's lists
// name the winning doctor; grants.json never kept the name, and nor does
// anything here.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import { formatMonth } from './format';
import { dataUrl } from './dataUrl';
import type { ColDef, Row } from './eesztTable';

export interface GrantWinner {
  programme: 'settle' | 'practice'; kind: 'gp' | 'dental'; year: number; seq: number;
  county: string; settlement: string; district: string; address: string;
  contract: boolean; fins: string[]; matchedBy: 'vacant' | 'registry' | 'ambiguous' | 'none';
  vacantSince: string | null; status: 'filled' | 'vacant' | 'gone' | null;
}

export interface GrantFile {
  files: Record<string, { url: string; retrieved: string }>;
  kinds: Record<'gp' | 'dental', { winners: GrantWinner[] }>;
}

let cache: GrantFile | null = null;
let pending: Promise<GrantFile | null> | null = null;

/** grants.json, once `wanted` turns true (and from then on, cached). */
export function useGrantFile(wanted: boolean): GrantFile | null {
  const [data, setData] = useState<GrantFile | null>(cache);
  useEffect(() => {
    if (!wanted || data) return;
    let alive = true;
    pending ??= fetch(dataUrl('grants.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GrantFile | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [wanted, data]);
  return data;
}

/** The part of the charts a winner falls in — the same six partsOf() counts. */
export function grantPart(w: Pick<GrantWinner, 'contract' | 'matchedBy' | 'status'>): string {
  if (!w.contract) return 'noContract';
  if (w.matchedBy === 'ambiguous') return 'ambiguous';
  if (w.matchedBy === 'none') return 'unmatched';
  return w.status ?? 'unmatched';
}

/** The source PDF of one year's list. */
export function grantFileKey(w: Pick<GrantWinner, 'programme' | 'kind' | 'year'>): string {
  return `${w.programme}_${w.kind}_${w.year}.pdf`;
}

export const GRANT_COLUMNS: ColDef[] = [
  { key: 'year', labelKey: 'outcomes.grants.col.year', type: 'number', visible: true },
  { key: 'settlement', labelKey: 'outcomes.grants.col.settlement', type: 'text', visible: true, link: 'settlement' },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'district', labelKey: 'outcomes.grants.col.district', type: 'enum', visible: false },
  { key: 'address', labelKey: 'outcomes.grants.col.address', type: 'text', visible: true },
  { key: 'part', labelKey: 'outcomes.grants.col.part', type: 'enum', visible: true },
  { key: 'vacantSince', labelKey: 'outcomes.grants.col.vacantSince', type: 'text', visible: true },
  { key: 'contract', labelKey: 'outcomes.grants.col.contract', type: 'bool', visible: false },
  { key: 'matchedBy', labelKey: 'outcomes.grants.col.matchedBy', type: 'enum', visible: false },
  { key: 'fins', labelKey: 'outcomes.grants.col.fins', type: 'text', visible: false },
  { key: 'seq', labelKey: 'outcomes.grants.col.seq', type: 'number', visible: false },
];

export function grantRows(list: GrantWinner[]): Row[] {
  return list.map((w) => ({
    year: w.year, seq: w.seq, county: w.county, settlement: w.settlement, district: w.district,
    address: w.address, contract: w.contract,
    part: t(`outcomes.grants.part.${grantPart(w)}`),
    matchedBy: t(`outcomes.grants.matchedBy.${w.matchedBy}`),
    vacantSince: w.vacantSince ? formatMonth(w.vacantSince) : null,
    fins: w.fins.join(', '),
  }));
}
