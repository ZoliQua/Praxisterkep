// How many settlements a vacancy touched, month by month. The archive is not
// monthly-dense, so the points sit on the months that exist and the line is
// drawn straight between them — no interpolation is implied beyond that.
import { useState } from 'react';
import { scaleLinear, scaleTime } from 'd3';
import { t } from '../../lib/i18n';
import { formatNumber } from '../../lib/format';

const MARGIN = { top: 18, right: 54, bottom: 30, left: 50 };
const WIDTH = 640;
const HEIGHT = 240;

export interface TrendPoint {
  month: string;
  affectedSettlements: number;
  affectedPopulation: number;
  vacantOnly: number;
}

const asDate = (month: string) => new Date(`${month}-01T00:00:00Z`);

export function CoverageTrendChart({ points, color }: {
  points: TrendPoint[];
  color: string;
}) {
  const [hover, setHover] = useState<TrendPoint | null>(null);
  if (points.length < 2) return null;

  const x = scaleTime()
    .domain([asDate(points[0].month), asDate(points[points.length - 1].month)])
    .range([MARGIN.left, WIDTH - MARGIN.right]);
  const maxY = Math.max(...points.map((p) => p.affectedSettlements));
  const y = scaleLinear().domain([0, maxY * 1.1]).range([HEIGHT - MARGIN.bottom, MARGIN.top]);

  const line = (key: 'affectedSettlements' | 'vacantOnly') => points
    .map((p, i) => `${i ? 'L' : 'M'}${x(asDate(p.month))},${y(p[key])}`)
    .join(' ');

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
        onPointerLeave={() => setHover(null)}>
        {y.ticks(4).map((v) => (
          <g key={v}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(v)} y2={y(v)}
              stroke="var(--line)" strokeWidth="1" />
            <text x={MARGIN.left - 8} y={y(v) + 4} textAnchor="end" className="chart__tick">
              {formatNumber(v)}
            </text>
          </g>
        ))}
        {x.ticks(6).map((d) => (
          <text key={String(d)} x={x(d)} y={HEIGHT - 12} textAnchor="middle"
            className="chart__tick">{d.getUTCFullYear()}</text>
        ))}

        <path d={line('affectedSettlements')} fill="none" stroke={color} strokeWidth="2.4" />
        <path d={line('vacantOnly')} fill="none" stroke={color} strokeWidth="2"
          strokeDasharray="5 4" opacity="0.75" />

        {points.map((p) => (
          <circle key={p.month} cx={x(asDate(p.month))} cy={y(p.affectedSettlements)}
            r={hover?.month === p.month ? 5 : 3} fill={color}
            onPointerEnter={() => setHover(p)} style={{ cursor: 'pointer' }} />
        ))}
      </svg>

      <div className="chart__legend">
        <span className="chart__legend-item">
          <i style={{ background: color }} />{t('coverage.trendAffected')}
        </span>
        <span className="chart__legend-item">
          <i style={{ background: color, opacity: 0.6 }} />{t('coverage.trendVacantOnly')}
        </span>
        {hover && (
          <span className="chart__legend-item">
            <em>{hover.month}: {formatNumber(hover.affectedSettlements)} · {formatNumber(hover.affectedPopulation)} {t('access.people')}</em>
          </span>
        )}
      </div>
    </div>
  );
}
