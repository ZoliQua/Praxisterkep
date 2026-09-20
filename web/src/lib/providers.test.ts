import { describe, expect, it } from 'vitest';
import {
  PROVIDER_COLUMNS, biggestProviders, portfolioSpread, providerRows,
  type ProvidersRaw,
} from './providers';

const data = {
  schemaVersion: 1, asOf: '2026-09-20', dataMonth: '2026-09',
  groups: ['dental', 'gp', 'oncall', 'university', 'specialist'],
  stats: { providers: 3, identified: 2, byMatch: { tax: 2, none: 1 }, services: 10 },
  providers: [
    {
      neakCode: '3936', neakName: 'Dr. Baumholzer Fogászati Bt.', tax: '20101189',
      match: 'tax', counts: { dental: 2, gp: 0, oncall: 0, university: 0, specialist: 1 },
      total: 3, counties: ['Baranya'], settlements: 2, euszolgId: '032175',
      officialName: 'DR. BAUMHOLZER Fogászati, Kereskedelmi és Szolgáltató Betéti Társaság',
      seatCounty: 'Baranya', seatPostal: '7627', seatSettlement: 'Pécs',
      seatAddress: 'Bokor utca 12/2.',
    },
    {
      neakCode: 'U915', neakName: 'Semmelweis Egyetem Klinikai Központ', tax: '19308674',
      match: 'tax', counts: { dental: 3, gp: 0, oncall: 1, university: 2, specialist: 0 },
      total: 6, counties: ['Budapest'], settlements: 1, euszolgId: '000123',
      officialName: 'Semmelweis Egyetem', seatCounty: 'Budapest', seatPostal: '1085',
      seatSettlement: 'Budapest VIII. kerület', seatAddress: 'Üllői út 26.',
    },
    {
      neakCode: 'X001', neakName: 'Névtelen Bt.', tax: '', match: 'none',
      counts: { dental: 1, gp: 0, oncall: 0, university: 0, specialist: 0 },
      total: 1, counties: ['Vas'], settlements: 1,
    },
  ],
} as unknown as ProvidersRaw;

describe('providerRows', () => {
  it('puts the official name and the seat next to the NEAK name', () => {
    const [first] = providerRows(data);
    expect(first.neakName).toBe('Dr. Baumholzer Fogászati Bt.');
    expect(String(first.officialName)).toContain('Betéti Társaság');
    expect(first.seat).toBe('7627 Pécs, Bokor utca 12/2.');
    expect(first.basis).toBeTruthy();
  });

  it('leaves the official fields empty when nothing was identified', () => {
    const last = providerRows(data)[2];
    expect(last.officialName).toBeNull();
    expect(last.seat).toBeNull();
    expect(last.euszolgId).toBeNull();
  });

  it('breaks the portfolio down per branch', () => {
    const [first] = providerRows(data);
    expect(first.dental).toBe(2);
    expect(first.specialist).toBe(1);
    expect(first.total).toBe(3);
  });
});

describe('summaries', () => {
  it('buckets providers by how much they run', () => {
    expect(portfolioSpread(data)).toEqual([
      { key: '1', n: 1 }, { key: '2', n: 0 }, { key: '3-5', n: 1 }, { key: '6+', n: 1 },
    ]);
  });

  it('ranks the biggest providers first', () => {
    expect(biggestProviders(data, 2).map((p) => p.neakCode)).toEqual(['U915', '3936']);
  });
});

describe('columns', () => {
  it('shows the official name, tax number and seat by default', () => {
    const visible = PROVIDER_COLUMNS.filter((c) => c.visible).map((c) => c.key);
    expect(visible).toEqual(expect.arrayContaining(['officialName', 'tax', 'seat']));
  });
});
