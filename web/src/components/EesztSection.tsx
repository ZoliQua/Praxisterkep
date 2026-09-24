// "EESZT-kiegészítés": how well the public EESZT master data could be joined
// (per branch, fully transparent), the map, and two full data browsers in
// modals — every district with its EESZT fields, and the districts that could
// not be matched, each with the reason.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { useEeszt } from '../lib/eeszt';
import {
  COLUMNS, UNMATCHED_COLUMNS, buildRows, buildUnmatchedRows, sortRows,
} from '../lib/eesztTable';
import { useAppStore, useSnapshot } from '../store/useAppStore';
import { DataTableModal } from './DataTableModal';
import { EesztMap } from './EesztMap';
import { EesztInfoModal } from './EesztInfoModal';
import { makeCellRenderer } from './EesztCells';
import { NeakDetailModal } from './NeakDetailModal';
import { DentalExtraBlocks } from './DentalExtraBlocks';
import { CrosscheckSection } from './CrosscheckSection';
import { OfficialMapSection } from './OfficialMapSection';
import { ProviderSection } from './ProviderSection';

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
  const [openTable, setOpenTable] = useState<'all' | 'unmatched' | 'info' | null>(null);
  // the NEAK record of a filled district, opened from its status badge
  const [neakFin, setNeakFin] = useState<string | null>(null);
  const renderCell = useMemo(() => makeCellRenderer(setNeakFin), []);

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
        <button className="icon-button" title={t('eeszt.infoOpen')}
          aria-label={t('eeszt.infoOpen')} onClick={() => setOpenTable('info')}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 9v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="10" cy="6.3" r="1.1" fill="currentColor" />
          </svg>
        </button>
      </div>
      <p className="section__explain">
        {tKind('eeszt.explain', kind, { asOf: data.asOf })}{' '}
        <button className="eeszt-coverage__unmatched" onClick={() => setOpenTable('info')}>
          {t('eeszt.infoOpen')} →
        </button>
      </p>

      <h3 className="section__subheading">{t('extra.part1')}</h3>

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

      <EesztMap rows={rows} />

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpenTable('all')}>
          {t('eeszt.openAll', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpenTable('unmatched')}>
          {t('eeszt.openUnmatched', { n: formatNumber(unmatchedRows.length) })}
        </button>
      </div>

      {kind === 'dental' && <DentalExtraBlocks />}

      {/* the cross-check closes the section: part 3 for dental (which has the
          specialist part), part 2 for GP */}
      <CrosscheckSection kind={kind} part={kind === 'dental' ? 3 : 2} />

      {/* NEAK's own FIN -> provider link, as a second opinion on the above */}
      <OfficialMapSection />

      {/* the provider list spans both branches, so it closes the section */}
      <ProviderSection part={kind === 'dental' ? 4 : 3} />

      <DataTableModal
        open={openTable === 'all'}
        onClose={() => setOpenTable((cur) => (cur === 'all' ? null : cur))}
        title={tKind('eeszt.tableTitle', kind)}
        subtitle={t('eeszt.tableSubtitle', { asOf: data.asOf })}
        rows={rows}
        columns={COLUMNS}
        filename={`praxisterkep-eeszt-${kind}`}
        renderCell={renderCell}
        above={{
          label: t('eeszt.mapToggle'),
          render: (filtered) => (
            <EesztMap rows={filtered} height={320} countyFilter={false}
              fitToRows searchLink={false} />
          ),
        }}
      />
      <NeakDetailModal fin={neakFin} kind={kind} onClose={() => setNeakFin(null)} />
      <EesztInfoModal
        open={openTable === 'info'}
        onClose={() => setOpenTable((cur) => (cur === 'info' ? null : cur))}
        data={data}
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
