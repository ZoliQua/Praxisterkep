import { create } from 'zustand';
import type { LatestFile, PraxisKind, Snapshot, Timeseries, TimeseriesMonth } from '../types';
import type { TypeFilter } from '../lib/selectors';

export type MapMetric = 'rate' | 'population';

interface AppState {
  latest: LatestFile | null;
  timeseries: Timeseries | null;
  loadError: string | null;
  kind: PraxisKind;
  typeFilter: TypeFilter;
  mapMetric: MapMetric;
  selectedCounty: string | null;
  setKind: (k: PraxisKind) => void;
  setTypeFilter: (t: TypeFilter) => void;
  setMapMetric: (m: MapMetric) => void;
  setSelectedCounty: (name: string | null) => void;
  loadData: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  latest: null,
  timeseries: null,
  loadError: null,
  kind: 'dental',
  typeFilter: 'all',
  mapMetric: 'rate',
  selectedCounty: null,
  // switching kind resets kind-specific view state
  setKind: (kind) => set({ kind, typeFilter: 'all', selectedCounty: null }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setMapMetric: (mapMetric) => set({ mapMetric }),
  setSelectedCounty: (selectedCounty) => set({ selectedCounty }),
  loadData: async () => {
    if (get().latest) return;
    try {
      const base = import.meta.env.BASE_URL;
      const [latest, timeseries] = await Promise.all([
        fetch(`${base}data/latest.json`).then(assertOk<LatestFile>),
        fetch(`${base}data/timeseries.json`).then(assertOk<Timeseries>),
      ]);
      set({ latest, timeseries });
    } catch (err) {
      set({ loadError: err instanceof Error ? err.message : String(err) });
    }
  },
}));

/** Snapshot of the active kind — null until data is loaded. */
export function useSnapshot(): Snapshot | null {
  return useAppStore((s) => s.latest?.kinds[s.kind] ?? null);
}

export function useTimeseriesMonths(): TimeseriesMonth[] {
  return useAppStore((s) => s.timeseries?.kinds[s.kind] ?? EMPTY_MONTHS);
}

const EMPTY_MONTHS: TimeseriesMonth[] = [];

async function assertOk<T>(resp: Response): Promise<T> {
  if (!resp.ok) throw new Error(`${resp.url}: HTTP ${resp.status}`);
  return resp.json() as Promise<T>;
}
