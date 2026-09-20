import { describe, expect, it } from 'vitest';
import {
  candidateRows, crosscheckRows, eesztOnlyRows, explain, verdictBreakdown,
  type CrosscheckRaw,
} from './crosscheck';

const data = {
  schemaVersion: 1, asOf: '2026-09-20', dataMonth: '2026-09',
  professions: { '1300': 'fogászati ellátás', '6301': 'háziorvosi ellátás' },
  verdicts: ['otherUnitSameProfession', 'providerName', 'none'],
  stats: {},
  records: [
    {
      id: '020066062', source: 'district-dental', family: 'dental',
      reason: 'noUnitLicence', named: false, settlement: 'Pécs', county: 'Baranya',
      address: 'Dr. Veress Endre u. 2.', units: '020066062',
      verdict: 'otherUnitSameProfession', candidateCount: 2, settlementLicences: 12,
      candidates: [
        {
          unit: '000040249', licenceId: '000040249/A1/1300', profession: '1300',
          settlement: 'Pécs', address: 'Dr. Veress Endre utca 2', publicFunded: true,
          match: 'address', otherUnit: true,
        },
        {
          unit: '000040250', licenceId: '000040250/A1/1300', profession: '1300',
          settlement: 'Pécs', address: 'Dr. Veress Endre utca 2', publicFunded: false,
          match: 'address', otherUnit: true,
        },
      ],
    },
    {
      id: '100090001', source: 'district-gp', family: 'gp', reason: 'noUnitLicence',
      named: false, settlement: 'Eger', county: 'Heves', address: 'Fő u. 1.',
      units: '', verdict: 'none', candidateCount: 0, settlementLicences: 0,
      candidates: [],
    },
  ],
  eesztOnly: [
    {
      fin: '010090999', tip: 'HSZ', county: 'Budapest', unit: '000012345',
      institution: '9999', settlement: 'Budapest', address: 'Fő utca 3.',
      profession: '6301', licenceId: '000012345/A1/6301',
    },
  ],
} as unknown as CrosscheckRaw;

describe('crosscheckRows', () => {
  it('keeps one row per record with its best candidate and count', () => {
    const rows = crosscheckRows(data, 'dental');
    expect(rows).toHaveLength(1);
    expect(rows[0].unitCode).toBe('000040249');
    expect(rows[0].moreCandidates).toBe(1);
    expect(rows[0].profession).toBe('fogászati ellátás');
  });

  it('separates the branches', () => {
    expect(crosscheckRows(data, 'gp').map((r) => r.fin)).toEqual(['100090001']);
  });
});

describe('explain', () => {
  it('names the unit the licence actually sits under', () => {
    const text = explain(data, data.records[0]);
    expect(text).toContain('000040249');
    expect(text).toContain('020066062');
    expect(text).toContain('fogászati ellátás');
  });

  it('says when nothing in the settlement could match', () => {
    expect(explain(data, data.records[1]).length).toBeGreaterThan(20);
  });
});

describe('candidateRows and eesztOnlyRows', () => {
  it('lists every candidate of a verdict row by row', () => {
    const rows = candidateRows(data, 'dental', 'otherUnitSameProfession');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.licenceId))
      .toEqual(['000040249/A1/1300', '000040250/A1/1300']);
  });

  it('filters the EESZT-only services by branch', () => {
    expect(eesztOnlyRows(data, 'gp')).toHaveLength(1);
    expect(eesztOnlyRows(data, 'dental')).toHaveLength(0);
  });
});

describe('verdictBreakdown', () => {
  it('counts verdicts in the published order', () => {
    expect(verdictBreakdown(data, 'dental')).toEqual([
      { verdict: 'otherUnitSameProfession', n: 1 },
    ]);
  });
});
