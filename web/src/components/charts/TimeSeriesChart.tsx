// Generic multi-series line chart on a true time axis (irregular monthly
// sampling stays visible: markers on every data point, gaps stay gaps).
// Mark specs follow the dataviz method: 2px lines, r=4 markers with a 2px
// surface ring, hairline grid, crosshair + single tooltip listing all series.
import { useMemo, useRef, useState } from 'react';
import { bisector, extent, max, scaleLinear, scaleTime } from 'd3';
import { formatMonth } from '../../lib/format';
import { monthToDate, type SeriesPoint } from '../../lib/statsSelectors';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  points: SeriesPoint[];
}

interface Props {
  series: ChartSeries[];
  height?: number;
  yFormat?: (v: number) => string;
  /** extra tooltip lines per month (e.g. dissolved counts) */
  tooltipExtra?: (month: string) => string | null;
}

const MARGIN = { top: 12, right: 16, bottom: 26, left: 58 };
const WIDTH = 640;

export function TimeSeriesChart({ series, height = 240, yFormat, tooltipExtra }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverMonth, setHoverMonth] = useState<string | null>(null);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const s of series) for (const p of s.points) set.add(p.month);
    return [...set].sort();
  }, [series]);

  const fmt = yFormat ?? ((v: number) => new Intl.NumberFormat('hu-HU').format(v));

  const { x, y, ticksX, ticksY } = useMemo(() => {
    const dates = months.map(monthToDate);
    const [d0, d1] = extent(dates) as [Date, Date];
    const x = scaleTime().domain([d0, d1]).range([MARGIN.left, WIDTH - MARGIN.right]);
    const maxV = max(series.flatMap((s) => s.points.map((p) => p.value))) ?? 1;
    const y = scaleLinear()
      .domain([0, maxV * 1.08])
      .nice()
      .range([height - MARGIN.bottom, MARGIN.top]);
    return { x, y, ticksX: x.ticks(6), ticksY: y.ticks(4) };
  }, [months, series, height]);

  const bisect = bisector((m: string) => monthToDate(m).getTime()).center;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const t = x.invert(px).getTime();
    setHoverMonth(months[bisect(months, t)] ?? null);
  }

  const hover = hoverMonth
    ? {
        month: hoverMonth,
        cx: x(monthToDate(hoverMonth)),
        rows: series
          .map((s) => ({
            label: s.label,
            color: s.color,
            point: s.points.find((p) => p.month === hoverMonth),
          }))
          .filter((r) => r.point !== undefined),
      }
    : null;

  return (
    <div className="chart" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverMonth(null)}
        role="img"
      >
        {ticksY.map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left} x2={WIDTH - MARGIN.right}
              y1={y(t)} y2={y(t)}
              stroke="var(--line)" strokeWidth={1}
            />
            <text x={MARGIN.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle"
              fill="var(--ink-faint)" fontSize={11}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {ticksX.map((d) => (
          <text key={+d} x={x(d)} y={height - 8} textAnchor="middle"
            fill="var(--ink-faint)" fontSize={11}>
            {d.getMonth() === 0 ? d.getFullYear() : `${d.getFullYear()}. ${d.getMonth() + 1}.`}
          </text>
        ))}
        {series.map((s) => {
          const path = s.points
            .map((p, i) => `${i ? 'L' : 'M'}${x(monthToDate(p.month))},${y(p.value)}`)
            .join('');
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round" />
              {s.points.map((p) => (
                <circle key={p.month}
                  cx={x(monthToDate(p.month))} cy={y(p.value)} r={4}
                  fill={s.color} stroke="var(--bg-raised)" strokeWidth={2} />
              ))}
            </g>
          );
        })}
        {hover && (
          <line x1={hover.cx} x2={hover.cx} y1={MARGIN.top} y2={height - MARGIN.bottom}
            stroke="var(--ink-faint)" strokeWidth={1} />
        )}
      </svg>
      {series.length > 1 && (
        <div className="chart__legend">
          {series.map((s) => (
            <span key={s.key} className="chart__legend-item">
              <span className="chart__key" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {hover && hover.rows.length > 0 && (
        <div
          className="chart__tooltip"
          style={{ left: `${(hover.cx / WIDTH) * 100}%` }}
        >
          <div className="chart__tooltip-title">{formatMonth(hover.month)}</div>
          {hover.rows.map((r) => (
            <div key={r.label} className="chart__tooltip-row">
              <span className="chart__key" style={{ background: r.color }} />
              <strong>{fmt(r.point!.value)}</strong>
              <span>{r.label}</span>
            </div>
          ))}
          {tooltipExtra && tooltipExtra(hover.month) && (
            <div className="chart__tooltip-extra">{tooltipExtra(hover.month)}</div>
          )}
        </div>
      )}
    </div>
  );
}
