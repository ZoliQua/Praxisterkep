import { useMemo, useState } from 'react';
import { scaleLinear } from 'd3';
import { t } from '../lib/i18n';
import { formatPercent } from '../lib/format';
import { countyRanking } from '../lib/selectors';
import { useSnapshot } from '../store/useAppStore';

const ROW_H = 26;
const LABEL_W = 190;
const VALUE_W = 120;
const WIDTH = 900;
const YEAR_OPTIONS = [0, 1, 2, 3, 5, 10];

export function CountyRanking() {
  const snapshot = useSnapshot()!;
  const [minYears, setMinYears] = useState(0);
  const rows = useMemo(
    () => countyRanking(snapshot, minYears * 12),
    [snapshot, minYears],
  );
  // the national reference line follows the same duration filter
  const nationalRate = useMemo(() => {
    const total = snapshot.national.totalDistricts;
    if (!total) return 0;
    return rows.reduce((sum, r) => sum + r.vacantAll, 0) / total;
  }, [snapshot, rows]);

  const maxRate = rows[0]?.rate ?? 0;
  const x = scaleLinear()
    .domain([0, Math.max(maxRate, 1e-9)])
    .range([0, WIDTH - LABEL_W - VALUE_W]);
  const height = rows.length * ROW_H + 20;

  return (
    <section className="section container" id="rangsor">
      <h2 className="section__heading">{t('ranking.heading')}</h2>
      <p className="section__explain">
        {t('ranking.explain')}{' '}
        {minYears > 0 && t('ranking.filterNote', { n: minYears })}
      </p>
      <div className="map-controls">
        <div className="seg" role="group">
          {YEAR_OPTIONS.map((y) => (
            <button key={y} aria-pressed={minYears === y}
              onClick={() => setMinYears(y)}>
              {y === 0 ? t('ranking.filterAll') : t('ranking.filterYears', { n: y })}
            </button>
          ))}
        </div>
      </div>
      <div className="ranking-chart">
        <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={t('ranking.heading')}>
          {rows.map((r, i) => {
            const y = i * ROW_H + 10;
            const w = Math.max(2, x(r.rate));
            return (
              <g key={r.name} transform={`translate(0, ${y})`}>
                <text x={LABEL_W - 10} y={ROW_H / 2} textAnchor="end" dominantBaseline="middle"
                  fill="var(--ink-dim)" fontSize="13">
                  {r.name}
                </text>
                <rect x={LABEL_W} y={5} width={w} height={ROW_H - 10} rx={3}
                  fill={r.rate >= nationalRate ? 'var(--alert)' : 'var(--accent)'}
                  opacity={0.85} />
                <text x={LABEL_W + w + 8} y={ROW_H / 2} dominantBaseline="middle"
                  fill="var(--ink)" fontSize="12.5" fontWeight="600">
                  {formatPercent(r.rate)}
                </text>
                <text x={LABEL_W + w + 62} y={ROW_H / 2} dominantBaseline="middle"
                  fill="var(--ink-faint)" fontSize="11.5">
                  {r.vacantAll}/{r.total}
                </text>
              </g>
            );
          })}
          <line
            x1={LABEL_W + x(nationalRate)} x2={LABEL_W + x(nationalRate)}
            y1={4} y2={height - 8}
            stroke="var(--ink-dim)" strokeDasharray="3 4" strokeWidth={1}
          />
          <text
            x={LABEL_W + x(nationalRate) + 6} y={height - 4}
            fill="var(--ink-faint)" fontSize="11">
            {t('ranking.national')}: {formatPercent(nationalRate)}
          </text>
        </svg>
      </div>
    </section>
  );
}
