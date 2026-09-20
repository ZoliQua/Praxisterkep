// Which orientation layers the maps show (county seats, county-rank cities,
// larger towns, Budapest district borders). The choice is shared by every map
// on the page and remembered per browser.
import { useSyncExternalStore } from 'react';

export type LayerKey = 'seats' | 'county' | 'towns' | 'budapest';
export const LAYER_KEYS: LayerKey[] = ['seats', 'county', 'towns', 'budapest'];

export type LayerState = Record<LayerKey, boolean>;

const DEFAULTS: LayerState = { seats: true, county: false, towns: false, budapest: false };
const STORAGE_KEY = 'praxisterkep.mapLayers';

function read(): LayerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<LayerState>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS; // private mode, blocked storage — the defaults still work
  }
}

let state: LayerState = typeof window === 'undefined' ? DEFAULTS : read();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toggleLayer(key: LayerKey): void {
  state = { ...state, [key]: !state[key] };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // not being able to remember the choice must never break the map
  }
  listeners.forEach((fn) => fn());
}

export function useMapLayers(): LayerState {
  return useSyncExternalStore(subscribe, () => state, () => DEFAULTS);
}

/* ---------------- the data behind the layers ---------------- */

export interface CityPoint {
  name: string;
  rank: 'seat' | 'county' | 'town';
  lat: number;
  lon: number;
}

let citiesPromise: Promise<CityPoint[]> | null = null;
let budapestPromise: Promise<GeoJSON.FeatureCollection | null> | null = null;

export function loadCities(): Promise<CityPoint[]> {
  citiesPromise ??= fetch(`${import.meta.env.BASE_URL}data/cities.geojson`)
    .then((r) => (r.ok ? r.json() : null))
    .then((fc: GeoJSON.FeatureCollection | null) => (fc?.features ?? []).map((f) => ({
      name: String(f.properties?.name ?? ''),
      rank: (f.properties?.rank ?? 'town') as CityPoint['rank'],
      lon: (f.geometry as GeoJSON.Point).coordinates[0],
      lat: (f.geometry as GeoJSON.Point).coordinates[1],
    })))
    .catch(() => []);
  return citiesPromise;
}

export function loadBudapest(): Promise<GeoJSON.FeatureCollection | null> {
  budapestPromise ??= fetch(`${import.meta.env.BASE_URL}data/budapest.geojson`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return budapestPromise;
}

/** which ranks a layer state shows */
export function visibleRanks(layers: LayerState): Set<CityPoint['rank']> {
  const out = new Set<CityPoint['rank']>();
  if (layers.seats) out.add('seat');
  if (layers.county) out.add('county');
  if (layers.towns) out.add('town');
  return out;
}
