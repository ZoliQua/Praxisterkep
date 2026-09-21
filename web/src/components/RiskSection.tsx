// "Kockázati előrejelzés": every district that has a doctor today, ranked by
// how likely it is to lose one within a year. The block shows the model's
// out-of-sample check next to its output, because a ranking that cannot say
// how well it worked is not worth acting on. One block of the analysis page.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import type { Row } from '../lib/eesztTable';
import {
  BAND_COLORS, RISK_COLUMNS, bandBreakdown, countyRisk, levelLabel, riskRows,
  useRisk,
} from '../lib/risk';
import { eesztPraxis, useEeszt } from '../lib/eeszt';
import { DataTableModal } from './DataTableModal';
import { EesztMap, type MapRow } from './EesztMap';
import { renderExtraCell } from './EesztCells';
import type { PraxisKind } from '../types';

const COUNTY_COLUMNS = [
  { key: 'county', labelKey: 'stats.thCounty', type: 'enum' as const, visible: true },
  { key: 'districts', labelKey: 'risk.colDistricts', type: 'number' as const, visible: true },
  { key: 'atRisk', labelKey: 'risk.colAtRisk', type: 'number' as const, visible: true },
  { key: 'share', labelKey: 'risk.colShare', type: 'number' as const, visible: true },
  { key: 'meanRisk', labelKey: 'risk.colMeanRisk', type: 'number' as const, visible: true },
];

function detailRows(row: MapRow): [string, string][] {
  return [
    [t('risk.colRisk'), `${formatNumber(Number(row.risk ?? 0))}%`],
    [t('risk.colBand'), String(row.band ?? '–')],
    [t('risk.colTenure'), row.tenureYears === null ? '–' : `${formatNumber(Number(row.tenureYears))} év`],
    [t('risk.colWasVacant'), row.wasVacant ? t('eeszt.yes') : t('eeszt.no')],
    [t('benefit.column'), row.benefit ? t('eeszt.yes') : t('eeszt.no')],
    [t('risk.colWhy'), String(row.why ?? '–')],
    [t('eeszt.colFin'), String(row.fin)],
  ];
}

