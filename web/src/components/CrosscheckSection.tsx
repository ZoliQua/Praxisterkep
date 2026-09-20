// "Keresztellenőrzés": what the premises address and the provider name say
// about the records the code chain could not pair — and the other direction,
// services EESZT finances that the NEAK lists do not contain. Every row
// carries the sentence that says what was compared and what agreed.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  CROSSCHECK_COLUMNS, EESZT_ONLY_COLUMNS, MANUAL_COLUMNS, crosscheckRows,
  eesztOnlyRows, manualReviewRows, useCrosscheck, verdictBreakdown,
} from '../lib/crosscheck';
import { DataTableModal } from './DataTableModal';
import { renderExtraCell } from './EesztCells';
import type { PraxisKind } from '../types';

const VERDICT_COLOR: Record<string, string> = {
  otherUnitSameProfession: '#4fd6c2',
  ownUnitSameProfession: '#6ea8ff',
  providerTaxNumber: '#17a08c',
  otherProfessionAtAddress: '#c98500',
  streetSameProfession: '#9085e9',
  providerName: '#17a08c',
  none: '#64748b',
};

export function CrosscheckSection({ kind, part }: { kind: PraxisKind; part: number }) {
  const data = useCrosscheck();
  const [open, setOpen] = useState<'records' | 'manual' | 'eesztOnly' | null>(null);

  const family = kind === 'gp' ? 'gp' : 'dental';
  const rows = useMemo(
    () => sortRows(crosscheckRows(data, family), 'settlement', 'asc'),
    [data, family],
  );
  const missing = useMemo(
    () => sortRows(eesztOnlyRows(data, family), 'settlement', 'asc'),
    [data, family],
  );
  const manual = useMemo(
    () => sortRows(manualReviewRows(data, family), 'settlement', 'asc'),
    [data, family],
  );
  const breakdown = useMemo(() => verdictBreakdown(data, family), [data, family]);

  if (!data || rows.length === 0) return null;
  const total = rows.length;
  const suggested = breakdown
    .filter((b) => b.verdict !== 'none')
    .reduce((a, b) => a + b.n, 0);

  return (
    <>
      <h3 className="section__subheading" id="eeszt-crosscheck">
        {t('crosscheck.part', { n: part })}
      </h3>
      <p className="section__explain">{tKind('crosscheck.explain', kind)}</p>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{formatNumber(total)}</strong>
          <span>{tKind('crosscheck.total', kind)}</span>
        </div>
        {breakdown.map(({ verdict, n }) => (
          <div key={verdict} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{t(`crosscheck.verdict.${verdict}`)}</span>
            <span className="eeszt-coverage__bar">
              <span style={{
                width: `${(n / total) * 100}%`,
                background: VERDICT_COLOR[verdict] ?? 'var(--accent)',
              }} />
            </span>
            <span className="eeszt-coverage__val">
              {formatNumber(n)} <em>({formatPercent(n / total)})</em>
            </span>
          </div>
        ))}
      </div>
      <p className="extra-note">
        {t('crosscheck.summary', {
          n: formatNumber(suggested),
          total: formatNumber(total),
          share: formatPercent(suggested / total),
        })}
      </p>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('records')}>
          {t('crosscheck.openTable', { n: formatNumber(total) })}
        </button>
        {manual.length > 0 && (
          <button className="data-btn" onClick={() => setOpen('manual')}>
            {t('crosscheck.openManual', { n: formatNumber(manual.length) })}
          </button>
        )}
        {missing.length > 0 && (
          <button className="data-btn data-btn--warn" onClick={() => setOpen('eesztOnly')}>
            {t('crosscheck.openEesztOnly', { n: formatNumber(missing.length) })}
          </button>
        )}
      </div>
      <p className="extra-note">{t('crosscheck.note', { asOf: data.asOf })}</p>

      <DataTableModal
        open={open === 'records'}
        onClose={() => setOpen((cur) => (cur === 'records' ? null : cur))}
        title={tKind('crosscheck.tableTitle', kind)}
        subtitle={t('crosscheck.tableSubtitle', { asOf: data.asOf })}
        rows={rows}
        columns={CROSSCHECK_COLUMNS}
        filename={`praxisterkep-keresztellenorzes-${family}`}
        renderCell={renderExtraCell}
        countUnit="services"
      />
      <DataTableModal
        open={open === 'manual'}
        onClose={() => setOpen((cur) => (cur === 'manual' ? null : cur))}
        title={t('crosscheck.manualTitle')}
        subtitle={t('crosscheck.manualSubtitle')}
        rows={manual}
        columns={MANUAL_COLUMNS}
        filename={`praxisterkep-kezi-ellenorzes-${family}`}
        renderCell={renderExtraCell}
        countUnit="districts"
      />
      <DataTableModal
        open={open === 'eesztOnly'}
        onClose={() => setOpen((cur) => (cur === 'eesztOnly' ? null : cur))}
        title={t('crosscheck.eesztOnlyTitle')}
        subtitle={tKind('crosscheck.eesztOnlySubtitle', kind, { asOf: data.asOf })}
        rows={missing}
        columns={EESZT_ONLY_COLUMNS}
        filename={`praxisterkep-eeszt-tobblet-${family}`}
        renderCell={renderExtraCell}
        countUnit="services"
      />
    </>
  );
}
