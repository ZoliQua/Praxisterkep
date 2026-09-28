// Since when the organisational unit a district works under has existed
// (data/licence_history.json). The licence register answers for past dates,
// the financing register does not — so this can say how old the current
// arrangement is, and cannot say who ran the district before it.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';

export interface HistoryDistrict {
  fin: string;
  type: string;
  county: string;
  institution: string;
  unit: string;
  provider: string;
  providerName: string;
  settlement: string;
  olderThanWindow: boolean;
  firstSeen: string;
  appearedAfter: string;
}

export interface LicenceHistoryRaw {
  schemaVersion: number;
  snapshots: { date: string; rows: number; units: number; licences: number;
    ambiguous: number }[];
  churn: { from: string; to: string; left: number; arrived: number; carried: number }[];
  stats: {
    from: string; to: string; snapshots: number; districtsFollowed: number;
    unitsOlderThanWindow: number; unitsNewerThanWindow: number;
    newByType: Record<string, number>; newByDate: Record<string, number>;
    unitsLeft: number; unitsArrived: number;
  };
  districts: HistoryDistrict[];
}

let cache: LicenceHistoryRaw | null = null;
let pending: Promise<LicenceHistoryRaw | null> | null = null;

export function useLicenceHistory(): LicenceHistoryRaw | null {
  const [data, setData] = useState<LicenceHistoryRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/licence_history.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: LicenceHistoryRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

// the branch names live in i18n under licenceHistory.types, keyed by the
// code the financing register's TIP column carries

export const HISTORY_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'typeLabel', labelKey: 'referral.colType', type: 'enum', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'firstSeen', labelKey: 'licenceHistory.colSince', type: 'enum', visible: true },
  { key: 'appearedAfter', labelKey: 'licenceHistory.colAfter', type: 'enum', visible: false },
  // the financing register names the institution for every row; the EESZT
  // provider is known for about three fifths of them, so it rides along hidden
  { key: 'institution', labelKey: 'licenceHistory.colInstitution', type: 'text',
    visible: true },
  { key: 'providerName', labelKey: 'licenceHistory.colProvider', type: 'text',
    visible: false },
  { key: 'unit', labelKey: 'eeszt.colUnit', type: 'text', visible: false },
];

const typeLabel = (code: string) => {
  const label = t(`licenceHistory.types.${code}`);
  return label.startsWith('licenceHistory.') ? code : label;
};

export function newUnitRows(data: LicenceHistoryRaw | null): Row[] {
  return (data?.districts ?? [])
    .filter((d) => !d.olderThanWindow)
    .map((d) => ({ ...d, typeLabel: typeLabel(d.type) } as Row));
}

/** the branches worth naming on the page, largest first */
export function newByType(
  data: LicenceHistoryRaw | null,
): { code: string; label: string; count: number }[] {
  return Object.entries(data?.stats.newByType ?? {})
    .map(([code, count]) => ({ code, label: typeLabel(code), count }))
    .sort((a, b) => b.count - a.count);
}
