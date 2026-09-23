// "Ügyelet és mentő": what stands around a district that has no physician.
// The site has always been able to say a district is vacant; this is the
// first block that can say what is near it — the nearest központi ügyelet and
// the nearest ambulance station. Neither proves care arrives, and the copy
// says so; what they do is turn "vacant" into something a resident can weigh.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  BAND_COLORS, COUNTY_COLUMNS, DISTRICT_COLUMNS, GROUP_COLORS, POINT_COLUMNS,
  SETTLEMENT_COLUMNS, type EmergencyGroup, bandBreakdown, countyRows,
  districtRows, groupStats, pointRows, settlementRows, useEmergency,
} from '../lib/emergency';
import { DataTableModal } from './DataTableModal';
import { EesztMap, type MapRow } from './EesztMap';
import { renderExtraCell } from './EesztCells';
import type { PraxisKind } from '../types';

function detailRows(row: MapRow): [string, string][] {
  return [
    [t('emergency.colGroup'), String(row.groupLabel ?? '–')],
    [t('vedono.colProvider'), String(row.provider ?? '–')],
    [t('eeszt.colAddress'), `${row.postalCode ?? ''} ${row.settlement ?? ''}, ${row.address ?? ''}`],
    [t('eeszt.colLicence'), String(row.licenceId || '–')],
    [t('eeszt.colFin'), String(row.fin)],
  ];
}

type Modal = 'points' | 'settlements' | 'districts' | 'counties' | null;

export function EmergencySection({ kind }: { kind: PraxisKind }) {
  const data = useEmergency();
  const [group, setGroup] = useState<EmergencyGroup>('oncall');
  const [open, setOpen] = useState<Modal>(null);

  const points = useMemo(() => pointRows(data, 'all'), [data]);
  const mapPoints = useMemo(() => points.filter((p) => p.lat !== null), [points]);
  const settlements = useMemo(
    () => sortRows(settlementRows(data), `${group}Km`, 'desc'), [data, group],
  );
  const districts = useMemo(
    () => sortRows(districtRows(data, kind), `${group}Km`, 'desc'), [data, kind, group],
  );
  const counties = useMemo(() => countyRows(data), [data]);
  const bands = useMemo(() => bandBreakdown(data, group), [data, group]);
  const categories = useMemo(() => (['oncall', 'ambulance', 'transport', 'dialysis'] as const)
    .map((g) => ({
      key: t(`emergency.group.${g}`), label: t(`emergency.group.${g}`), color: GROUP_COLORS[g],
    })), []);

  if (!data) return null;
  const stats = groupStats(data, group);
  const oncall = data.groups.oncall;
  const ambulance = data.groups.ambulance;
  const totalSettlements = data.stats.settlements as number;

  return (
    <section className="section container" id="ugyelet">
      <h2 className="section__heading">{t('emergency.heading')}</h2>
      <p className="section__explain">{t('emergency.explain', {
        oncall: formatNumber(oncall.services),
        ambulance: formatNumber(ambulance.services),
      })}</p>
      <p className="section__explain">{t('emergency.caveat')}</p>

      <div className="seg" role="group">
        {(['oncall', 'ambulance'] as EmergencyGroup[]).map((g) => (
          <button key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>
            {t(`emergency.group.${g}`)}
          </button>
        ))}
      </div>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{stats?.medianKm ?? '–'} km</strong>
          <span>{t('emergency.median', { group: t(`emergency.group.${group}`) })}</span>
        </div>
        {bands.map(({ band, n, population }) => (
          <div key={band} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{t(`emergency.band.${band}`)}</span>
            <span className="eeszt-coverage__bar">
              <span style={{
                width: `${(n / totalSettlements) * 100}%`,
                background: BAND_COLORS[band],
              }} />
            </span>
            <span className="eeszt-coverage__val">
              {formatNumber(n)} <em>({formatNumber(population)} {t('access.people')})</em>
            </span>
          </div>
        ))}
      </div>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatNumber(stats?.populationBeyond20 ?? 0)}</strong>
          {' '}{t('emergency.beyond20')}
        </span>
        <span className="extra-stats__item">
          <strong>{stats?.districtMedianKm ?? '–'} km</strong> {t('emergency.districtMedian')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(stats?.districtsBeyond20 ?? 0)}</strong>
          {' '}{t('emergency.districtsBeyond20')}
        </span>
        <span className="extra-stats__item">
          <strong>{stats?.maxKm ?? '–'} km</strong> {t('emergency.max')}
        </span>
      </div>

      <EesztMap rows={mapPoints as MapRow[]} categories={categories} detailRows={detailRows}
        searchLink={false} countKey="emergency.mapCount"
        exportName="praxisterkep-ugyelet" />

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('districts')}>
          {tKind('emergency.openDistricts', kind, { n: formatNumber(districts.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('settlements')}>
          {t('emergency.openSettlements', { n: formatNumber(settlements.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('points')}>
          {t('emergency.openPoints', { n: formatNumber(points.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('counties')}>
          {t('emergency.openCounties')}
        </button>
      </div>
      <p className="extra-note">{t('emergency.note', {
        asOf: data.asOf,
        oncallLocated: formatNumber(oncall.located),
        oncallTotal: formatNumber(oncall.services),
        ambulanceLocated: formatNumber(ambulance.located),
        ambulanceTotal: formatNumber(ambulance.services),
      })}</p>

      <DataTableModal
        open={open === 'districts'}
        onClose={() => setOpen((cur) => (cur === 'districts' ? null : cur))}
        title={tKind('emergency.districtTitle', kind)}
        subtitle={t('emergency.districtSubtitle')}
        rows={districts}
        columns={DISTRICT_COLUMNS}
        filename={`praxisterkep-ugyelet-korzetek-${kind}`}
        countUnit="districts"
      />
      <DataTableModal
        open={open === 'settlements'}
        onClose={() => setOpen((cur) => (cur === 'settlements' ? null : cur))}
        title={t('emergency.settlementTitle')}
        subtitle={t('emergency.settlementSubtitle')}
        rows={settlements}
        columns={SETTLEMENT_COLUMNS}
        filename="praxisterkep-ugyelet-telepulesek"
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'points'}
        onClose={() => setOpen((cur) => (cur === 'points' ? null : cur))}
        title={t('emergency.pointTitle')}
        subtitle={t('emergency.pointSubtitle')}
        rows={points}
        columns={POINT_COLUMNS}
        filename="praxisterkep-ugyeleti-pontok"
        renderCell={renderExtraCell}
        countUnit="rows"
        above={{
          label: t('eeszt.mapToggle'),
          render: (filtered) => (
            <EesztMap rows={filtered.filter((r) => r.lat !== null) as MapRow[]} height={320}
              countyFilter={false} fitToRows searchLink={false} categories={categories}
              detailRows={detailRows} countKey="emergency.mapCount"
              exportName="praxisterkep-ugyelet" />
          ),
        }}
      />
      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={t('emergency.countyTitle')}
        subtitle={t('emergency.countySubtitle')}
        rows={counties}
        columns={COUNTY_COLUMNS}
        filename="praxisterkep-ugyelet-megyek"
        countUnit="rows"
      />
    </section>
  );
}
