// "Ki tartja a körzeteket": turnover across the archive and the physicians
// holding more than one district. The archive names the contracted physician
// of every filled district, but no name is used here — the ETL reduces each
// to a pseudonymous key before counting, so this block can only say how many.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  BAND_COLORS, COUNTY_COLUMNS, DISTRICT_COLUMNS, PORTFOLIO_COLUMNS, bandLabel,
  countyRows, districtRows, portfolioRows, useWorkforce,
} from '../lib/workforce';
import { DataTableModal } from './DataTableModal';
import type { PraxisKind } from '../types';

type Modal = 'portfolios' | 'districts' | 'counties' | null;

export function WorkforceSection({ kind }: { kind: PraxisKind }) {
  const data = useWorkforce();
  const [open, setOpen] = useState<Modal>(null);

  const portfolios = useMemo(
    () => sortRows(portfolioRows(data, kind), 'districts', 'desc'), [data, kind],
  );
  const districts = useMemo(
    () => sortRows(districtRows(data, kind), 'changes', 'desc'), [data, kind],
  );
  const counties = useMemo(() => countyRows(data, kind), [data, kind]);

  const model = data?.kinds?.[kind] ?? null;
  if (!model) return null;
  const st = model.stats;
  const multiShare = st.districtsHeldToday
    ? st.districtsInMultiHands / st.districtsHeldToday : 0;

  return (
    <section className="section container" id="orvosok">
      <h2 className="section__heading">{t('workforce.heading')}</h2>
      <p className="section__explain">{tKind('workforce.explain', kind, {
        months: String(model.archiveMonths),
        from: model.months[0],
        physicians: formatNumber(st.physicians),
        districts: formatNumber(st.districtsHeldToday),
      })}</p>
      <p className="section__explain">{t('workforce.privacy')}</p>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatNumber(st.multiDistrictPhysicians)}</strong>
          {' '}{t('workforce.statMulti')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.districtsInMultiHands)}</strong>
          {' '}{t('workforce.statMultiDistricts', { share: formatPercent(multiShare) })}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.largestPortfolio)}</strong> {t('workforce.statLargest')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatPercent(st.changeShare)}</strong> {t('workforce.statChanged')}
        </span>
      </div>

      <div className="extra-block">
        <h4 className="extra-block__title">{t('workforce.bandsTitle')}</h4>
        <p className="section__explain">{t('workforce.bandsExplain')}</p>
        <div className="eeszt-coverage">
          {model.portfolioBands.map((b) => (
            <div key={b.band} className="eeszt-coverage__row">
              <span className="eeszt-coverage__label">{bandLabel(b.band)}</span>
              <span className="eeszt-coverage__bar">
                <span style={{
                  width: `${(b.physicians / Math.max(st.physicians, 1)) * 100}%`,
                  background: BAND_COLORS[b.band],
                }} />
              </span>
              <span className="eeszt-coverage__val">
                {formatNumber(b.physicians)}
                {' '}<em>({formatNumber(b.districts)} {t('workforce.districtsShort')})</em>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('portfolios')}>
          {t('workforce.openPortfolios', { n: formatNumber(portfolios.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('districts')}>
          {t('workforce.openDistricts', { n: formatNumber(districts.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('counties')}>
          {t('workforce.openCounties')}
        </button>
      </div>
      <p className="extra-note">{t('workforce.note', {
        changes: formatNumber(st.changes),
        months: String(model.archiveMonths),
        crossCounty: formatNumber(st.crossCountyPhysicians),
      })}</p>

      <DataTableModal
        open={open === 'portfolios'}
        onClose={() => setOpen((cur) => (cur === 'portfolios' ? null : cur))}
        title={tKind('workforce.portfolioTitle', kind)}
        subtitle={t('workforce.portfolioSubtitle')}
        rows={portfolios}
        columns={PORTFOLIO_COLUMNS}
        filename={`praxisterkep-orvosok-tobb-korzet-${kind}`}
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'districts'}
        onClose={() => setOpen((cur) => (cur === 'districts' ? null : cur))}
        title={tKind('workforce.districtTitle', kind)}
        subtitle={t('workforce.districtSubtitle')}
        rows={districts}
        columns={DISTRICT_COLUMNS}
        filename={`praxisterkep-orvosvaltas-${kind}`}
        countUnit="districts"
      />
      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={tKind('workforce.countyTitle', kind)}
        subtitle={t('workforce.countySubtitle')}
        rows={counties}
        columns={COUNTY_COLUMNS}
        filename={`praxisterkep-orvosvaltas-megyek-${kind}`}
        countUnit="rows"
      />
    </section>
  );
}
