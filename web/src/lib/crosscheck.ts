// The cross-check (data/crosscheck.json): for every NEAK record the code
// chain could not pair with EESZT, what the premises address and the provider
// name suggest — plus the other direction, services EESZT finances that the
// published NEAK lists do not contain. Every row carries its own explanation.
import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { ColDef, Row } from './eesztTable';

export type Verdict =
  | 'otherUnitSameProfession' | 'ownUnitSameProfession' | 'otherProfessionAtAddress'
  | 'streetSameProfession' | 'providerName' | 'none';

export interface Candidate {
  unit: string;
  licenceId: string;
  profession: string;
  settlement: string;
  address: string;
  publicFunded: boolean;
  match: 'address' | 'street' | 'provider';
  otherUnit: boolean;
  nameOverlap?: number;
}

export interface OwnLicence extends Candidate {
  atNeakSite: boolean;
}

export interface CrosscheckRecord {
  id: string;
  source: string;           // district-dental | district-gp | service-<group>
  family: 'dental' | 'gp';
  reason: string;
  named: boolean;
  settlement: string;
  county: string;
  address: string;
  units: string;
  verdict: Verdict;
  candidates: Candidate[];
  candidateCount: number;
  settlementLicences: number;
  provider?: string;
  /** only on the manual-review records: every licence of its own units */
  ownLicences?: OwnLicence[];
  suggestion?: string;
}

export interface EesztOnlyRow {
  fin: string;
  tip: string;
  county: string;
  unit: string;
  institution: string;
  settlement: string;
  address: string;
  profession: string;
  licenceId: string;
  /** where the code shows up in the archived NEAK snapshots, if at all */
  neakFirstMonth?: string;
  neakLastMonth?: string;
  neakMonths?: number;
  neakLastStatus?: string;
  neakSettlement?: string;
}

export interface CrosscheckRaw {
  schemaVersion: number;
  asOf: string;
  dataMonth: string;
  professions: Record<string, string>;
  verdicts: Verdict[];
  stats: Record<string, Record<string, number>>;
  archive: { from: string; to: string; months: number };
  records: CrosscheckRecord[];
  eesztOnly: EesztOnlyRow[];
}

let cache: CrosscheckRaw | null = null;
let pending: Promise<CrosscheckRaw | null> | null = null;

