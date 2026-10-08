// Physician turnover (data/fluctuation.json): how often a district changes
// hands, read out of our own archive of monthly snapshots.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';
import type { PraxisKind } from '../types';

export interface ChurnCounty {
  county: string;
  districts: number;
  recentChanges: number;
  changes: number;
  recentRate: number | null;
  medianTenureMonths: number | null;
  unchangedWholeWindow: number;
}

export interface FluctuationRaw {
  schemaVersion: number;
  dataMonth: string;
  recentMonths: number;
  kinds: Record<PraxisKind, {
    from: string; snapshots: number; changes: number; recentChanges: number;
    districts: number; byYear: Record<string, number>; counties: ChurnCounty[];
    events: { month: string; fin: string; county: string }[];
  }>;
}

let cache: FluctuationRaw | null = null;
let pending: Promise<FluctuationRaw | null> | null = null;

export function useFluctuation(): FluctuationRaw | null {
  const [data, setData] = useState<FluctuationRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/fluctuation.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: FluctuationRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export function churnRows(data: FluctuationRaw | null, kind: PraxisKind): ChurnCounty[] {
  return data?.kinds[kind].counties ?? [];
}

export const CHURN_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'districts', labelKey: 'churn.colDistricts', type: 'number', visible: true },
  { key: 'recentChanges', labelKey: 'churn.colRecent', type: 'number', visible: true },
  { key: 'recentRate', labelKey: 'churn.colRate', type: 'number', visible: true },
  { key: 'medianTenureMonths', labelKey: 'churn.colTenure', type: 'number', visible: true },
  { key: 'unchangedWholeWindow', labelKey: 'churn.colUnchanged', type: 'number', visible: true },
  { key: 'changes', labelKey: 'churn.colAll', type: 'number', visible: false },
];

/** The rows as the table wants them (it reads plain values, not objects). */
export function churnTableRows(data: FluctuationRaw | null, kind: PraxisKind): Row[] {
  return churnRows(data, kind).map((r) => ({ ...r } as Row));
}

export const churnLabel = (key: string) => t(`churn.${key}`);
