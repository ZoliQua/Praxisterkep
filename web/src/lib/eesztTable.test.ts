import { describe, expect, it } from 'vitest';
import {
  COLUMNS, filterRows, serialize, sortRows, type EesztRow,
} from './eesztTable';

function row(over: Partial<EesztRow>): EesztRow {
  return {
    fin: '000000000', settlement: 'X', county: 'Vas', type: 'vegyes',
    status: 'Betöltetlen', eesztState: 'engedély',
    districtNo: null, licPostal: null, licSettlement: null, licAddress: null,
    settlementMatch: null, providerMatch: null, onCall: null, onCallDuty: null,
    publicFunded: null, profession: null, provider: null, institutionCode: null,
    sharedUnit: null, licenceCount: null,
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
