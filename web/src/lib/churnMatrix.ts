// The county × year grid behind the turnover heatmap.
//
// Two things make a plain count per year dishonest here. The archive is not
// evenly spaced — one month between some snapshots, twenty-seven between
// others — and it is silent for whole years (there is no usable GP snapshot
// from 2025 at all). A grid of raw counts would therefore say more about when
// we happened to keep a file than about when doctors changed.
//
// So each interval between two snapshots is walked month by month. Every
// month it covers gets its share of that interval's changes and contributes
// its districts to the denominator; a year's cell is then changes per 100
// districts per year, over the months actually observed in it. A year nobody
// observed stays empty rather than becoming a zero.
//
// The one assumption, stated on the page as well: inside a long interval the
// changes are spread evenly over its months. The register does not say when
// within the gap a name changed, and pretending otherwise would be worse.
import type { FluctuationRaw } from './fluctuation';
import type { PraxisKind } from '../types';

export interface Cell {
  year: string;
  changes: number;
  /** months of this year the archive could see */
  months: number;
  /** changes per 100 districts per year, or null where nothing was observed */
  rate: number | null;
}

export interface MatrixRow {
  county: string;
  cells: Cell[];
  /** the county's rate over the whole window */
  overall: number | null;
}

export interface Matrix {
  years: string[];
  rows: MatrixRow[];
  /** the largest rate in the grid, for scaling the colour */
  max: number;
}

/** The months an interval covers: the one after `from`, up to and including `to`. */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m < endM)) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    out.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

export function churnMatrix(data: FluctuationRaw | null, kind: PraxisKind): Matrix {
  const intervals = data?.kinds[kind].intervals ?? [];
  const years = new Set<string>();
  // county -> year -> { changes, months, districtMonths }
  const acc = new Map<string, Map<string, {
    changes: number; months: number; districtMonths: number }>>();

  for (const interval of intervals) {
    const months = monthsBetween(interval.from, interval.to);
    if (!months.length) continue;
    for (const [county, row] of Object.entries(interval.counties)) {
      const perMonth = row.changes / months.length;
      const byYear = acc.get(county) ?? new Map();
      acc.set(county, byYear);
      for (const month of months) {
        const year = month.slice(0, 4);
        years.add(year);
        const cell = byYear.get(year) ?? { changes: 0, months: 0, districtMonths: 0 };
        cell.changes += perMonth;
        cell.months += 1;
        cell.districtMonths += row.districts;
        byYear.set(year, cell);
      }
    }
  }

  const yearList = [...years].sort();
  let max = 0;
  const rows: MatrixRow[] = [...acc.entries()]
    .map(([county, byYear]) => {
      let changes = 0;
      let districtMonths = 0;
      const cells = yearList.map((year) => {
        const cell = byYear.get(year);
        if (!cell || !cell.districtMonths) {
          return { year, changes: 0, months: 0, rate: null };
        }
        changes += cell.changes;
        districtMonths += cell.districtMonths;
        const rate = (cell.changes * 12 * 100) / cell.districtMonths;
        max = Math.max(max, rate);
        return { year, changes: cell.changes, months: cell.months, rate };
      });
      return {
        county,
        cells,
        overall: districtMonths ? (changes * 12 * 100) / districtMonths : null,
      };
    })
    .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));

  return { years: yearList, rows, max };
}
