import { describe, expect, it } from 'vitest';
import {
  badnessRank, incomeThird, metaOf, pValue, ruralMedian, strengthOf, valueOf,
  type OutcomeDistrict,
} from './outcomes';
import { inSentence, lowerFirst } from './format';

const row = (over: Partial<OutcomeDistrict>): OutcomeDistrict => ({
  name: 'X', slug: 'x', county: 'C', capital: false, population: 1000,
  gpRate: null, gpLongTerm: null, gpVacant: null, gpTotal: null, dentalRate: null,
  gpMinutes: null, noBusShare: null, development: null, avoidable: null, amenable: null,
  treatable: null, preventable: null, both: null, allCause: null, avoidableMen: null,
  avoidableWomen: null, shh: {}, income: null, incomeIndex: null, incomeIndex2012: null,
  taxpayers: null, naturalChange: null, migration: null, diabetes: null, hypertension: null,
  ischaemic: null, gpLoad: null, ageing: null, jobseekers: null, jobseekersLongShare: null,
  jobseekersTrend: null, capitalWide: false,
  degree: null, employed: null, noDigital: null, poorHousing: null, elderlyOnly: null,
  sboMinutes: null, sboBeyond30: null, gpRateIn12: null, gpVacantIn12: null,
  gpExpectedNew: null, grants: { gp: 0, dental: 0, practice: 0 }, ...over,
});

describe('outcome measures', () => {
  it('reads plain fields and the SHH table alike', () => {
    const r = row({ avoidable: 441, shh: { all: 112 } });
    expect(valueOf(r, 'avoidable')).toBe(441);
    expect(valueOf(r, 'shh.all')).toBe(112);
    expect(valueOf(r, 'income')).toBeNull();
    // SHH has its middle at 100, the national rate
    expect(metaOf('shh.all').mid).toBe(100);
  });

  it('takes the yardstick from the rural járás only', () => {
    const rows = [row({ avoidable: 300 }), row({ avoidable: 500 }), row({ avoidable: 700 }),
      row({ avoidable: 150, capital: true })];
    expect(ruralMedian(rows, 'avoidable')).toBe(500);
  });

  it('ranks badness in the direction the measure is bad in', () => {
    const rows = [row({ avoidable: 300, income: 3000 }), row({ avoidable: 500, income: 2000 }),
      row({ avoidable: 700, income: 1000 })];
    // the highest mortality and the lowest income are both the worst place
    expect(badnessRank(rows, 'avoidable', 700)).toBe(1);
    expect(badnessRank(rows, 'income', 1000)).toBe(1);
    expect(badnessRank(rows, 'income', 3000)).toBeCloseTo(1 / 3);
  });

  it('cuts income into thirds and leaves the capital out', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((i) => row({ name: `j${i}`, income: i * 1000 }));
    const third = incomeThird(rows);
    expect(third(rows[0])).toBe(0);
    expect(third(rows[5])).toBe(2);
    expect(third(row({ income: 9000, capital: true }))).toBeNull();
  });

  it('says a correlation in words with the thresholds the site already uses', () => {
    expect(strengthOf(0.1)).toBe('none');
    expect(strengthOf(-0.3)).toBe('weak');
    expect(strengthOf(0.44)).toBe('moderate');
    expect(strengthOf(-0.66)).toBe('strong');
  });

  it('writes a p-value so a sentence can follow it', () => {
    expect(pValue(1e-9)).toBe('< 0,001');
    expect(pValue(0.0234)).toMatch(/^= 0[,.]023$/);
  });
});

describe('measure names inside a sentence', () => {
  it('lower-cases the name and picks the article', () => {
    expect(inSentence('Elkerülhető halálozás')).toBe('az elkerülhető halálozás');
    expect(inSentence('Jövedelem egy lakosra')).toBe('a jövedelem egy lakosra');
    expect(inSentence('Összhalálozás')).toBe('az összhalálozás');
    expect(lowerFirst('Egy háziorvosra jutó betegforgalom')).toBe('egy háziorvosra jutó betegforgalom');
  });
});
