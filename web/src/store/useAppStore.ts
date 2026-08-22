import { create } from 'zustand';
import type { Snapshot, Timeseries } from '../types';
import type { TypeFilter } from '../lib/selectors';

export type MapMetric = 'rate' | 'population';

interface AppState {
  snapshot: Snapshot | null;
  timeseries: Timeseries | null;
  loadError: string | null;
  typeFilter: TypeFilter;
  mapMetric: MapMetric;
  selectedCounty: string | null;
  setTypeFilter: (t: TypeFilter) => void;
  setMapMetric: (m: MapMetric) => void;
  setSelectedCounty: (name: string | null) => void;
  loadData: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  snapshot: null,
  timeseries: null,
  loadError: null,
  typeFilter: 'all',
  mapMetric: 'rate',
  selectedCounty: null,
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setMapMetric: (mapMetric) => set({ mapMetric }),
  setSelectedCounty: (selectedCounty) => set({ selectedCounty }),
  loadData: async () => {
    if (get().snapshot) return;
    try {
      const base = import.meta.env.BASE_URL;
      const [snapshot, timeseries] = await Promise.all([
        fetch(`${base}data/latest.json`).then(assertOk<Snapshot>),
        fetch(`${base}data/timeseries.json`).then(assertOk<Timeseries>),
      ]);
      set({ snapshot, timeseries });
    } catch (err) {
      set({ loadError: err instanceof Error ? err.message : String(err) });
    }
  },
}));

async function assertOk<T>(resp: Response): Promise<T> {
  if (!resp.ok) throw new Error(`${resp.url}: HTTP ${resp.status}`);
  return resp.json() as Promise<T>;
}
