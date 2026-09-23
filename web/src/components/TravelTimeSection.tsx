// "Menetidő légvonal helyett": the same distances, measured on the road
// network instead of through the air. Every earlier chart on this site used
// straight lines and said so; this block shows what that cost — which
// settlements the straight line flattered, and by how much.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  BAND_COLORS, TRAVEL_COUNTY_COLUMNS, type Layer, layerStats, travelColumns,
  travelCountyRows, travelRows, useTravel,
} from '../lib/mobility';
import { DataTableModal } from './DataTableModal';
import { EesztMap, type MapRow } from './EesztMap';

const LAYERS: Layer[] = ['gp', 'oncall', 'inpatient', 'dental', 'outpatient', 'ambulance'];

export function TravelTimeSection() {
  const data = useTravel();
  const [layer, setLayer] = useState<Layer>('gp');
  const [open, setOpen] = useState<'settlements' | 'counties' | null>(null);

  const rows = useMemo(
    () => sortRows(travelRows(data, layer), `${layer}Min`, 'desc'), [data, layer],
  );
  const counties = useMemo(() => travelCountyRows(data), [data]);
  const categories = useMemo(() => (data?.bands ?? []).map((band) => ({
    key: t(`travel.band.${band}`), label: t(`travel.band.${band}`), color: BAND_COLORS[band],
  })), [data]);

  const detailRows = useMemo(() => (row: MapRow): [string, string][] => [
    [t('travel.colMinutes'), row[`${layer}Min`] === null ? '–'
      : t('travel.minutes', { n: formatNumber(Number(row[`${layer}Min`])) })],
    [t('travel.colKm'), row[`${layer}Km`] === null ? '–'
      : `${formatNumber(Number(row[`${layer}Km`]))} km`],
    [t('travel.colAt'), String(row[`${layer}At`] || '–')],
    [t('access.colPopulation'), formatNumber(Number(row.population ?? 0))],
  ], [layer]);

  if (!data) return null;
  const stats = layerStats(data, layer);
  const comparison = data.comparison[layer] ?? data.comparison.gp;
  const total = data.settlements.length;

  return (
    <section className="section container" id="menetido">
      <h2 className="section__heading">{t('travel.heading')}</h2>
      <p className="section__explain">{t('travel.explain')}</p>
      <p className="section__explain">{t('travel.caveat')}</p>

      <div className="seg" role="group">
        {LAYERS.map((l) => (
          <button key={l} aria-pressed={layer === l} onClick={() => setLayer(l)}>
            {t(`travel.layer.${l}`)}
          </button>
        ))}
      </div>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{t('travel.minutes', { n: formatNumber(stats?.medianMin ?? 0) })}</strong>
          <span>{t('travel.median', { layer: t(`travel.layer.${layer}`) })}</span>
        </div>
        {(data.bands).map((band) => (
          <div key={band} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{t(`travel.band.${band}`)}</span>
            <span className="eeszt-coverage__bar">
              <span style={{
                width: `${((stats?.counts[band] ?? 0) / total) * 100}%`,
                background: BAND_COLORS[band],
              }} />
            </span>
            <span className="eeszt-coverage__val">
              {formatNumber(stats?.counts[band] ?? 0)}
              {' '}<em>({formatNumber(stats?.population[band] ?? 0)} {t('access.people')})</em>
            </span>
          </div>
        ))}
      </div>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{t('travel.minutes', { n: formatNumber(stats?.maxMin ?? 0) })}</strong>
          {' '}{t('travel.max')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(stats?.populationBeyond30 ?? 0)}</strong>
          {' '}{t('travel.beyond30')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(comparison?.medianDetour ?? 0)}</strong>
          {' '}{t('travel.detourMedian')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(stats?.points ?? 0)}</strong> {t('travel.points')}
        </span>
      </div>

      <EesztMap rows={rows as MapRow[]} categories={categories} detailRows={detailRows}
        searchLink={false} countKey="travel.mapCount"
        exportName={`praxisterkep-menetido-${layer}`} />

      <div className="extra-block">
        <h4 className="extra-block__title">{t('travel.detourTitle')}</h4>
        <p className="section__explain">{t('travel.detourExplain')}</p>
        <table className="info-table">
          <thead>
            <tr>
              <th>{t('stats.thSettlement')}</th>
              <th>{t('stats.thCounty')}</th>
              <th className="is-num">{t('access.colPopulation')}</th>
              <th className="is-num">{t('travel.colKm')}</th>
              <th className="is-num">{t('travel.colMinutes')}</th>
            </tr>
          </thead>
          <tbody>
            {(comparison?.worst ?? []).slice(0, 8).map((w) => (
              <tr key={`${w.settlement}-${w.county}`}>
                <td>{w.settlement}</td>
                <td>{w.county}</td>
                <td className="is-num">{formatNumber(w.population)}</td>
                <td className="is-num">{w.km === null ? '–' : `${formatNumber(w.km)} km`}</td>
                <td className="is-num">
                  <strong style={{ color: BAND_COLORS['30+'] }}>
                    {w.minutes === null ? '–' : t('travel.minutes', { n: formatNumber(w.minutes) })}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('settlements')}>
          {t('travel.openTable', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('counties')}>
          {t('travel.openCounties')}
        </button>
      </div>
      <p className="extra-note">{t('travel.note', { source: data.roadSource })}</p>

      <DataTableModal
        open={open === 'settlements'}
        onClose={() => setOpen((cur) => (cur === 'settlements' ? null : cur))}
        title={t('travel.tableTitle', { layer: t(`travel.layer.${layer}`) })}
        subtitle={t('travel.tableSubtitle')}
        rows={rows}
        columns={travelColumns(layer)}
        filename={`praxisterkep-menetido-${layer}`}
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={t('travel.countyTitle')}
        subtitle={t('travel.countySubtitle')}
        rows={counties}
        columns={TRAVEL_COUNTY_COLUMNS}
        filename="praxisterkep-menetido-megyek"
        countUnit="rows"
      />
    </section>
  );
}
