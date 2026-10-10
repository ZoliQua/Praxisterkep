import { describe, expect, it } from 'vitest';
import { churnMatrix } from './churnMatrix';
import type { FluctuationRaw } from './fluctuation';

const data = (intervals: unknown[]) => ({
  kinds: { gp: { intervals }, dental: { intervals: [] } },
} as unknown as FluctuationRaw);

describe('turnover matrix', () => {
  it('annualises a short interval instead of reading it as a year', () => {
    // 1 change in 100 districts over one month is 12 a year, not 1
    const m = churnMatrix(data([{
      from: '2026-01', to: '2026-02', months: 1,
      counties: { Vas: { changes: 1, districts: 100 } },
    }]), 'gp');
    expect(m.rows[0].cells[0].rate).toBeCloseTo(12, 5);
  });

  it('spreads a long interval over the years it actually covers', () => {
    const m = churnMatrix(data([{
      from: '2024-12', to: '2026-12', months: 24,
      counties: { Vas: { changes: 24, districts: 100 } },
    }]), 'gp');
    expect(m.years).toEqual(['2025', '2026']);
    // twelve of the twenty-four months fall in each year
    expect(m.rows[0].cells.map((c) => c.months)).toEqual([12, 12]);
    expect(m.rows[0].cells.map((c) => Math.round(c.changes))).toEqual([12, 12]);
    expect(m.rows[0].cells[0].rate).toBeCloseTo(12, 5);
  });

  it('leaves a year nobody observed empty rather than zero', () => {
    const m = churnMatrix(data([
      { from: '2024-01', to: '2024-06', months: 5,
        counties: { Vas: { changes: 5, districts: 100 } } },
      { from: '2026-01', to: '2026-06', months: 5,
        counties: { Vas: { changes: 0, districts: 100 } } },
    ]), 'gp');
    expect(m.years).toEqual(['2024', '2026']);
    const cells = m.rows[0].cells;
    expect(cells[0].rate).not.toBeNull();
    expect(cells[1].rate).toBe(0);           // observed, and nothing happened
    expect(m.years.includes('2025')).toBe(false); // never observed at all
  });

  it('orders counties by the whole window, worst first', () => {
    const m = churnMatrix(data([{
      from: '2026-01', to: '2026-02', months: 1,
      counties: {
        Vas: { changes: 1, districts: 100 },
        Zala: { changes: 5, districts: 100 },
      },
    }]), 'gp');
    expect(m.rows.map((r) => r.county)).toEqual(['Zala', 'Vas']);
    expect(m.max).toBeCloseTo(60, 5);
  });

  it('has nothing to show without data', () => {
    expect(churnMatrix(null, 'gp')).toEqual({ years: [], rows: [], max: 0 });
  });
});
