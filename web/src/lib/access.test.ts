import { describe, expect, it } from 'vitest';
import {
  ACCESS_COLUMNS, accessRows, bandBreakdown, populationBeyond, type AccessRaw,
} from './access';

const data = {
  schemaVersion: 1, asOf: '2026-09-20', dataMonth: '2026-09',
  bands: [
    { key: '0-5', maxKm: 5 }, { key: '5-10', maxKm: 10 },
    { key: '10-20', maxKm: 20 }, { key: '20+', maxKm: null },
  ],
  stats: {
    dental: {
      subjects: 3, measured: 3, missingGeo: 0, operating: 2229,
      operatingWithoutGeo: 245,
      counts: { '0-5': 1, '5-10': 1, '10-20': 1, '20+': 0 },
      population: { '0-5': 1000, '5-10': 2000, '10-20': 3000, '20+': 0 },
      medianKm: 7.2, maxKm: 14.5, sameSettlement: 1,
    },
    gp: {
      subjects: 1, measured: 1, missingGeo: 0, operating: 5198,
      operatingWithoutGeo: 65,
      counts: { '0-5': 1, '5-10': 0, '10-20': 0, '20+': 0 },
      population: { '0-5': 500, '5-10': 0, '10-20': 0, '20+': 0 },
      medianKm: 0.3, maxKm: 0.3, sameSettlement: 1,
    },
  },
  districts: [
    {
      id: 'D1', kind: 'dental', status: 'vacant', settlement: 'Aba', county: 'Fejér',
      type: 'mixed', population: 1000, km: 2.1, band: '0-5', nearestId: 'F1',
      nearestSettlement: 'Aba', sameSettlement: true, geoApprox: false,
      lat: 47.03, lon: 18.52,
    },
    {
      id: 'D2', kind: 'dental', status: 'dissolved', settlement: 'Bak', county: 'Zala',
      type: 'adult', population: 2000, km: 7.2, band: '5-10', nearestId: 'F2',
      nearestSettlement: 'Zalaegerszeg', sameSettlement: false, geoApprox: true,
      lat: 46.72, lon: 16.84,
    },
    {
      id: 'D3', kind: 'dental', status: 'vacant', settlement: 'Cak', county: 'Vas',
      type: 'mixed', population: 3000, km: 14.5, band: '10-20', nearestId: 'F3',
      nearestSettlement: 'Kőszeg', sameSettlement: false, geoApprox: false,
      lat: 47.34, lon: 16.55,
    },
    {
      id: 'G1', kind: 'gp', status: 'vacant', settlement: 'Dad', county: 'Komárom-Esztergom',
      type: 'adult', population: 500, km: 0.3, band: '0-5', nearestId: 'F4',
      nearestSettlement: 'Dad', sameSettlement: true, geoApprox: false,
      lat: 47.55, lon: 18.2,
    },
  ],
} as unknown as AccessRaw;

describe('accessRows', () => {
  it('keeps one row per district of the branch, with the band as map category', () => {
    const rows = accessRows(data, 'dental');
    expect(rows).toHaveLength(3);
    expect(rows[0].km).toBe(2.1);
    expect(rows[0].type).toBe(rows[0].bandLabel); // the map colours by `type`
    expect(rows[1].status).toBe('Megszűnt');
  });

  it('separates the branches', () => {
    expect(accessRows(data, 'gp').map((r) => r.fin)).toEqual(['G1']);
  });
});

describe('bandBreakdown', () => {
  it('returns every published band in order, with counts and population', () => {
    expect(bandBreakdown(data, 'dental')).toEqual([
      { band: '0-5', count: 1, population: 1000 },
      { band: '5-10', count: 1, population: 2000 },
      { band: '10-20', count: 1, population: 3000 },
      { band: '20+', count: 0, population: 0 },
    ]);
  });
});

describe('populationBeyond', () => {
  it('adds up the residents of districts at or beyond a distance', () => {
    expect(populationBeyond(data, 'dental', 10)).toBe(3000);
    expect(populationBeyond(data, 'dental', 5)).toBe(5000);
    expect(populationBeyond(data, 'gp', 10)).toBe(0);
  });
});

describe('columns', () => {
  it('offers the distance and the nearest surgery by default', () => {
    const visible = ACCESS_COLUMNS.filter((c) => c.visible).map((c) => c.key);
    expect(visible).toContain('km');
    expect(visible).toContain('nearestSettlement');
  });
});
