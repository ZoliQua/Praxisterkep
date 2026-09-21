// "Milyen messze a legközelebbi rendelő?" — the distance from every district
// without a contracted physician to the nearest operating surgery of the same
// branch. A distance says what a resident has to travel; it does not say the
// district is unserved (CLAUDE.md rule 4), and the copy keeps the two apart.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  ACCESS_COLUMNS, BAND_COLORS, COUNTY_ACCESS_COLUMNS, accessRows, bandBreakdown,
  bandLabel, countyAccess, countyAccessRows, populationBeyond, useAccess,
} from '../lib/access';
import { benefitCompare } from '../lib/access';
import { useBenefit } from '../lib/kedvezmenyezett';
import { useAppStore } from '../store/useAppStore';
import { DataTableModal } from './DataTableModal';
import { EesztMap, type MapRow } from './EesztMap';
import { renderExtraCell } from './EesztCells';

function detailRows(row: MapRow): [string, string][] {
  return [
    [t('access.colKm'), `${formatNumber(Number(row.km ?? 0))} km`],
    [t('access.colBand'), String(row.bandLabel ?? '–')],
    [t('access.colNearest'), String(row.nearestSettlement ?? '–')],
    [t('access.colSameSettlement'), row.sameSettlement ? t('eeszt.yes') : t('eeszt.no')],
    [t('stats.thStatus'), String(row.status ?? '–')],
    [t('stats.thType'), String(row.praxisType ?? '–')],
    [t('access.colPopulation'), row.population ? formatNumber(Number(row.population)) : '–'],
    [t('eeszt.colFin'), String(row.fin)],
  ];
}

