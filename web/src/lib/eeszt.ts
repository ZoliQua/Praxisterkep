// EESZT supplement (source H): public master data from the EESZT
// törzspublikáció, joined to NEAK districts by FIN code in the ETL
// (etl/build_eeszt.py). Loaded lazily — the core map never waits for it.
import { useEffect, useState } from 'react';

export interface EesztRaw {
  schemaVersion: number;
  asOf: string;
  dataMonth: string;
  stats: Record<string, Record<string, number>>;
  professions: Record<string, string>;
  onCall: string[];
  /** FIN -> { k: 'd'|'g', d?: district no, p?/i?: provider + institution (filled only), l?: licence } */
  praxes: Record<string, {
    k: 'd' | 'g';
    d?: string;
    p?: string;
    i?: string;
    l?: [string, string, string, string, number, number, number];
  }>;
  /** FIN -> [kind initial, reason code, detail] for districts with no usable licence */
  unmatched?: Record<string, ['d' | 'g', string, string]>;
  /** our settlement name -> [kind, postal, address, professionCode, publicFunded, onCallIdx][] */
  settlements: Record<string, ['d' | 'g', string, string, string, number, number][]>;
}

export interface EesztLicence {
  postalCode: string;
  settlement: string;
  address: string;
  profession: string;
  onCall: string;
  settlementMatch: boolean;
  providerMatch: boolean;
  publicFunded: boolean;
  sharedUnit: boolean;
  licenceCount: number;
}

export interface EesztPraxis {
  districtNo?: string;
  provider?: string;
  institutionCode?: string;
  licence?: EesztLicence;
}

export interface EesztSettlementLicence {
  kind: 'dental' | 'gp';
  postalCode: string;
  address: string;
  profession: string;
  publicFunded: boolean;
  onCall: string;
}

let cache: EesztRaw | null = null;
let promise: Promise<EesztRaw | null> | null = null;

export function loadEeszt(): Promise<EesztRaw | null> {
  promise ??= fetch(`${import.meta.env.BASE_URL}data/eeszt.json`)
    .then((r) => (r.ok ? (r.json() as Promise<EesztRaw>) : null))
    .then((d) => {
      cache = d;
      return d;
    })
    .catch(() => null); // the supplement is optional
  return promise;
}

/** synchronous access once loaded (for HTML popups built outside React) */
export function eesztNow(): EesztRaw | null {
  return cache;
}

export function useEeszt(): EesztRaw | null {
  const [data, setData] = useState<EesztRaw | null>(cache);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    void loadEeszt().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

export function eesztPraxis(data: EesztRaw | null, fin: string): EesztPraxis | null {
  const e = data?.praxes[fin];
  if (!data || !e) return null;
  const out: EesztPraxis = {};
  if (e.d) out.districtNo = e.d;
  if (e.p) out.provider = e.p;
  if (e.i) out.institutionCode = e.i;
  if (e.l) {
    const [postalCode, settlement, address, prof, onCallIdx, flags, licenceCount] = e.l;
    out.licence = {
      postalCode,
      settlement,
      address,
      profession: data.professions[prof] ?? prof,
      onCall: data.onCall[onCallIdx] ?? '',
      settlementMatch: (flags & 1) !== 0,
      providerMatch: (flags & 2) !== 0,
      publicFunded: (flags & 4) !== 0,
      sharedUnit: (flags & 8) !== 0,
      licenceCount,
    };
  }
  return out;
}

export function eesztSettlement(
  data: EesztRaw | null, settlement: string, kind: 'dental' | 'gp',
): EesztSettlementLicence[] {
  const rows = data?.settlements[settlement] ?? [];
  const k = kind === 'gp' ? 'g' : 'd';
  return rows
    .filter((r) => r[0] === k)
    .map((r) => ({
      kind,
      postalCode: r[1],
      address: r[2],
      profession: data!.professions[r[3]] ?? r[3],
      publicFunded: r[4] === 1,
      onCall: data!.onCall[r[5]] ?? '',
    }));
}

/** 'nem vesz részt' variants read as "no on-call duty" */
export function takesOnCall(onCall: string): boolean {
  return !!onCall && !/^nem vesz részt/i.test(onCall);
}
