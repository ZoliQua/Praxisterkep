// The country at járás resolution, one number per shape.
//
// The county choropleth has twenty blocks and hides the thing worth seeing:
// a county with a middling rate can hold a járás at 60% and another at 0%.
// 197 shapes show that without a sentence.
import { useState } from 'react';
import { useDistrictShapes } from '../../lib/districtShapes';

const W = 760;
const H = 430;

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

export function DistrictMap({
  values, format, color = '#ef6461', empty = 'var(--bg-panel)', onPick, selected,
}: {
  /** járás name -> value in 0..1; a missing one is drawn as empty */
  values: Map<string, number>;
  format?: (name: string, value: number | undefined) => string;
  color?: string;
  empty?: string;
  onPick?: (name: string) => void;
  selected?: string | null;
}) {
  const shapes = useDistrictShapes(W, H);
  const [hover, setHover] = useState<string | null>(null);
  if (!shapes.length) return null;
  // the ramp tops out at the 90th percentile, not at the single worst járás:
  // a lone 75% would squash every other shape into the background, and the
  // question the map answers is where the bad patches are, not who holds the
  // record. Anything above it is simply the darkest shade.
  const sorted = [...values.values()].sort((a, b) => a - b);
  const max = Math.max(0.0001, sorted[Math.floor(sorted.length * 0.9)] ?? 0);
  const shown = hover ?? selected ?? null;
  const row = shown ? { name: shown, value: values.get(shown) } : null;

  return (
    <div className="district-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={format?.('', undefined)
        ?? 'járás'} onPointerLeave={() => setHover(null)}>
        {shapes.map((s) => {
          const v = values.get(s.name);
          const on = s.name === selected;
          return (
            <path key={s.name} d={s.d}
              className={`district-map__shape${on ? ' is-on' : ''}${
                onPick ? ' is-clickable' : ''}`}
              fill={fillOf(v, max, color, empty)}
              onPointerEnter={() => setHover(s.name)}
              onClick={onPick ? () => onPick(s.name) : undefined}>
              <title>{format ? format(s.name, v) : `${s.name}: ${v ?? '–'}`}</title>
            </path>
          );
        })}
        {/* the selected shape is drawn again on top: an outline under its
            neighbours is an outline nobody can see */}
        {shapes.filter((s) => s.name === selected).map((s) => (
          <path key="on" d={s.d} className="district-map__halo" />
        ))}
      </svg>
      {row && (
        <p className="district-map__read">
          <strong>{row.name}</strong>
          {' — '}
          {format ? format(row.name, row.value).split(': ').slice(1).join(': ')
            : String(row.value ?? '–')}
        </p>
      )}
    </div>
  );
}
