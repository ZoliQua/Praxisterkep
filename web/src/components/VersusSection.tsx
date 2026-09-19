// Side-by-side comparison of the two care branches (dental vs GP): headline
// indicators, overlaid rate/median time series and a per-county dumbbell.
// Everything is read from both kinds' snapshots + history at once, so the
// section is independent of the global kind toggle.
import { useMemo } from 'react';
import { locale, t } from '../lib/i18n';
import { formatDecimal, formatDuration, formatMonth, formatNumber, formatPercent, monthsBetween } from '../lib/format';
import { longestVacant, primarySite } from '../lib/selectors';
import { medianSeries, rateSeries, type HistoryEntry } from '../lib/statsSelectors';
import { useAppStore } from '../store/useAppStore';
import { TimeSeriesChart, type ChartSeries } from './charts/TimeSeriesChart';
import type { PraxisKind, Snapshot } from '../types';

const COLORS: Record<PraxisKind, string> = { dental: '#17a08c', gp: '#3d87e0' };

const ROW_H = 24;
const LABEL_W = 190;
const WIDTH = 900;

function metricRows(dental: Snapshot, gp: Snapshot,
  histDental: HistoryEntry[], histGp: HistoryEntry[]): [string, string, string][] {
  const f = (s: Snapshot) => {
    const all = s.national.vacant + s.national.dissolved;
    return {
      all,
      rate: s.national.vacancyRate,
      pop: s.national.populationVacant + s.national.populationDissolved,
      share: s.national.populationShare,
      per10k: s.national.praxesPer10k,
      longTerm: s.national.longTerm,
    };
  };
  const a = f(dental);
  const b = f(gp);
  const medA = histDental[histDental.length - 1]?.medianVacancyMonths;
  const medB = histGp[histGp.length - 1]?.medianVacancyMonths;
  const longA = longestVacant(dental.praxes);
  const longB = longestVacant(gp.praxes);
  const longTxt = (s: Snapshot, p: ReturnType<typeof longestVacant>) => p
    ? `${formatDuration(monthsBetween(p.vacantSince, s.month))} (${primarySite(p)?.settlement})`
    : '–';
  return [
    [t('versus.metricVacant'), formatNumber(a.all), formatNumber(b.all)],
    [t('versus.metricRate'),
      a.rate !== null ? formatPercent(a.rate) : '–',
      b.rate !== null ? formatPercent(b.rate) : '–'],
    [t('versus.metricPop'), formatNumber(a.pop), formatNumber(b.pop)],
    [t('versus.metricPopShare'),
      a.share != null ? formatPercent(a.share) : '–',
      b.share != null ? formatPercent(b.share) : '–'],
    [t('versus.metricPer10k'),
      a.per10k != null ? formatDecimal(a.per10k) : '–',
      b.per10k != null ? formatDecimal(b.per10k) : '–'],
    [t('versus.metricLongTerm'),
      a.longTerm != null && a.all ? `${a.longTerm} (${formatPercent(a.longTerm / a.all, 0)})` : '–',
      b.longTerm != null && b.all ? `${b.longTerm} (${formatPercent(b.longTerm / b.all, 0)})` : '–'],
    [t('versus.metricMedian'),
      medA != null ? formatDuration(medA) : '–',
      medB != null ? formatDuration(medB) : '–'],
    [t('versus.metricLongest'), longTxt(dental, longA), longTxt(gp, longB)],
  ];
}

