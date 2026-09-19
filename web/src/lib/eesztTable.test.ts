import { describe, expect, it } from 'vitest';
import {
  COLUMNS, buildReasonRows, filterRows, serialize, sortRows, type EesztRow,
} from './eesztTable';
import type { EesztRaw } from './eeszt';
import type { Snapshot } from '../types';

function row(over: Partial<EesztRow>): EesztRow {
  return {
    fin: '000000000', settlement: 'X', county: 'Vas', type: 'vegyes',
    status: 'Betöltetlen', eesztState: 'engedély',
    districtNo: null, licPostal: null, licSettlement: null, licAddress: null,
    settlementMatch: null, providerMatch: null, onCall: null, onCallDuty: null,
    publicFunded: null, profession: null, provider: null, institutionCode: null,
    sharedUnit: null, licenceCount: null, geoApprox: null, lat: null, lon: null,
    unitCode: null, licenceId: null, providerId: null,
    ...over,
  };
}

const rows = [
  row({ fin: '1', settlement: 'Vasvár', settlementMatch: true, licenceCount: 1 }),
  row({ fin: '2', settlement: 'Ábrahámhegy', county: 'Veszprém', settlementMatch: false, licenceCount: 3 }),
  row({ fin: '3', settlement: 'Zalaegerszeg', county: 'Zala', licenceCount: null }),
  row({ fin: '4', settlement: 'Érd', county: 'Pest', provider: 'Minta, "Dent" Kft.', licenceCount: 2 }),
];

describe('filterRows', () => {
  it('text filters are accent- and case-insensitive substrings', () => {
    expect(filterRows(rows, COLUMNS, { settlement: 'abraham' }).map((r) => r.fin)).toEqual(['2']);
  });
  it('enum filters match exactly', () => {
    expect(filterRows(rows, COLUMNS, { county: 'Zala' }).map((r) => r.fin)).toEqual(['3']);
  });
  it('bool filters distinguish true / false / empty', () => {
    expect(filterRows(rows, COLUMNS, { settlementMatch: 'true' }).map((r) => r.fin)).toEqual(['1']);
    expect(filterRows(rows, COLUMNS, { settlementMatch: 'false' }).map((r) => r.fin)).toEqual(['2']);
    expect(filterRows(rows, COLUMNS, { settlementMatch: 'null' }).map((r) => r.fin)).toEqual(['3', '4']);
  });
  it('number filters support comparison operators', () => {
    expect(filterRows(rows, COLUMNS, { licenceCount: '>=2' }).map((r) => r.fin)).toEqual(['2', '4']);
    expect(filterRows(rows, COLUMNS, { licenceCount: '1' }).map((r) => r.fin)).toEqual(['1']);
    expect(filterRows(rows, COLUMNS, { licenceCount: '>' })).toHaveLength(4); // incomplete input
  });
  it('the global search spans every text column', () => {
    expect(filterRows(rows, COLUMNS, {}, 'dent').map((r) => r.fin)).toEqual(['4']);
  });
});

describe('sortRows', () => {
  it('sorts Hungarian text with the hu collation', () => {
    expect(sortRows(rows, 'settlement', 'asc').map((r) => r.settlement))
      .toEqual(['Ábrahámhegy', 'Érd', 'Vasvár', 'Zalaegerszeg']);
  });
  it('keeps empty cells last in both directions', () => {
    expect(sortRows(rows, 'licenceCount', 'asc').map((r) => r.fin)).toEqual(['1', '4', '2', '3']);
    expect(sortRows(rows, 'licenceCount', 'desc').map((r) => r.fin)).toEqual(['2', '4', '1', '3']);
  });
});

describe('serialize', () => {
  const cols = COLUMNS.filter((c) => ['fin', 'provider'].includes(c.key));
  it('quotes CSV cells that contain commas or quotes', () => {
    const csv = serialize([rows[3]], cols, 'csv');
    expect(csv.split('\r\n')[1]).toBe('4,"Minta, ""Dent"" Kft."');
  });
  it('writes TSV with tab separators and flattened tabs', () => {
    const tsv = serialize([row({ fin: '9', provider: 'a\tb' })], cols, 'tsv');
    expect(tsv.split('\r\n')[1]).toBe('9\ta b');
  });
});

describe('buildReasonRows', () => {
  const snapshot = {
    praxes: [
      { id: 'A', county: 'Baranya', type: 'mixed', status: 'vacant', sites: [{ settlement: 'Komló' }] },
      { id: 'B', county: 'Vas', type: 'adult', status: 'vacant', sites: [{ settlement: 'Vasvár' }] },
    ],
    filledPraxes: [{ id: 'C', county: 'Zala', type: 'adult', settlement: 'Zalalövő' }],
  } as unknown as Snapshot;

  const data = {
    schemaVersion: 1, asOf: '2026-09-19', dataMonth: '2026-09', stats: {},
    professions: { '1300': 'fogászati ellátás', '1306': 'fogászati röntgen' },
    onCall: ['nem vesz részt ügyeletben'],
    praxes: {},
    settlements: {},
    unmatched: {
      A: ['d', 'ambiguous', '2|2'],
      B: ['d', 'noUnitLicence', '000000042'],
      C: ['d', 'otherProfession', 'fogászati röntgen'],
    },
    unmatchedDetails: {
      A: [
        ['L1', 'U1', '7300', 'Komló', 'Fő utca 1.', '1300', 1, 0],
        ['L2', 'U2', '7396', 'Magyarszék', 'Hársfa utca 2.', '1300', 1, 0],
      ],
      C: [['L3', 'U3', '8999', 'Zalalövő', 'Kert utca 3.', '1306', 0, 0]],
    },
  } as unknown as EesztRaw;

  it('lists one row per candidate licence for the ambiguous districts', () => {
    const { rows, expanded, districts } = buildReasonRows(snapshot, data, 'ambiguous');
    expect(expanded).toBe(true);
    expect(districts).toBe(1);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.licSettlement)).toEqual(['Komló', 'Magyarszék']);
  });

  it('names the profession an other-profession licence was issued for', () => {
    const { rows } = buildReasonRows(snapshot, data, 'otherProfession');
    expect(rows).toHaveLength(1);
    expect(rows[0].profession).toBe('fogászati röntgen');
    expect(rows[0].status).toBe('Betöltött');
  });

  it('gives the other reasons one filterable row per district', () => {
    const { rows, expanded, districts } = buildReasonRows(snapshot, data, 'noUnitLicence');
    expect(expanded).toBe(false);
    expect(districts).toBe(1);
    expect(rows[0].fin).toBe('B');
    expect(String(rows[0].detail)).toContain('000000042');
  });
});
