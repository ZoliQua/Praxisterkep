// "Hivatalos összerendelés": NEAK's extended financing register names the
// provider behind each FIN code — the very link the cross-check reconstructs
// from addresses and names. This block holds the two against each other and
// publishes the disagreement rather than quietly adopting either side.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import {
  OFFICIAL_COLUMNS, OFFICIAL_COUNTY_COLUMNS, VERDICT_COLORS,
  officialCountyRows, officialRows, useOfficialMap,
} from '../lib/officialmap';
import { DataTableModal } from './DataTableModal';

const SOURCES = ['code', 'crosscheck', 'none'] as const;

export function OfficialMapSection() {
  const data = useOfficialMap();
  const [open, setOpen] = useState<'all' | 'differ' | 'counties' | null>(null);

  const rows = useMemo(() => officialRows(data), [data]);
  const differing = useMemo(() => officialRows(data, 'differ'), [data]);
  const counties = useMemo(() => officialCountyRows(data), [data]);

  if (!data) return null;
  const st = data.stats;

  return (
    <div className="extra-block" id="hivatalos">
      <h3 className="section__subheading">{t('officialmap.heading')}</h3>
      <p className="section__explain">{t('officialmap.explain')}</p>
      <p className="section__explain">{t('officialmap.policy')}</p>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{formatPercent(st.agreement)}</strong>
          <span>{t('officialmap.lead', {
            decidable: formatNumber(st.decidable),
            praxes: formatNumber(st.praxes),
          })}</span>
        </div>
        {data.verdicts.map((verdict) => (
          <div key={verdict} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">
              {t(`officialmap.verdict.${verdict}`)}
            </span>
            <span className="eeszt-coverage__bar">
              <span style={{
                width: `${(st[verdict] / st.praxes) * 100}%`,
                background: VERDICT_COLORS[verdict],
              }} />
            </span>
            <span className="eeszt-coverage__val">
              {verdict === 'differ' ? (
                <button className="info-drill" onClick={() => setOpen('differ')}>
                  {formatNumber(st[verdict])}
                </button>
              ) : formatNumber(st[verdict])}
            </span>
          </div>
        ))}
      </div>

      <table className="info-table">
        <thead>
          <tr>
            <th>{t('officialmap.thSource')}</th>
            <th className="is-num">{t('officialmap.colPraxes')}</th>
            <th className="is-num">{t('officialmap.verdict.agree')}</th>
            <th className="is-num">{t('officialmap.verdict.differ')}</th>
            <th className="is-num">{t('officialmap.colAgreement')}</th>
          </tr>
        </thead>
        <tbody>
          {SOURCES.map((source) => {
            const block = st.bySource[source] ?? {};
            const decidable = (block.agree ?? 0) + (block.differ ?? 0);
            return (
              <tr key={source}>
                <td>{t(`officialmap.source.${source}`)}</td>
                <td className="is-num">{formatNumber(block.praxes ?? 0)}</td>
                <td className="is-num">{formatNumber(block.agree ?? 0)}</td>
                <td className="is-num">
                  <strong style={{ color: VERDICT_COLORS.differ }}>
                    {formatNumber(block.differ ?? 0)}
                  </strong>
                </td>
                <td className="is-num">
                  {decidable ? formatPercent((block.agree ?? 0) / decidable) : '–'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('all')}>
          {t('officialmap.openTable', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('differ')}>
          {t('officialmap.openDiffer', { n: formatNumber(differing.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('counties')}>
          {t('officialmap.openCounties')}
        </button>
      </div>
      <p className="extra-note">{t('officialmap.note', {
        asOf: data.asOf,
        rescuable: formatNumber(st.rescuable),
      })}</p>

      {open && (
        <DataTableModal
          open
          onClose={() => setOpen(null)}
          title={t(open === 'counties' ? 'officialmap.countyTitle'
            : open === 'differ' ? 'officialmap.differTitle' : 'officialmap.tableTitle')}
          subtitle={t(open === 'counties' ? 'officialmap.countySubtitle'
            : open === 'differ' ? 'officialmap.differSubtitle' : 'officialmap.tableSubtitle')}
          rows={open === 'counties' ? counties : open === 'differ' ? differing : rows}
          columns={open === 'counties' ? OFFICIAL_COUNTY_COLUMNS : OFFICIAL_COLUMNS}
          filename={`praxisterkep-hivatalos-osszerendeles-${open}`}
          countUnit="rows"
        />
      )}
    </div>
  );
}
