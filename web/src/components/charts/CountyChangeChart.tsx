// Dumbbell chart: first vs latest archived month per county. The connecting
// line carries direction; the filled dot is "now", the hollow one the start.
import { useState } from 'react';
import { max, scaleLinear } from 'd3';
import { t } from '../../lib/i18n';
import { formatMonth, formatNumber } from '../../lib/format';
import type { CountyChangeRow } from '../../lib/statsSelectors';

const ROW_H = 24;
const LABEL_W = 190;
const WIDTH = 640;
const RIGHT_PAD = 56;

export function CountyChangeChart({ rows, color, firstMonth, lastMonth }: {
  rows: CountyChangeRow[];
  color: string;
  firstMonth: string;
  lastMonth: string;
}) {
  const [hover, setHover] = useState<CountyChangeRow | null>(null);
  const m = max(rows.flatMap((r) => [r.firstValue, r.lastValue])) ?? 1;
  const x = scaleLinear().domain([0, m]).range([LABEL_W, WIDTH - RIGHT_PAD]);
  const height = rows.length * ROW_H + 8;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img"
        onPointerLeave={() => setHover(null)}>
        {rows.map((r, i) => {
          const y = i * ROW_H + ROW_H / 2;
          const grew = r.lastValue >= r.firstValue;
          return (
            <g key={r.county} onPointerEnter={() => setHover(r)}
              opacity={hover && hover !== r ? 0.45 : 1}>
              <rect x={0} y={i * ROW_H} width={WIDTH} height={ROW_H} fill="transparent" />
              <text x={LABEL_W - 10} y={y} textAnchor="end" dominantBaseline="middle"
                fill="var(--ink-dim)" fontSize={12}>
                {r.county}
              </text>
              <line x1={x(r.firstValue)} x2={x(r.lastValue)} y1={y} y2={y}
                stroke={grew ? '#d95926' : color} strokeWidth={2} strokeLinecap="round" />
              <circle cx={x(r.firstValue)} cy={y} r={4} fill="var(--bg-raised)"
                stroke="var(--ink-faint)" strokeWidth={2} />
              <circle cx={x(r.lastValue)} cy={y} r={4.5}
                fill={grew ? '#d95926' : color} stroke="var(--bg-raised)" strokeWidth={2} />
              <text x={x(Math.max(r.firstValue, r.lastValue)) + 10} y={y}
                dominantBaseline="middle" fill="var(--ink)" fontSize={12} fontWeight={600}>
                {formatNumber(r.lastValue)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="chart__legend">
        <span className="chart__legend-item">
          <span className="chart__dot chart__dot--hollow" />
          {t('stats.countyChangeFirst')} ({formatMonth(firstMonth)})
        </span>
        <span className="chart__legend-item">
          <span className="chart__dot" style={{ background: color }} />
          {t('stats.countyChangeLast')} ({formatMonth(lastMonth)})
        </span>
      </div>
      {hover && (
        <div className="chart__tooltip" style={{ left: '50%' }}>
          <div className="chart__tooltip-title">{hover.county}</div>
          <div className="chart__tooltip-row">
            <strong>{formatNumber(hover.firstValue)}</strong>
            <span>→</span>
            <strong>{formatNumber(hover.lastValue)}</strong>
            <span>
              ({hover.lastValue - hover.firstValue >= 0 ? '+' : ''}
              {formatNumber(hover.lastValue - hover.firstValue)})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
