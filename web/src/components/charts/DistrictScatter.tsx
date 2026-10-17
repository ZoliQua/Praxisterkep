// Does a járás without doctors also sit far from one?
//
// Every járás is a dot: how far its settlements are from a surgery by road
// (median minutes) against the share of its districts with nobody under
// contract. Two separate misfortunes, or one — the cloud answers that, and
// the selected járás is where it falls inside it.
import { useState } from 'react';
import { t } from '../../lib/i18n';
import { formatDecimal, formatPercent } from '../../lib/format';
import { vacancyRate, type DistrictsRaw } from '../../lib/districts';

const W = 760;
const H = 330;
const PAD = { top: 34, right: 18, bottom: 42, left: 52 };

export type ScatterX = 'travel' | 'development';

export function DistrictScatter({ data, branch, selected, onPick, axis = 'travel' }: {
  data: DistrictsRaw | null;
  branch: 'gp' | 'dental';
  selected: string;
  onPick?: (name: string) => void;
  /** what the horizontal axis holds */
  axis?: ScatterX;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const points = (data?.districts ?? [])
    .map((d) => ({
      name: d.name,
      county: d.county,
      x: axis === 'development'
        ? d.development?.complex ?? null
        : branch === 'gp' ? d.medianGpMinutes : d.medianDentalMinutes,
      y: vacancyRate(d, branch),
      r: d.population,
    }))
    .filter((p): p is { name: string; county: string; x: number; y: number; r: number } =>
      p.x !== null && p.y !== null);
  if (points.length < 10) return null;

  const maxX = Math.max(...points.map((p) => p.x));
  const minX = axis === 'development' ? Math.min(...points.map((p) => p.x)) : 0;
  const maxY = Math.max(...points.map((p) => p.y));
  const maxR = Math.max(...points.map((p) => p.r));
  const px = (v: number) => PAD.left
    + ((v - minX) / (maxX - minX || 1)) * (W - PAD.left - PAD.right);
  const py = (v: number) => H - PAD.bottom - (v / maxY) * (H - PAD.top - PAD.bottom);
  const pr = (v: number) => 2.5 + Math.sqrt(v / maxR) * 7;
  const shown = points.find((p) => p.name === (hover ?? selected));

  const ticksX = [0, 0.25, 0.5, 0.75, 1].map((f) => minX + f * (maxX - minX));
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);

  return (
    <div className="district-scatter">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('district.scatterHeading')}
        onPointerLeave={() => setHover(null)}>
        {ticksY.map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={py(v)} y2={py(v)}
              stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.left - 8} y={py(v) + 3.5} textAnchor="end"
              className="district-scatter__tick">{formatPercent(v, 0)}</text>
          </g>
        ))}
        {ticksX.map((v) => (
          <text key={`x${v}`} x={px(v)} y={H - PAD.bottom + 16} textAnchor="middle"
            className="district-scatter__tick">
            {formatDecimal(v.toFixed(0))}
          </text>
        ))}
        <text x={(W + PAD.left) / 2} y={H - 8} textAnchor="middle"
          className="district-scatter__axis">{t(`district.scatterX.${axis}`)}</text>
        {/* above the plot, not on its first gridline */}
        <text x={14} y={15} className="district-scatter__axis">
          {t('district.scatterY')}
        </text>
        {points.map((p) => {
          const on = p.name === selected;
          return (
            <circle key={p.name} cx={px(p.x)} cy={py(p.y)} r={pr(p.r)}
              className={`district-scatter__dot${on ? ' is-on' : ''}${
                onPick ? ' is-clickable' : ''}`}
              onPointerEnter={() => setHover(p.name)}
              onClick={onPick ? () => onPick(p.name) : undefined}>
              <title>{`${p.name}: ${formatPercent(p.y)}, ${
                formatDecimal(p.x.toFixed(1))}`}</title>
            </circle>
          );
        })}
      </svg>
      {shown && (
        <p className="district-map__read">
          <strong>{shown.name}</strong> ({shown.county}) — {t(
            `district.scatterRead.${axis}`, {
              rate: formatPercent(shown.y),
              x: formatDecimal(shown.x.toFixed(1)),
            })}
        </p>
      )}
    </div>
  );
}
