// Duration-of-vacancy distribution for the latest archived month.
// Columns ≤24px equivalent per band width, 4px rounded cap, value on the cap.
import { useState } from 'react';
import { max, scaleBand, scaleLinear } from 'd3';
import { t } from '../../lib/i18n';

const MARGIN = { top: 22, right: 16, bottom: 30, left: 46 };
const WIDTH = 640;
const HEIGHT = 220;

const BUCKET_LABEL_KEYS: Record<string, string> = {
  '0-11': 'stats.bucket0',
  '12-35': 'stats.bucket1',
  '36-119': 'stats.bucket2',
  '120+': 'stats.bucket3',
};

export function DurationHistogram({ buckets, color }: {
  buckets: Record<string, number>;
  color: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const names = Object.keys(BUCKET_LABEL_KEYS).filter((k) => k in buckets);
  const x = scaleBand<string>().domain(names)
    .range([MARGIN.left, WIDTH - MARGIN.right]).padding(0.35);
  const m = max(names.map((n) => buckets[n])) ?? 1;
  const y = scaleLinear().domain([0, m * 1.12]).range([HEIGHT - MARGIN.bottom, MARGIN.top]);
  const fmt = (v: number) => new Intl.NumberFormat('hu-HU').format(v);
  const barW = Math.min(56, x.bandwidth());

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
        onPointerLeave={() => setHover(null)}>
        {y.ticks(3).map((tv) => (
          <line key={tv} x1={MARGIN.left} x2={WIDTH - MARGIN.right}
            y1={y(tv)} y2={y(tv)} stroke="var(--line)" strokeWidth={1} />
        ))}
        {names.map((name) => {
          const v = buckets[name];
          const cx = (x(name) ?? 0) + x.bandwidth() / 2;
          const h = Math.max(0, y(0) - y(v));
          const r = Math.min(4, h);
          const d = `M${cx - barW / 2},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`;
          return (
            <g key={name} onPointerEnter={() => setHover(name)}>
              <rect x={cx - barW / 2 - 8} y={MARGIN.top} width={barW + 16}
                height={HEIGHT - MARGIN.top - MARGIN.bottom} fill="transparent" />
              <path d={d} fill={color} opacity={hover && hover !== name ? 0.45 : 1} />
              <text x={cx} y={y(v) - 7} textAnchor="middle"
                fill="var(--ink)" fontSize={12.5} fontWeight={600}>
                {fmt(v)}
              </text>
              <text x={cx} y={HEIGHT - 10} textAnchor="middle"
                fill="var(--ink-dim)" fontSize={11.5}>
                {t(BUCKET_LABEL_KEYS[name])}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
