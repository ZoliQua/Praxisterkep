// Care deserts (data/clusters.json): the high-index settlements that form one
// contiguous area, so the map can say "this is a region" rather than listing
// forty villages one by one.
import { useEffect, useState } from 'react';
import type { ColDef, Row } from './eesztTable';

export interface ClusterMember {
  kshId: string;
  settlement: string;
  county: string;
  population: number;
  index: number;
  band: string;
}

export interface Cluster {
  id: number;
  name: string;
  core: string;
  county: string;
  counties: string[];
  settlements: number;
  population: number;
  meanIndex: number;
  maxIndex: number;
  spreadKm: number;
  meanGpKm: number | null;
  meanInpatientKm: number | null;
  meanOldShare: number | null;
  lat: number;
  lon: number;
  kshIds: string[];
  members: ClusterMember[];
}

export interface ClustersRaw {
  schemaVersion: number;
  dataMonth: string;
  neighbourKm: number;
  minSettlements: number;
  bands: string[];
  stats: {
    candidates: number; clusters: number; settlementsInClusters: number;
    populationInClusters: number; isolated: number; isolatedPopulation: number;
    largest: number;
  };
  counties: { county: string; settlements: number; population: number; clusters: number }[];
  clusters: Cluster[];
}

let cache: ClustersRaw | null = null;
let pending: Promise<ClustersRaw | null> | null = null;

export function useClusters(): ClustersRaw | null {
  const [data, setData] = useState<ClustersRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/clusters.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ClustersRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const CLUSTER_COLUMNS: ColDef[] = [
  { key: 'name', labelKey: 'clusters.colName', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'settlements', labelKey: 'vedono.colSettlements', type: 'number', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'meanIndex', labelKey: 'composite.colMeanIndex', type: 'number', visible: true },
  { key: 'spreadKm', labelKey: 'clusters.colSpread', type: 'number', visible: true },
  { key: 'meanGpKm', labelKey: 'composite.colGpKm', type: 'number', visible: true },
  { key: 'meanInpatientKm', labelKey: 'composite.colInpKm', type: 'number', visible: false },
  { key: 'oldSharePct', labelKey: 'coverage.colOldShare', type: 'number', visible: true },
  { key: 'core', labelKey: 'clusters.colCore', type: 'text', visible: false },
];

export const MEMBER_COLUMNS: ColDef[] = [
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'cluster', labelKey: 'clusters.colName', type: 'enum', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'index', labelKey: 'composite.colIndex', type: 'number', visible: true },
];

export function clusterRows(data: ClustersRaw | null): Row[] {
  return (data?.clusters ?? []).map((c) => ({
    ...c,
    counties: c.counties.join(', '),
    kshIds: c.kshIds.length,
    members: c.members.length,
    oldSharePct: c.meanOldShare === null ? null : Math.round(c.meanOldShare * 1000) / 10,
    // the map needs these
    type: 'cluster',
    fin: String(c.id),
    status: '',
    settlement: c.name,
  }));
}

export function memberRows(data: ClustersRaw | null): Row[] {
  return (data?.clusters ?? []).flatMap((c) => c.members.map((m) => ({
    ...m, cluster: c.name,
  })));
}
