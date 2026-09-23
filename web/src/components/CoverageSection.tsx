// "Települési lefedettség a körzetszékhely helyett": the same vacancies,
// counted where people live rather than where the surgery is registered. A
// district seated in the small town serves the villages around it, and when
// it empties the villages never appear in a seat-based count.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  CLASS_COLORS, COVERAGE_COLUMNS, COVERAGE_COUNTY_COLUMNS, type CoverageClass,
  coverageCountyRows, coverageRows, useCoverage,
} from '../lib/analysis';
import { DataTableModal } from './DataTableModal';
import { CoverageTrendChart } from './charts/CoverageTrendChart';
import type { PraxisKind } from '../types';

const CLASSES: CoverageClass[] = ['filled', 'partial', 'vacantOnly', 'absent'];
const classKey = (c: CoverageClass) => `coverage.class${c[0].toUpperCase()}${c.slice(1)}`;

export function CoverageSection({ kind }: { kind: PraxisKind }) {
  const data = useCoverage();
  const [open, setOpen] = useState<CoverageClass | 'all' | 'counties' | null>(null);

  const model = data?.kinds?.[kind] ?? null;
  const rows = useMemo(
    () => sortRows(coverageRows(data, kind), 'population', 'desc'), [data, kind],
  );
  const counties = useMemo(
    () => coverageCountyRows(data, kind), [data, kind],
  );

  if (!model) return null;
  const st = model.stats;
  const affectedShare = st.population ? st.affectedPopulation / st.population : 0;

  return (
    <section className="section container" id="lefedettseg">
      <h2 className="section__heading">{t('coverage.heading')}</h2>
      <p className="section__explain">{tKind('coverage.explain', kind)}</p>
      <p className="section__explain">
        {t(model.servedListPublished ? 'coverage.servedKnown' : 'coverage.servedUnknown')}
      </p>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{formatNumber(st.affectedSettlements)}</strong>
          <span>{tKind('coverage.lead', kind, {
            people: formatNumber(st.affectedPopulation),
            share: formatPercent(affectedShare),
            seats: formatNumber(st.seatSettlements),
          })}</span>
        </div>
        {CLASSES.map((c) => (
          <div key={c} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{t(classKey(c))}</span>
            <span className="eeszt-coverage__bar">
              <span style={{
                width: `${(st.byClass[c] / st.settlements) * 100}%`,
                background: CLASS_COLORS[c],
              }} />
            </span>
            <span className="eeszt-coverage__val">
              <button className="info-drill" onClick={() => setOpen(c)}>
                {formatNumber(st.byClass[c])}
              </button>
              {' '}<em>({formatNumber(st.populationByClass[c])} {t('access.people')})</em>
            </span>
          </div>
        ))}
      </div>

      <div className="extra-block">
        <h4 className="extra-block__title">{t('coverage.trendTitle')}</h4>
        <p className="section__explain">{t('coverage.trendExplain', {
          from: model.series[0]?.month ?? '',
          fromN: formatNumber(model.series[0]?.affectedSettlements ?? 0),
          to: model.series[model.series.length - 1]?.month ?? '',
          toN: formatNumber(st.affectedSettlements),
        })}</p>
        <CoverageTrendChart points={model.series} color={CLASS_COLORS.vacantOnly} />
      </div>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatNumber(st.seatSettlements)}</strong> {t('coverage.seatView')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.affectedSettlements)}</strong> {t('coverage.settlementView')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.affectedOld)}</strong> {t('coverage.affectedOld')}
        </span>
      </div>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('all')}>
          {t('coverage.openTable', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('counties')}>
          {t('coverage.openCounties')}
        </button>
      </div>
      <p className="extra-note">{t('coverage.note', { month: data?.dataMonth ?? '' })}</p>

      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={tKind('coverage.countyTitle', kind)}
        subtitle={t('coverage.countySubtitle')}
        rows={counties}
        columns={COVERAGE_COUNTY_COLUMNS}
        filename={`praxisterkep-lefedettseg-megyek-${kind}`}
        countUnit="rows"
      />
      {open && open !== 'counties' && (
        <DataTableModal
          open
          onClose={() => setOpen(null)}
          title={open === 'all'
            ? tKind('coverage.tableTitle', kind)
            : t(classKey(open as CoverageClass))}
          subtitle={t(open === 'all' ? 'coverage.tableSubtitle' : 'coverage.classSubtitle')}
          rows={open === 'all' ? rows : rows.filter((r) => r.class === open)}
          columns={COVERAGE_COLUMNS}
          filename={`praxisterkep-lefedettseg-${kind}-${open}`}
          countUnit="rows"
        />
      )}
    </section>
  );
}
