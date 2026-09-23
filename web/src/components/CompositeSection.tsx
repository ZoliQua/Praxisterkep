// "Összetett ellátási kockázati index": the settlements where several public
// indicators point the same way at once — no physician in the districts that
// serve them, the next surgery far away, the hospital further still, an old
// population and a beneficiary settlement. Every score can be taken apart
// into the components that made it, because an index nobody can audit is
// just an opinion with decimals.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import {
  BAND_COLORS, COMPOSITE_COLUMNS, COMPOSITE_COUNTY_COLUMNS, compositeCountyRows,
  compositeRows, useComposite,
} from '../lib/analysis';
import { DataTableModal } from './DataTableModal';
import { EesztMap, type MapRow } from './EesztMap';
import { renderExtraCell } from './EesztCells';

function detailRows(row: MapRow): [string, string][] {
  return [
    [t('composite.colIndex'), String(row.index ?? '–')],
    [t('composite.colBand'), String(row.band ?? '–')],
    [t('access.colPopulation'), formatNumber(Number(row.population ?? 0))],
    [t('composite.colGpKm'), row.gpKm === null ? '–' : `${formatNumber(Number(row.gpKm))} km`],
    [t('emergency.colOncallKm'), row.oncallKm === null ? '–' : `${formatNumber(Number(row.oncallKm))} km`],
    [t('composite.colInpKm'), row.inpatientKm === null ? '–' : `${formatNumber(Number(row.inpatientKm))} km`],
    [t('coverage.colOldShare'), row.oldSharePct === null ? '–' : `${formatNumber(Number(row.oldSharePct))}%`],
    [t('composite.colGpClass'), String(row.gpState ?? '–')],
    [t('composite.colDentalClass'), String(row.dentalState ?? '–')],
  ];
}

export function CompositeSection() {
  const data = useComposite();
  const [open, setOpen] = useState<'settlements' | 'counties' | null>(null);

  const rows = useMemo(() => compositeRows(data), [data]);
  const counties = useMemo(() => compositeCountyRows(data), [data]);
  const categories = useMemo(() => (data?.bands ?? []).map((band) => ({
    key: t(`composite.band.${band}`), label: t(`composite.band.${band}`),
    color: BAND_COLORS[band],
  })), [data]);

  if (!data) return null;
  const st = data.stats;
  const top = data.settlements.slice(0, 10);

  return (
    <section className="section container" id="index">
      <h2 className="section__heading">{t('composite.heading')}</h2>
      <p className="section__explain">{t('composite.explain')}</p>
      <p className="section__explain">{t('composite.caveat')}</p>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{formatNumber(st.atRiskSettlements)}</strong>
          <span>{t('composite.lead', {
            people: formatNumber(st.atRiskPopulation),
            total: formatNumber(st.settlements),
          })}</span>
        </div>
        {(data.bands).map((band) => (
          <div key={band} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{t(`composite.band.${band}`)}</span>
            <span className="eeszt-coverage__bar">
              <span style={{
                width: `${((st.byBand[band] ?? 0) / st.settlements) * 100}%`,
                background: BAND_COLORS[band],
              }} />
            </span>
            <span className="eeszt-coverage__val">
              {formatNumber(st.byBand[band] ?? 0)}
              {' '}<em>({formatNumber(st.populationByBand[band] ?? 0)} {t('access.people')})</em>
            </span>
          </div>
        ))}
      </div>

      <EesztMap rows={rows as MapRow[]} categories={categories} detailRows={detailRows}
        searchLink={false} countKey="composite.mapCount"
        exportName="praxisterkep-index" />

      <div className="extra-block">
        <h4 className="extra-block__title">{t('composite.weightsTitle')}</h4>
        <p className="section__explain">{t('composite.weightsExplain')}</p>
        <table className="info-table">
          <thead>
            <tr>
              <th>{t('composite.thComponent')}</th>
              <th className="is-num">{t('composite.thWeight')}</th>
              <th>{t('composite.thSource')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.weights).map(([key, weight]) => (
              <tr key={key}>
                <td>{t(`composite.component.${key}`)}</td>
                <td className="is-num">{formatPercent(weight, 0)}</td>
                <td>{t(`composite.source.${key}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="extra-block">
        <h4 className="extra-block__title">{t('composite.topTitle')}</h4>
        <table className="info-table">
          <thead>
            <tr>
              <th>{t('stats.thSettlement')}</th>
              <th>{t('stats.thCounty')}</th>
              <th className="is-num">{t('composite.colIndex')}</th>
              <th className="is-num">{t('access.colPopulation')}</th>
              <th className="is-num">{t('composite.colGpKm')}</th>
              <th className="is-num">{t('coverage.colOldShare')}</th>
            </tr>
          </thead>
          <tbody>
            {top.map((s) => (
              <tr key={s.kshId}>
                <td>{s.settlement}</td>
                <td>{s.county}</td>
                <td className="is-num">
                  <strong style={{ color: BAND_COLORS[s.band] }}>{formatNumber(s.index)}</strong>
                </td>
                <td className="is-num">{formatNumber(s.population)}</td>
                <td className="is-num">
                  {s.raw.gpKm === null ? '–' : `${formatNumber(s.raw.gpKm)} km`}
                </td>
                <td className="is-num">
                  {s.raw.ageing === null ? '–' : formatPercent(s.raw.ageing)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('settlements')}>
          {t('composite.openTable', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('counties')}>
          {t('composite.openCounties')}
        </button>
      </div>
      <p className="extra-note">{t('composite.note', { month: data.dataMonth })}</p>

      <DataTableModal
        open={open === 'settlements'}
        onClose={() => setOpen((cur) => (cur === 'settlements' ? null : cur))}
        title={t('composite.tableTitle')}
        subtitle={t('composite.tableSubtitle')}
        rows={rows}
        columns={COMPOSITE_COLUMNS}
        filename="praxisterkep-index"
        renderCell={renderExtraCell}
        countUnit="rows"
        above={{
          label: t('eeszt.mapToggle'),
          render: (filtered) => (
            <EesztMap rows={filtered as MapRow[]} height={320} countyFilter={false}
              fitToRows searchLink={false} categories={categories}
              detailRows={detailRows} countKey="composite.mapCount"
              exportName="praxisterkep-index" />
          ),
        }}
      />
      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={t('composite.countyTitle')}
        subtitle={t('composite.countySubtitle')}
        rows={counties}
        columns={COMPOSITE_COUNTY_COLUMNS}
        filename="praxisterkep-index-megyek"
        countUnit="rows"
      />
    </section>
  );
}
