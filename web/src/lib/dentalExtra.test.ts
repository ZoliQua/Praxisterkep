import { describe, expect, it } from 'vitest';
import {
  countyBreakdown, extraColumns, extraRows, typeBreakdown, type DentalExtraRaw,
} from './dentalExtra';

const data = {
  schemaVersion: 1, asOf: '2026-09-20', dataMonth: '2026-09',
  source: 'data/raw/2026-09/dental_registry.xls', eesztSources: {},
  types: { 'Szájsebészet': 'specialist', 'Ügyelet': 'oncall' },
  professions: { '1301': 'dento-alveoláris sebészet' },
  onCall: ['nem vesz részt ügyeletben'],
  stats: { specialist: { services: 2, licence: 1 }, oncall: { services: 1 }, university: {} },
  services: [
    {
      id: '02006A425', group: 'specialist', level: 'Szakellátás', unitType: 'Szájsebészet',
      county: 'Baranya', settlement: 'Pécs', postalCode: '7633', address: 'Veress u. 2.',
      rows: 1, doctors: ['Dr. Minta Béla'], provider: 'Minta Bt.', neakCode: '0632',
      licence: {
        postalCode: '7633', settlement: 'Pécs', address: 'Veress u. 2.', profession: '1301',
        settlementMatch: true, providerMatch: false, publicFunded: true, onCall: 0,
        licenceCount: 1,
      },
      trace: { units: 'U1', licenceId: 'L1', providerId: 'P1' },
      geo: { lat: 46.07, lon: 18.23, approx: false, from: 'licence' },
    },
    {
      id: '02006A426', group: 'specialist', level: 'Szakellátás', unitType: 'Röntgen',
      county: 'Baranya', settlement: 'Mohács', postalCode: '7700', address: 'Fő u. 1.',
      rows: 1,
      trace: { units: 'U2', licenceId: '', providerId: '' },
    },
    {
      id: '020066900', group: 'oncall', level: 'Alapellátás', unitType: 'Ügyelet',
      county: 'Baranya', settlement: 'Pécs', postalCode: '7621', address: 'Fő u. 1.',
      rows: 3, doctors: ['Dr. A', 'Dr. B', 'Dr. C'],
    },
  ],
  unmatched: { '02006A426': ['noUnitLicence', 'U2'] },
  unmatchedDetails: {},
} as unknown as DentalExtraRaw;

describe('extraRows', () => {
  it('flattens a service into one row with its licence and location', () => {
    const rows = extraRows(data, 'specialist');
    expect(rows).toHaveLength(2);
    const [surgery, xray] = rows;
    expect(surgery.fin).toBe('02006A425');
    expect(surgery.profession).toBe('dento-alveoláris sebészet');
    expect(surgery.doctorCount).toBe(1);
    expect(surgery.lat).toBe(46.07);
    // an unmatched service keeps its reason and has no licence fields
    expect(xray.licenceId).toBeNull();
    expect(xray.lat).toBeNull();
    expect(String(xray.reason)).toBeTruthy();
  });

  it('never carries provider identity for a service with no named physician', () => {
    const [, xray] = extraRows(data, 'specialist');
    expect(xray.doctors).toBeNull();
    expect(xray.provider).toBeNull();
    expect(xray.neakCode).toBeNull();
    expect(xray.providerId).toBeNull();
  });

  it('lists the on-call roster as one row per service', () => {
    const rows = extraRows(data, 'oncall');
    expect(rows).toHaveLength(1);
    expect(rows[0].doctorCount).toBe(3);
    expect(rows[0].doctors).toBe('Dr. A, Dr. B, Dr. C');
  });
});

describe('summaries', () => {
  it('ranks service types and counties by size', () => {
    expect(typeBreakdown(data, 'specialist').map((x) => x.type))
      .toEqual(['Szájsebészet', 'Röntgen']);
    expect(countyBreakdown(data, 'specialist')).toEqual([['Baranya', 2]]);
  });

  it('drops the service-type column where a group has only one type', () => {
    expect(extraColumns('oncall').some((c) => c.key === 'unitType')).toBe(false);
    expect(extraColumns('specialist').some((c) => c.key === 'unitType')).toBe(true);
  });
});
