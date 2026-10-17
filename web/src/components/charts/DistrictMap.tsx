// The country at járás resolution, one number per shape.
//
// The county choropleth has twenty blocks and hides the thing worth seeing:
// a county with a middling rate can hold a járás at 60% and another at 0%.
// 197 shapes show that without a sentence.
//
// Two things the shapes alone cannot do. The capital is 0.6% of the country's
// area and a tenth of its people, so its 23 kerület are drawn again, blown up
// in the corner. And the empty quarter of the frame above the Danube is where
// the hover goes: the name of the járás, its seat, and its number, big enough
// to read without hunting for a tooltip.
import { useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import { useDistrictShapes, type Box, type DistrictShape } from '../../lib/districtShapes';

const W = 760;
const H = 440;
const INSET: Box = { x: W - 184, y: H - 178, width: 168, height: 150 };
// the empty north-west corner, where no járás is ever drawn
const READ = { x: 14, y: 18, width: 236 };

/**
 * The ramp.
 *
 * On a dark page an opacity ramp turns every low value into the background,
 * and the map reads as "all bad". Mixing towards a pale floor colour instead
 * keeps the low end visible and lets the eye find the dark patches.
 */
function fillOf(v: number | undefined, max: number, color: string, empty: string) {
  if (v === undefined) return empty;
  const share = Math.round((0.1 + Math.min(1, v / max) * 0.9) * 100);
  return `color-mix(in srgb, ${color} ${share}%, var(--bg-raised))`;
}

/** The ramp as a strip, with what its ends mean. */
function Legend({ max, color, empty, format, hasEmpty }: {
  max: number; color: string; empty: string;
  format: (v: number) => string; hasEmpty: boolean;
}) {
  const steps = 24;
  return (
    <div className="district-map__legend">
      <span className="district-map__legend-end">{format(0)}</span>
      <span className="district-map__ramp" aria-hidden="true">
        {Array.from({ length: steps }, (_, i) => (
          <i key={i} style={{ background: fillOf(
            (i / (steps - 1)) * max, max, color, empty) }} />
        ))}
      </span>
      <span className="district-map__legend-end">
        {format(max)}
        <small>{t('district.legendTop')}</small>
      </span>
      {hasEmpty && (
        <span className="district-map__legend-empty">
          <i style={{ background: empty }} />
          {t('district.legendEmpty')}
        </span>
      )}
    </div>
  );
}

export function DistrictMap({
  values, format, color = '#ef6461', empty = 'var(--bg-panel)', onPick, selected,
  legendFormat, total, seatOf,
}: {
  /** járás name -> value in 0..1; a missing one is drawn as empty */
  values: Map<string, number>;
  format?: (name: string, value: number | undefined) => string;
  color?: string;
  empty?: string;
  onPick?: (name: string) => void;
  selected?: string | null;
  /** how the legend and the readout write a value; without it no legend */
  legendFormat?: (value: number) => string;
  /** how many shapes there are, so the legend can say when some have no value */
  total?: number;
  /** the seat of a járás, for the readout */
  seatOf?: (name: string) => string | undefined;
}) {
  const inset = useMemo(() => INSET, []);
  const { shapes, capital } = useDistrictShapes(W, H, inset);
  const [hover, setHover] = useState<string | null>(null);
  if (!shapes.length) return null;
  const sorted = [...values.values()].sort((a, b) => a - b);
  // the ramp tops out at the 90th percentile, not at the single worst járás:
  // a lone 75% would squash every other shape into the background, and the
  // question the map answers is where the bad patches are, not who holds the
  // record. Anything above it is simply the darkest shade.
  const max = Math.max(0.0001, sorted[Math.floor(sorted.length * 0.9)] ?? 0);
  const shownName = hover ?? selected ?? null;
  const value = shownName ? values.get(shownName) : undefined;
  const seat = shownName && seatOf ? seatOf(shownName) : undefined;

  const shape = (s: DistrictShape, key: string) => {
    const v = values.get(s.name);
    const on = s.name === selected;
    return (
      <path key={key} d={s.d}
        className={`district-map__shape${on ? ' is-on' : ''}${
          onPick ? ' is-clickable' : ''}`}
        fill={fillOf(v, max, color, empty)}
        onPointerEnter={() => setHover(s.name)}
        onClick={onPick ? () => onPick(s.name) : undefined}>
        <title>{format ? format(s.name, v) : `${s.name}: ${v ?? '–'}`}</title>
      </path>
    );
  };

  return (
    <div className="district-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('district.heading')}
        onPointerLeave={() => setHover(null)}>
        {shapes.map((s) => shape(s, s.name))}
        {/* the selected shape is drawn again on top: an outline under its
            neighbours is an outline nobody can see */}
        {shapes.filter((s) => s.name === selected).map((s) => (
          <path key="on" d={s.d} className="district-map__halo" />
        ))}

        {capital.length > 0 && (
          <g className="district-map__inset">
            <rect x={inset.x - 9} y={inset.y - 9} width={inset.width + 18}
              height={inset.height + 27} rx={8} />
            {capital.map((s) => shape(s, `inset-${s.name}`))}
            {capital.filter((s) => s.name === selected).map((s) => (
              <path key="inset-on" d={s.d} className="district-map__halo" />
            ))}
            <text x={inset.x + inset.width / 2} y={inset.y + inset.height + 12}
              textAnchor="middle" className="district-map__inset-label">
              {t('district.capitalInset')}
            </text>
          </g>
        )}

        {/* the readout, in the empty corner above the Danube. It gets a panel
            of its own: the corner is empty at the top but the north-west
            counties reach into it, and a number over an outline is unreadable
            at exactly the moment it matters. */}
        <g className="district-map__readout" aria-hidden="true">
          <rect x={READ.x - 6} y={READ.y - 14} width={READ.width + 12}
            height={shownName ? 120 : 34} rx={8} />
          {shownName ? (
            <>
              <text x={READ.x + READ.width / 2} y={READ.y + 16} textAnchor="middle"
                className="district-map__read-name">{shownName}</text>
              {seat && seat !== shownName && (
                <text x={READ.x + READ.width / 2} y={READ.y + 36} textAnchor="middle"
                  className="district-map__read-seat">
                  {t('district.readSeat', { seat })}
                </text>
              )}
              <text x={READ.x + READ.width / 2} y={READ.y + 82} textAnchor="middle"
                className="district-map__read-value">
                {value === undefined ? '–'
                  : legendFormat ? legendFormat(value) : String(value)}
              </text>
              <text x={READ.x + READ.width / 2} y={READ.y + 101} textAnchor="middle"
                className="district-map__read-label">
                {t('district.readValue')}
              </text>
            </>
          ) : (
            <text x={READ.x + READ.width / 2} y={READ.y + 16} textAnchor="middle"
              className="district-map__read-hint">{t('district.readHint')}</text>
          )}
        </g>
      </svg>
      {legendFormat && (
        <Legend max={max} color={color} empty={empty} format={legendFormat}
          hasEmpty={(total ?? shapes.length) > values.size} />
      )}
    </div>
  );
}
