// Pure table logic for the EESZT data browser: flat rows, column schemas,
// per-column filters, sorting and CSV/TSV serialization. Generic over the
// row shape so the matched table and the unmatched-reasons table share one
// engine. No React here — unit-tested in eesztTable.test.ts.
import { t } from './i18n';
import { primarySite } from './selectors';
import { eesztPraxis, takesOnCall, type EesztRaw } from './eeszt';
import type { Snapshot } from '../types';

export type ColType = 'text' | 'enum' | 'bool' | 'number';
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

export interface ColDef {
  key: string;
  labelKey: string;
  type: ColType;
  visible: boolean;
}

/* ---------------- matched table ---------------- */

export type EesztRow = {
  fin: string;
  settlement: string;
  county: string;
  type: string;
  status: string;
  doctor: string | null;
  neakCode: string | null;
  eesztState: string;
  districtNo: string | null;
  licPostal: string | null;
  licSettlement: string | null;
  licAddress: string | null;
  settlementMatch: boolean | null;
  providerMatch: boolean | null;
  onCall: string | null;
  onCallDuty: boolean | null;
  publicFunded: boolean | null;
  profession: string | null;
  provider: string | null;
  institutionCode: string | null;
  sharedUnit: boolean | null;
  licenceCount: number | null;
  geoApprox: boolean | null;
  lat: number | null;
  lon: number | null;
  unitCode: string | null;
  licenceId: string | null;
  providerId: string | null;
};

export const COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: false },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'type', labelKey: 'stats.thType', type: 'enum', visible: true },
  { key: 'status', labelKey: 'stats.thStatus', type: 'enum', visible: true },
  { key: 'doctor', labelKey: 'eeszt.colDoctor', type: 'text', visible: true },
  { key: 'neakCode', labelKey: 'eeszt.colNeakCode', type: 'text', visible: true },
  { key: 'eesztState', labelKey: 'eeszt.colState', type: 'enum', visible: false },
  { key: 'districtNo', labelKey: 'eeszt.thDistrictNo', type: 'text', visible: true },
  { key: 'licPostal', labelKey: 'eeszt.colPostal', type: 'text', visible: false },
  { key: 'licSettlement', labelKey: 'eeszt.colLicSettlement', type: 'text', visible: true },
  { key: 'licAddress', labelKey: 'eeszt.colLicAddress', type: 'text', visible: true },
  { key: 'settlementMatch', labelKey: 'eeszt.colSettlementMatch', type: 'bool', visible: true },
  { key: 'providerMatch', labelKey: 'eeszt.colProviderMatch', type: 'bool', visible: false },
  { key: 'onCall', labelKey: 'eeszt.onCall', type: 'enum', visible: true },
  { key: 'onCallDuty', labelKey: 'eeszt.colOnCallDuty', type: 'bool', visible: false },
  { key: 'publicFunded', labelKey: 'eeszt.thFunded', type: 'bool', visible: true },
  { key: 'profession', labelKey: 'eeszt.colProfession', type: 'enum', visible: false },
  { key: 'provider', labelKey: 'eeszt.provider', type: 'text', visible: true },
  { key: 'institutionCode', labelKey: 'eeszt.institutionCode', type: 'text', visible: false },
  { key: 'sharedUnit', labelKey: 'eeszt.colSharedUnit', type: 'bool', visible: false },
  { key: 'licenceCount', labelKey: 'eeszt.colLicenceCount', type: 'number', visible: false },
  { key: 'geoApprox', labelKey: 'eeszt.colGeoApprox', type: 'bool', visible: false },
  { key: 'unitCode', labelKey: 'eeszt.colUnit', type: 'text', visible: false },
  { key: 'licenceId', labelKey: 'eeszt.colLicenceId', type: 'text', visible: false },
  { key: 'providerId', labelKey: 'eeszt.colProviderId', type: 'text', visible: false },
];

// type alias (not interface) so rows stay assignable to Record<string, Cell>
type BaseRow = {
  fin: string;
  settlement: string;
  county: string;
  type: string;
  status: string;
  /** NEAK registry fields — filled praxes only (CLAUDE.md rule 3) */
  doctor: string | null;
  neakCode: string | null;
};

function baseRows(snapshot: Snapshot): BaseRow[] {
  const statusLabel = (s: string) => (s === 'filled' ? t('stats.statusFilled')
    : s === 'dissolved' ? t('stats.statusDissolved') : t('stats.statusVacant'));
  return [
    ...snapshot.praxes.map((p) => ({
      fin: p.id,
      settlement: primarySite(p)?.settlement ?? '',
      county: p.county,
      type: t(`praxisTypes.${p.type}`),
      status: statusLabel(p.status),
      doctor: null,
      neakCode: null,
    })),
    ...snapshot.filledPraxes.map((f) => ({
      fin: f.id,
      settlement: f.settlement,
      county: f.county,
      type: t(`praxisTypes.${f.type}`),
      status: statusLabel('filled'),
      doctor: f.doctor ?? null,
      neakCode: f.neakCode ?? null,
    })),
  ];
}