function CountyDumbbell({ dental, gp }: { dental: Snapshot; gp: Snapshot }) {
  const rows = useMemo(() => {
    const rateOf = (s: Snapshot, name: string) => {
      const c = s.counties.find((x) => x.name === name);
      return c && c.total ? (c.vacant + c.dissolved) / c.total : null;
    };
    const names = new Set([
      ...dental.counties.map((c) => c.name),
      ...gp.counties.map((c) => c.name),
    ]);
    return [...names]
      .map((name) => ({ name, a: rateOf(dental, name), b: rateOf(gp, name) }))
      .sort((x, y) => (y.b ?? 0) - (x.b ?? 0));
  }, [dental, gp]);

  const max = Math.max(0.01, ...rows.flatMap((r) => [r.a ?? 0, r.b ?? 0]));
  const x = (v: number) => LABEL_W + (v / max) * (WIDTH - LABEL_W - 90);
  const height = rows.length * ROW_H + 16;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={t('versus.dumbbellTitle')}>
      {rows.map((r, i) => {
        const y = i * ROW_H + 14;
        return (
          <g key={r.name}>
            <text x={LABEL_W - 10} y={y + 4} textAnchor="end"
              fill="var(--ink-dim)" fontSize="13">{r.name}</text>
            <line x1={LABEL_W} x2={WIDTH - 90} y1={y} y2={y}
              stroke="var(--line)" strokeWidth={1} />
            {r.a !== null && r.b !== null && (
              <line x1={x(r.a)} x2={x(r.b)} y1={y} y2={y}
                stroke="var(--line-strong)" strokeWidth={2.5} />
            )}
            {r.a !== null && (
              <circle cx={x(r.a)} cy={y} r={5.5} fill={COLORS.dental}
                stroke="var(--bg-raised)" strokeWidth={1.5} />
            )}
            {r.b !== null && (
              <>
                <circle cx={x(r.b)} cy={y} r={5.5} fill={COLORS.gp}
                  stroke="var(--bg-raised)" strokeWidth={1.5} />
                <text x={Math.max(x(r.b), r.a !== null ? x(r.a) : 0) + 12} y={y + 4}
                  fill="var(--ink-faint)" fontSize="11.5">
                  {formatPercent(r.b)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function VersusSection() {
  const latest = useAppStore((s) => s.latest);
  const history = useAppStore((s) => s.history);
  const dental = latest?.kinds.dental;
  const gp = latest?.kinds.gp;
  const histDental = history?.kinds.dental?.months ?? [];
  const histGp = history?.kinds.gp?.months ?? [];
  if (!dental || !gp) return null;

  const rateChart: ChartSeries[] = [
    { key: 'dental', label: t('kinds.dental.label'), color: COLORS.dental, points: rateSeries(histDental) },
    { key: 'gp', label: t('kinds.gp.label'), color: COLORS.gp, points: rateSeries(histGp) },
  ];
  const medianChart: ChartSeries[] = [
    { key: 'dental', label: t('kinds.dental.label'), color: COLORS.dental, points: medianSeries(histDental) },
    { key: 'gp', label: t('kinds.gp.label'), color: COLORS.gp, points: medianSeries(histGp) },
  ];

  return (
    <section className="section container" id="osszevetes">
      <h2 className="section__heading">{t('versus.heading')}</h2>
      <p className="section__explain">{t('versus.explain', { month: formatMonth(dental.month) })}</p>

      <div className="versus-table__wrap">
        <table className="versus-table">
          <thead>
            <tr>
              <th>{t('versus.thMetric')}</th>
              <th><span className="compare-dot" style={{ background: COLORS.dental }} />{t('kinds.dental.label')}</th>
              <th><span className="compare-dot" style={{ background: COLORS.gp }} />{t('kinds.gp.label')}</th>
            </tr>
          </thead>
          <tbody>
            {metricRows(dental, gp, histDental, histGp).map(([label, a, b]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{a}</td>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="chart-grid">
        <figure className="chart-card">
          <figcaption>
            <h3>{t('versus.chartRate')}</h3>
            <p>{t('versus.chartRateExplain')}</p>
          </figcaption>
          <TimeSeriesChart series={rateChart} yFormat={(v) => formatPercent(v, 1)} />
        </figure>
        <figure className="chart-card">
          <figcaption>
            <h3>{t('versus.chartMedian')}</h3>
            <p>{t('versus.chartMedianExplain')}</p>
          </figcaption>
          <TimeSeriesChart series={medianChart}
            yFormat={(v) => (v >= 12
              ? `${Math.round(v / 12)} ${locale === 'en' ? 'y' : 'év'}`
              : `${Math.round(v)} ${locale === 'en' ? 'mo' : 'hó'}`)} />
        </figure>
      </div>

      <figure className="chart-card chart-card--wide">
        <figcaption>
          <h3>{t('versus.dumbbellTitle')}</h3>
          <p>{t('versus.dumbbellExplain')}</p>
        </figcaption>
        <CountyDumbbell dental={dental} gp={gp} />
      </figure>
    </section>
  );
}
