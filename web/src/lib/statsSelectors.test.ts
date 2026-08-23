import { describe, expect, it } from 'vitest';
import {
  countyNames,
  countySeries,
  flowPoints,
  overallChange,
  rateSeries,
  typeSeries,
  vacantSeries,
  type HistoryEntry,
} from './statsSelectors';

function entry(over: Partial<HistoryEntry>): HistoryEntry {
  return {
    month: '2020-01',
    totalDistricts: 100,
    vacant: 10,
    dissolved: 0,
    vacancyRate: 0.1,
    populationVacant: 5000,
    populationDissolved: 0,
    medianVacancyMonths: 12,
    durationBuckets: { '0-11': 5, '12-35': 3, '36-119': 2, '120+': 0 },
    byType: { mixed: { total: 80, vacant: 8 }, adult: { total: 20, vacant: 2 } },
    byCounty: { Zala: { vacant: 4, dissolved: 0, populationVacant: 2000, total: 40 } },
    flow: null,
    ...over,
  };
}

const entries = [
  entry({ month: '2019-03', vacant: 8, vacancyRate: 0.08 }),
  entry({ month: '2020-01', vacant: 10, vacancyRate: null, totalDistricts: null }),
  entry({
    month: '2021-06', vacant: 14, vacancyRate: 0.14,
    flow: { sincePrevMonth: '2020-01', entered: 6, left: 2 },
    byCounty: { Zala: { vacant: 7, dissolved: 0, populationVacant: 3000, total: 40 } },
  }),
];

describe('vacantSeries / rateSeries', () => {
  it('keeps every month for counts', () => {
    expect(vacantSeries(entries).map((p) => p.value)).toEqual([8, 10, 14]);
  });
  it('drops months without a denominator — gaps stay gaps', () => {
    expect(rateSeries(entries).map((p) => p.month)).toEqual(['2019-03', '2021-06']);
  });
});

describe('typeSeries', () => {
  it('splits by type and drops all-zero types', () => {
    const ts = typeSeries([
      entry({ byType: { mixed: { total: 80, vacant: 8 }, school: { total: 10, vacant: 0 } } }),
    ]);
    expect([...ts.keys()]).toEqual(['mixed']);
    expect(ts.get('mixed')![0].value).toBe(8);
  });
});

describe('county helpers', () => {
  it('collects sorted county names', () => {
    expect(countyNames(entries)).toEqual(['Zala']);
  });
  it('builds a county series with 0 fallback', () => {
    expect(countySeries(entries, 'Zala').map((p) => p.value)).toEqual([4, 4, 7]);
    expect(countySeries(entries, 'Vas').map((p) => p.value)).toEqual([0, 0, 0]);
  });
});

describe('flowPoints', () => {
  it('keeps only months with flow and names the comparison month', () => {
    const f = flowPoints(entries);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ month: '2021-06', sincePrevMonth: '2020-01', entered: 6 });
  });
});

describe('overallChange', () => {
  it('compares first and last archived month', () => {
    const c = overallChange(entries)!;
    expect(c.delta).toBe(6);
    expect(c.ratio).toBeCloseTo(0.75);
  });
  it('returns null for a single month', () => {
    expect(overallChange([entry({})])).toBeNull();
  });
});