export function buildRows(snapshot: Snapshot, data: EesztRaw | null): EesztRow[] {
  return baseRows(snapshot).map((b) => {
    const e = eesztPraxis(data, b.fin);
    const lic = e?.licence;
    return {
      ...b,
      eesztState: lic ? t('eeszt.stateLicence') : t('eeszt.noLicence'),
      districtNo: e?.districtNo ?? null,
      licPostal: lic?.postalCode || null,
      licSettlement: lic?.settlement || null,
      licAddress: lic?.address || null,
      settlementMatch: lic ? lic.settlementMatch : null,
      providerMatch: lic ? lic.providerMatch : null,
      onCall: lic?.onCall || null,
      onCallDuty: lic ? takesOnCall(lic.onCall) : null,
      publicFunded: lic ? lic.publicFunded : null,
      profession: lic?.profession ?? null,
      // provider/institution exist only for filled districts (ETL guard)
      provider: e?.provider ?? null,
      institutionCode: e?.institutionCode ?? null,
      sharedUnit: lic ? lic.sharedUnit : null,
      licenceCount: lic ? lic.licenceCount : null,
      geoApprox: e?.geo ? e.geo.approx : null,
      lat: e?.geo?.lat ?? null,
      lon: e?.geo?.lon ?? null,
      unitCode: e?.trace?.units.join(', ') || null,
      licenceId: e?.trace?.licenceId || null,
      providerId: e?.trace?.providerId || null,
    };
  });
}

/* ---------------- unmatched table ---------------- */

export type UnmatchedRow = BaseRow & { reason: string; detail: string };

export const UNMATCHED_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'type', labelKey: 'stats.thType', type: 'enum', visible: true },
  { key: 'status', labelKey: 'stats.thStatus', type: 'enum', visible: true },
  { key: 'reason', labelKey: 'eeszt.colReason', type: 'enum', visible: true },
  { key: 'detail', labelKey: 'eeszt.colReasonDetail', type: 'text', visible: true },
];

export function reasonDetail(code: string, detail: string): string {
  switch (code) {
    case 'ambiguous': {
      const [units, places] = detail.split('|');
      return t('eeszt.why.ambiguous', { units, places });
    }
    case 'otherProfession':
      return t('eeszt.why.otherProfession', { professions: detail });
    case 'noUnitLicence':
      return t('eeszt.why.noUnitLicence', { units: detail });
    case 'otherTip':
      return t('eeszt.why.otherTip', { tips: detail });
    default:
      return t('eeszt.why.noFin');
  }
}

export function buildUnmatchedRows(snapshot: Snapshot, data: EesztRaw | null): UnmatchedRow[] {
  const unmatched = data?.unmatched ?? {};
  return baseRows(snapshot)
    .filter((b) => b.fin in unmatched)
    .map((b) => {
      const [, code, detail] = unmatched[b.fin];
      return { ...b, reason: t(`eeszt.reason.${code}`), detail: reasonDetail(code, detail) };
    });
}

/* ---------------- engine ---------------- */

/** filter value encodings: text = substring; enum = exact; bool = 'true' |
 *  'false' | 'null'; number = '>5', '<=2', '=3' or a bare number */
export type Filters = Record<string, string>;

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function matchNumber(v: Cell, f: string): boolean {
  const m = f.trim().match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return true; // incomplete input filters nothing
  if (typeof v !== 'number') return false;
  const n = Number(m[2].replace(',', '.'));
  switch (m[1] ?? '=') {
    case '>': return v > n;
    case '<': return v < n;
    case '>=': return v >= n;
    case '<=': return v <= n;
    default: return v === n;
  }
}

export function filterRows<R extends Row>(
  rows: R[], cols: ColDef[], filters: Filters, global = '',
): R[] {
  const active = cols.filter((c) => (filters[c.key] ?? '') !== '');
  const g = fold(global.trim());
  return rows.filter((r) => {
    for (const c of active) {
      const f = filters[c.key];
      const v = r[c.key];
      if (c.type === 'text') {
        if (v === null || !fold(String(v)).includes(fold(f))) return false;
      } else if (c.type === 'enum') {
        if ((v ?? '') !== f) return false;
      } else if (c.type === 'bool') {
        if (f === 'null' ? v !== null : String(v) !== f) return false;
      } else if (!matchNumber(v, f)) {
        return false;
      }
    }
    if (g) {
      const hay = cols.map((c) => r[c.key]).filter((v) => typeof v === 'string').join(' ');
      if (!fold(hay).includes(g)) return false;
    }
    return true;
  });
}

const collator = new Intl.Collator('hu', { numeric: true, sensitivity: 'base' });

/** stable sort; empty cells always go last regardless of direction */
export function sortRows<R extends Row>(rows: R[], key: string, dir: 'asc' | 'desc'): R[] {
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const va = a.r[key];
      const vb = b.r[key];
      const ea = va === null || va === '';
      const eb = vb === null || vb === '';
      if (ea && eb) return a.i - b.i;
      if (ea) return 1;
      if (eb) return -1;
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else if (typeof va === 'boolean' && typeof vb === 'boolean') cmp = Number(va) - Number(vb);
      else cmp = collator.compare(String(va), String(vb));
      return cmp !== 0 ? sign * cmp : a.i - b.i;
    })
    .map((x) => x.r);
}

