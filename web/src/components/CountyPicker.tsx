// Pick a county by clicking it.
//
// A dropdown of twenty names is a list of words; this is the question people
// actually have ("what about here?") in the shape they have it in. The
// outlines are the same GeoJSON the maps use, drawn once as plain SVG paths —
// no map library, no tiles, no interaction beyond the click.
import { t } from '../lib/i18n';
import { useContextStore } from '../lib/context';
import { useCountyShapes } from '../lib/countyShapes';

const W = 720;
const H = 260;

export function CountyPicker({ onPick }: { onPick?: (county: string) => void }) {
  const county = useContextStore((s) => s.county);
  const setCounty = useContextStore((s) => s.setCounty);

  const shapes = useCountyShapes(W, H);

  if (!shapes.length) return null;
  const pick = (name: string) => {
    setCounty(name === county ? null : name);
    onPick?.(name);
  };

  return (
    <div className="countypicker">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t('county.pick')}>
        {shapes.map((s) => (
          <g key={s.name} className={`countypicker__county${
            s.name === county ? ' is-on' : ''}`}
            onClick={() => pick(s.name)} role="button" tabIndex={0}
            aria-pressed={s.name === county}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pick(s.name); }}>
            <title>{s.name}</title>
            <path d={s.d} />
            {/* Budapest is too small to carry its name inside itself */}
            {s.name !== 'Budapest' && (
              <text x={s.cx} y={s.cy} textAnchor="middle">{s.name}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
