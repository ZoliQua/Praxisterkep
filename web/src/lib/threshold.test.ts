import { describe, expect, it } from 'vitest';
import { beyond, curve, THRESHOLDS } from './threshold';
import type { TravelRaw } from './mobility';

const row = (settlement: string, county: string, population: number,
  gpMin: number | null) => ({
  kshId: settlement, settlement, county, district: '', population, snapKm: 0.2,
  gpMin, dentalMin: null,
});

const data = {
  settlements: [
    row('A', 'Vas', 1000, 4),
    row('B', 'Vas', 2000, 21),
    row('C', 'Zala', 500, 35),
    row('D', 'Zala', 300, null), // the road graph could not reach it
  ],
} as unknown as TravelRaw;

describe('travel-time threshold', () => {
  it('counts who lives beyond the dial', () => {
    const r = beyond(data, 'gp', 20)!;
    expect(r).toMatchObject({
      minutes: 20, settlements: 2, population: 2500,
      ofSettlements: 3, ofPopulation: 3500, unreachable: 1,
    });
  });

  it('treats the threshold itself as inside', () => {
    expect(beyond(data, 'gp', 21)!.settlements).toBe(1);
    expect(beyond(data, 'gp', 35)!.settlements).toBe(0);
  });

  it('leaves the unreachable out of the denominator rather than counting them as near', () => {
    const r = beyond(data, 'gp', 60)!;
    expect(r.ofSettlements).toBe(3);
    expect(r.unreachable).toBe(1);
    expect(r.population).toBe(0);
  });

  it('names the worst, furthest first', () => {
    expect(beyond(data, 'gp', 10)!.worst.map((w) => w.settlement)).toEqual(['C', 'B']);
  });

  it('says nothing without data', () => {
    expect(beyond(null, 'gp', 20)).toBeNull();
    expect(beyond({ settlements: [] } as unknown as TravelRaw, 'gp', 20)).toBeNull();
  });

  it('falls as the minutes rise', () => {
    const c = curve(data, 'gp');
    expect(c.map((p) => p.minutes)).toEqual([...THRESHOLDS]);
    for (let i = 1; i < c.length; i += 1) {
      expect(c[i].population).toBeLessThanOrEqual(c[i - 1].population);
    }
  });
});
