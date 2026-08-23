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
import { VacancyTableModal } from './VacancyTableModal';
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
  // page resets when the kind toggles (derived, no effect needed)
  const [pageState, setPageState] = useState({ kind, page: 0 });
  const page = pageState.kind === kind ? pageState.page : 0;
  const setPage = (p: number) => setPageState({ kind, page: p });
  const [tableOpen, setTableOpen] = useState(false);

  const counties = useMemo(() => countyNames(entries), [entries]);
  const change = useMemo(() => overallChange(entries), [entries]);
  const changeRows = useMemo(() => countyChange(entries), [entries]);
  const longest = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.praxes]
      .filter((p) => p.status === 'vacant')
      .sort((a, b) => a.vacantSince.localeCompare(b.vacantSince));
  }, [snapshot]);
  const PAGE_SIZE = 10;
  const pageCount = Math.max(1, Math.ceil(longest.length / PAGE_SIZE));
  const pageStart = Math.min(page, pageCount - 1) * PAGE_SIZE;
  const pageRows = longest.slice(pageStart, pageStart + PAGE_SIZE);
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
            <div className={`stat__value ${latest.populationVacant + latest.populationDissolved >= 1_000_000 ? 'stat__value--long' : ''}`}>
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
            <figcaption className="chart-card__head">
              <div>
                <h3>{t('stats.longestTitle')}</h3>
                <p>{t('stats.longestExplain')}</p>
              </div>
              <button className="icon-button" title={t('stats.openTable')}
                aria-label={t('stats.openTable')}
                onClick={() => setTableOpen(true)}>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none"
                    stroke="currentColor" strokeWidth="1.6" />
                  <path d="M2.5 8h15M8 8v8.5M13 8v8.5" stroke="currentColor"
                    strokeWidth="1.6" />
                </svg>
              </button>
            </figcaption>
            <ol className="longest-list" start={pageStart + 1}
              style={{ counterReset: `longest ${pageStart}` }}>
              {pageRows.map((p) => {
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
            {pageCount > 1 && (
              <div className="pager">
                <button onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={pageStart === 0} aria-label={t('stats.pagePrev')}>
                  ‹
                </button>
                <span>
                  {t('stats.pageOf', {
                    from: pageStart + 1,
                    to: Math.min(pageStart + PAGE_SIZE, longest.length),
                    n: longest.length,
                  })}
                </span>
                <button onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
                  disabled={pageStart + PAGE_SIZE >= longest.length}
                  aria-label={t('stats.pageNext')}>
                  ›
                </button>
              </div>
            )}
          </figure>
        )}
      </div>

      {snapshot && (
        <VacancyTableModal snapshot={snapshot} open={tableOpen}
          onClose={() => setTableOpen(false)} />
      )}

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
