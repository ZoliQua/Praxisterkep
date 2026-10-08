// The county level (data/counties.json): the step the site jumped over.
//
// The file is the settlement profiles sliced by county and cut down to what a
// county page shows — 265 KB instead of the 3.9 MB the full profiles weigh,
// because a browser should not download 3177 towns to look at one county.
import { useEffect, useState } from 'react';

export type Branch = 'gp' | 'dental';
export type State = 'filled' | 'partial' | 'vacantOnly' | 'absent' | '';
export type Band = 'kiemelt' | 'magas' | 'kozepes' | 'alacsony' | '';

export interface CountyAggregateRow {
  name: string;
  slug: string;
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
  /** census age split; absent where the census suppressed the county */
  age?: { young: number; working: number; old: number; total: number };
  oncallPoints?: number;
  ambulanceStations?: number;
  gpDistricts?: DistrictCounts;
  dentalDistricts?: DistrictCounts;
  gpChurn?: ChurnCounts;
  dentalChurn?: ChurnCounts;
}

/** The districts NEAK publishes for the county — not the settlements. */
export interface DistrictCounts {
  total: number; vacant: number; dissolved: number; longTerm: number;
  rate: number | null;
}

export interface ChurnCounts {
  districts: number; recentChanges: number; recentRate: number | null;
  medianTenureMonths: number | null; unchangedWholeWindow: number;
}

/** One settlement, in the compact order the ETL writes (see FIELDS there). */
export interface SettlementRow {
  slug: string;
  name: string;
  population: number;
  band: Band;
  gp: State;
  dental: State;
  gpMin: number | null;
  dentalMin: number | null;
  oncallMin: number | null;
  inpatientMin: number | null;
  bus: boolean;
}

export interface CountiesRaw {
  schemaVersion: number;
  dataMonth: string;
  fields: string[];
  counties: CountyAggregateRow[];
  settlements: Record<string, unknown[][]>;
}

let cache: CountiesRaw | null = null;
let pending: Promise<CountiesRaw | null> | null = null;

export function useCounties(): CountiesRaw | null {
  const [data, setData] = useState<CountiesRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/counties.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CountiesRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

/** The compact rows of one county, named. */
export function settlementRows(
  data: CountiesRaw | null, county: string | null,
): SettlementRow[] {
  const rows = (county && data?.settlements[county]) || [];
  return rows.map((r) => ({
    slug: String(r[0]), name: String(r[1]), population: Number(r[2]),
    band: r[3] as Band, gp: r[4] as State, dental: r[5] as State,
    gpMin: r[6] as number | null, dentalMin: r[7] as number | null,
    oncallMin: r[8] as number | null, inpatientMin: r[9] as number | null,
    bus: Boolean(r[10]),
  }));
}

export function countyOf(
  data: CountiesRaw | null, county: string | null,
): CountyAggregateRow | null {
  return data?.counties.find((c) => c.name === county) ?? null;
}

/**
 * Where a county stands among the twenty on one measure, 1 = worst.
 *
 * A rank is a comparison, not a verdict: it says this county is worse off
 * than the ones behind it, never that care is missing there.
 */
export function rankOf(
  data: CountiesRaw | null,
  county: string | null,
  value: (c: CountyAggregateRow) => number | null,
): { rank: number; of: number } | null {
  const rows = (data?.counties ?? [])
    .map((c) => ({ name: c.name, v: value(c) }))
    .filter((r): r is { name: string; v: number } => r.v !== null);
  if (!rows.length || !county) return null;
  rows.sort((a, b) => b.v - a.v);
  const i = rows.findIndex((r) => r.name === county);
  return i < 0 ? null : { rank: i + 1, of: rows.length };
}

/** Share of settlements where the branch has no contracted physician at all. */
export function vacantShare(c: CountyAggregateRow | null, branch: Branch): number | null {
  if (!c) return null;
  const vacantOnly = branch === 'gp' ? c.gpVacantOnly : c.dentalVacantOnly;
  const absent = branch === 'gp' ? c.gpAbsent : c.dentalAbsent;
  // settlements that are not district seats are not part of this question
  const known = c.settlements - absent;
  return known > 0 ? vacantOnly / known : null;
}
