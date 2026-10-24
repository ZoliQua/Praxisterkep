// Every story built from the real data files: each must have scenes, every
// line must be filled in (no {placeholder}, no raw i18n key, no NaN) and short
// enough for the torn note.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import sources from '../../lib/sources.json';
import {
  analysisScenes, countyOverviewScenes, countyScenes, districtOverviewScenes, districtScenes,
  europeScenes, highlightsScenes, landingScenes, methodScenes, specialistScenes,
  type SpecialistInput,
} from './stories';
import type { Scene } from './Story';

const DATA = resolve(__dirname, '../../../../data');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (f: string): any => JSON.parse(readFileSync(resolve(DATA, f), 'utf8'));
const have = (...fs: string[]) => fs.every((f) => existsSync(resolve(DATA, f)));

function check(scenes: Scene[], min = 4) {
  expect(scenes.length).toBeGreaterThanOrEqual(min);
  expect(scenes.length).toBeLessThanOrEqual(10);
  for (const s of scenes) {
    expect(s.say).not.toMatch(/[{}]|NaN|undefined|null|story\./);
    expect(s.say.length).toBeLessThanOrEqual(125);
    expect(typeof s.draw).toBe('function');
  }
}

describe.runIf(have('latest.json', 'timeseries.json'))('landing story', () => {
  const latest = load('latest.json');
  const ts = load('timeseries.json');
  for (const kind of ['dental', 'gp'] as const) {
    for (const mode of ['without', 'with'] as const) {
      it(`${kind}, dissolved ${mode}`, () => {
        check(landingScenes({ kind, snapshot: latest.kinds[kind], months: ts.kinds[kind], mode }), 6);
      });
    }
  }
});

describe.runIf(have('highlights.json', 'europe_summary.json'))('highlights story', () => {
  it('tells the four facts', () => {
    check(highlightsScenes(load('highlights.json'), load('europe_summary.json')), 8);
  });
});

describe.runIf(have('counties.json', 'districts.json', 'latest.json'))('county and district stories', () => {
  const latest = load('latest.json');
  it('every county', () => {
    const c = load('counties.json');
    for (const row of c.counties) check(countyScenes(c, row.name, 'gp', latest.kinds.gp), 6);
    check(countyOverviewScenes(latest.kinds.dental, 'dental', 'without'), 5);
  });
  it('every district', () => {
    const d = load('districts.json');
    for (const row of d.districts) check(districtScenes(d, row.name, 'dental', latest.kinds.dental), 5);
    check(districtOverviewScenes(d, 'gp'), 4);
  });
});

describe.runIf(have('survival.json', 'outcomes.json', 'europe.json'))('analysis and Europe stories', () => {
  it('analysis, both branches', () => {
    const s = load('survival.json');
    const o = load('outcomes.json');
    check(analysisScenes('gp', s.kinds.gp, o), 7);
    check(analysisScenes('dental', s.kinds.dental, o), 7);
  });
  it('Europe, every group', () => {
    const e = load('europe.json');
    for (const g of ['all', 'cee', 'v4'] as const) {
      check(europeScenes(e, 'gp', g), 6);
      check(europeScenes(e, 'dental', g), 6);
    }
  });
});

describe.runIf(have('vedono.json', 'specialist.json', 'pharmacy.json', 'gyse.json'))('specialist story', () => {
  it('builds', () => {
    check(specialistScenes({
      vedono: load('vedono.json'), specialist: load('specialist.json'),
      pharmacy: load('pharmacy.json'), gyse: load('gyse.json'),
    } as SpecialistInput), 8);
  });
});

describe.runIf(have('latest.json', 'timeseries.json', 'pipeline.json', 'settlement_slugs.json'))('method story', () => {
  it('builds', () => {
    const latest = load('latest.json');
    check(methodScenes({
      sources, timeseries: load('timeseries.json').kinds, latest: latest.kinds, month: latest.month,
      pipeline: load('pipeline.json'), settlementPages: load('settlement_slugs.json').settlements.length,
    }), 7);
  });
});
