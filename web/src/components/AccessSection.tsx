// "Milyen messze a legközelebbi rendelő?" — the distance from every district
// without a contracted physician to the nearest operating surgery of the same
// branch. A distance says what a resident has to travel; it does not say the
// district is unserved (CLAUDE.md rule 4), and the copy keeps the two apart.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  ACCESS_COLUMNS, BAND_COLORS, accessRows, bandBreakdown, bandLabel,
  populationBeyond, useAccess,
} from '../lib/access';
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
  const kind = useAppStore((s) => s.kind);
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => sortRows(accessRows(data, kind), 'km', 'desc'), [data, kind]);
  const bands = useMemo(() => bandBreakdown(data, kind), [data, kind]);
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
  const sameShare = measured ? (st?.sameSettlement ?? 0) / measured : 0;

  return (
    <section className="section container" id="tavolsag">
      <div className="section__heading-row">
        <h2 className="section__heading">{t('access.heading')}</h2>
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
        searchLink={false} countKey="access.mapCount" />

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen(true)}>
          {t('access.openTable', { n: formatNumber(rows.length) })}
        </button>
      </div>
      <p className="extra-note">
        {t('access.note', {
          operating: formatNumber(st?.operating ?? 0),
          missing: formatNumber(st?.operatingWithoutGeo ?? 0),
          month: data.dataMonth,
        })}
      </p>

      <DataTableModal
        open={open}
        onClose={() => setOpen(false)}
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
              detailRows={detailRows} countKey="access.mapCount" />
          ),
        }}
      />
    </section>
  );
}
