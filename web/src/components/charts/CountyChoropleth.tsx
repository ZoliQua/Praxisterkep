// One number per county, painted onto the country.
//
// Twenty bars say the same thing, but geography is the point here: "the north
// east is thin" is a sentence a map writes by itself and a bar chart never
// does.
import { useCountyShapes } from '../../lib/countyShapes';
import { useContextStore } from '../../lib/context';

const W = 720;
const H = 250;

export function CountyChoropleth({
  values, format, color = '#4fd6c2', empty = 'var(--bg-panel)', onPick, selected,
}: {
  /** county name -> value in 0..1; a missing county is drawn as empty */
  values: Map<string, number>;
  /** what the tooltip says for a county */
  format?: (county: string, value: number | undefined) => string;
  color?: string;
  empty?: string;
  onPick?: (county: string) => void;
  selected?: string | null;
}) {
  const shapes = useCountyShapes(W, H);
  const county = useContextStore((s) => s.county);
  const chosen = selected === undefined ? county : selected;
  if (!shapes.length) return null;

  return (
    <div className="choropleth">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {shapes.map((s) => {
          const v = values.get(s.name);
          return (
            <g key={s.name} className={`choropleth__county${
              s.name === chosen ? ' is-on' : ''}${onPick ? ' is-clickable' : ''}`}
              onClick={onPick ? () => onPick(s.name) : undefined}>
              <title>{format ? format(s.name, v) : `${s.name}: ${v ?? '–'}`}</title>
              <path d={s.d} fill={v === undefined ? empty : color}
                fillOpacity={v === undefined ? 1 : 0.15 + v * 0.85} />
              {s.name !== 'Budapest' && (
                <text x={s.cx} y={s.cy} textAnchor="middle">{s.name}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
