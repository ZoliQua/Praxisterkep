import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatDuration, formatMonth, formatNumber, formatPercent } from '../lib/format';
import {
  countyChange,
  countyNames,
  countySeries,
  flowPoints,
  medianSeries,
  overallChange,
  populationSeries,
  rateSeries,
  typeSeries,
  vacantSeries,
  type HistoryEntry,
} from '../lib/statsSelectors';
import { useAppStore, useHistoryEntries, usePersistence, useSnapshot } from '../store/useAppStore';
import { primarySite } from '../lib/selectors';
import { TimeSeriesChart, type ChartSeries } from './charts/TimeSeriesChart';
import { FlowChart } from './charts/FlowChart';
import { DurationHistogram } from './charts/DurationHistogram';
import { CountyChangeChart } from './charts/CountyChangeChart';
import { monthsBetween } from '../lib/format';

// validated categorical palette (dark surface #101823) — fixed assignment
const TYPE_COLORS: Record<string, string> = {
  adult: '#3d87e0',
  child: '#c98500',
  mixed: '#17a08c',
  school: '#9085e9',
};
const KIND_LINE = { dental: '#17a08c', gp: '#3d87e0' } as const;

function single(key: string, label: string, color: string, points: ChartSeries['points']): ChartSeries[] {
  return [{ key, label, color, points }];
}

/** axis-friendly duration: whole years above a year, months below */
function formatMonthsAxis(v: number): string {
  if (v === 0) return '0';
  return v >= 12 ? `${Math.round(v / 12)} év` : `${Math.round(v)} hó`;
}

