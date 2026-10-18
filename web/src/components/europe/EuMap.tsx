// Europe on one equal-area map, coloured by one measure.
//
// The frame follows the group the reader picked: the whole union, the region
// around Hungary, or the four Visegrád countries close up — the outlines
// outside it stay, grey, so a reader always sees where the cut-out sits. The
// colour runs from the worst value drawn to the best (or from low to high,
// for a measure with no good direction), so the same tone means the same
// thing on every map of the page.
import { useMemo, useRef, useState } from 'react';
import { geoArea, geoAzimuthalEqualArea, geoPath, interpolateRgbBasis } from 'd3';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import { t } from '../../lib/i18n';
import { goodness, type Better, type EuShape } from '../../lib/europe';

const W = 760;
const H = 560;
const GOOD = interpolateRgbBasis(['#ff7a59', '#ffb454', '#e9e3a6', '#4fd6c2']);
const PLAIN = interpolateRgbBasis(['#1f3550', '#3f6fa8', '#8fc3ff']);

/** d3-geo wants each exterior ring clockwise; GeoJSON files differ. A ring
 *  the wrong way round fills the whole globe but itself — so measure, and
 *  turn the polygon round when it claims more than half the sphere. */
function rewind(s: EuShape): Feature<MultiPolygon> {
  const coordinates = s.geometry.coordinates.map((poly) => {
    const f: Feature<MultiPolygon> = { type: 'Feature', properties: {},
      geometry: { type: 'MultiPolygon', coordinates: [poly] } };
    return geoArea(f) > 2 * Math.PI ? poly.map((ring) => [...ring].reverse()) : poly;
  });
  return { type: 'Feature', properties: { id: s.id }, geometry: { type: 'MultiPolygon', coordinates } };
}

export interface MapValue { value: number; year: string; stale?: boolean }

export function EuMap({ shapes, base, frame, valueOf, better, focus, onPick, nameOf, format,
  attribution, legendKey }: {
  /** the shapes that carry a value (countries or regions) */
  shapes: EuShape[];
  /** drawn underneath, grey: the countries around a regional map */
  base?: EuShape[];
  /** ids whose outline the map is fitted to */
  frame: Set<string>;
  valueOf: (id: string) => MapValue | null;
  better: Better;
  focus: string | null;
  onPick?: (id: string) => void;
  nameOf: (id: string) => string;
  format: (v: number) => string;
  attribution: string;
  legendKey?: string;
}) {
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const feats = useMemo(() => shapes.map(rewind), [shapes]);
  const baseFeats = useMemo(() => (base ?? []).map(rewind), [base]);

  const path = useMemo(() => {
    const inFrame = feats.filter((f) => frame.has(String(f.properties?.id)));
    const fit: FeatureCollection<MultiPolygon> = { type: 'FeatureCollection',
      features: inFrame.length ? inFrame : feats };
    const projection = geoAzimuthalEqualArea().rotate([-12, -52]).fitExtent([[10, 10], [W - 10, H - 10]], fit);
    return geoPath(projection);
  }, [feats, frame]);

  const values = useMemo(() => {
    const out = new Map<string, MapValue>();
    for (const s of shapes) {
      const v = valueOf(s.id);
      if (v) out.set(s.id, v);
    }
    return out;
  }, [shapes, valueOf]);
  // the colour scale spans what is in the frame, so a close-up uses its range
  const [lo, hi] = useMemo(() => {
    const vs = [...values.entries()].filter(([id, v]) => frame.has(id) && !v.stale).map(([, v]) => v.value);
    const all = vs.length ? vs : [...values.values()].map((v) => v.value);
    return [Math.min(...all), Math.max(...all)];
  }, [values, frame]);
  const colour = (v: MapValue) => {
    const g = goodness(better, v.value, lo, hi);
    return better === 'neutral' ? PLAIN(Math.max(0, Math.min(1, g))) : GOOD(Math.max(0, Math.min(1, g)));
  };

  const hv = hover ? values.get(hover.id) : null;
  return (
    <div className="eu-map" ref={box} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t(legendKey ?? 'europe.map.aria')}>
        {baseFeats.map((f) => (
          <path key={`b${String(f.properties?.id)}`} d={path(f) ?? ''} className="eu-map__base" />
        ))}
        {feats.map((f) => {
          const id = String(f.properties?.id);
          const v = values.get(id);
          const inFrame = frame.has(id);
          return (
            <path key={id} d={path(f) ?? ''}
              className={`eu-map__shape${inFrame ? '' : ' is-out'}${focus === id ? ' is-focus' : ''}${v ? '' : ' is-empty'}${v?.stale ? ' is-stale' : ''}`}
              style={v ? { fill: colour(v) } : undefined}
              onMouseMove={(e) => {
                const r = box.current?.getBoundingClientRect();
                if (r) setHover({ id, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onClick={onPick ? () => onPick(id) : undefined}>
              <title>{`${nameOf(id)}${v ? `: ${format(v.value)} (${v.year})` : ''}`}</title>
            </path>
          );
        })}
      </svg>
      {hover && (
        <div className="eu-map__tip" style={{ left: hover.x, top: hover.y }}>
          <b>{nameOf(hover.id)}</b>
          <span>{hv ? `${format(hv.value)} · ${hv.year}` : t('europe.noData')}</span>
          {hv?.stale && <em>{t('europe.stale')}</em>}
        </div>
      )}
      <div className="eu-map__legend">
        <span>{better === 'neutral' ? t('europe.map.low') : t('europe.map.worse')}</span>
        <i className={better === 'neutral' ? 'is-plain' : ''} />
        <span>{better === 'neutral' ? t('europe.map.high') : t('europe.map.better')}</span>
        {Number.isFinite(lo) && <small>{format(better === 'lower' ? hi : lo)} – {format(better === 'lower' ? lo : hi)}</small>}
      </div>
      <p className="eu-map__credit">{attribution}</p>
    </div>
  );
}