export function AccessSection() {
  const data = useAccess();
  const benefit = useBenefit();
  const kind = useAppStore((s) => s.kind);
  const [open, setOpen] = useState<'districts' | 'counties' | 'benefit' | 'other' | null>(null);
  const [county, setCounty] = useState('');

  const rows = useMemo(
    () => sortRows(accessRows(data, kind, benefit), 'km', 'desc'),
    [data, kind, benefit],
  );
  const compare = useMemo(() => benefitCompare(data, kind, benefit), [data, kind, benefit]);
  const bands = useMemo(() => bandBreakdown(data, kind), [data, kind]);
  const counties = useMemo(() => countyAccess(data, kind), [data, kind]);
  const countyRows = useMemo(() => countyAccessRows(data, kind), [data, kind]);
  const categories = useMemo(
    () => bands.map((b) => ({
      key: bandLabel(b.band), label: bandLabel(b.band), color: BAND_COLORS[b.band],
    })),
    [bands],
  );

  if (!data || rows.length === 0) return null;
  const st = data.stats[kind];
  const measured = st?.measured ?? 0;
  const beyond10 = populationBeyond(data, kind, 10);
  const selected = counties.find((c) => c.county === county) ?? null;
  const sameShare = measured ? (st?.sameSettlement ?? 0) / measured : 0;

  return (
    <section className="section container" id="tavolsag">
      <div className="section__heading-row">
        <h2 className="section__heading">{t('access.heading')}</h2>
        <button className="icon-button" title={t('access.openCounties')}
          aria-label={t('access.openCounties')} onClick={() => setOpen('counties')}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none"
              stroke="currentColor" strokeWidth="1.6" />
            <path d="M2.5 8h15M8 8v8.5M13 8v8.5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
      <p className="section__explain">{tKind('access.explain', kind)}</p>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{st?.medianKm !== null ? `${formatNumber(st!.medianKm!)} km` : '–'}</strong>
          <span>{tKind('access.median', kind)}</span>
        </div>
        {bands.map(({ band, count, population }) => (
          <div key={band} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{bandLabel(band)}</span>
            <span className="eeszt-coverage__bar">
              <span style={{
                width: `${measured ? (count / measured) * 100 : 0}%`,
                background: BAND_COLORS[band],
              }} />
            </span>
            <span className="eeszt-coverage__val">
              {formatNumber(count)} <em>({formatNumber(population)} {t('access.people')})</em>
            </span>
          </div>
        ))}
      </div>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatPercent(sameShare)}</strong> {t('access.sameSettlementShare')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(beyond10)}</strong> {t('access.beyond10')}
        </span>
        <span className="extra-stats__item">
          <strong>{st?.maxKm !== null ? `${formatNumber(st!.maxKm!)} km` : '–'}</strong>
          {' '}{t('access.max')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st?.operating ?? 0)}</strong> {t('access.operating')}
        </span>
      </div>

      <EesztMap rows={rows as MapRow[]} categories={categories} detailRows={detailRows}
        searchLink={false} countKey="access.mapCount" onCounty={setCounty}
        exportName={`praxisterkep-tavolsag-${kind}`} />

      {selected && (
        <p className="access-county">
          {t('access.countyLine', {
            county: selected.county,
            districts: formatNumber(selected.districts),
            mean: formatNumber(selected.meanKm),
            median: formatNumber(selected.medianKm),
            max: formatNumber(selected.maxKm),
            within5: formatNumber(selected.within5),
            beyond10: formatNumber(selected.beyond10),
            people: formatNumber(selected.populationBeyond10),
          })}
        </p>
      )}

      {compare.length === 2 && (
        <div className="benefit-compare">
          <h4 className="extra-block__title">{t('benefit.compareTitle')}</h4>
          <p className="section__explain">{t('benefit.compareExplain')}</p>
          <table className="info-table">
            <thead>
              <tr>
                <th />
                <th className="is-num">{t('access.colDistricts')}</th>
                <th className="is-num">{t('access.colMeanKm')}</th>
                <th className="is-num">{t('access.colMedianKm')}</th>
                <th className="is-num">{t('access.colBeyond10')}</th>
                <th className="is-num">{t('access.colPopulation')}</th>
              </tr>
            </thead>
            <tbody>
              {compare.map((c) => (
                <tr key={c.group}>
                  <td>{t(`benefit.group.${c.group}`)}</td>
                  <td className="is-num">
                    <button className="info-drill" title={t('benefit.openGroup')}
                      onClick={() => setOpen(c.group)}>{formatNumber(c.districts)}</button>
                  </td>
                  <td className="is-num">{formatNumber(c.meanKm)} km</td>
                  <td className="is-num">{formatNumber(c.medianKm)} km</td>
                  <td className="is-num">{formatNumber(c.beyond10)}</td>
                  <td className="is-num">{formatNumber(c.population)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="extra-note">{t('benefit.source')}</p>
        </div>
      )}

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('districts')}>
          {t('access.openTable', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('counties')}>
          {t('access.openCounties')}
        </button>
      </div>
      <p className="extra-note">
        {t('access.note', {
          operating: formatNumber(st?.operating ?? 0),
          missing: formatNumber(st?.operatingWithoutGeo ?? 0),
          month: data.dataMonth,
        })}
      </p>

      {(open === 'benefit' || open === 'other') && (
        <DataTableModal
          open
          onClose={() => setOpen(null)}
          title={t(`benefit.group.${open}`)}
          subtitle={t('benefit.groupSubtitle')}
          rows={rows.filter((r) => (open === 'benefit' ? r.benefit === true : !r.benefit))}
          columns={ACCESS_COLUMNS}
          filename={`praxisterkep-tavolsag-${kind}-${open}`}
          renderCell={renderExtraCell}
          countUnit="districts"
        />
      )}
      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={tKind('access.countyTableTitle', kind)}
        subtitle={t('access.countyTableSubtitle')}
        rows={countyRows}
        columns={COUNTY_ACCESS_COLUMNS}
        filename={`praxisterkep-tavolsag-megyek-${kind}`}
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'districts'}
        onClose={() => setOpen((cur) => (cur === 'districts' ? null : cur))}
        title={tKind('access.tableTitle', kind)}
        subtitle={t('access.tableSubtitle')}
        rows={rows}
        columns={ACCESS_COLUMNS}
        filename={`praxisterkep-tavolsag-${kind}`}
        renderCell={renderExtraCell}
        above={{
          label: t('eeszt.mapToggle'),
          render: (filtered) => (
            <EesztMap rows={filtered as MapRow[]} height={320} countyFilter={false}
              fitToRows searchLink={false} categories={categories}
              detailRows={detailRows} countKey="access.mapCount"
              exportName={`praxisterkep-tavolsag-${kind}`} />
          ),
        }}
      />
    </section>
  );
}