/** compact Hungarian magnitude labels for population axes */
function formatCompactAxis(v: number): string {
  if (v === 0) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)} ezer`;
  return formatNumber(v);
}

export function StatsSection() {
  const kind = useAppStore((s) => s.kind);
  const entries = useHistoryEntries();
  const persistence = usePersistence();
  const snapshot = useSnapshot();
  const [county, setCounty] = useState<string>('');

  const counties = useMemo(() => countyNames(entries), [entries]);
  const change = useMemo(() => overallChange(entries), [entries]);
  const changeRows = useMemo(() => countyChange(entries), [entries]);
  const longest = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.praxes]
      .filter((p) => p.status === 'vacant')
      .sort((a, b) => a.vacantSince.localeCompare(b.vacantSince))
      .slice(0, 10);
  }, [snapshot]);
  const lineColor = KIND_LINE[kind];

  if (entries.length === 0) return null;
  const latest = entries[entries.length - 1];
  const byMonth = new Map<string, HistoryEntry>(entries.map((e) => [e.month, e]));

  const types = typeSeries(entries);
  const typeChartSeries: ChartSeries[] = [...types.entries()].map(([type, points]) => ({
    key: type,
    label: t(`praxisTypes.${type}`),
    color: TYPE_COLORS[type],
    points,
  }));

  const selectedCounty = county || counties[0];

  return (
    <section className="section container" id="statisztika">
      <h2 className="section__heading">{t('stats.heading')}</h2>
      <p className="section__explain">{tKind('stats.explain', kind)}</p>
      <p className="section__explain stats__coverage">
        {t('stats.coverage', {
          n: entries.length,
          first: formatMonth(entries[0].month),
          last: formatMonth(latest.month),
        })}
      </p>

      {change && change.ratio !== null && (
        <div className="statgrid statgrid--stats">
          <div className="stat">
            <div className={`stat__value ${change.delta > 0 ? 'stat__value--alert' : 'stat__value--accent'}`}>
              {change.delta > 0 ? '+' : ''}{formatNumber(change.delta)}
            </div>
            <div className="stat__label">
              {tKind('stats.changeSince', kind, { month: formatMonth(change.firstMonth) })}{' '}
              ({change.firstVacant} → {change.lastVacant};{' '}
              {change.ratio > 0 ? '+' : ''}{formatPercent(change.ratio, 0)})
            </div>
          </div>
          {latest.medianVacancyMonths !== null && (
            <div className="stat">
              <div className="stat__value">{formatDuration(latest.medianVacancyMonths)}</div>
              <div className="stat__label">{t('stats.medianNow')}</div>
            </div>
          )}
          <div className="stat">
            <div className="stat__value">
              {formatNumber(latest.populationVacant + latest.populationDissolved)}
            </div>
            <div className="stat__label">{tKind('stats.populationNow', kind)}</div>
          </div>
          {persistence && (
            <div className="stat">
              <div className="stat__value stat__value--soft">
                {formatPercent(persistence.stillVacant / persistence.firstVacant, 0)}
              </div>
              <div className="stat__label">
                {t('stats.persistence', {
                  month: formatMonth(persistence.firstMonth),
                  still: persistence.stillVacant,
                  first: persistence.firstVacant,
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="chart-grid">
        <figure className="chart-card">
          <figcaption>
            <h3>{t('stats.vacantTitle')}</h3>
            <p>{t('stats.vacantExplain')}</p>
          </figcaption>
          <TimeSeriesChart
            series={single('vacant', t('stats.vacantTitle'), lineColor, vacantSeries(entries))}
            tooltipExtra={(m) => {
              const e = byMonth.get(m);
              return e && e.dissolved > 0
                ? `+ ${formatNumber(e.dissolved)} ${t('stats.dissolvedNote')}`
                : null;
            }}
          />
        </figure>

        <figure className="chart-card">
          <figcaption>
            <h3>{t('stats.rateTitle')}</h3>
            <p>{t('stats.rateExplain')}</p>
          </figcaption>
          <TimeSeriesChart
            series={single('rate', t('stats.rateTitle'), lineColor, rateSeries(entries))}
            yFormat={(v) => formatPercent(v, 1)}
          />
        </figure>

        <figure className="chart-card">
          <figcaption>
            <h3>{t('stats.typesTitle')}</h3>
            <p>{t('stats.typesExplain')}</p>
          </figcaption>
          <TimeSeriesChart series={typeChartSeries} />
        </figure>

        <figure className="chart-card">
          <figcaption>
            <h3>{t('stats.flowTitle')}</h3>
            <p>{t('stats.flowExplain')}</p>
          </figcaption>
          <FlowChart points={flowPoints(entries)} />
        </figure>

        <figure className="chart-card">
          <figcaption>
            <h3>{t('stats.countyTitle')}</h3>
            <p>{t('stats.countyExplain')}</p>
          </figcaption>
          <label className="chart-card__control">
            {t('stats.countySelect')}
            <select value={selectedCounty} onChange={(e) => setCounty(e.target.value)}>
              {counties.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <TimeSeriesChart
            series={single('county', selectedCounty, lineColor, countySeries(entries, selectedCounty))}
          />
        </figure>

        <figure className="chart-card">
          <figcaption>
            <h3>{t('stats.medianTitle')}</h3>
            <p>{t('stats.medianExplain')}</p>
          </figcaption>
          <TimeSeriesChart
            series={single('median', t('stats.medianTitle'), lineColor, medianSeries(entries))}
            yFormat={formatMonthsAxis}
          />
        </figure>

        <figure className="chart-card">
          <figcaption>
            <h3>{t('stats.populationTitle')}</h3>
            <p>{t('stats.populationExplain')}</p>
          </figcaption>
          <TimeSeriesChart
            series={single('population', t('stats.populationTitle'), lineColor, populationSeries(entries))}
            yFormat={formatCompactAxis}
          />
        </figure>

        <figure className="chart-card">
          <figcaption>
            <h3>{t('stats.durationTitle', { month: formatMonth(latest.month) })}</h3>
            <p>{t('stats.durationExplain')}</p>
          </figcaption>
          <DurationHistogram buckets={latest.durationBuckets} color={lineColor} />
        </figure>
        {changeRows.length > 0 && change && (
          <figure className="chart-card chart-card--tall">
            <figcaption>
              <h3>{t('stats.countyChangeTitle', {
                first: formatMonth(change.firstMonth),
                last: formatMonth(change.lastMonth),
              })}</h3>
              <p>{t('stats.countyChangeExplain')}</p>
            </figcaption>
            <CountyChangeChart rows={changeRows} color={lineColor}
              firstMonth={change.firstMonth} lastMonth={change.lastMonth} />
          </figure>
        )}

        {snapshot && longest.length > 0 && (
          <figure className="chart-card chart-card--tall">
            <figcaption>
              <h3>{t('stats.longestTitle')}</h3>
              <p>{t('stats.longestExplain')}</p>
            </figcaption>
            <ol className="longest-list">
              {longest.map((p) => {
                const site = primarySite(p);
                return (
                  <li key={p.id}>
                    <span className="longest-list__place">
                      <strong>{site?.settlement}</strong>
                      <span>{p.county} · {t(`praxisTypes.${p.type}`)}</span>
                    </span>
                    <span className="longest-list__time">
                      <strong>{formatDuration(monthsBetween(p.vacantSince, snapshot.month))}</strong>
                      <span>
                        {formatMonth(p.vacantSince)} {t('stats.longestSince')}
                        {p.population ? ` · ${formatNumber(p.population)} ${t('stats.longestPop')}` : ''}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </figure>
        )}
      </div>

      <details className="stats-table">
        <summary>{t('stats.tableToggle')}</summary>
        <div className="stats-table__scroll">
          <table>
            <thead>
              <tr>
                <th>{t('stats.thMonth')}</th>
                <th>{t('map.countyVacant')}</th>
                <th>{t('map.countyDissolved')}</th>
                <th>{t('stats.thRate')}</th>
                <th>{t('map.metricPopulation')}</th>
                <th>{t('stats.thMedian')}</th>
                <th>{t('stats.flowEntered')}</th>
                <th>{t('stats.flowLeft')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.month}>
                  <td>{e.month}</td>
                  <td>{formatNumber(e.vacant)}</td>
                  <td>{e.dissolved > 0 ? formatNumber(e.dissolved) : '–'}</td>
                  <td>{e.vacancyRate !== null ? formatPercent(e.vacancyRate) : '–'}</td>
                  <td>{formatNumber(e.populationVacant + e.populationDissolved)}</td>
                  <td>{e.medianVacancyMonths !== null ? e.medianVacancyMonths : '–'}</td>
                  <td>{e.flow ? `+${formatNumber(e.flow.entered)}` : '–'}</td>
                  <td>{e.flow ? `−${formatNumber(e.flow.left)}` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
