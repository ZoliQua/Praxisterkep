// Diverging in/out flow: newly vacated districts up (warm), districts that
// left the vacant list down (aqua). Bars ≤24px, 4px rounded data-end, square
// baseline, per-bar hover tooltip. Comparison month named in the tooltip
// because archive months are not always consecutive.
import { useMemo, useState } from 'react';
import { max, scaleLinear, scaleTime } from 'd3';
import { t } from '../../lib/i18n';
import { formatMonth } from '../../lib/format';
import { monthToDate, type FlowPoint } from '../../lib/statsSelectors';

const MARGIN = { top: 12, right: 16, bottom: 26, left: 46 };
const WIDTH = 640;
const HEIGHT = 240;
const FLOW_COLORS = { entered: '#d95926', left: '#17a08c' };

export function FlowChart({ points }: { points: FlowPoint[] }) {
  const [hover, setHover] = useState<FlowPoint | null>(null);

  const { x, y, barW } = useMemo(() => {
    const dates = points.map((p) => monthToDate(p.month));
    const x = scaleTime()
      .domain([dates[0], dates[dates.length - 1]])
      .range([MARGIN.left + 14, WIDTH - MARGIN.right - 14]);
    const m = max(points.flatMap((p) => [p.entered, p.left])) ?? 1;
    const y = scaleLinear()
      .domain([-m * 1.1, m * 1.1])
      .range([HEIGHT - MARGIN.bottom, MARGIN.top]);
    const minGap = dates.length > 1
      ? Math.min(...dates.slice(1).map((d, i) => x(d) - x(dates[i])))
      : 48;
    return { x, y, barW: Math.max(4, Math.min(24, minGap - 2)) };
  }, [points]);

  const zero = y(0);
  const fmt = (v: number) => new Intl.NumberFormat('hu-HU').format(v);

  function bar(p: FlowPoint, kind: 'entered' | 'left') {
    const value = p[kind];
    const h = Math.abs(y(value === 0 ? 0 : kind === 'entered' ? value : -value) - zero);
    const cx = x(monthToDate(p.month));
    const r = Math.min(4, h);
    // 4px rounded data-end, square at the baseline
    const d = kind === 'entered'
      ? `M${cx - barW / 2},${zero} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`
      : `M${cx - barW / 2},${zero} v${h - r} q0,${r} ${r},${r} h${barW - 2 * r} q${r},0 ${r},${-r} v${-(h - r)} z`;
    return (
      <path key={`${p.month}-${kind}`} d={d} fill={FLOW_COLORS[kind]}
        opacity={hover && hover !== p ? 0.45 : 1}
        onPointerEnter={() => setHover(p)} />
    );
  }

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
        onPointerLeave={() => setHover(null)}>
        <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={zero} y2={zero}
          stroke="var(--line-strong)" strokeWidth={1} />
        {y.ticks(4).map((tv) => (
          <text key={tv} x={MARGIN.left - 8} y={y(tv)} textAnchor="end"
            dominantBaseline="middle" fill="var(--ink-faint)" fontSize={11}>
            {fmt(Math.abs(tv))}
          </text>
        ))}
        {x.ticks(6).map((d) => (
          <text key={+d} x={x(d)} y={HEIGHT - 8} textAnchor="middle"
            fill="var(--ink-faint)" fontSize={11}>
            {d.getFullYear()}
          </text>
        ))}
        {points.map((p) => bar(p, 'entered'))}
        {points.map((p) => bar(p, 'left'))}
      </svg>
      <div className="chart__legend">
        <span className="chart__legend-item">
          <span className="chart__key" style={{ background: FLOW_COLORS.entered }} />
          {t('stats.flowEntered')}
        </span>
        <span className="chart__legend-item">
          <span className="chart__key" style={{ background: FLOW_COLORS.left }} />
          {t('stats.flowLeft')}
        </span>
      </div>
      {hover && (
        <div className="chart__tooltip"
          style={{ left: `${(x(monthToDate(hover.month)) / WIDTH) * 100}%` }}>
          <div className="chart__tooltip-title">
            {formatMonth(hover.sincePrevMonth)} → {formatMonth(hover.month)}
          </div>
          <div className="chart__tooltip-row">
            <span className="chart__key" style={{ background: FLOW_COLORS.entered }} />
            <strong>{fmt(hover.entered)}</strong>
            <span>{t('stats.flowEntered')}</span>
          </div>
          <div className="chart__tooltip-row">
            <span className="chart__key" style={{ background: FLOW_COLORS.left }} />
            <strong>{fmt(hover.left)}</strong>
            <span>{t('stats.flowLeft')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
