import { describe, expect, it } from 'vitest';
import {
  countyRanking,
  filterPraxes,
  filterPraxisRows,
  longestVacant,
  medianVacancyMonths,
  praxisTableRows,
  primarySite,
  searchSettlements,
  sortPraxisRows,
} from './selectors';
import type { Praxis, SettlementEntry } from '../types';

function praxis(over: Partial<Praxis>): Praxis {
  return {
    id: '000000000',
    kind: 'dental',
    type: 'mixed',
    status: 'vacant',
    county: 'Zala',
    countyCode: '20',
    sites: [
      {
        postalCode: '8900',
        settlement: 'Zalaegerszeg',
        address: 'Fő út 1.',
        district: 'Zalaegerszegi',
        isHeadquarters: false,
      },
    ],
    vacantSince: '2024-01',
    population: 1000,
    ...over,
  };
}

describe('filterPraxes', () => {
  const list = [praxis({ type: 'adult' }), praxis({ type: 'mixed' })];
  it('passes everything through for "all"', () => {
    expect(filterPraxes(list, 'all')).toHaveLength(2);
  });
  it('filters by type', () => {
    expect(filterPraxes(list, 'adult')).toHaveLength(1);
  });
});

describe('medianVacancyMonths', () => {
  it('odd count: middle element', () => {
    const list = ['2026-07', '2026-05', '2020-08'].map((m) => praxis({ vacantSince: m }));
    expect(medianVacancyMonths(list, '2026-08')).toBe(3);
  });
  it('even count: rounded mean of middle two', () => {
    const list = ['2026-06', '2026-04', '2026-02', '2020-08'].map((m) =>
      praxis({ vacantSince: m }),
    );
    expect(medianVacancyMonths(list, '2026-08')).toBe(5);
  });
  it('empty list: 0', () => {
    expect(medianVacancyMonths([], '2026-08')).toBe(0);
  });
});

describe('longestVacant', () => {
  it('returns the oldest vacancy', () => {
    const oldest = praxis({ id: '1', vacantSince: '2011-03' });
    expect(longestVacant([praxis({ id: '2' }), oldest])?.id).toBe('1');
  });
});

describe('primarySite', () => {
  it('skips headquarters when a surgery site exists', () => {
    const p = praxis({
      sites: [
        { postalCode: '1', settlement: 'HQ', address: 'x', district: '', isHeadquarters: true },
        { postalCode: '2', settlement: 'Rendelő', address: 'y', district: '', isHeadquarters: false },
      ],
    });
    expect(primarySite(p)?.settlement).toBe('Rendelő');
  });
  it('falls back to the headquarters when it is the only site', () => {
    const p = praxis({
      sites: [
        { postalCode: '1', settlement: 'HQ', address: 'x', district: '', isHeadquarters: true },
      ],
    });
    expect(primarySite(p)?.settlement).toBe('HQ');
  });
});

describe('searchSettlements', () => {
  const entries: SettlementEntry[] = [
    { name: 'Szombathely', county: 'Vas', filled: 10, vacantPraxisIds: [], dissolvedPraxisIds: [], affectedByDissolved: false },
    { name: 'Szolnok', county: 'Jász-Nagykun-Szolnok', filled: 8, vacantPraxisIds: [], dissolvedPraxisIds: [], affectedByDissolved: false },
    { name: 'Ószombat', county: 'Vas', filled: 0, vacantPraxisIds: ['x'], dissolvedPraxisIds: [], affectedByDissolved: false },
  ];
  it('needs at least 2 characters', () => {
    expect(searchSettlements(entries, 'S')).toHaveLength(0);
  });
  it('is accent- and case-insensitive, prefix matches first', () => {
    const hits = searchSettlements(entries, 'szo');
    expect(hits.map((h) => h.name)).toEqual(['Szombathely', 'Szolnok', 'Ószombat']);
  });
});

describe('countyRanking duration filter', () => {
  const snapshot = {
    month: '2026-08',
    national: { totalDistricts: 10 },
    counties: [
      { name: 'Zala', total: 6, vacant: 2, dissolved: 0 },
      { name: 'Vas', total: 4, vacant: 1, dissolved: 0 },
    ],
    praxes: [
      praxis({ id: '1', county: 'Zala', vacantSince: '2025-09' }), // 11 months
      praxis({ id: '2', county: 'Zala', vacantSince: '2020-08' }), // 6 years
      praxis({ id: '3', county: 'Vas', vacantSince: '2014-08' }),  // 12 years
    ],
  } as never;
  it('minMonths=0 counts every vacant praxis', () => {
    const rows = countyRanking(snapshot);
    expect(rows.map((r) => [r.name, r.vacantAll])).toEqual([
      ['Zala', 2], ['Vas', 1],
    ]);
  });
  it('filters by vacancy duration', () => {
    const rows = countyRanking(snapshot, 5 * 12);
    expect(rows.map((r) => [r.name, r.vacantAll])).toEqual([
      ['Vas', 1], ['Zala', 1],
    ]);
    expect(rows[0].rate).toBeCloseTo(0.25);
  });
});

describe('sortPraxisRows', () => {
  const snapshot = {
    month: '2026-08',
    praxes: [
      praxis({ id: '1', vacantSince: '2020-01', population: 500,
        sites: [{ postalCode: '1', settlement: 'Bér', address: 'x', district: '', isHeadquarters: false }] }),
      praxis({ id: '2', vacantSince: '2024-01', population: 2000,
        sites: [{ postalCode: '2', settlement: 'Ács', address: 'y', district: '', isHeadquarters: false }] }),
    ],
  } as never;
  it('sorts strings with Hungarian collation and numbers numerically', () => {
    const rows = praxisTableRows(snapshot);
    expect(sortPraxisRows(rows, 'settlement', 'asc')[0].settlement).toBe('Ács');
    expect(sortPraxisRows(rows, 'population', 'desc')[0].population).toBe(2000);
    expect(sortPraxisRows(rows, 'vacantSince', 'asc')[0].vacantSince).toBe('2020-01');
  });
});

describe('filterPraxisRows', () => {
  const snapshot = {
    month: '2026-08',
    praxes: [
      praxis({ id: '1', county: 'Zala', type: 'mixed',
        sites: [{ postalCode: '1', settlement: 'Söjtör', address: 'x', district: 'Zalaegerszegi', isHeadquarters: false }] }),
      praxis({ id: '2', county: 'Vas', type: 'child',
        sites: [{ postalCode: '2', settlement: 'Vasvár', address: 'y', district: 'Vasvári', isHeadquarters: false }] }),
    ],
  } as never;
  const rows = praxisTableRows(snapshot);
  it('filters by county and type', () => {
    expect(filterPraxisRows(rows, { county: 'Zala' })).toHaveLength(1);
    expect(filterPraxisRows(rows, { type: 'child' })[0].id).toBe('2');
    expect(filterPraxisRows(rows, { county: 'Zala', type: 'child' })).toHaveLength(0);
  });
  it('matches settlement or district, accent-insensitive', () => {
    expect(filterPraxisRows(rows, { query: 'sojtor' })).toHaveLength(1);
    expect(filterPraxisRows(rows, { query: 'zalaeger' })[0].id).toBe('1');
    expect(filterPraxisRows(rows, { query: '' })).toHaveLength(2);
  });
});
