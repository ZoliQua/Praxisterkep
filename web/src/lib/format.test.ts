import { describe, expect, it } from 'vitest';
import { formatDuration, formatMonth, formatPercent, monthsBetween } from './format';

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
