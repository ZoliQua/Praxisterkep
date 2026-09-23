// "Összefüggő ellátási hiányterületek": the high-index settlements that touch
// each other. Listed one by one they read as unlucky villages; joined up they
// are regions, and the neighbouring village is no alternative because it is
// in the same state. The method is single linkage at a published radius, so
// long corridors stay visible as corridors — the extent travels with the size.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  CLUSTER_COLUMNS, MEMBER_COLUMNS, clusterRows, memberRows, useClusters,
} from '../lib/clusters';
import { BAND_COLORS } from '../lib/analysis';
import { DataTableModal } from './DataTableModal';
import { EesztMap, type MapRow } from './EesztMap';

function detailRows(row: MapRow): [string, string][] {
  return [
    [t('clusters.colName'), String(row.name ?? '–')],
    [t('vedono.colSettlements'), formatNumber(Number(row.settlements ?? 0))],
    [t('access.colPopulation'), formatNumber(Number(row.population ?? 0))],
    [t('composite.colMeanIndex'), String(row.meanIndex ?? '–')],
    [t('clusters.colSpread'), `${row.spreadKm ?? '–'} km`],
    [t('clusters.colCore'), String(row.core ?? '–')],
  ];
}

export function ClusterSection() {
  const data = useClusters();
  const [open, setOpen] = useState<'clusters' | 'members' | null>(null);

  const rows = useMemo(() => sortRows(clusterRows(data), 'population', 'desc'), [data]);
  const members = useMemo(() => sortRows(memberRows(data), 'index', 'desc'), [data]);
  const categories = useMemo(() => [{
    key: 'cluster', label: t('clusters.mapLegend'), color: BAND_COLORS.kiemelt,
  }], []);

  if (!data) return null;
  const st = data.stats;
  const clustered = st.candidates ? st.settlementsInClusters / st.candidates : 0;
  const top = data.clusters.slice(0, 8);

  return (
    <section className="section container" id="hianyteruletek">
      <h2 className="section__heading">{t('clusters.heading')}</h2>
      <p className="section__explain">{t('clusters.explain', {
        km: String(data.neighbourKm),
        min: String(data.minSettlements),
      })}</p>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatNumber(st.clusters)}</strong> {t('clusters.statClusters')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.settlementsInClusters)}</strong>
          {' '}{t('clusters.statSettlements', { share: formatPercent(clustered) })}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.populationInClusters)}</strong>
          {' '}{t('clusters.statPopulation')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.isolated)}</strong> {t('clusters.statIsolated')}
        </span>
      </div>

      <EesztMap rows={rows as MapRow[]} categories={categories} detailRows={detailRows}
        searchLink={false} countKey="clusters.mapCount"
        exportName="praxisterkep-hianyteruletek" />

      <div className="extra-block">
        <h4 className="extra-block__title">{t('clusters.topTitle')}</h4>
        <table className="info-table">
          <thead>
            <tr>
              <th>{t('clusters.colName')}</th>
              <th>{t('stats.thCounty')}</th>
              <th className="is-num">{t('vedono.colSettlements')}</th>
              <th className="is-num">{t('access.colPopulation')}</th>
              <th className="is-num">{t('composite.colMeanIndex')}</th>
              <th className="is-num">{t('clusters.colSpread')}</th>
              <th className="is-num">{t('composite.colGpKm')}</th>
            </tr>
          </thead>
          <tbody>
            {top.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.counties.join(', ')}</td>
                <td className="is-num">{formatNumber(c.settlements)}</td>
                <td className="is-num">{formatNumber(c.population)}</td>
                <td className="is-num">
                  <strong style={{ color: BAND_COLORS.kiemelt }}>{formatNumber(c.meanIndex)}</strong>
                </td>
                <td className="is-num">{formatNumber(c.spreadKm)} km</td>
                <td className="is-num">
                  {c.meanGpKm === null ? '–' : `${formatNumber(c.meanGpKm)} km`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('clusters')}>
          {t('clusters.openTable', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('members')}>
          {t('clusters.openMembers', { n: formatNumber(members.length) })}
        </button>
      </div>
      <p className="extra-note">{t('clusters.note', {
        km: String(data.neighbourKm),
        min: String(data.minSettlements),
        month: data.dataMonth,
      })}</p>

      <DataTableModal
        open={open === 'clusters'}
        onClose={() => setOpen((cur) => (cur === 'clusters' ? null : cur))}
        title={t('clusters.tableTitle')}
        subtitle={t('clusters.tableSubtitle')}
        rows={rows}
        columns={CLUSTER_COLUMNS}
        filename="praxisterkep-hianyteruletek"
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'members'}
        onClose={() => setOpen((cur) => (cur === 'members' ? null : cur))}
        title={t('clusters.memberTitle')}
        subtitle={t('clusters.memberSubtitle')}
        rows={members}
        columns={MEMBER_COLUMNS}
        filename="praxisterkep-hianyteruletek-telepulesek"
        countUnit="rows"
      />
    </section>
  );
}
