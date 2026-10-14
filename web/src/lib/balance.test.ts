import { describe, expect, it } from 'vitest';
import { stockOf, typeRows } from './balance';
import type { Snapshot } from '../types';

const snap = (national: unknown) => ({ national } as unknown as Snapshot);

describe('district stock', () => {
  it('counts what is left as filled', () => {
    expect(stockOf(snap({ totalDistricts: 2776, vacant: 262, dissolved: 42 })))
      .toEqual({ total: 2776, vacant: 262, dissolved: 42, filled: 2472 });
  });

  it('treats a branch without a dissolved list as having none', () => {
    // NEAK publishes no dissolved list for GP care
    expect(stockOf(snap({ totalDistricts: 6283, vacant: 1026, dissolved: 0 })))
      .toEqual({ total: 6283, vacant: 1026, dissolved: 0, filled: 5257 });
  });

  it('never reports a negative number of filled districts', () => {
    expect(stockOf(snap({ totalDistricts: 10, vacant: 12, dissolved: 3 })?.national
      ? snap({ totalDistricts: 10, vacant: 12, dissolved: 3 }) : null)?.filled).toBe(0);
  });

  it('says nothing when there is no snapshot or no districts', () => {
    expect(stockOf(null)).toBeNull();
    expect(stockOf(snap({ totalDistricts: 0, vacant: 0, dissolved: 0 }))).toBeNull();
  });

  it('splits the stock by type, worst rate included', () => {
    const rows = typeRows(snap({
      totalDistricts: 6283,
      byType: {
        adult: { total: 3351, vacant: 341 },
        child: { total: 1457, vacant: 266 },
        mixed: { total: 1475, vacant: 419 },
      },
    }));
    expect(rows.map((r) => r.key)).toEqual(['adult', 'child', 'mixed']);
    expect(rows[0]).toMatchObject({ total: 3351, vacant: 341, filled: 3010 });
    expect(rows[2].rate).toBeCloseTo(419 / 1475, 5);
  });

  it('keeps the order fixed and skips the types a branch does not have', () => {
    const rows = typeRows(snap({
      byType: { school: { total: 258, vacant: 0 }, adult: { total: 451, vacant: 22 } },
    }));
    expect(rows.map((r) => r.key)).toEqual(['adult', 'school']);
  });

  it('has no types to show when the snapshot carries none', () => {
    expect(typeRows(snap({ totalDistricts: 10 }))).toEqual([]);
    expect(typeRows(null)).toEqual([]);
  });
});

describe('the two readings of a type row', () => {
  const snap2 = {
    national: {
      totalDistricts: 2776,
      byType: {
        adult: { total: 451, vacant: 22 },
        mixed: { total: 1835, vacant: 215 },
      },
    },
    praxes: Array.from({ length: 42 }, (_, i) => ({
      id: String(i), type: 'mixed', status: 'dissolved',
    })),
  } as unknown as Snapshot;

  it('leaves the dissolved out of both sides when asked to', () => {
    const rows = typeRows(snap2, 'without');
    expect(rows[1]).toMatchObject({ total: 1835, vacant: 215, dissolved: 42 });
    expect(rows[1].rate).toBeCloseTo(215 / 1835, 5);
  });

  it('puts them back into their own type when asked to', () => {
    const rows = typeRows(snap2, 'with');
    // a dissolved district is gone from the registry, so it is missing from
    // the denominator as well as the numerator
    expect(rows[1]).toMatchObject({ total: 1877, vacant: 257, dissolved: 42 });
    expect(rows[1].rate).toBeCloseTo(257 / 1877, 5);
  });

  it('leaves a type with no dissolved district alone', () => {
    expect(typeRows(snap2, 'with')[0]).toMatchObject({ total: 451, vacant: 22 });
  });
});
