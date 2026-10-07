// Contracted pharmacies (data/pharmacy.json). NEAK's own list of the
// pharmacies it has a dispensing contract with — the statutory register
// behind OGYÉI's finder is richer but its robots.txt and copyright notice
// both forbid automated processing, so this is the source the pipeline uses
// and the limits travel with it.
import { useEffect, useState } from 'react';
import type { ColDef, Row } from './eesztTable';

export interface Pharmacy {
  name: string;
  operator: string;
  postalCode: string;
  settlement: string;
  address: string;
  lat: number | null;
  lon: number | null;
  geoApprox: boolean | null;
}

export interface PharmacyRaw {
  schemaVersion: number;
  dataMonth: string;
  source: string;
  stats: {
    pharmacies: number; settlements: number; settlementsTotal: number;
    geocoded: number; population: number; residentsPerPharmacy: number;
  };
  counties: { county: string; pharmacies: number; population: number;
    residentsPerPharmacy: number }[];
  settlements: { settlement: string; county: string; district: string;
    population: number; pharmacies: number }[];
  pharmacies: Pharmacy[];
}

let cache: PharmacyRaw | null = null;
let pending: Promise<PharmacyRaw | null> | null = null;

export function usePharmacy(): PharmacyRaw | null {
  const [data, setData] = useState<PharmacyRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    pending ??= fetch(`${import.meta.env.BASE_URL}data/pharmacy.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PharmacyRaw | null) => { cache = d; return d; })
      .catch(() => null);
    void pending.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const PHARMACY_COLUMNS: ColDef[] = [
  { key: 'name', labelKey: 'pharmacy.colName', type: 'text', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true, link: 'settlement' },
  { key: 'postalCode', labelKey: 'pharmacy.colPostal', type: 'text', visible: false },
  { key: 'address', labelKey: 'eeszt.colAddress', type: 'text', visible: true },
  { key: 'operator', labelKey: 'pharmacy.colOperator', type: 'text', visible: false },
  { key: 'geoApprox', labelKey: 'eeszt.colApprox', type: 'bool', visible: false },
];

export const PHARMACY_COUNTY_COLUMNS: ColDef[] = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'pharmacies', labelKey: 'pharmacy.colCount', type: 'number', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'residentsPerPharmacy', labelKey: 'pharmacy.colPer', type: 'number', visible: true },
];

export const PHARMACY_SETTLEMENT_COLUMNS: ColDef[] = [
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true, link: 'settlement' },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'population', labelKey: 'access.colPopulation', type: 'number', visible: true },
  { key: 'pharmacies', labelKey: 'pharmacy.colCount', type: 'number', visible: true },
];

export function pharmacyRows(data: PharmacyRaw | null): Row[] {
  return (data?.pharmacies ?? []).map((p) => ({
    ...p,
    // the map colours by `type` and wants the district field names
    type: 'pharmacy',
    fin: `${p.postalCode} ${p.settlement}`,
    status: '',
  } as Row));
}

export function pharmacyCountyRows(data: PharmacyRaw | null): Row[] {
  return (data?.counties ?? []).map((c) => ({ ...c } as Row));
}

export function withoutPharmacy(data: PharmacyRaw | null): Row[] {
  return (data?.settlements ?? [])
    .filter((s) => s.pharmacies === 0)
    .map((s) => ({ ...s } as Row));
}
