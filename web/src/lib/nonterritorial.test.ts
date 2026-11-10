import { describe, expect, it } from 'vitest';
import { tekRows, yearEnds, type TekMonth } from './nonterritorial';

const m = (month: string, tn: [number, number, number], t: [number, number, number]): TekMonth => ({
  month,
  territorial: { total: t[0] + t[1] + t[2], byType: { adult: t[0], mixed: t[1], child: t[2] } },
  nonTerritorial: { total: tn[0] + tn[1] + tn[2], byType: { adult: tn[0], mixed: tn[1], child: tn[2] }, unnamed: 0 },
});

describe('nonterritorial', () => {
  it('puts districts and TN practices side by side and sums them', () => {
    const rows = tekRows(m('2026-11', [74, 2, 0], [3350, 1475, 1456]));
    expect(rows.map((r) => r.key)).toEqual(['adult', 'mixed', 'child', 'total']);
    expect(rows[0]).toEqual({ key: 'adult', territorial: 3350, nonTerritorial: 74, all: 3424 });
    expect(rows[3]).toEqual({ key: 'total', territorial: 6281, nonTerritorial: 76, all: 6357 });
  });

  it('keeps the last archived month of each year', () => {
    const ends = yearEnds([m('2019-03', [1, 0, 0], [1, 0, 0]), m('2019-12', [2, 0, 0], [1, 0, 0]),
      m('2020-10', [3, 0, 0], [1, 0, 0])]);
    expect(ends.map((e) => e.month)).toEqual(['2019-12', '2020-10']);
  });
});

describe('institutionSplit', () => {
  it('puts state bodies and universities against businesses', async () => {
    const { institutionSplit } = await import('./nonterritorial');
    expect(institutionSplit({ state: 13, university: 4, company: 47, sole: 12, other: 0, unknown: 0 }))
      .toEqual({ institutions: 17, business: 59, unknown: 0 });
  });
});
