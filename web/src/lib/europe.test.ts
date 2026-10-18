import { describe, expect, it } from 'vitest';
import {
  changeRows, goodness, profile, groupFromUrl, latest, ranking, reference, sectionIndicators, standing,
  type EuIndicator, type EuropeRaw,
} from './europe';

const ind = (over: Partial<EuIndicator>): EuIndicator => ({
  section: 'workforce', branch: 'gp', better: 'higher', unit: 'per100k', source: 'eurostat',
  dataset: 'x', url: '', fetched: '', years: [], values: {}, eu: {}, sourceByGeo: {}, ...over,
});

describe('the European ranking', () => {
  it('takes each country at its own latest year', () => {
    expect(latest({ 2019: 1, 2024: 3, 2021: 2 })).toEqual({ year: '2024', value: 3 });
    expect(latest({})).toBeNull();
  });

  it('ranks best first in the direction the measure is good in', () => {
    const i = ind({ better: 'lower', values: { HU: { 2023: 472 }, AT: { 2023: 210 }, CZ: { 2023: 330 } } });
    const rows = ranking(i, ['HU', 'AT', 'CZ']);
    expect(rows.map((r) => r.geo)).toEqual(['AT', 'CZ', 'HU']);
    expect(standing(rows, 'HU')).toMatchObject({ rank: 3, of: 3 });
  });

  it('leaves a value far older than the rest out of the ranking, marked', () => {
    const i = ind({ values: { HU: { 2012: 470 }, AT: { 2023: 180 }, CZ: { 2023: 350 } } });
    const rows = ranking(i, ['HU', 'AT', 'CZ']);
    const hu = rows.find((r) => r.geo === 'HU')!;
    expect(hu.stale).toBe(true);
    expect(hu.rank).toBeNull();
    expect(rows[rows.length - 1].geo).toBe('HU');
    expect(standing(rows, 'HU')).toBeNull();
  });

  it('does not rank a measure that has no good direction', () => {
    const i = ind({ better: 'neutral', values: { HU: { 2024: 10 }, AT: { 2024: 13 } } });
    const rows = ranking(i, ['HU', 'AT']);
    expect(rows.map((r) => r.geo)).toEqual(['AT', 'HU']);
    expect(rows.every((r) => r.rank === null)).toBe(true);
  });

  it('marks the one country taken from the other publisher', () => {
    const i = ind({ values: { UK: { 2024: 80 }, HU: { 2024: 46 } }, sourceByGeo: { UK: 'oecd' } });
    expect(ranking(i, ['UK', 'HU']).map((r) => r.oecd)).toEqual([true, false]);
  });

  it('compares with the EU aggregate, or says it is a median of countries', () => {
    const withEu = ind({ eu: { 2023: 238 }, values: { HU: { 2023: 472 } } });
    expect(reference(withEu, ranking(withEu, ['HU']))).toEqual({ value: 238, year: '2023', kind: 'eu' });
    const noEu = ind({ values: { HU: { 2024: 1 }, AT: { 2024: 3 }, CZ: { 2024: 2 }, PL: { 2024: 10 } } });
    expect(reference(noEu, ranking(noEu, ['HU', 'AT', 'CZ', 'PL']))).toMatchObject({ value: 2.5, kind: 'median' });
  });

  it('turns a value into a colour position, the right way up', () => {
    expect(goodness('higher', 10, 0, 10)).toBe(1);
    expect(goodness('lower', 10, 0, 10)).toBe(0);
    expect(goodness('higher', 5, 5, 5)).toBe(0.5);
  });
});

describe('the page state', () => {
  it('reads the country group from the address, the region by default', () => {
    expect(groupFromUrl('?orszagok=v4')).toBe('v4');
    expect(groupFromUrl('?orszagok=all')).toBe('all');
    expect(groupFromUrl('?orszagok=xx')).toBe('cee');
    expect(groupFromUrl('')).toBe('cee');
  });

  it('shows a section the branch’s own indicators and the shared ones', () => {
    const raw = { indicators: {
      gpDensity: ind({ branch: 'gp' }), dentistDensity: ind({ branch: 'dental' }),
      physicians: ind({ branch: 'both' }), gpVisitRural: ind({ branch: 'gp', part: 'gpVisit' }),
      avoidable: ind({ section: 'outcomes', branch: 'both' }),
    } } as unknown as EuropeRaw;
    expect(sectionIndicators(raw, 'workforce', 'gp')).toEqual(['gpDensity', 'physicians']);
    expect(sectionIndicators(raw, 'workforce', 'dental')).toEqual(['dentistDensity', 'physicians']);
  });
});

describe('change and profile', () => {
  it('starts a change ten years back, or within two years of it', () => {
    const i = ind({ values: { HU: { 2013: 40, 2024: 46 }, AT: { 2014: 70, 2025: 75 }, PL: { 2021: 30, 2024: 32 } } });
    const rows = changeRows(i, ['HU', 'AT', 'PL']);
    // Poland has no year near 2014 and is left out
    expect(rows.map((r) => [r.geo, r.fromYear, r.toYear])).toEqual([['AT', '2014', '2025'], ['HU', '2013', '2024']]);
  });

  it('scores a country 1 where it is best and 0 where it is worst', () => {
    const raw = { indicators: {
      gpDensity: ind({ values: { HU: { 2024: 46 }, AT: { 2024: 75 }, CZ: { 2024: 74 } } }),
      avoidable: ind({ section: 'outcomes', branch: 'both', better: 'lower',
        values: { HU: { 2023: 210 }, AT: { 2023: 300 }, CZ: { 2023: 330 } } }),
      consultations: ind({ better: 'neutral', values: { HU: { 2024: 11 }, AT: { 2024: 13 }, CZ: { 2024: 9 } } }),
    } } as unknown as EuropeRaw;
    expect(profile(raw, 'gp', ['HU', 'AT', 'CZ'], 'HU').map((r) => [r.key, r.score]))
      .toEqual([['avoidable', 1], ['gpDensity', 0]]);
  });
});
