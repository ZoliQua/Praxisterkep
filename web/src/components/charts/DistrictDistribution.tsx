// All 197 járás on one measure, and where this one falls among them.
//
// A rank on its own says nothing about distance: 103rd can be a hair from the
// median or halfway to the bottom. The spread shows which, and the same chart
// serves every measure — development, vacancy, the drive to a surgery — so
// the reader learns to read one picture instead of eight.
//
// It is a histogram rather than a dot swarm on purpose. Two of the measures
// have a mass point that a swarm cannot draw: 69 of the 197 járás have no
// vacant dental district at all, and 52 have no settlement classed as
// lagging. Stacked as dots that is a 69-high column that pushes everything
// below it off the screen; as a bar it is the single most informative thing
// on the chart — a third of the country sits at zero.
import { useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import { formatNumber } from '../../lib/format';
import type { DistrictRow, Measure } from '../../lib/districts';

const W = 860;
const H = 190;
const PAD = { top: 24, right: 20, bottom: 34, left: 20 };
const BINS = 24;
/** how many names a bin lists before it just says how many there are */
const CHIPS = 12;

interface Row { name: string; county: string; v: number }

export function DistrictDistribution({ rows, measure, selected, format, onPick }: {
  rows: DistrictRow[];
  measure: Measure;
  selected: string;
  format: (value: number) => string;
  onPick?: (name: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const { bins, lo, hi, median, tallest, step } = useMemo(() => {
    const vals: Row[] = rows
      .map((d) => ({ name: d.name, county: d.county, v: measure.value(d) }))
      .filter((r): r is Row => r.v !== null)
      .sort((a, b) => a.v - b.v);
    if (!vals.length) {
      return { bins: [] as Row[][], lo: 0, hi: 1, median: 0, tallest: 1, step: 1 };
    }
    const lo = vals[0].v;
    const hi = vals[vals.length - 1].v;
    const step = (hi - lo) / BINS || 1;
    const bins: Row[][] = Array.from({ length: BINS }, () => []);
    for (const r of vals) {
      // the top value belongs in the last bin, not in one past the end
      const i = Math.min(BINS - 1, Math.floor((r.v - lo) / step));
      bins[i].push(r);
    }
    const mid = Math.floor(vals.length / 2);
    const median = vals.length % 2
      ? vals[mid].v : (vals[mid - 1].v + vals[mid].v) / 2;
    return {
      bins, lo, hi, median, step,
      tallest: Math.max(1, ...bins.map((b) => b.length)),
    };
  }, [rows, measure]);

  if (!bins.length) return null;

  const inner = W - PAD.left - PAD.right;
  const binW = inner / BINS;
  const xOf = (v: number) =>
    PAD.left + Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1))) * inner;
  const hOf = (n: number) => (n / tallest) * (H - PAD.top - PAD.bottom);

  const here = rows.find((d) => d.name === selected);
  const hereValue = here ? measure.value(here) : null;
  const hereBin = hereValue === null || hereValue === undefined
    ? null : Math.min(BINS - 1, Math.floor((hereValue - lo) / step));
  const shownBin = hover ?? hereBin;
  const shown = shownBin === null ? [] : bins[shownBin];
  // 1 = the worst, whichever end that is for this measure
  const rank = hereValue === null || hereValue === undefined ? null
    : bins.flat().filter((r) => (measure.worseHigh
      ? r.v > hereValue : r.v < hereValue)).length + 1;
  const counted = bins.flat().length;

  return (
    <div className="district-dist">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={t(`district.measure.${measure.key}`)}
        onPointerLeave={() => setHover(null)}>
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom}
          y2={H - PAD.bottom} className="district-dist__axis" />
        <line x1={xOf(median)} x2={xOf(median)} y1={PAD.top - 12}
          y2={H - PAD.bottom + 6} className="district-dist__median" />
        <text x={xOf(median)} y={PAD.top - 16} textAnchor="middle"
          className="district-dist__tick">
          {t('district.distMedian', { n: format(median) })}
        </text>
        {bins.map((bin, i) => {
          if (!bin.length) return null;
          const h = hOf(bin.length);
          const on = i === hereBin;
          return (
            <g key={i} className={`district-dist__bin${on ? ' is-on' : ''}`}
              onPointerEnter={() => setHover(i)}>
              <rect x={PAD.left + i * binW + 1} y={H - PAD.bottom - h}
                width={binW - 2} height={h} rx={2} />
              {/* an invisible full-height target: a one-district bar is three
                  pixels tall and impossible to hover */}
              <rect x={PAD.left + i * binW} y={PAD.top - 12} width={binW}
                height={H - PAD.top - PAD.bottom + 12} fill="transparent" />
              <title>{t('district.distBin', {
                n: formatNumber(bin.length),
                from: format(lo + i * step),
                to: format(lo + (i + 1) * step),
              })}</title>
            </g>
          );
        })}
        {hereValue !== null && hereValue !== undefined && (
          <g>
            <line x1={xOf(hereValue)} x2={xOf(hereValue)} y1={PAD.top - 12}
              y2={H - PAD.bottom + 10} className="district-dist__pin" />
            <circle cx={xOf(hereValue)} cy={PAD.top - 12} r={4}
              className="district-dist__pindot" />
          </g>
        )}
        <text x={PAD.left} y={H - 12} className="district-dist__tick">
          {format(lo)}{!measure.worseHigh && ` · ${t('district.distWorse')}`}
        </text>
        <text x={W - PAD.right} y={H - 12} textAnchor="end"
          className="district-dist__tick">
          {format(hi)}{measure.worseHigh && ` · ${t('district.distWorse')}`}
        </text>
      </svg>

      <p className="district-map__read">
        {hereValue !== null && hereValue !== undefined ? (
          <>
            <strong>{selected}</strong> — {format(hereValue)}
            {rank !== null && <> · {t('district.distRank', {
              rank: formatNumber(rank), of: formatNumber(counted),
            })}</>}
          </>
        ) : t('district.distNoValue', { name: selected })}
      </p>
      {shown.length > 0 && (
        <div className="district-dist__chips">
          <span className="district-dist__chips-label">
            {t('district.distBinLabel', {
              n: formatNumber(shown.length),
              from: format(lo + (shownBin ?? 0) * step),
              to: format(lo + ((shownBin ?? 0) + 1) * step),
            })}
          </span>
          {shown.slice(0, CHIPS).map((r) => (
            <button key={r.name} type="button"
              className={`district-dist__chip${
                r.name === selected ? ' is-on' : ''}`}
              onClick={onPick ? () => onPick(r.name) : undefined}>
              {r.name}
            </button>
          ))}
          {shown.length > CHIPS && (
            <span className="district-dist__chips-label">
              {t('district.distMore', {
                n: formatNumber(shown.length - CHIPS),
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
