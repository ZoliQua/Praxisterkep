// "Gyógyszertárak" — the pharmacies NEAK has a dispensing contract with.
// The block says plainly what it is and is not: the contracted network, with
// no type and no opening hours, because the register that carries those
// forbids automated processing and the pipeline respects that.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  PHARMACY_COLUMNS, PHARMACY_COUNTY_COLUMNS, PHARMACY_SETTLEMENT_COLUMNS,
  pharmacyCountyRows, pharmacyRows, usePharmacy, withoutPharmacy,
} from '../lib/pharmacy';
import { DataTableModal } from './DataTableModal';
import { EesztMap, type MapRow } from './EesztMap';
import { renderExtraCell } from './EesztCells';

function detailRows(row: MapRow): [string, string][] {
  return [
    [t('pharmacy.colName'), String(row.name ?? '–')],
    [t('eeszt.colAddress'), `${row.postalCode ?? ''} ${row.settlement ?? ''}, ${row.address ?? ''}`],
    [t('pharmacy.colOperator'), String(row.operator || '–')],
  ];
}

type Modal = 'pharmacies' | 'counties' | 'without' | null;

export function PharmacySection() {
  const data = usePharmacy();
  const [open, setOpen] = useState<Modal>(null);

  const rows = useMemo(() => pharmacyRows(data), [data]);
  const mapRows = useMemo(() => rows.filter((r) => r.lat !== null), [rows]);
  const counties = useMemo(
    () => sortRows(pharmacyCountyRows(data), 'residentsPerPharmacy', 'desc'), [data],
  );
  const without = useMemo(() => withoutPharmacy(data), [data]);
  const categories = useMemo(() => [{
    key: 'pharmacy', label: t('pharmacy.mapLegend'), color: '#4fd6c2',
  }], []);

  if (!data) return null;
  const st = data.stats;
  const covered = st.settlementsTotal ? st.settlements / st.settlementsTotal : 0;
  const withoutPopulation = without.reduce((a, s) => a + Number(s.population ?? 0), 0);

  return (
    <section className="section container" id="gyogyszertar">
      <h2 className="section__heading">{t('pharmacy.heading')}</h2>
      <p className="section__explain">{t('pharmacy.explain', {
        n: formatNumber(st.pharmacies),
        settlements: formatNumber(st.settlements),
        total: formatNumber(st.settlementsTotal),
      })}</p>
      <p className="section__explain">{t('pharmacy.caveat')}</p>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatNumber(st.residentsPerPharmacy)}</strong> {t('pharmacy.statPer')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatPercent(covered)}</strong> {t('pharmacy.statCovered')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(without.length)}</strong>
          {' '}{t('pharmacy.statWithout', { people: formatNumber(withoutPopulation) })}
        </span>
      </div>

      <EesztMap rows={mapRows as MapRow[]} categories={categories} detailRows={detailRows}
        searchLink={false} countKey="pharmacy.mapCount" exportName="praxisterkep-gyogyszertarak" />

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('pharmacies')}>
          {t('pharmacy.openTable', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('without')}>
          {t('pharmacy.openWithout', { n: formatNumber(without.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('counties')}>
          {t('pharmacy.openCounties')}
        </button>
      </div>
      <p className="extra-note">{t('pharmacy.note', {
        month: data.dataMonth, geocoded: formatNumber(st.geocoded),
      })}</p>

      <DataTableModal
        open={open === 'pharmacies'}
        onClose={() => setOpen((cur) => (cur === 'pharmacies' ? null : cur))}
        title={t('pharmacy.tableTitle')}
        subtitle={t('pharmacy.tableSubtitle')}
        rows={rows}
        columns={PHARMACY_COLUMNS}
        filename="praxisterkep-gyogyszertarak"
        renderCell={renderExtraCell}
        countUnit="rows"
        above={{
          label: t('eeszt.mapToggle'),
          render: (filtered) => (
            <EesztMap rows={filtered.filter((r) => r.lat !== null) as MapRow[]} height={320}
              countyFilter={false} fitToRows searchLink={false} categories={categories}
              detailRows={detailRows} countKey="pharmacy.mapCount"
              exportName="praxisterkep-gyogyszertarak" />
          ),
        }}
      />
      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={t('pharmacy.countyTitle')}
        subtitle={t('pharmacy.countySubtitle')}
        rows={counties}
        columns={PHARMACY_COUNTY_COLUMNS}
        filename="praxisterkep-gyogyszertarak-megyek"
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'without'}
        onClose={() => setOpen((cur) => (cur === 'without' ? null : cur))}
        title={t('pharmacy.withoutTitle')}
        subtitle={t('pharmacy.withoutSubtitle')}
        rows={without}
        columns={PHARMACY_SETTLEMENT_COLUMNS}
        filename="praxisterkep-gyogyszertar-nelkul"
        countUnit="rows"
      />
    </section>
  );
}
