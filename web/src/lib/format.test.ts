import { describe, expect, it } from 'vitest';
import { formatDuration, formatMonth, formatPercent, monthsBetween, huArticle } from './format';

describe('formatMonth', () => {
  it('renders Hungarian month names', () => {
    expect(formatMonth('2026-08')).toBe('2026. augusztus');
    expect(formatMonth('2011-03')).toBe('2011. március');
  });
});

describe('monthsBetween', () => {
  it('counts whole months', () => {
    expect(monthsBetween('2026-07', '2026-08')).toBe(1);
    expect(monthsBetween('2024-06', '2026-08')).toBe(26);
    expect(monthsBetween('2026-08', '2026-08')).toBe(0);
  });
});

describe('formatDuration', () => {
  it('renders years and months', () => {
    expect(formatDuration(8)).toBe('8 hónap');
    expect(formatDuration(12)).toBe('1 év');
    expect(formatDuration(27)).toBe('2 év 3 hónap');
  });
});

describe('formatPercent', () => {
  it('uses Hungarian decimal comma', () => {
    expect(formatPercent(0.1056)).toBe('10,6%');
  });
});

describe('the definite article in front of a number', () => {
  it('follows the first sound of the number as it is said', () => {
    const say = (n: number) => `${huArticle(n)} ${n}.`;
    expect(say(1)).toBe('az 1.');
    expect(say(5)).toBe('az 5.');
    expect(say(2)).toBe('a 2.');
    expect(say(10)).toBe('a 10.');   // tíz
    expect(say(15)).toBe('a 15.');   // tizenöt
    expect(say(27)).toBe('a 27.');   // huszonhét
    expect(say(50)).toBe('az 50.');  // ötven
    expect(say(55)).toBe('az 55.');  // ötvenöt
    expect(say(100)).toBe('a 100.'); // száz
    expect(say(197)).toBe('a 197.');
    expect(say(500)).toBe('az 500.'); // ötszáz
    expect(say(1000)).toBe('az 1000.'); // ezer
    expect(say(1999)).toBe('az 1999.');
    expect(say(2000)).toBe('a 2000.');
    expect(say(5000)).toBe('az 5000.'); // ötezer
  });
});
