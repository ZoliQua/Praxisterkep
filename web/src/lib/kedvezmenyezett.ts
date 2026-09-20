// Beneficiary settlements (data/kedvezmenyezett.json), from the annexes of
// 105/2015. (IV. 23.) Korm. rendelet: which settlements count as
// socio-economically and infrastructurally beneficiary, which are hit by
// significant unemployment, and which are beneficiary for the time being.
import { useEffect, useState } from 'react';
import { t } from './i18n';

export interface BenefitEntry {
  /** settlement name as the decree spells it */
  n: string;
  /** county as the decree spells it */
  c: string;
  /** socio-economically and infrastructurally beneficiary */
  s: 0 | 1;
  /** significant unemployment */
  u: 0 | 1;
  /** beneficiary for the time being */
  t: 0 | 1;
}

export interface BenefitRaw {
  schemaVersion: number;
  source: string;
  sourceUrl: string;
  fetched: string;
  counts: { socio: number; unemployment: number; temporary: number; settlements: number };
  settlements: Record<string, BenefitEntry>;
}

let cache: BenefitRaw | null = null;
let pending: Promise<BenefitRaw | null> | null = null;

export function loadBenefit(): Promise<BenefitRaw | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch(`${import.meta.env.BASE_URL}data/kedvezmenyezett.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: BenefitRaw | null) => { cache = d; return d; })
    .catch(() => null);
  return pending;
}

export function useBenefit(): BenefitRaw | null {
  const [data, setData] = useState<BenefitRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadBenefit().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function countyKey(county: string): string {
  return normalize(county.replace(/\s*(megye|vármegye)\s*$/i, ''));
}

/** the decree's entry for a settlement, or null when it is not listed */
export function benefitOf(
  data: BenefitRaw | null, settlement: string, county: string,
): BenefitEntry | null {
  if (!data) return null;
  return data.settlements[`${countyKey(county)}|${normalize(settlement)}`] ?? null;
}

/** "társadalmi-gazdasági · munkanélküliség", or an empty string */
export function benefitLabel(entry: BenefitEntry | null): string {
  if (!entry) return '';
  const parts: string[] = [];
  if (entry.s) parts.push(t('benefit.socio'));
  if (entry.u) parts.push(t('benefit.unemployment'));
  if (entry.t) parts.push(t('benefit.temporary'));
  return parts.join(' · ');
}