export function distinctValues(rows: Row[], key: string): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (v !== null && v !== '') set.add(String(v));
  }
  return [...set].sort((a, b) => collator.compare(a, b));
}

/** display/export text of a cell (booleans localized, empty = '') */
export function cellText(v: Cell): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? t('eeszt.yes') : t('eeszt.no');
  return String(v);
}

/** RFC 4180 CSV (quoted when needed) or TSV (tabs/newlines flattened) */
export function serialize(rows: Row[], cols: ColDef[], format: 'csv' | 'tsv'): string {
  const esc = format === 'csv'
    ? (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    : (s: string) => s.replace(/[\t\r\n]+/g, ' ');
  const sep = format === 'csv' ? ',' : '\t';
  const lines = [cols.map((c) => esc(t(c.labelKey))).join(sep)];
  for (const r of rows) lines.push(cols.map((c) => esc(cellText(r[c.key]))).join(sep));
  return lines.join('\r\n') + '\r\n';
}

/* ---------------- one reason, row by row ---------------- */

export type ReasonSimpleRow = BaseRow & {
  unitCode: string | null;
  detail: string;
};

export type ReasonLicenceRow = BaseRow & {
  unitCode: string;
  licenceId: string;
  licPostal: string;
  licSettlement: string;
  licAddress: string;
  profession: string;
  publicFunded: boolean;
  onCall: string;
};

export const REASON_SIMPLE_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: true },
  { key: 'type', labelKey: 'stats.thType', type: 'enum', visible: true },
  { key: 'status', labelKey: 'stats.thStatus', type: 'enum', visible: true },
  { key: 'unitCode', labelKey: 'eeszt.colUnit', type: 'text', visible: true },
  { key: 'detail', labelKey: 'eeszt.colReasonDetail', type: 'text', visible: true },
];

export const REASON_LICENCE_COLUMNS: ColDef[] = [
  { key: 'fin', labelKey: 'eeszt.colFin', type: 'text', visible: true },
  { key: 'settlement', labelKey: 'stats.thSettlement', type: 'text', visible: true },
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum', visible: false },
  { key: 'type', labelKey: 'stats.thType', type: 'enum', visible: false },
  { key: 'status', labelKey: 'stats.thStatus', type: 'enum', visible: true },
  { key: 'unitCode', labelKey: 'eeszt.colUnit', type: 'text', visible: true },
  { key: 'licenceId', labelKey: 'eeszt.colLicenceId', type: 'text', visible: true },
  { key: 'licPostal', labelKey: 'eeszt.colPostal', type: 'text', visible: false },
  { key: 'licSettlement', labelKey: 'eeszt.colLicSettlement', type: 'text', visible: true },
  { key: 'licAddress', labelKey: 'eeszt.colLicAddress', type: 'text', visible: true },
  { key: 'profession', labelKey: 'eeszt.colProfession', type: 'enum', visible: true },
  { key: 'publicFunded', labelKey: 'eeszt.thFunded', type: 'bool', visible: true },
  { key: 'onCall', labelKey: 'eeszt.onCall', type: 'enum', visible: false },
];

/** districts of one reason; "ambiguous" and "otherProfession" are expanded
 *  to one row per licence so the problem itself is readable */
export function buildReasonRows(
  snapshot: Snapshot, data: EesztRaw | null, reason: string,
): { rows: Row[]; columns: ColDef[]; expanded: boolean; districts: number } {
  const unmatched = data?.unmatched ?? {};
  const details = data?.unmatchedDetails ?? {};
  const base = baseRows(snapshot).filter((b) => unmatched[b.fin]?.[1] === reason);
  const expanded = reason === 'ambiguous' || reason === 'otherProfession';
  if (!expanded) {
    const rows: ReasonSimpleRow[] = base.map((b) => {
      const [, code, detail] = unmatched[b.fin];
      return {
        ...b,
        unitCode: eesztPraxis(data, b.fin)?.trace?.units.join(', ') || null,
        detail: reasonDetail(code, detail),
      };
    });
    return { rows, columns: REASON_SIMPLE_COLUMNS, expanded, districts: base.length };
  }
  const rows: ReasonLicenceRow[] = [];
  for (const b of base) {
    for (const d of details[b.fin] ?? []) {
      rows.push({
        ...b,
        licenceId: d[0],
        unitCode: d[1],
        licPostal: d[2],
        licSettlement: d[3],
        licAddress: d[4],
        profession: data?.professions[d[5]] ?? d[5],
        publicFunded: d[6] === 1,
        onCall: data?.onCall[d[7]] ?? '',
      });
    }
  }
  return { rows, columns: REASON_LICENCE_COLUMNS, expanded, districts: base.length };
}
