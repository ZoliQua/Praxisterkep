// The vacancy-risk model (data/risk.json): every district that has a doctor
// today, ranked by how likely it is to lose one within a year, with the
// factors that moved its score. The model is fitted on the archived monthly
// snapshots and its out-of-sample check travels with it.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import { formatNumber } from './format';
import type { ColDef, Row } from './eesztTable';
import type { PraxisKind } from '../types';

export interface RiskWhy {
  factor: string;
  level: string;
  lift: number;
}

export interface RiskRow {
  fin: string;
  settlement: string;
  county: string;
  type: string;
  risk: number;
  band: string;
  tenureMonths: number | null;
  tenureFrom: string | null;
  changes: number;
  wasVacant: boolean;
  population: number | null;
  benefit: boolean;
  solo: boolean;
  neighbourVacant: boolean;
  why: RiskWhy[];
}

export interface RiskValidation {
  pairs: number;
  events: number;
  baseRate12?: number;
  topDecileRate12?: number;
  lift?: number | null;
  auc?: number | null;
}

export interface RiskKind {
  months: string[];
  trainPairs: number;
  testPairs: number;
  baseHazard12: number;
  validation: RiskValidation;
  lifts: Record<string, Record<string, number>>;
  cells: Record<string, Record<string, { events: number; months: number; rate12: number | null }>>;
  rows: RiskRow[];
}

export interface RiskRaw {
  schemaVersion: number;
  dataMonth: string;
  horizonMonths: number;
  validationFrom: string;
  bands: string[];
  kinds: Record<PraxisKind, RiskKind>;
}

export const BAND_COLORS: Record<string, string> = {
  kiemelt: '#e05b8a',
  magas: '#ff7a59',
  kozepes: '#c98500',
  alacsony: '#4fd6c2',
};

let cache: RiskRaw | null = null;
let pending: Promise<RiskRaw | null> | null = null;

export function loadRisk(): Promise<RiskRaw | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch(`${import.meta.env.BASE_URL}data/risk.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: RiskRaw | null) => { cache = d; return d; })
    .catch(() => null);
  return pending;
}

export function useRisk(): RiskRaw | null {
  const [data, setData] = useState<RiskRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadRisk().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

/** "10+ év ugyanaz az orvos · kedvezményezett település" */
export function whyText(why: RiskWhy[]): string {
  return why
    .filter((w) => Math.abs(Math.log(w.lift || 1)) > 0.05)
    .map((w) => `${t(`risk.factor.${w.factor}`)}: ${levelLabel(w.factor, w.level)} `
      + `(${formatNumber(Math.round(w.lift * 100) / 100)}×)`)
    .join(' · ');
}

export function levelLabel(factor: string, level: string): string {
  if (factor === 'type') return t(`praxisTypes.${level}`, undefined) || level;
  const key = `risk.level.${level}`;
  const text = t(key);
  return text === key ? level : text;
}

export const RISK_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'type', labelKey: 'stats.thType', type: 'enum', visible: false },
  { key: 'risk', labelKey: 'risk.colRisk', type: 'number', visible: true },
  { key: 'band', labelKey: 'risk.colBand', type: 'enum', visible: true },
  { key: 'tenureYears', labelKey: 'risk.colTenure', type: 'number', visible: true },
  { key: 'changes', labelKey: 'risk.colChanges', type: 'number', visible: false },
  { key: 'wasVacant', labelKey: 'risk.colWasVacant', type: 'bool', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: false },
  { key: 'benefit', labelKey: 'benefit.column', type: 'bool', visible: true },
  { key: 'solo', labelKey: 'risk.colSolo', type: 'bool', visible: false },
  { key: 'neighbourVacant', labelKey: 'risk.colNeighbour', type: 'bool', visible: false },
  { key: 'why', labelKey: 'risk.colWhy', type: 'text', visible: true },
];

export function riskRows(data: RiskRaw | null, kind: PraxisKind): Row[] {
  const rows = data?.kinds?.[kind]?.rows ?? [];
  return rows.map((r) => ({
    fin: r.fin,
    settlement: r.settlement,
    county: r.county,
    type: t(`praxisTypes.${r.type}`),
    risk: Math.round(r.risk * 1000) / 10,
    band: t(`risk.band.${r.band}`),
    tenureYears: r.tenureMonths === null ? null : Math.round((r.tenureMonths / 12) * 10) / 10,
    changes: r.changes,
    wasVacant: r.wasVacant,
    population: r.population,
    benefit: r.benefit,
    solo: r.solo,
    neighbourVacant: r.neighbourVacant,
    why: whyText(r.why),
    // the map colours by `type`, so the band travels in that slot
    lat: null,
    lon: null,
  }));
}

export function bandBreakdown(
  data: RiskRaw | null, kind: PraxisKind,
): { band: string; n: number; meanRisk: number }[] {
  const rows = data?.kinds?.[kind]?.rows ?? [];
  if (!rows.length) return [];
  const groups = new Map<string, RiskRow[]>();
  for (const r of rows) {
    groups.set(r.band, [...(groups.get(r.band) ?? []), r]);
  }
  return (data?.bands ?? []).filter((b) => groups.has(b)).map((band) => {
    const list = groups.get(band) ?? [];
    return {
      band,
      n: list.length,
      meanRisk: list.reduce((a, r) => a + r.risk, 0) / list.length,
    };
  });
}

/** counties ranked by how many districts sit in the two worst bands */
export function countyRisk(
  data: RiskRaw | null, kind: PraxisKind,
): { county: string; districts: number; atRisk: number; share: number; meanRisk: number }[] {
  const rows = data?.kinds?.[kind]?.rows ?? [];
  const groups = new Map<string, RiskRow[]>();
  for (const r of rows) groups.set(r.county, [...(groups.get(r.county) ?? []), r]);
  return [...groups.entries()]
    .map(([county, list]) => {
      const atRisk = list.filter((r) => r.band === 'kiemelt' || r.band === 'magas').length;
      return {
        county,
        districts: list.length,
        atRisk,
        share: atRisk / list.length,
        meanRisk: list.reduce((a, r) => a + r.risk, 0) / list.length,
      };
    })
    .sort((a, b) => b.share - a.share);
}
