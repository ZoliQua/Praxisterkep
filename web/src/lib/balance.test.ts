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
