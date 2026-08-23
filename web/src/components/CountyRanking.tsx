import { useMemo } from 'react';
import { scaleLinear } from 'd3';
import { t } from '../lib/i18n';
import { formatPercent } from '../lib/format';
import { countyRanking } from '../lib/selectors';
import { useSnapshot } from '../store/useAppStore';

const ROW_H = 26;
const LABEL_W = 190;
const VALUE_W = 120;
const WIDTH = 900;

export function CountyRanking() {
  const snapshot = useSnapshot()!;
  const rows = useMemo(() => countyRanking(snapshot), [snapshot]);
  const nationalRate = snapshot.national.vacancyRate ?? 0;

  const maxRate = rows[0]?.rate ?? 0;
  const x = scaleLinear()
    .domain([0, maxRate])
    .range([0, WIDTH - LABEL_W - VALUE_W]);
  const height = rows.length * ROW_H + 20;

  return (
    <section className="section container" id="rangsor">
      <h2 className="section__heading">{t('ranking.heading')}</h2>
      <p className="section__explain">{t('ranking.explain')}</p>
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
