// Age composition (data/age.json): the KSH 2022 census read at settlement
// level and aggregated to counties. The site's denominators come from the
// annual gazetteer, so what travels here are the census *shares* plus the
// counts they imply for the current resident population.
import { useEffect, useState } from 'react';
import type { ColDef, Row } from './eesztTable';

export interface AgeSettlement {
  kshId: string;
  settlement: string;
  county: string;
  district: string;
  isDistrictOfCapital: boolean;
  population: number;
  censusTotal: number | null;
  young: number | null;
  working: number | null;
  old: number | null;
  youngShare: number | null;
  oldShare: number | null;
  youngNow: number | null;
  oldNow: number | null;
  suppressed: boolean;
  recovered: boolean;
}

export interface AgeGroup {
  name: string;
  settlements: number;
  suppressed: number;
  population: number;
  censusTotal: number;
  young: number;
  old: number;
  youngShare: number | null;
  oldShare: number | null;
  youngNow: number | null;
  oldNow: number | null;
}

export interface AgeRaw {
  schemaVersion: number;
  source: string;
  sourceUrl: string;
  licence: string;
  censusYear: number;
  apiVersion: string;
  populationYear: number;
  settlements: AgeSettlement[];
  counties: AgeGroup[];
  country: AgeGroup;
}

let cache: AgeRaw | null = null;
let pending: Promise<AgeRaw | null> | null = null;

export function loadAge(): Promise<AgeRaw | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch(`${import.meta.env.BASE_URL}data/age.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: AgeRaw | null) => { cache = d; return d; })
    .catch(() => null);
  return pending;
}

export function useAge(): AgeRaw | null {
  const [data, setData] = useState<AgeRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadAge().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const AGE_COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'youngSharePct', labelKey: 'coverage.colYoungShare', type: 'number', visible: true },
  { key: 'oldSharePct', labelKey: 'coverage.colOldShare', type: 'number', visible: true },
  { key: 'youngNow', labelKey: 'age.colYoungNow', type: 'number', visible: true },
  { key: 'oldNow', labelKey: 'age.colOldNow', type: 'number', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: false },
];

export function ageCountyRows(data: AgeRaw | null): Row[] {
  return (data?.counties ?? []).map((c) => ({
    county: c.name,
    population: c.population,
    youngSharePct: c.youngShare === null ? null : Math.round(c.youngShare * 1000) / 10,
    oldSharePct: c.oldShare === null ? null : Math.round(c.oldShare * 1000) / 10,
    youngNow: c.youngNow,
    oldNow: c.oldNow,
    settlements: c.settlements,
  }));
}

/** the county's age group, for sections that show one county at a time */
export function countyAge(data: AgeRaw | null, county: string): AgeGroup | null {
  return (data?.counties ?? []).find((c) => c.name === county) ?? null;
}

/** one settlement by KSH code, for the settlement-level sections */
export function settlementAge(data: AgeRaw | null, kshId: string): AgeSettlement | null {
  return (data?.settlements ?? []).find((s) => s.kshId === kshId) ?? null;
}
