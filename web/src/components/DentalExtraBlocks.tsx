// The dental services outside the district map, in the two parts the NEAK
// registry itself uses: still inside "1. Alapellátás" the on-call and the
// university primary-care services (tables only), then "2. Szakellátás" with
// every specialist service — analysed, mapped and exportable like the
// districts above.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  countyBreakdown, extraColumns, extraRows, groupStat, typeBreakdown,
  useDentalExtra, type ExtraGroup, type ExtraRow,
} from '../lib/dentalExtra';
import { serviceTypeColor } from '../lib/palette';
import { DataTableModal } from './DataTableModal';
import { EesztMap, type MapRow } from './EesztMap';
import { renderExtraCell } from './EesztCells';

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span className="extra-stats__item">
      <strong>{formatNumber(n)}</strong> {label}
    </span>
  );
}

/** the side panel of the specialist map — the registry fields, then EESZT */
function detailRows(row: MapRow): [string, string][] {
  const pairs: [string, string][] = [
    [t('extra.colUnitType'), String(row.unitType ?? '–')],
    [t('extra.colLevel'), String(row.status ?? '–')],
    [t('extra.colAddress'), String(row.address ?? '–')],
    [t('extra.colDoctorCount'), formatNumber(Number(row.doctorCount ?? 0))],
  ];
  if (row.provider) pairs.push([t('eeszt.provider'), String(row.provider)]);
  if (row.neakCode) pairs.push([t('eeszt.colNeakCode'), String(row.neakCode)]);
  pairs.push([t('eeszt.colState'), String(row.eesztState ?? '–')]);
  if (row.profession) pairs.push([t('eeszt.colProfession'), String(row.profession)]);
  if (row.licAddress) {
    pairs.push([t('eeszt.licence'),
      `${row.licSettlement ?? ''}, ${row.licAddress}`]);
  }
  if (row.reason) pairs.push([t('eeszt.colReason'), String(row.reason)]);
  pairs.push([t('extra.colGeoFrom'), String(row.geoFrom ?? '–')]);
  pairs.push([t('extra.colCode'), String(row.fin)]);
  return pairs;
}

export function DentalExtraBlocks() {
  const data = useDentalExtra();
  const [open, setOpen] = useState<ExtraGroup | null>(null);

  const rows = useMemo(() => ({
    oncall: sortRows(extraRows(data, 'oncall'), 'settlement', 'asc') as ExtraRow[],
    university: sortRows(extraRows(data, 'university'), 'settlement', 'asc') as ExtraRow[],
    specialist: sortRows(extraRows(data, 'specialist'), 'settlement', 'asc') as ExtraRow[],
  }), [data]);
  const specialistTypes = useMemo(() => typeBreakdown(data, 'specialist'), [data]);
  const categories = useMemo(
    () => specialistTypes.map((x) => ({
      key: x.type, label: x.type, color: serviceTypeColor(x.type),
    })),
    [specialistTypes],
  );

  if (!data) return null;
  const maxType = specialistTypes[0]?.services ?? 1;

  const block = (group: ExtraGroup) => {
    const n = rows[group].length;
    const counties = countyBreakdown(data, group).length;
    return (
      <div className="extra-block">
        <h4 className="extra-block__title">{t(`extra.${group}Title`)}</h4>
        <p className="section__explain">{t(`extra.${group}Explain`)}</p>
        <div className="extra-stats">
          <Stat n={n} label={t('extra.statServices')} />
          <Stat n={groupStat(data, group, 'rows')} label={t('extra.statRows')} />
          <Stat n={groupStat(data, group, 'licence')} label={t('extra.statLicence')} />
          <Stat n={counties} label={t('extra.statCounties')} />
        </div>
        <button className="data-btn" onClick={() => setOpen(group)}>
          {t('extra.openTable', { n: formatNumber(n) })}
        </button>
      </div>
    );
  };

  return (
    <>
      {block('oncall')}
      {block('university')}

      <h3 className="section__subheading" id="eeszt-specialist">
        {t('extra.part2')}
      </h3>
      <p className="section__explain">{t('extra.specialistExplain')}</p>
      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{formatNumber(rows.specialist.length)}</strong>
          <span>{t('extra.specialistTotal')}</span>
        </div>
        {specialistTypes.map((x) => (
          <div key={x.type} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{x.type}</span>
            <span className="eeszt-coverage__bar">
              <span style={{
                width: `${(x.services / maxType) * 100}%`,
                background: serviceTypeColor(x.type),
              }} />
            </span>
            <span className="eeszt-coverage__val">{formatNumber(x.services)}</span>
          </div>
        ))}
      </div>
      <div className="extra-stats">
        <Stat n={groupStat(data, 'specialist', 'licence')} label={t('extra.statLicence')} />
        <Stat n={groupStat(data, 'specialist', 'geo')} label={t('extra.statLocated')} />
        <Stat n={groupStat(data, 'specialist', 'named')} label={t('extra.statNamed')} />
        <Stat n={countyBreakdown(data, 'specialist').length} label={t('extra.statCounties')} />
      </div>

      <EesztMap rows={rows.specialist} categories={categories} detailRows={detailRows}
        searchLink={false} countKey="extra.mapCount" />

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('specialist')}>
          {t('extra.openTable', { n: formatNumber(rows.specialist.length) })}
        </button>
      </div>
      <p className="extra-note">{t('extra.note', { month: data.dataMonth, asOf: data.asOf })}</p>

      {(['oncall', 'university', 'specialist'] as ExtraGroup[]).map((group) => (
        <DataTableModal
          key={group}
          open={open === group}
          onClose={() => setOpen((cur) => (cur === group ? null : cur))}
          title={t(`extra.${group}Title`)}
          subtitle={t('extra.tableSubtitle', { month: data.dataMonth, asOf: data.asOf })}
          rows={rows[group]}
          columns={extraColumns(group)}
          filename={`praxisterkep-fogaszat-${group}`}
          renderCell={renderExtraCell}
          countUnit="services"
          above={group === 'specialist' ? {
            label: t('eeszt.mapToggle'),
            render: (filtered) => (
              <EesztMap rows={filtered as MapRow[]} height={320} countyFilter={false}
                fitToRows searchLink={false} categories={categories}
                detailRows={detailRows} countKey="extra.mapCount" />
            ),
          } : undefined}
        />
      ))}
    </>
  );
}
