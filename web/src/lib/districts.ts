// The járás level (data/districts.json): the step between a county and a town.
//
// A county is twenty rows, a settlement is one of 3177, and the thing people
// actually live in is in between. 197 rows — 174 járás and the capital's 23
// kerület — cut down to what a járás page shows, the same way counties.ts is.
import { useEffect, useState } from 'react';
import type { Band, EmergencyPoint, SettlementRow, State } from './counties';

export type { Band, EmergencyPoint, SettlementRow, State };

/** The districts NEAK publishes for the járás — not its settlements. */
export interface DistrictCounts {
  total: number; vacant: number; dissolved: number; longTerm: number;
  rate: number | null;
}

export interface DistrictRow {
  name: string;
  slug: string;
  county: string;
  /** the seat, from the gazetteer's own column */
  seat: string;
  seatSlug: string;
  isCapital: boolean;
  settlements: number;
  population: number;
  gpFilled: number; gpPartial: number; gpVacantOnly: number; gpAbsent: number;
  dentalFilled: number; dentalPartial: number;
  dentalVacantOnly: number; dentalAbsent: number;
  bands: Record<string, number>;
  medianGpMinutes: number | null;
  medianDentalMinutes: number | null;
  medianOncallMinutes: number | null;
  medianInpatientMinutes: number | null;
  withoutDirectBus: number;
  age?: { young: number; working: number; old: number; total: number };
  oncallPoints: number;
  ambulanceStations: number;
  emergency: EmergencyPoint[];
  pharmacies: number;
  /** median composite care-risk index of its settlements */
  medianIndex: number | null;
  gpDistricts?: DistrictCounts;
  dentalDistricts?: DistrictCounts;
}

export interface DistrictsRaw {
  schemaVersion: number;
  dataMonth: string;
  fields: string[];
  districts: DistrictRow[];
  /** services the registry puts in "Budapest" with no kerület */
  unplaced: Record<string, number>;
  settlements: Record<string, unknown[][]>;
}

let cache: DistrictsRaw | null = null;
let pending: Promise<DistrictsRaw | null> | null = null;

export function useDistricts(): DistrictsRaw | null {
  const [data, setData] = useState<DistrictsRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/districts.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DistrictsRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export function districtOf(
  data: DistrictsRaw | null, name: string | null,
): DistrictRow | null {
  return data?.districts.find((d) => d.name === name) ?? null;
}

/** The compact rows of one járás, named. */
export function settlementRows(
  data: DistrictsRaw | null, name: string | null,
): SettlementRow[] {
  const rows = (name && data?.settlements[name]) || [];
  return rows.map((r) => ({
    slug: String(r[0]), name: String(r[1]), population: Number(r[2]),
    band: r[3] as Band, gp: r[4] as State, dental: r[5] as State,
    gpMin: r[6] as number | null, dentalMin: r[7] as number | null,
    oncallMin: r[8] as number | null, inpatientMin: r[9] as number | null,
    bus: Boolean(r[10]),
  }));
}

/** The vacancy rate of a járás on one branch, or null without districts there. */
export function vacancyRate(d: DistrictRow | null, branch: 'gp' | 'dental'):
number | null {
  const cell = branch === 'gp' ? d?.gpDistricts : d?.dentalDistricts;
  return cell?.rate ?? null;
}

/**
 * Where a járás stands among those that can be measured, 1 = worst.
 *
 * `within` narrows the field to one county, which is the comparison a reader
 * makes first: not "of 197" but "of the nine in Zala".
 */
export function rankOf(
  data: DistrictsRaw | null,
  name: string | null,
  value: (d: DistrictRow) => number | null,
  within?: string | null,
): { rank: number; of: number; median: number } | null {
  const rows = (data?.districts ?? [])
    .filter((d) => !within || d.county === within)
    .map((d) => ({ name: d.name, v: value(d) }))
    .filter((r): r is { name: string; v: number } => r.v !== null);
  if (!rows.length || !name) return null;
  rows.sort((a, b) => b.v - a.v);
  const i = rows.findIndex((r) => r.name === name);
  if (i < 0) return null;
  const mid = Math.floor(rows.length / 2);
  const median = rows.length % 2
    ? rows[mid].v : (rows[mid - 1].v + rows[mid].v) / 2;
  return { rank: i + 1, of: rows.length, median };
}

/** Share of settlements where the branch has no contracted physician at all. */
export function vacantShare(d: DistrictRow | null, branch: 'gp' | 'dental'):
number | null {
  if (!d) return null;
  const vacantOnly = branch === 'gp' ? d.gpVacantOnly : d.dentalVacantOnly;
  const absent = branch === 'gp' ? d.gpAbsent : d.dentalAbsent;
  const known = d.settlements - absent;
  return known > 0 ? vacantOnly / known : null;
}

/** Contracted districts per 10 000 inhabitants — how thin the cover is. */
export function per10k(d: DistrictRow | null, branch: 'gp' | 'dental'):
number | null {
  const cell = branch === 'gp' ? d?.gpDistricts : d?.dentalDistricts;
  if (!cell || !d?.population) return null;
  return (cell.total - cell.vacant - cell.dissolved) / (d.population / 10_000);
}
