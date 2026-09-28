// "Mióta működik a mai szervezeti egység?" — what the archived licence
// register can and cannot say about how long a district has been where it
// is. It cannot name a previous operator: units belong to their provider
// for good, so a change of hands appears as a new unit, and the FIN → unit
// link has no history. What it can do is date that new unit.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import {
  HISTORY_COLUMNS, newByType, newUnitRows, useLicenceHistory,
} from '../lib/licenceHistory';
import { DataTableModal } from './DataTableModal';

export function LicenceHistorySection() {
  const data = useLicenceHistory();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => newUnitRows(data), [data]);
  const byType = useMemo(() => newByType(data), [data]);

  if (!data) return null;
  const st = data.stats;
  const share = st.districtsFollowed
    ? st.unitsNewerThanWindow / st.districtsFollowed : 0;

  return (
    <div className="extra-block" id="egysegkor">
      <h3 className="section__subheading">{t('licenceHistory.heading')}</h3>
      <p className="section__explain">{t('licenceHistory.explain', {
        from: st.from, to: st.to, snapshots: String(st.snapshots),
      })}</p>
      <p className="section__explain">{t('licenceHistory.limit')}</p>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatNumber(st.unitsNewerThanWindow)}</strong>
          {' '}{t('licenceHistory.statNew', { share: formatPercent(share) })}
        </span>
        <span className="extra-stats__item">
          {t('licenceHistory.byBranch')}{' '}
          {byType.slice(0, 5).map((b) => `${b.label} ${formatNumber(b.count)}`)
            .join(' · ')}
        </span>
      </div>

      <table className="info-table">
        <thead>
          <tr>
            <th>{t('licenceHistory.thWindow')}</th>
            <th className="is-num">{t('licenceHistory.thNew')}</th>
            <th className="is-num">{t('licenceHistory.thArrived')}</th>
            <th className="is-num">{t('licenceHistory.thLeft')}</th>
          </tr>
        </thead>
        <tbody>
          {data.churn.map((c) => (
            <tr key={c.to}>
              <td>{c.from} → {c.to}</td>
              <td className="is-num">{formatNumber(st.newByDate[c.to] ?? 0)}</td>
              <td className="is-num">{formatNumber(c.arrived)}</td>
              <td className="is-num">{formatNumber(c.left)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen(true)}>
          {t('licenceHistory.openTable', { n: formatNumber(rows.length) })}
        </button>
      </div>
      <p className="extra-note">{t('licenceHistory.note', {
        older: formatNumber(st.unitsOlderThanWindow),
      })}</p>

      <DataTableModal
        open={open}
        onClose={() => setOpen(false)}
        title={t('licenceHistory.tableTitle')}
        subtitle={t('licenceHistory.tableSubtitle')}
        rows={rows}
        columns={HISTORY_COLUMNS}
        filename="praxisterkep-uj-szervezeti-egysegek"
        countUnit="rows"
      />
    </div>
  );
}