export function RiskSection({ kind }: { kind: PraxisKind }) {
  const data = useRisk();
  const eeszt = useEeszt();
  const [open, setOpen] = useState<'districts' | 'counties' | null>(null);

  const rows = useMemo<MapRow[]>(() => {
    const base = riskRows(data, kind);
    // the map needs coordinates, which live in the EESZT supplement
    return base.map((r: Row): MapRow => {
      const geo = eesztPraxis(eeszt, String(r.fin))?.geo;
      return {
        ...r,
        fin: String(r.fin),
        settlement: String(r.settlement ?? ''),
        county: String(r.county ?? ''),
        status: '',
        lat: geo?.lat ?? null,
        lon: geo?.lon ?? null,
        geoApprox: geo?.approx ?? null,
        settlementMatch: null,
        unitCode: null,
        licenceId: null,
        providerId: null,
        type: String(r.band ?? ''), // the map colours by `type`
        praxisType: r.type,
      };
    });
  }, [data, kind, eeszt]);

  const bands = useMemo(() => bandBreakdown(data, kind), [data, kind]);
  const counties = useMemo(() => countyRisk(data, kind), [data, kind]);
  const categories = useMemo(
    () => bands.map((b) => ({
      key: t(`risk.band.${b.band}`), label: t(`risk.band.${b.band}`),
      color: BAND_COLORS[b.band],
    })),
    [bands],
  );

  if (!data) {
    return <div className="loading">…</div>;
  }
  const model = data.kinds[kind];
  const check = model.validation;
  const total = model.rows.length;
  const factors = ['tenure', 'population', 'benefit', 'wasVacant', 'type', 'soloProvider'];

  return (
    <>
      <header className="section container" id="kockazat">
        <h2 className="section__heading">{t('risk.heading')}</h2>
        <p className="section__explain">{tKind('risk.explain', kind, {
          months: String(model.months.length),
          from: model.months[0],
          horizon: String(data.horizonMonths),
        })}</p>
      </header>

      <section className="section container">
        <div className="eeszt-coverage">
          <div className="eeszt-coverage__total">
            <strong>{formatPercent(model.baseHazard12)}</strong>
            <span>{tKind('risk.baseRate', kind, { horizon: String(data.horizonMonths) })}</span>
          </div>
          {bands.map(({ band, n, meanRisk }) => (
            <div key={band} className="eeszt-coverage__row">
              <span className="eeszt-coverage__label">{t(`risk.band.${band}`)}</span>
              <span className="eeszt-coverage__bar">
                <span style={{ width: `${(n / total) * 100}%`, background: BAND_COLORS[band] }} />
              </span>
              <span className="eeszt-coverage__val">
                {formatNumber(n)} <em>({formatPercent(meanRisk)} {t('risk.meanShort')})</em>
              </span>
            </div>
          ))}
        </div>

        <div className="risk-check">
          <h3 className="section__subheading">{t('risk.checkTitle')}</h3>
          <p className="section__explain">
            {t('risk.checkExplain', {
              from: data.validationFrom,
              events: formatNumber(check.events ?? 0),
              base: formatPercent(check.baseRate12 ?? 0),
              top: formatPercent(check.topDecileRate12 ?? 0),
              lift: check.lift ? formatNumber(check.lift) : '–',
              auc: check.auc ? formatNumber(check.auc) : '–',
            })}
          </p>
        </div>

        <EesztMap rows={rows} categories={categories} detailRows={detailRows}
          searchLink={false} countKey="risk.mapCount" exportName={`praxisterkep-kockazat-${kind}`} />

        <div className="eeszt-actions">
          <button className="data-btn data-btn--accent" onClick={() => setOpen('districts')}>
            {t('risk.openTable', { n: formatNumber(total) })}
          </button>
          <button className="data-btn" onClick={() => setOpen('counties')}>
            {t('risk.openCounties')}
          </button>
        </div>
      </section>

      <section className="section container">
        <h2 className="section__heading">{t('risk.factorsTitle')}</h2>
        <p className="section__explain">{t('risk.factorsExplain')}</p>
        <div className="data-files">
          <table className="info-table data-files__table">
            <thead>
              <tr>
                <th>{t('risk.thFactor')}</th>
                <th>{t('risk.thLevel')}</th>
                <th className="is-num">{t('risk.thLift')}</th>
                <th className="is-num">{t('risk.thEvents')}</th>
                <th className="is-num">{t('risk.thObserved')}</th>
              </tr>
            </thead>
            <tbody>
              {factors.flatMap((factor) => {
                const levels = Object.entries(model.lifts[factor] ?? {})
                  .sort((a, b) => b[1] - a[1]);
                return levels.map(([level, lift], index) => (
                  <tr key={`${factor}-${level}`}>
                    <td>{index === 0 ? t(`risk.factor.${factor}`) : ''}</td>
                    <td>{levelLabel(factor, level)}</td>
                    <td className="is-num">
                      <strong style={{
                        color: lift > 1.15 ? BAND_COLORS.magas
                          : lift < 0.9 ? BAND_COLORS.alacsony : 'inherit',
                      }}>{formatNumber(Math.round(lift * 100) / 100)}×</strong>
                    </td>
                    <td className="is-num">
                      {formatNumber(model.cells[factor]?.[level]?.events ?? 0)}
                    </td>
                    <td className="is-num">
                      {formatPercent(model.cells[factor]?.[level]?.rate12 ?? 0)}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>

        <h2 className="section__heading">{t('risk.limitsTitle')}</h2>
        <ul className="info-list">
          {['l1', 'l2', 'l3', 'l4'].map((k) => <li key={k}>{t(`risk.${k}`)}</li>)}
        </ul>
        <p className="extra-note">{t('risk.note', { month: data.dataMonth })}</p>
      </section>

      <DataTableModal
        open={open === 'districts'}
        onClose={() => setOpen((cur) => (cur === 'districts' ? null : cur))}
        title={tKind('risk.tableTitle', kind)}
        subtitle={t('risk.tableSubtitle', { horizon: String(data.horizonMonths) })}
        rows={rows}
        columns={RISK_COLUMNS}
        filename={`praxisterkep-kockazat-${kind}`}
        renderCell={renderExtraCell}
        countUnit="districts"
        above={{
          label: t('eeszt.mapToggle'),
          render: (filtered) => (
            <EesztMap rows={filtered as MapRow[]} height={320} countyFilter={false}
              fitToRows searchLink={false} categories={categories} detailRows={detailRows}
              countKey="risk.mapCount" exportName={`praxisterkep-kockazat-${kind}`} />
          ),
        }}
      />
      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={tKind('risk.countyTitle', kind)}
        subtitle={t('risk.countySubtitle')}
        rows={counties.map((c) => ({
          county: c.county,
          districts: c.districts,
          atRisk: c.atRisk,
          share: Math.round(c.share * 1000) / 10,
          meanRisk: Math.round(c.meanRisk * 1000) / 10,
        }))}
        columns={COUNTY_COLUMNS}
        filename={`praxisterkep-kockazat-megyek-${kind}`}
        countUnit="rows"
      />
    </>
  );
}