export function loadCrosscheck(): Promise<CrosscheckRaw | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch(`${import.meta.env.BASE_URL}data/crosscheck.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: CrosscheckRaw | null) => { cache = d; return d; })
    .catch(() => null);
  return pending;
}

export function useCrosscheck(): CrosscheckRaw | null {
  const [data, setData] = useState<CrosscheckRaw | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadCrosscheck().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

/* ---------------- rows ---------------- */

const SOURCE_LABEL: Record<string, string> = {
  'district-dental': 'crosscheck.srcDentalDistrict',
  'district-gp': 'crosscheck.srcGpDistrict',
  'service-oncall': 'extra.oncallTitle',
  'service-university': 'extra.universityTitle',
  'service-specialist': 'extra.specialistTitle',
};

export function sourceLabel(source: string): string {
  return t(SOURCE_LABEL[source] ?? source);
}

function profession(data: CrosscheckRaw, code: string): string {
  return data.professions[code] ?? code;
}

/** the sentence that says what was compared and what agreed */
export function explain(data: CrosscheckRaw, rec: CrosscheckRecord): string {
  const best = rec.candidates[0];
  const place = best ? `${best.settlement}, ${best.address}` : '';
  switch (rec.verdict) {
    case 'otherUnitSameProfession':
      return t('crosscheck.why.otherUnit', {
        profession: profession(data, best.profession),
        unit: best.unit,
        own: rec.units || t('crosscheck.noUnit'),
        place,
      });
    case 'ownUnitSameProfession':
      return t('crosscheck.why.ownUnit', {
        profession: profession(data, best.profession),
        unit: best.unit,
        reason: t(`eeszt.reason.${rec.reason}`),
      });
    case 'otherProfessionAtAddress':
      return t('crosscheck.why.otherProfession', {
        professions: [...new Set(rec.candidates.map((c) => profession(data, c.profession)))]
          .slice(0, 3).join(', '),
        family: t(`kinds.${rec.family}.adj`),
      });
    case 'streetSameProfession':
      return t('crosscheck.why.street', {
        profession: profession(data, best.profession),
        place,
      });
    case 'providerName':
      return t('crosscheck.why.provider', {
        profession: profession(data, best.profession),
        unit: best.unit,
        overlap: best.nameOverlap ? `${Math.round(best.nameOverlap * 100)}%` : '–',
      });
    default:
      return rec.settlementLicences > 0
        ? t('crosscheck.why.noneInSettlement', { n: rec.settlementLicences })
        : t('crosscheck.why.noneAtAll');
  }
}

export type CrosscheckRow = Row & { fin: string; verdict: string };

export const CROSSCHECK_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'crosscheck.colCode', type: 'text', visible: true },
  { key: 'source', labelKey: 'crosscheck.colSource', type: 'enum', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: false },
  { key: 'address', labelKey: 'crosscheck.colNeakAddress', type: 'text', visible: true },
  { key: 'reason', labelKey: 'crosscheck.colReason', type: 'enum', visible: true },
  { key: 'verdict', labelKey: 'crosscheck.colVerdict', type: 'enum', visible: true },
  { key: 'unitCode', labelKey: 'crosscheck.colSuggestedUnit', type: 'text', visible: true },
  { key: 'licenceId', labelKey: 'eeszt.colLicenceId', type: 'text', visible: false },
  { key: 'licSettlement', labelKey: 'eeszt.colLicSettlement', type: 'text', visible: false },
  { key: 'licAddress', labelKey: 'crosscheck.colLicAddress', type: 'text', visible: true },
  { key: 'profession', labelKey: 'eeszt.colProfession', type: 'enum', visible: true },
  { key: 'basis', labelKey: 'crosscheck.colBasis', type: 'enum', visible: true },
  { key: 'ownUnits', labelKey: 'crosscheck.colOwnUnit', type: 'text', visible: false },
  { key: 'moreCandidates', labelKey: 'crosscheck.colMore', type: 'number', visible: false },
  { key: 'settlementLicences', labelKey: 'crosscheck.colSettlementLicences', type: 'number', visible: false },
  { key: 'provider', labelKey: 'eeszt.provider', type: 'text', visible: false },
  { key: 'explanation', labelKey: 'crosscheck.colExplanation', type: 'text', visible: true },
];

function rowOf(data: CrosscheckRaw, rec: CrosscheckRecord): CrosscheckRow {
  const best = rec.candidates[0];
  return {
    fin: rec.id,
    source: sourceLabel(rec.source),
    settlement: rec.settlement,
    county: rec.county,
    address: rec.address,
    reason: t(`eeszt.reason.${rec.reason}`),
    verdict: t(`crosscheck.verdict.${rec.verdict}`),
    unitCode: best?.unit ?? null,
    licenceId: best?.licenceId ?? null,
    licSettlement: best?.settlement ?? null,
    licAddress: best?.address ?? null,
    profession: best ? profession(data, best.profession) : null,
    basis: best ? t(`crosscheck.basis.${best.match}`) : null,
    ownUnits: rec.units || null,
    moreCandidates: Math.max(0, rec.candidateCount - 1),
    settlementLicences: rec.settlementLicences,
    provider: rec.provider ?? null,
    explanation: explain(data, rec),
  };
}

/** the records of one branch: dental covers its services too */
export function crosscheckRows(
  data: CrosscheckRaw | null, family: 'dental' | 'gp', verdict?: string,
): CrosscheckRow[] {
  if (!data) return [];
  return data.records
    .filter((r) => r.family === family && (!verdict || r.verdict === verdict))
    .map((r) => rowOf(data, r));
}

/* ---------------- every candidate, row by row ---------------- */

export const CANDIDATE_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'crosscheck.colCode', type: 'text', visible: true },
  { key: 'source', labelKey: 'crosscheck.colSource', type: 'enum', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'address', labelKey: 'crosscheck.colNeakAddress', type: 'text', visible: true },
  { key: 'unitCode', labelKey: 'crosscheck.colSuggestedUnit', type: 'text', visible: true },
  { key: 'licenceId', labelKey: 'eeszt.colLicenceId', type: 'text', visible: true },
  { key: 'licAddress', labelKey: 'crosscheck.colLicAddress', type: 'text', visible: true },
  { key: 'profession', labelKey: 'eeszt.colProfession', type: 'enum', visible: true },
  { key: 'basis', labelKey: 'crosscheck.colBasis', type: 'enum', visible: true },
  { key: 'otherUnit', labelKey: 'crosscheck.colOtherUnit', type: 'bool', visible: true },
  { key: 'publicFunded', labelKey: 'eeszt.thFunded', type: 'bool', visible: true },
];

export function candidateRows(
  data: CrosscheckRaw | null, family: 'dental' | 'gp', verdict: string,
): Row[] {
  if (!data) return [];
  const out: Row[] = [];
  for (const rec of data.records) {
    if (rec.family !== family || rec.verdict !== verdict) continue;
    for (const c of rec.candidates) {
      out.push({
        fin: rec.id,
        source: sourceLabel(rec.source),
        settlement: rec.settlement,
        address: rec.address,
        unitCode: c.unit,
        licenceId: c.licenceId,
        licAddress: `${c.settlement}, ${c.address}`,
        profession: profession(data, c.profession),
        basis: t(`crosscheck.basis.${c.match}`),
        otherUnit: c.otherUnit,
        publicFunded: c.publicFunded,
      });
    }
  }
  return out;
}

/* ---------------- financed in EESZT, missing from NEAK ---------------- */

export const EESZT_ONLY_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'tip', labelKey: 'crosscheck.colTip', type: 'enum', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'settlement', labelKey: 'eeszt.colLicSettlement', type: 'text', visible: true },
  { key: 'address', labelKey: 'crosscheck.colLicAddress', type: 'text', visible: true },
  { key: 'profession', labelKey: 'eeszt.colProfession', type: 'enum', visible: true },
  { key: 'unitCode', labelKey: 'eeszt.colUnit', type: 'text', visible: true },
  { key: 'licenceId', labelKey: 'eeszt.colLicenceId', type: 'text', visible: false },
  { key: 'institution', labelKey: 'eeszt.institutionCode', type: 'text', visible: false },
  { key: 'inNeakArchive', labelKey: 'crosscheck.colInArchive', type: 'bool', visible: true },
  { key: 'neakLastMonth', labelKey: 'crosscheck.colLastMonth', type: 'text', visible: true },
  { key: 'neakLastStatus', labelKey: 'crosscheck.colLastStatus', type: 'enum', visible: true },
  { key: 'neakSettlement', labelKey: 'crosscheck.colArchiveSettlement', type: 'text', visible: false },
  { key: 'neakMonths', labelKey: 'crosscheck.colArchiveMonths', type: 'number', visible: false },
  { key: 'history', labelKey: 'crosscheck.colHistory', type: 'text', visible: true },
];

export function eesztOnlyRows(data: CrosscheckRaw | null, family: 'dental' | 'gp'): Row[] {
  if (!data) return [];
  const tip = family === 'dental' ? 'FOG' : 'HSZ';
  return data.eesztOnly.filter((r) => r.tip === tip).map((r) => ({
    fin: r.fin,
    tip: t(`crosscheck.tip.${r.tip}`),
    county: r.county,
    settlement: r.settlement || null,
    address: r.address || null,
    profession: r.profession ? profession(data, r.profession) : null,
    unitCode: r.unit || null,
    licenceId: r.licenceId || null,
    institution: r.institution || null,
    inNeakArchive: Boolean(r.neakLastMonth),
    neakLastMonth: r.neakLastMonth ?? null,
    neakLastStatus: r.neakLastStatus ? t(`crosscheck.status.${r.neakLastStatus}`) : null,
    neakSettlement: r.neakSettlement ?? null,
    neakMonths: r.neakMonths ?? null,
    history: historyText(data, r),
  }));
}

/** verdict counts of one branch, strongest first */
export function verdictBreakdown(
  data: CrosscheckRaw | null, family: 'dental' | 'gp',
): { verdict: Verdict; n: number }[] {
  if (!data) return [];
  const counts = new Map<Verdict, number>();
  for (const r of data.records) {
    if (r.family !== family) continue;
    counts.set(r.verdict, (counts.get(r.verdict) ?? 0) + 1);
  }
  return data.verdicts
    .filter((v) => counts.has(v))
    .map((v) => ({ verdict: v, n: counts.get(v) ?? 0 }));
}

/* ---------------- the records that need a human decision ---------------- */

export const MANUAL_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'crosscheck.colCode', type: 'text', visible: true },
  { key: 'source', labelKey: 'crosscheck.colSource', type: 'enum', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: false },
  { key: 'address', labelKey: 'crosscheck.colNeakAddress', type: 'text', visible: true },
  { key: 'units', labelKey: 'crosscheck.colOwnUnit', type: 'text', visible: true },
  { key: 'licenceCount', labelKey: 'crosscheck.colLicenceCount', type: 'number', visible: true },
  { key: 'why', labelKey: 'crosscheck.colWhy', type: 'text', visible: true },
  { key: 'licenceId', labelKey: 'crosscheck.colSuggestedLicence', type: 'text', visible: true },
  { key: 'unitCode', labelKey: 'crosscheck.colSuggestedUnit', type: 'text', visible: true },
  { key: 'otherSites', labelKey: 'crosscheck.colOtherSites', type: 'text', visible: true },
  { key: 'suggestion', labelKey: 'crosscheck.colSuggestion', type: 'text', visible: true },
];

/** the records where the automation had a licence of its own unit in hand but
 *  refused to choose — one row each, with what to decide */
export function manualReviewRows(
  data: CrosscheckRaw | null, family: 'dental' | 'gp',
): Row[] {
  if (!data) return [];
  return data.records
    .filter((r) => r.family === family && r.verdict === 'ownUnitSameProfession')
    .map((rec) => {
      const own = rec.ownLicences ?? [];
      const best = own.find((l) => l.licenceId === rec.suggestion) ?? own.find((l) => l.atNeakSite);
      const others = own.filter((l) => l !== best);
      const places = [...new Set(others.map((l) => `${l.settlement}, ${l.address}`))];
      return {
        fin: rec.id,
        source: sourceLabel(rec.source),
        settlement: rec.settlement,
        county: rec.county,
        address: rec.address,
        units: rec.units,
        licenceCount: own.length,
        why: t('crosscheck.manual.why', {
          units: rec.units.split(',').length,
          places: new Set(own.map((l) => `${l.settlement}|${l.address}`)).size,
        }),
        licenceId: best?.licenceId ?? null,
        unitCode: best?.unit ?? null,
        otherSites: places.join(' · ') || null,
        suggestion: best
          ? t('crosscheck.manual.pick', {
            licence: best.licenceId,
            unit: best.unit,
            profession: profession(data, best.profession),
            address: `${best.settlement}, ${best.address}`,
            n: others.length,
          })
          : t('crosscheck.manual.decide'),
      };
    });
}

/** the sentence about what the NEAK archive knows of an EESZT-only service */
export function historyText(data: CrosscheckRaw, row: EesztOnlyRow): string {
  if (!row.neakLastMonth) {
    // an older cached file may predate the archive block
    return t('crosscheck.history.never', { from: data.archive?.from ?? '2017-10' });
  }
  return t('crosscheck.history.found', {
    months: row.neakMonths ?? 0,
    first: row.neakFirstMonth ?? '',
    last: row.neakLastMonth ?? '',
    status: t(`crosscheck.status.${row.neakLastStatus}`),
    settlement: row.neakSettlement ?? '',
  });
}
