// All 197 járás on one line, and where this one falls on it.
//
// A rank on its own ("103rd of 197") says nothing about distance: 103rd can
// be a hair from the median or halfway to the bottom. The whole distribution
// shows which, and the same strip works for every measure — the development
// indicator, the vacancy rate, the drive to a surgery — so the reader learns
// to read one chart instead of five.
import { useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import { formatNumber } from '../../lib/format';
import type { DistrictRow, Measure } from '../../lib/districts';

const W = 860;
const PAD = { top: 26, right: 22, bottom: 30, left: 22 };
const R = 4.2;
const LANE = R * 1.7;
// the swarm grows upward from the axis, so the box is as tall as the tallest
// stack needs — a fixed height clipped the dense middle of every measure
const MIN_LANES = 8;

interface Dot { name: string; county: string; v: number; x: number; y: number }

export function DistrictDistribution({ rows, measure, selected, format, onPick }: {
  rows: DistrictRow[];
  measure: Measure;
  selected: string;
  format: (value: number) => string;
  onPick?: (name: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const { dots, median, lo, hi, height } = useMemo(() => {
    const vals = rows
      .map((d) => ({ name: d.name, county: d.county, v: measure.value(d) }))
      .filter((r): r is { name: string; county: string; v: number } => r.v !== null)
      .sort((a, b) => a.v - b.v);
    if (!vals.length) {
      return { dots: [] as Dot[], median: 0, lo: 0, hi: 1, height: 100 };
    }
    const lo = vals[0].v;
    const hi = vals[vals.length - 1].v;
    const span = hi - lo || 1;
    const mid = Math.floor(vals.length / 2);
    const median = vals.length % 2 ? vals[mid].v : (vals[mid - 1].v + vals[mid].v) / 2;
    // a beeswarm without a physics engine: dots that would overlap are
    // stacked upward in the order they come, which is enough to show where
    // the mass sits
    const lanes: number[] = [];
    const inner = W - PAD.left - PAD.right;
    const placed = vals.map((r) => {
      const x = PAD.left + ((r.v - lo) / span) * inner;
      let lane = 0;
      while (lanes[lane] !== undefined && x - lanes[lane] < R * 1.8) lane += 1;
      lanes[lane] = x;
      return { ...r, x, lane };
    });
    const used = Math.max(MIN_LANES, ...placed.map((d) => d.lane + 1));
    const height = PAD.top + used * LANE + PAD.bottom;
    const dots = placed.map((d) => ({
      name: d.name, county: d.county, v: d.v, x: d.x,
      y: height - PAD.bottom - d.lane * LANE,
    }));
    return { dots, median, lo, hi, height };
  }, [rows, measure]);

  if (!dots.length) return null;
  const here = dots.find((d) => d.name === selected) ?? null;
  const shown = dots.find((d) => d.name === hover) ?? here;
  const span = hi - lo || 1;
  const xOf = (v: number) => PAD.left + ((v - lo) / span) * (W - PAD.left - PAD.right);
  // which end is the bad one, so the strip under the axis can say so
  const worseEnd = measure.worseHigh ? 'right' : 'left';

  return (
    <div className="district-dist">
      <svg viewBox={`0 0 ${W} ${height}`} role="img"
        aria-label={t(`district.measure.${measure.key}`)}
        onPointerLeave={() => setHover(null)}>
        <line x1={PAD.left} x2={W - PAD.right} y1={height - PAD.bottom + 10}
          y2={height - PAD.bottom + 10} className="district-dist__axis" />
        <line x1={xOf(median)} x2={xOf(median)} y1={PAD.top - 4}
          y2={height - PAD.bottom + 14} className="district-dist__median" />
        <text x={xOf(median)} y={PAD.top - 10} textAnchor="middle"
          className="district-dist__tick">
          {t('district.distMedian', { n: format(median) })}
        </text>
        {dots.map((d) => (
          <circle key={d.name} cx={d.x} cy={d.y} r={R}
            className={`district-dist__dot${d.name === selected ? ' is-on' : ''}${
              onPick ? ' is-clickable' : ''}`}
            onPointerEnter={() => setHover(d.name)}
            onClick={onPick ? () => onPick(d.name) : undefined}>
            <title>{`${d.name}: ${format(d.v)}`}</title>
          </circle>
        ))}
        {here && (
          <line x1={here.x} x2={here.x} y1={here.y - 10}
            y2={height - PAD.bottom + 14} className="district-dist__pin" />
        )}
        <text x={PAD.left} y={height - 8} className="district-dist__tick">
          {format(lo)}{worseEnd === 'left' && ` · ${t('district.distWorse')}`}
        </text>
        <text x={W - PAD.right} y={height - 8} textAnchor="end"
          className="district-dist__tick">
          {format(hi)}{worseEnd === 'right' && ` · ${t('district.distWorse')}`}
        </text>
      </svg>
      <p className="district-map__read">
        {shown ? (
          <>
            <strong>{shown.name}</strong> ({shown.county}) — {format(shown.v)}
            {shown.name === selected && here && (
              <> · {t('district.distRank', {
                rank: formatNumber(rankOf(dots, here, measure)),
                of: formatNumber(dots.length),
              })}</>
            )}
          </>
        ) : t('district.distHint')}
      </p>
    </div>
  );
}

/** 1 = the worst, whichever end that is for this measure. */
function rankOf(dots: Dot[], here: Dot, measure: Measure): number {
  const sorted = [...dots].sort((a, b) => (measure.worseHigh ? b.v - a.v : a.v - b.v));
  return sorted.findIndex((d) => d.name === here.name) + 1;
}
