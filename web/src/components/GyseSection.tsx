// "Gyógyászati segédeszköz: hol lehet kiváltani?" — the other half of a
// prescription. The register licenses seven activities, and they are not
// interchangeable: a repair shop cannot hand over a walking frame, so the
// distance question is asked about the three that dispense.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  COUNTY_COLUMNS, SETTLEMENT_COLUMNS, SITE_COLUMNS, countyRows,
  kindBreakdown, settlementRows, siteRows, useGyse,
} from '../lib/gyse';
import { DataTableModal } from './DataTableModal';
import { EesztMap, type MapRow } from './EesztMap';
import { renderExtraCell } from './EesztCells';

function detailRows(row: MapRow): [string, string][] {
  return [
    [t('gyse.colKind'), String(row.kindLabel ?? '–')],
    [t('vedono.colProvider'), String(row.provider ?? '–')],
    [t('eeszt.colAddress'), `${row.postalCode ?? ''} ${row.settlement ?? ''}, ${row.address ?? ''}`],
    [t('gyse.colSiteId'), String(row.siteId ?? '–')],
    [t('gyse.colAuthority'), String(row.authority ?? '–')],
  ];
}

type Modal = 'sites' | 'counties' | 'settlements' | 'without' | null;

export function GyseSection() {
  const data = useGyse();
  const [retailOnly, setRetailOnly] = useState(true);
  const [open, setOpen] = useState<Modal>(null);

  const rows = useMemo(() => siteRows(data, retailOnly), [data, retailOnly]);
  const mapRows = useMemo(() => rows.filter((r) => r.lat !== null), [rows]);
  const counties = useMemo(
    () => sortRows(countyRows(data), 'residentsPerSite', 'desc'), [data],
  );
  const settlements = useMemo(() => settlementRows(data, false), [data]);
  const without = useMemo(() => settlementRows(data, true), [data]);
  const kinds = useMemo(() => kindBreakdown(data), [data]);
  const categories = useMemo(() => kinds.map((k) => ({
    key: t(`gyse.kind.${k.kind}`), label: t(`gyse.kind.${k.kind}`), color: k.color,
  })), [kinds]);

  if (!data) return null;
  const st = data.stats;
  const covered = st.settlementsTotal ? st.retailSettlements / st.settlementsTotal : 0;
  const withoutPopulation = without.reduce((a, s) => a + Number(s.population ?? 0), 0);

  return (
    <section className="section container" id="segedeszkoz">
      <h2 className="section__heading">{t('gyse.heading')}</h2>
      <p className="section__explain">{t('gyse.explain', {
        premises: formatNumber(st.premises),
        providers: formatNumber(st.providers),
      })}</p>
      <p className="section__explain">{t('gyse.caveat')}</p>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatNumber(st.retailPremises)}</strong> {t('gyse.statRetail')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.retailSettlements)}</strong>
          {' '}{t('gyse.statSettlements', { share: formatPercent(covered) })}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(without.length)}</strong>
          {' '}{t('gyse.statWithout', { people: formatNumber(withoutPopulation) })}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.providers)}</strong> {t('gyse.statProviders')}
        </span>
      </div>

      <div className="eeszt-coverage">
        {kinds.map((k) => (
          <div key={k.kind} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{t(`gyse.kind.${k.kind}`)}</span>
            <span className="eeszt-coverage__bar">
              <span style={{ width: `${(k.n / st.sites) * 100}%`, background: k.color }} />
            </span>
            <span className="eeszt-coverage__val">{formatNumber(k.n)}</span>
          </div>
        ))}
      </div>

      <div className="seg" role="group">
        <button aria-pressed={retailOnly} onClick={() => setRetailOnly(true)}>
          {t('gyse.onlyRetail')}
        </button>
        <button aria-pressed={!retailOnly} onClick={() => setRetailOnly(false)}>
          {t('gyse.allKinds')}
        </button>
      </div>

      <EesztMap rows={mapRows as MapRow[]} categories={categories} detailRows={detailRows}
        searchLink={false} countKey="gyse.mapCount" exportName="praxisterkep-segedeszkoz" />

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('sites')}>
          {t('gyse.openSites', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('without')}>
          {t('gyse.openWithout', { n: formatNumber(without.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('settlements')}>
          {t('gyse.openSettlements')}
        </button>
        <button className="data-btn" onClick={() => setOpen('counties')}>
          {t('gyse.openCounties')}
        </button>
      </div>
      <p className="extra-note">{t('gyse.note', {
        asOf: data.asOf,
        geocoded: formatNumber(st.geocoded),
        sites: formatNumber(st.sites),
      })}</p>

      <DataTableModal
        open={open === 'sites'}
        onClose={() => setOpen((cur) => (cur === 'sites' ? null : cur))}
        title={t('gyse.siteTitle')}
        subtitle={t('gyse.siteSubtitle')}
        rows={rows}
        columns={SITE_COLUMNS}
        filename="praxisterkep-segedeszkoz"
        renderCell={renderExtraCell}
        countUnit="rows"
        above={{
          label: t('eeszt.mapToggle'),
          render: (filtered) => (
            <EesztMap rows={filtered.filter((r) => r.lat !== null) as MapRow[]} height={320}
              countyFilter={false} fitToRows searchLink={false} categories={categories}
              detailRows={detailRows} countKey="gyse.mapCount"
              exportName="praxisterkep-segedeszkoz" />
          ),
        }}
      />
      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={t('gyse.countyTitle')}
        subtitle={t('gyse.countySubtitle')}
        rows={counties}
        columns={COUNTY_COLUMNS}
        filename="praxisterkep-segedeszkoz-megyek"
        countUnit="rows"
      />
      {(open === 'settlements' || open === 'without') && (
        <DataTableModal
          open
          onClose={() => setOpen(null)}
          title={t(open === 'without' ? 'gyse.withoutTitle' : 'gyse.settlementTitle')}
          subtitle={t(open === 'without' ? 'gyse.withoutSubtitle' : 'gyse.settlementSubtitle')}
          rows={open === 'without' ? without : settlements}
          columns={SETTLEMENT_COLUMNS}
          filename={`praxisterkep-segedeszkoz-telepulesek-${open}`}
          countUnit="rows"
        />
      )}
    </section>
  );
}
