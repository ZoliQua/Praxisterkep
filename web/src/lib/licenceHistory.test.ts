import { describe, expect, it } from 'vitest';
import {
  HISTORY_COLUMNS, newByType, newUnitRows, type LicenceHistoryRaw,
} from './licenceHistory';

const district = (fin: string, type: string, firstSeen: string, older = false) => ({
  fin, type, county: 'Baranya', institution: 'Bt.', unit: `U${fin}`,
  provider: 'P1', providerName: 'Bt.', settlement: 'Szigetvár',
  olderThanWindow: older, firstSeen, appearedAfter: '2025-01-15',
});

const data: LicenceHistoryRaw = {
  schemaVersion: 1,
  snapshots: [
    { date: '2024-01-15', rows: 9, units: 3, licences: 9, ambiguous: 0 },
    { date: '2025-07-15', rows: 9, units: 4, licences: 9, ambiguous: 0 },
  ],
  churn: [{ from: '2024-01-15', to: '2025-07-15', left: 1, arrived: 2, carried: 2 }],
  stats: {
    from: '2024-01-15', to: '2025-07-15', snapshots: 2, districtsFollowed: 3,
    unitsOlderThanWindow: 1, unitsNewerThanWindow: 2,
    newByType: { HSZ: 1, JAR: 1 }, newByDate: { '2025-07-15': 2 },
    unitsLeft: 1, unitsArrived: 2,
  },
  districts: [
    district('000000001', 'HSZ', '2025-07-15'),
    district('000000002', 'JAR', '2025-07-15'),
    district('000000003', 'FOG', '2024-01-15', true),
  ],
};

describe('licence history', () => {
  it('shows only the services whose unit carries a date', () => {
    const rows = newUnitRows(data);
    expect(rows.map((r) => r.fin)).toEqual(['000000001', '000000002']);
  });

  it('names the branch in Hungarian and keeps unknown codes as codes', () => {
    expect(newByType(data)).toEqual([
      { code: 'HSZ', label: 'háziorvosi', count: 1 },
      { code: 'JAR', label: 'járóbeteg-szakellátás', count: 1 },
    ]);
    const odd = { ...data, stats: { ...data.stats, newByType: { QQQ: 4 } } };
    expect(newByType(odd)).toEqual([{ code: 'QQQ', label: 'QQQ', count: 4 }]);
  });

  it('labels the branch of every published row', () => {
    expect(newUnitRows(data).map((r) => r.typeLabel))
      .toEqual(['háziorvosi', 'járóbeteg-szakellátás']);
  });

  it('survives a missing file', () => {
    expect(newUnitRows(null)).toEqual([]);
    expect(newByType(null)).toEqual([]);
  });

  it('offers a column for every field the table shows', () => {
    const keys = new Set(Object.keys(newUnitRows(data)[0]));
    for (const col of HISTORY_COLUMNS) expect(keys.has(col.key)).toBe(true);
  });
});
