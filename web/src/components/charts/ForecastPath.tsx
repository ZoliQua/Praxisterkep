// The vacancies month by month for the next year, from the flows: new ones
// arriving at each filled district's risk, refills at each vacant one's
// survival curve. The bar at the end is the 90% band the forecast publishes
// for twelve months; nothing is drawn between, because no band was computed
// for the months in between and none is invented.
import { t } from '../../lib/i18n';
import { formatDecimal, formatMonth } from '../../lib/format';

function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const k = y * 12 + (m - 1) + n;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
}

export function ForecastPath({ path, band, start, compare }: {
  path: number[];
  band: [number, number];
  start: string;
  /** a second, dimmer path — the other branch, or a county */
  compare?: { label: string; path: number[]; band: [number, number] } | null;
}) {
  const W = 640; const H = 240; const P = { l: 52, r: 70, t: 16, b: 34 };
  const all = [...path, ...band, ...(compare ? [...compare.path, ...compare.band] : [])];
  const lo = Math.min(...all) * 0.97; const hi = Math.max(...all) * 1.02;
  const x = (i: number) => P.l + (i / (path.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - ((v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const line = (ps: number[]) => ps.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [0, 3, 6, 9, 12].filter((i) => i < path.length);
  const end = path.length - 1;
  const fmt = (v: number) => formatDecimal(v.toFixed(0));
  return (
    <svg className="forecast-path" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={t('outcomes.forecast.pathAria', { now: fmt(path[0]), later: fmt(path[end]) })}>
      {[lo, (lo + hi) / 2, hi].map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="forecast-path__grid" />
          <text x={P.l - 6} y={y(v) + 4} textAnchor="end" className="forecast-path__tick">{fmt(v)}</text>
        </g>
      ))}
      {ticks.map((i) => (
        <text key={i} x={x(i)} y={H - 12} textAnchor="middle" className="forecast-path__tick">
          {formatMonth(addMonths(start, i))}
        </text>
      ))}
      {compare && <path d={line(compare.path)} className="forecast-path__compare" />}
      <path d={line(path)} className="forecast-path__line" />
      <line x1={x(end)} x2={x(end)} y1={y(band[0])} y2={y(band[1])} className="forecast-path__band" />
      <line x1={x(end) - 6} x2={x(end) + 6} y1={y(band[0])} y2={y(band[0])} className="forecast-path__band" />
      <line x1={x(end) - 6} x2={x(end) + 6} y1={y(band[1])} y2={y(band[1])} className="forecast-path__band" />
      <circle cx={x(0)} cy={y(path[0])} r={5} className="forecast-path__now" />
      <circle cx={x(end)} cy={y(path[end])} r={5} className="forecast-path__end" />
      <text x={x(end) + 10} y={y(path[end]) + 4} className="forecast-path__label">{fmt(path[end])}</text>
      <text x={x(0) + 8} y={y(path[0]) - 9} className="forecast-path__label">{fmt(path[0])}</text>
    </svg>
  );
}
