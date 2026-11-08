// What changed (data/changes.json): the vacancy lists held against each
// other, month by month this year and year by year before it.
import { useEffect, useState } from 'react';
import type { ColDef, Row } from './eesztTable';
import type { PraxisKind } from '../types';
import { dataUrl } from './dataUrl';

export interface ChangeFlows {
  stillVacant: number; ended: number; filled: number; toDissolved: number;
  leftRegistry: number; unknownFate: number;
  newVacant: number; fromFilled: number; fromDissolved: number; newDistrict: number; unknownOrigin: number;
}

export interface ChangeEntry {
  id: string; settlement: string; county: string; population: number | null; how: string;
}

export interface ChangePair {
  from: string; to: string; months: number;
  vacantFrom: number; vacantTo: number;
  populationFrom: number | null; populationTo: number | null;
  totalFrom: number | null; totalTo: number | null;
  longTermFrom: number | null; longTermTo: number | null;
  dissolvedFrom: number | null; dissolvedTo: number | null;
  known: { registryFrom: boolean; registryTo: boolean; dissolvedFrom: boolean; dissolvedTo: boolean };
  flows: ChangeFlows;
  doctorChanges: number | null;
  byType: Record<string, [number, number]>;
  counties: { county: string; vacantFrom: number; vacantTo: number; newVacant: number; ended: number }[];
  newList?: ChangeEntry[];
  endedList?: ChangeEntry[];
}

export interface ChangesRaw {
  schemaVersion: number;
  dataMonth: string;
  year: string;
  kinds: Record<PraxisKind, {
    months: string[];
    years: { year: string; month: string; partial: boolean; vacant: number;
      total: number | null; population: number | null; longTerm: number | null }[];
    monthly: ChangePair[];
    yearly: ChangePair[];
    span: ChangePair;
  }>;
}

let cache: ChangesRaw | null = null;
let pending: Promise<ChangesRaw | null> | null = null;

export function useChanges(): ChangesRaw | null {
  const [data, setData] = useState<ChangesRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(dataUrl('changes.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ChangesRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'vacantFrom', labelKey: 'changes.colFrom', type: 'number', visible: true },
  { key: 'vacantTo', labelKey: 'changes.colTo', type: 'number', visible: true },
  { key: 'net', labelKey: 'changes.colNet', type: 'number', visible: true },
  { key: 'newVacant', labelKey: 'changes.colNew', type: 'number', visible: true },
  { key: 'ended', labelKey: 'changes.colEnded', type: 'number', visible: true },
];

export const LIST_COLUMNS: ColDef[] = [
  { key: 'settlement', labelKey: 'changes.colSettlement', type: 'text', visible: true, link: 'settlement' },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'population', labelKey: 'changes.colPopulation', type: 'number', visible: true },
  { key: 'howLabel', labelKey: 'changes.colHow', type: 'enum', visible: true },
  { key: 'id', labelKey: 'changes.colFin', type: 'text', visible: false },
];

export function countyRows(pair: ChangePair): Row[] {
  return pair.counties.map((c) => ({ ...c, net: c.vacantTo - c.vacantFrom } as Row));
}

/** Net change per county, the largest movements first. */
export function countyMoves(pair: ChangePair) {
  return pair.counties
    .map((c) => ({ ...c, net: c.vacantTo - c.vacantFrom }))
    .filter((c) => c.newVacant || c.ended)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.newVacant + b.ended - a.newVacant - a.ended
      || a.county.localeCompare(b.county, 'hu'));
}
