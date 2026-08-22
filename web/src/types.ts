// Mirrors the JSON contract produced by etl/build.py (schemaVersion 1).

export type PraxisKind = 'dental' | 'gp';
export type PraxisType = 'adult' | 'child' | 'mixed' | 'school';
export type PraxisStatus = 'filled' | 'vacant' | 'vacant_longterm' | 'dissolved';

export interface Site {
  postalCode: string;
  settlement: string;
  address: string;
  district: string;
  isHeadquarters: boolean;
  lat?: number;
  lon?: number;
  geoApprox?: boolean;
}

export interface Praxis {
  id: string;
  kind: PraxisKind;
  type: PraxisType;
  status: PraxisStatus;
  county: string;
  countyCode: string;
  sites: Site[];
  servedSettlements?: string[];
  vacantSince: string; // YYYY-MM
  population: number | null;
}

export interface TypeCount {
  total: number;
  vacant: number;
}

export interface CountyAggregate {
  name: string;
  total: number;
  vacant: number;
  dissolved: number;
  populationVacant: number;
  populationDissolved: number;
  vacancyRate: number;
  byType: Record<string, TypeCount>;
}

export interface NationalAggregate {
  totalDistricts: number;
  vacant: number;
  dissolved: number;
  vacancyRate: number;
  populationVacant: number;
  populationDissolved: number;
  byType: Record<string, TypeCount>;
}

export interface SettlementEntry {
  name: string;
  county: string;
  filled: number;
  vacantPraxisIds: string[];
  dissolvedPraxisIds: string[];
  affectedByDissolved: boolean;
}

export interface Snapshot {
  schemaVersion: number;
  kind: PraxisKind;
  month: string;
  disclaimer: string;
  sources: string[];
  national: NationalAggregate;
  counties: CountyAggregate[];
  praxes: Praxis[];
  settlements: SettlementEntry[];
}

export interface TimeseriesMonth {
  month: string;
  totalDistricts: number;
  vacant: number;
  dissolved: number;
  populationVacant: number;
  populationDissolved: number;
  byCounty: Record<string, { vacant: number; dissolved: number }>;
}

export interface Timeseries {
  kind: PraxisKind;
  months: TimeseriesMonth[];
}
