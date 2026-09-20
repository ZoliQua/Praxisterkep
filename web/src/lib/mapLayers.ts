// Which orientation layers the maps show: county names, county seats,
// county-rank cities, járás seats, larger towns, járás borders and the
// Budapest district borders. A layer the visitor has not touched falls back
// to the map's own default (the main map shows county names, the others do
// not); once switched, the choice is shared by every map and remembered.
import { useSyncExternalStore } from 'react';

export type LayerKey =
  | 'counties' | 'seats' | 'county' | 'jarasSeats' | 'towns' | 'jaras' | 'budapest';

export const LAYER_KEYS: LayerKey[] = [
  'counties', 'seats', 'county', 'jarasSeats', 'towns', 'jaras', 'budapest',
];

/** what a layer does when neither the visitor nor the map says otherwise */
const DEFAULTS: Record<LayerKey, boolean> = {
  counties: false, seats: true, county: false, jarasSeats: false,
  towns: false, jaras: false, budapest: false,
};

export type LayerChoice = Partial<Record<LayerKey, boolean>>;
const STORAGE_KEY = 'praxisterkep.mapLayers';

function read(): LayerChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LayerChoice) : {};
  } catch {
    return {}; // private mode, blocked storage — the defaults still work
  }
}

let chosen: LayerChoice = typeof window === 'undefined' ? {} : read();
const listeners = new Set<() => void>();
const EMPTY: LayerChoice = {};

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLayer(key: LayerKey, on: boolean): void {
  chosen = { ...chosen, [key]: on };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chosen));
  } catch {
    // not being able to remember the choice must never break the map
  }
  listeners.forEach((fn) => fn());
}

/** the visitor's explicit choices; resolve them with resolveLayers() */
export function useLayerChoice(): LayerChoice {
  return useSyncExternalStore(subscribe, () => chosen, () => EMPTY);
}

export type LayerState = Record<LayerKey, boolean>;

/** the visitor's choice, else this map's default, else the global default */
export function resolveLayers(choice: LayerChoice, mapDefaults: LayerChoice = {}): LayerState {
  return Object.fromEntries(
    LAYER_KEYS.map((key) => [key, choice[key] ?? mapDefaults[key] ?? DEFAULTS[key]]),
  ) as LayerState;
}

/* ---------------- the data behind the layers ---------------- */

export type CityRank = 'seat' | 'county' | 'jarasSeat' | 'town';

export interface CityPoint {
  name: string;
  rank: CityRank;
  /** at least 20 000 residents — the "larger towns" layer goes by size */
  big: boolean;
  lat: number;
  lon: number;
}

let citiesPromise: Promise<CityPoint[]> | null = null;
const geoPromises = new Map<string, Promise<GeoJSON.FeatureCollection | null>>();

export function loadCities(): Promise<CityPoint[]> {
  citiesPromise ??= fetch(`${import.meta.env.BASE_URL}data/cities.geojson`)
    .then((r) => (r.ok ? r.json() : null))
    .then((fc: GeoJSON.FeatureCollection | null) => (fc?.features ?? []).map((f) => ({
      name: String(f.properties?.name ?? ''),
      rank: (f.properties?.rank ?? 'town') as CityRank,
      big: Boolean(f.properties?.big),
      lon: (f.geometry as GeoJSON.Point).coordinates[0],
      lat: (f.geometry as GeoJSON.Point).coordinates[1],
    })))
    .catch(() => []);
  return citiesPromise;
}

/** counties.geojson / jaras.geojson / budapest.geojson, fetched once each */
export function loadGeo(name: string): Promise<GeoJSON.FeatureCollection | null> {
  let promise = geoPromises.get(name);
  if (!promise) {
    promise = fetch(`${import.meta.env.BASE_URL}data/${name}.geojson`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    geoPromises.set(name, promise);
  }
  return promise;
}

/** does this city belong to any switched-on layer? */
export function cityVisible(city: CityPoint, layers: LayerState): boolean {
  if (layers.seats && city.rank === 'seat') return true;
  if (layers.county && city.rank === 'county') return true;
  if (layers.jarasSeats && city.rank === 'jarasSeat') return true;
  return Boolean(layers.towns && city.big);
}
