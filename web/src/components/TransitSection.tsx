// "Busszal is elérhető?": the same care destinations, for a household
// without a car. Scheduled departures on an ordinary Wednesday, and whether
// any of them reaches the settlement of the nearest surgery, on-call point
// or hospital without a change. "No direct bus" is not "unreachable" — a
// change may work — but a change is exactly what an eighty-year-old cannot
// always make, and the copy keeps the two apart.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  TRANSIT_COLUMNS, TRANSIT_COUNTY_COLUMNS, serviceBreakdown, transitCountyRows,
  transitRows, useTransit,
} from '../lib/mobility';
import { DataTableModal } from './DataTableModal';

const TARGETS = ['gp', 'oncall', 'inpatient'] as const;

export function TransitSection() {
  const data = useTransit();
  const [target, setTarget] = useState<(typeof TARGETS)[number]>('oncall');
  const [open, setOpen] = useState<'settlements' | 'counties' | null>(null);

  const rows = useMemo(
    () => sortRows(transitRows(data), 'departures', 'asc'), [data],
  );
  const counties = useMemo(() => transitCountyRows(data), [data]);
  const breakdown = useMemo(() => serviceBreakdown(data, target), [data, target]);

  if (!data) return null;
  const st = data.stats;
  const layer = (st[target] ?? {}) as {
    direct: number; noDirect: number; populationNoDirect: number;
    medianMinutes: number | null; maxMinutes: number | null;
  };
  const total = st.settlements;

  return (
    <section className="section container" id="busz">
      <h2 className="section__heading">{t('transit.heading')}</h2>
      <p className="section__explain">{t('transit.explain', {
        day: String(data.referenceDay),
        settlements: formatNumber(st.withService),
        total: formatNumber(total),
      })}</p>
      <p className="section__explain">{t('transit.caveat')}</p>

      <div className="seg" role="group">
        {TARGETS.map((x) => (
          <button key={x} aria-pressed={target === x} onClick={() => setTarget(x)}>
            {t(`transit.target.${x}`)}
          </button>
        ))}
      </div>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{formatNumber(layer.noDirect ?? 0)}</strong>
          <span>{t('transit.lead', {
            target: t(`transit.target.${target}`),
            people: formatNumber(layer.populationNoDirect ?? 0),
          })}</span>
        </div>
        {breakdown.map((b) => (
          <div key={b.key} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{t(`transit.state.${b.key}`)}</span>
            <span className="eeszt-coverage__bar">
              <span style={{ width: `${(b.n / total) * 100}%`, background: b.color }} />
            </span>
            <span className="eeszt-coverage__val">
              {formatNumber(b.n)} <em>({formatNumber(b.population)} {t('access.people')})</em>
            </span>
          </div>
        ))}
      </div>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatNumber(st.medianDepartures)}</strong> {t('transit.statDepartures')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.withoutService)}</strong>
          {' '}{t('transit.statNoService', {
            people: formatNumber(st.populationWithoutService),
          })}
        </span>
        <span className="extra-stats__item">
          <strong>{layer.medianMinutes === null ? '–'
            : t('travel.minutes', { n: formatNumber(layer.medianMinutes ?? 0) })}</strong>
          {' '}{t('transit.statRide')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.capitalDistricts)}</strong> {t('transit.statCapital')}
        </span>
      </div>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('settlements')}>
          {t('transit.openTable', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('counties')}>
          {t('transit.openCounties')}
        </button>
      </div>
      <p className="extra-note">{t('transit.note', {
        source: data.source,
        licence: data.licence,
        feed: data.feedVersion,
        from: data.feedStart,
        to: data.feedEnd,
      })}</p>
      <p className="extra-note">{t('transit.railNote')}</p>

      <DataTableModal
        open={open === 'settlements'}
        onClose={() => setOpen((cur) => (cur === 'settlements' ? null : cur))}
        title={t('transit.tableTitle')}
        subtitle={t('transit.tableSubtitle')}
        rows={rows}
        columns={TRANSIT_COLUMNS}
        filename="praxisterkep-busz"
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={t('transit.countyTitle')}
        subtitle={t('transit.countySubtitle')}
        rows={counties}
        columns={TRANSIT_COUNTY_COLUMNS}
        filename="praxisterkep-busz-megyek"
        countUnit="rows"
      />
    </section>
  );
}
