// "EESZT-kiegészítés": how well the public EESZT master data could be
// joined (per branch, fully transparent), a 20-row preview, and two full
// data browsers in modals — every district with its EESZT fields, and the
// districts that could not be matched, each with the reason.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { useEeszt } from '../lib/eeszt';
import {
  COLUMNS, UNMATCHED_COLUMNS, buildRows, buildUnmatchedRows, cellText, sortRows,
  type ColDef, type Row,
} from '../lib/eesztTable';
import { useAppStore, useSnapshot } from '../store/useAppStore';
import { DataTableModal } from './DataTableModal';

const PREVIEW = 20;

function statusBadge(status: string) {
  const cls = status === t('stats.statusFilled') ? 'badge--ok'
    : status === t('stats.statusDissolved') ? 'badge--dissolved' : 'badge--vacant';
  return <span className={`badge ${cls}`}>{status}</span>;
}

function renderCell(col: ColDef, row: Row) {
  if (col.key === 'status') return statusBadge(String(row.status));
  if (col.key === 'settlementMatch' && row.settlementMatch === false) {
    return <em className="eeszt-warn">{t('eeszt.no')}</em>;
  }
  return undefined;
}

function TableIcon({ warn = false }: { warn?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none"
        stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 8h15M8 8v8.5M13 8v8.5" stroke="currentColor" strokeWidth="1.6" />
      {warn && <circle cx="16" cy="4.5" r="3.6" fill="var(--alert-soft)" stroke="var(--bg-raised)" strokeWidth="1.2" />}
    </svg>
  );
}

export function EesztSection() {
  const data = useEeszt();
  const snapshot = useSnapshot()!;
  const kind = useAppStore((s) => s.kind);
  const [openTable, setOpenTable] = useState<'all' | 'unmatched' | null>(null);

  const rows = useMemo(
    () => sortRows(buildRows(snapshot, data), 'settlement', 'asc'),
    [snapshot, data],
  );
  const unmatchedRows = useMemo(
    () => sortRows(buildUnmatchedRows(snapshot, data), 'settlement', 'asc'),
    [snapshot, data],
  );

  if (!data) return null;
  const st = data.stats[kind] ?? {};
  const total = st.total ?? 0;
  const cov: [string, number][] = [
    [t('eeszt.covFin'), st.fin ?? 0],
    [t('eeszt.covLicence'), st.licence ?? 0],
    [t('eeszt.covSettlement'), st.settlementMatch ?? 0],
    [t('eeszt.covProvider'), st.providerMatch ?? 0],
  ];
  const previewCols = COLUMNS.filter((c) => c.visible);

  return (
    <section className="section container" id="eeszt">
      <div className="section__heading-row">
        <h2 className="section__heading">{t('eeszt.heading')}</h2>
        <button className="icon-button" title={t('eeszt.openAll', { n: rows.length })}
          aria-label={t('eeszt.openAll', { n: rows.length })}
          onClick={() => setOpenTable('all')}>
          <TableIcon />
        </button>
        <button className="icon-button" title={t('eeszt.openUnmatched', { n: unmatchedRows.length })}
          aria-label={t('eeszt.openUnmatched', { n: unmatchedRows.length })}
          onClick={() => setOpenTable('unmatched')}>
          <TableIcon warn />
        </button>
      </div>
      <p className="section__explain">{tKind('eeszt.explain', kind, { asOf: data.asOf })}</p>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{formatNumber(total)}</strong>
          <span>{tKind('eeszt.covTotal', kind)}</span>
        </div>
        {cov.map(([label, n]) => (
          <div key={label} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{label}</span>
            <span className="eeszt-coverage__bar">
              <span style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
            </span>
            <span className="eeszt-coverage__val">
              {formatNumber(n)} <em>({total ? formatPercent(n / total) : '–'})</em>
            </span>
          </div>
        ))}
        <button className="eeszt-coverage__unmatched" onClick={() => setOpenTable('unmatched')}>
          {tKind('eeszt.unmatchedLine', kind, { n: formatNumber(unmatchedRows.length) })} →
        </button>
      </div>

      <div className="stats-table__scroll eeszt-table">
        <table>
          <thead>
            <tr>{previewCols.map((c) => <th key={c.key}>{t(c.labelKey)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, PREVIEW).map((r) => (
              <tr key={r.fin}>
                {previewCols.map((c) => (
                  <td key={c.key}>{renderCell(c, r) ?? (cellText(r[c.key as keyof typeof r]) || '–')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpenTable('all')}>
          {t('eeszt.openAll', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpenTable('unmatched')}>
          {t('eeszt.openUnmatched', { n: formatNumber(unmatchedRows.length) })}
        </button>
      </div>

      <DataTableModal
        open={openTable === 'all'}
        onClose={() => setOpenTable((cur) => (cur === 'all' ? null : cur))}
        title={tKind('eeszt.tableTitle', kind)}
        subtitle={t('eeszt.tableSubtitle', { asOf: data.asOf })}
        rows={rows}
        columns={COLUMNS}
        filename={`praxisterkep-eeszt-${kind}`}
        renderCell={renderCell}
      />
      <DataTableModal
        open={openTable === 'unmatched'}
        onClose={() => setOpenTable((cur) => (cur === 'unmatched' ? null : cur))}
        title={tKind('eeszt.unmatchedTitle', kind)}
        subtitle={t('eeszt.unmatchedSubtitle')}
        rows={unmatchedRows}
        columns={UNMATCHED_COLUMNS}
        filename={`praxisterkep-eeszt-${kind}-nem-illesztheto`}
        renderCell={renderCell}
      />
    </section>
  );
}
