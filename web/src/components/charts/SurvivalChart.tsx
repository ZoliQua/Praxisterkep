// Kaplan–Meier curves: the share of vacancies still open after N months.
// A step function, because that is what the estimator is — the level only
// changes in the months where a district was actually refilled.
import { useState } from 'react';
import { scaleLinear } from 'd3';
import { t } from '../../lib/i18n';
import { formatPercent } from '../../lib/format';

const MARGIN = { top: 18, right: 18, bottom: 34, left: 46 };
const WIDTH = 640;
const HEIGHT = 260;

export interface SurvivalSeries {
  key: string;
  label: string;
  color: string;
  points: { month: number; survival: number }[];
  median: number | null;
}

export function SurvivalChart({ series, maxMonth = 96 }: {
  series: SurvivalSeries[];
  maxMonth?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const x = scaleLinear().domain([0, maxMonth]).range([MARGIN.left, WIDTH - MARGIN.right]);
  const y = scaleLinear().domain([0, 1]).range([HEIGHT - MARGIN.bottom, MARGIN.top]);

  const path = (points: { month: number; survival: number }[]) => {
    const parts: string[] = [];
    let last = 1;
    for (const p of points) {
      if (p.month > maxMonth) break;
      parts.push(`${parts.length ? 'L' : 'M'}${x(p.month)},${y(last)}`);
      parts.push(`L${x(p.month)},${y(p.survival)}`);
      last = p.survival;
    }
    return parts.join(' ');
  };

  const atHover = (s: SurvivalSeries) => {
    if (hover === null) return null;
    let value = 1;
    for (const p of s.points) {
      if (p.month > hover) break;
      value = p.survival;
    }
    return value;
  };

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const box = (e.target as SVGElement).ownerSVGElement?.getBoundingClientRect();
          if (!box) return;
          const px = ((e.clientX - box.left) / box.width) * WIDTH;
          setHover(Math.max(0, Math.min(maxMonth, Math.round(x.invert(px)))));
        }}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(v)} y2={y(v)}
              stroke="var(--line)" strokeWidth="1" />
            <text x={MARGIN.left - 8} y={y(v) + 4} textAnchor="end" className="chart__tick">
              {formatPercent(v, 0)}
            </text>
          </g>
        ))}
        {[0, 12, 24, 36, 48, 60, 72, 84, 96].filter((m) => m <= maxMonth).map((m) => (
          <text key={m} x={x(m)} y={HEIGHT - 12} textAnchor="middle" className="chart__tick">
            {m}
          </text>
        ))}
        <text x={WIDTH - MARGIN.right} y={HEIGHT - 12} textAnchor="end"
          className="chart__tick">{t('survival.axisMonths')}</text>

        {series.map((s) => (
          <path key={s.key} d={path(s.points)} fill="none" stroke={s.color}
            strokeWidth="2.2" strokeLinejoin="round" />
        ))}

        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom}
              stroke="var(--ink-dim)" strokeWidth="1" strokeDasharray="3 3" />
            {series.map((s) => {
              const v = atHover(s);
              return v === null ? null : (
                <circle key={s.key} cx={x(hover)} cy={y(v)} r="3.5" fill={s.color} />
              );
            })}
          </g>
        )}
      </svg>

      <div className="chart__legend">
        {series.map((s) => {
          const v = atHover(s);
          return (
            <span key={s.key} className="chart__legend-item">
              <i style={{ background: s.color }} />
              {s.label}
              {hover !== null && v !== null && (
                <em> · {hover} {t('survival.monthsShort')}: {formatPercent(v, 0)}</em>
              )}
              {hover === null && s.median !== null && (
                <em> · {t('survival.medianShort')}: {s.median}</em>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
