import { describe, expect, it } from 'vitest';
import {
  filterPraxes,
  longestVacant,
  medianVacancyMonths,
  primarySite,
  searchSettlements,
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
