// Where each level's report gets its numbers: the same JSON files the pages
// read, fetched once per page view. A settlement page carries its own
// profile inline (the generator writes it), so it needs no download at all.
import type { CountiesRaw } from '../lib/counties';
import type { DistrictsRaw } from '../lib/districts';
import type { OutcomesRaw } from '../lib/outcomes';
import { rings, type ShapeFeature } from '../lib/projection';
import type { EuropeRaw } from '../lib/europe';
import type { AnalysisInput } from './analysisReport';
import type { CountyInput, DistrictInput, SettlementInput } from './report';

interface GeoFile { features: { properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } }[] }

const cache = new Map<string, Promise<unknown>>();

function json<T>(name: string, optional = false): Promise<T | null> {
  if (!cache.has(name)) {
    cache.set(name, fetch(`/data/${name}`).then((r) => {
      if (!r.ok) throw new Error(`${name}: ${r.status}`);
      return r.json();
    }).catch((e) => {
      cache.delete(name);
      if (optional) return null;
      throw e;
    }));
  }
  return cache.get(name) as Promise<T | null>;
}

export async function countyInput(name: string): Promise<CountyInput> {
  const [counties, outcomes, districts, geo] = await Promise.all([
    json<CountiesRaw>('counties.json'), json<OutcomesRaw>('outcomes.json', true),
    json<DistrictsRaw>('districts.json', true), json<GeoFile>('counties.geojson', true)]);
  return { counties: counties!, outcomes, districts, name,
    geo: geo ? geo.features.map((f) => ({ name: String(f.properties.name), rings: rings(f.geometry),
      isCapital: false })) : null };
}

export async function districtInput(name: string): Promise<DistrictInput> {
  const [districts, outcomes, jaras, capital] = await Promise.all([
    json<DistrictsRaw>('districts.json'), json<OutcomesRaw>('outcomes.json', true),
    json<GeoFile>('jaras.geojson', true), json<GeoFile>('budapest.geojson', true)]);
  return { districts: districts!, outcomes, name, geo: jaras ? districtGeo(jaras, capital) : null };
}

/** The 174 járás and the 23 kerület under the names districts.json uses. */
function districtGeo(jaras: GeoFile, capital: GeoFile | null): { jaras: ShapeFeature[]; capital: ShapeFeature[] } {
  const kerulet: ShapeFeature[] = [];
  for (const f of capital?.features ?? []) {
    // "I. kerület" with ref "1" is what districts.json calls "Budapest 01. ker."
    const ref = Number(f.properties.ref);
    if (ref) kerulet.push({ name: `Budapest ${String(ref).padStart(2, '0')}. ker.`, rings: rings(f.geometry), isCapital: true });
  }
  const rural = jaras.features.filter((f) => f.properties.name !== 'Budapest')
    .map((f) => ({ name: String(f.properties.name), rings: rings(f.geometry), isCapital: false }));
  return { jaras: [...rural, ...kerulet], capital: kerulet };
}

/** The profile a static settlement page carries in <script id="pdf-data">. */
export function settlementInput(): SettlementInput {
  const el = document.getElementById('pdf-data');
  if (!el?.textContent) throw new Error('no settlement data on this page');
  return JSON.parse(el.textContent) as SettlementInput;
}

interface LatestKind { national: AnalysisInput['national']['gp'] }

/** The country as a whole: the snapshot, the series, and the analyses. */
export async function analysisInput(): Promise<AnalysisInput> {
  const [latest, ts, survival, outcomes, counties, districts] = await Promise.all([
    json<{ month: string; kinds: Record<'gp' | 'dental', LatestKind> }>('latest.json'),
    json<{ kinds: AnalysisInput['timeseries'] }>('timeseries.json'),
    json<{ kinds: NonNullable<AnalysisInput['survival']> }>('survival.json', true),
    json<OutcomesRaw>('outcomes.json', true), json<CountiesRaw>('counties.json'),
    json<DistrictsRaw>('districts.json', true)]);
  return { dataMonth: latest!.month,
    national: { gp: latest!.kinds.gp.national, dental: latest!.kinds.dental.national },
    timeseries: ts!.kinds, survival: survival?.kinds ?? null, outcomes, counties: counties!, districts };
}

export async function europeInput(): Promise<EuropeRaw> {
  return (await json<EuropeRaw>('europe.json'))!;
}
