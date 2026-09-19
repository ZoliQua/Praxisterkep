import { describe, expect, it } from 'vitest';
import { eesztPraxis, eesztSettlement, takesOnCall, type EesztRaw } from './eeszt';

const data: EesztRaw = {
  schemaVersion: 1,
  asOf: '2026-09-19',
  dataMonth: '2026-09',
  stats: {},
  professions: { '6301': 'háziorvosi ellátás', '1300': 'fogászati ellátás' },
  onCall: ['nem vesz részt ügyeletben', 'központi ügyeletben'],
  praxes: {
    '000000001': { k: 'g', d: '2. körzet', l: ['7900', 'Szigetvár', 'Fő utca 1.', '6301', 1, 1 | 4, 1] },
    '000000002': { k: 'd', p: 'Minta Bt.', i: '1234', l: ['7000', 'Pécs', 'Tüzér utca 1', '1300', 0, 2 | 8, 2] },
  },
  settlements: {
    Szigetvár: [['g', '7900', 'Fő utca 1.', '6301', 1, 1], ['d', '7900', 'Kert u. 2.', '1300', 0, 0]],
  },
};

describe('eesztPraxis', () => {
  it('decodes the licence flags bit by bit', () => {
    const a = eesztPraxis(data, '000000001')!;
    expect(a.districtNo).toBe('2. körzet');
    expect(a.licence).toMatchObject({
      settlementMatch: true, providerMatch: false, publicFunded: true, sharedUnit: false,
      profession: 'háziorvosi ellátás', onCall: 'központi ügyeletben',
    });
    const b = eesztPraxis(data, '000000002')!;
    expect(b.licence).toMatchObject({
      settlementMatch: false, providerMatch: true, publicFunded: false, sharedUnit: true,
      licenceCount: 2,
    });
    expect(b.provider).toBe('Minta Bt.');
  });

  it('returns null for unknown districts and missing data', () => {
    expect(eesztPraxis(data, '999999999')).toBeNull();
    expect(eesztPraxis(null, '000000001')).toBeNull();
  });
});

describe('eesztSettlement', () => {
  it('filters the directory by branch', () => {
    expect(eesztSettlement(data, 'Szigetvár', 'gp')).toHaveLength(1);
    expect(eesztSettlement(data, 'Szigetvár', 'dental')[0].publicFunded).toBe(false);
    expect(eesztSettlement(data, 'Nincsilyen', 'gp')).toEqual([]);
  });
});

describe('takesOnCall', () => {
  it('reads the "nem vesz részt" variants as no duty', () => {
    expect(takesOnCall('nem vesz részt ügyeletben')).toBe(false);
    expect(takesOnCall('nem vesz részt')).toBe(false);
    expect(takesOnCall('központi ügyeletben')).toBe(true);
    expect(takesOnCall('')).toBe(false);
  });
});
