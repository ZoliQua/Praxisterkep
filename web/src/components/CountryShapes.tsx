// Country/county silhouettes for the scrollytelling intro, built from the
// same counties.geojson the map uses — so they stay correct whenever the
// worst county or the longest-vacant district changes.
import { useEffect, useState } from 'react';

const W = 520;
const H = 330;
const PAD = 8;

interface Shapes {
  /** county name -> SVG path in country-wide coordinates */
  paths: Map<string, string>;
  /** projector from lon/lat to the same coordinate space */
  project: (lon: number, lat: number) => [number, number];
}

let shapesPromise: Promise<Shapes> | null = null;

function buildShapes(fc: GeoJSON.FeatureCollection): Shapes {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const rings: { name: string; ring: number[][] }[] = [];
  for (const f of fc.features) {
    const name = String(f.properties?.name ?? '');
    const geom = f.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates]
      : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const poly of polys) {
      for (const [lon, lat] of poly[0]) {
        minX = Math.min(minX, lon); maxX = Math.max(maxX, lon);
        minY = Math.min(minY, lat); maxY = Math.max(maxY, lat);
      }
      rings.push({ name, ring: poly[0] });
    }
  }
  const k = Math.cos(((minY + maxY) / 2) * (Math.PI / 180));
  const s = Math.min(
    (W - 2 * PAD) / ((maxX - minX) * k),
    (H - 2 * PAD) / (maxY - minY),
  );
  const ox = (W - (maxX - minX) * k * s) / 2;
  const oy = (H - (maxY - minY) * s) / 2;
  const project = (lon: number, lat: number): [number, number] => [
    ox + (lon - minX) * k * s,
    oy + (maxY - lat) * s,
  ];
  const paths = new Map<string, string>();
  for (const { name, ring } of rings) {
    const d = ring
      .map(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join('') + 'Z';
    paths.set(name, (paths.get(name) ?? '') + d);
  }
  return { paths, project };
}

export function useCountryShapes(): Shapes | null {
  const [shapes, setShapes] = useState<Shapes | null>(null);
  useEffect(() => {
    shapesPromise ??= fetch(`${import.meta.env.BASE_URL}data/counties.geojson`)
      .then((r) => r.json())
      .then(buildShapes);
    void shapesPromise.then(setShapes);
  }, []);
  return shapes;
}

/** Hungary outline, filled from the bottom up to `pct` (0..1). */
export function CountryFill({ shapes, pct, color, label }: {
  shapes: Shapes; pct: number | null; color: string; label?: string;
}) {
  const all = [...shapes.paths.values()].join('');
  const fillH = pct !== null ? H * Math.min(1, Math.max(0, pct)) : 0;
  const clipId = `country-fill-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="intro__shape" role="img" aria-hidden="true">
      <defs>
        <clipPath id={clipId}><path d={all} /></clipPath>
      </defs>
      <path d={all} fill="var(--bg-raised)" stroke="var(--line-strong)" strokeWidth={1.2} />
      {shapes && [...shapes.paths.entries()].map(([name, d]) => (
        <path key={name} d={d} fill="none" stroke="var(--line)" strokeWidth={0.8} />
      ))}
      {pct !== null && (
        <g clipPath={`url(#${clipId})`}>
          <rect className="intro__shape-fill" x={0} y={H - fillH} width={W}
            height={fillH} fill={color} opacity={0.75} />
        </g>
      )}
      <path d={all} fill="none" stroke="var(--ink-faint)" strokeWidth={1.4} />
      {label && (
        <text x={W / 2} y={H / 2 + 8} textAnchor="middle" className="intro__shape-label">
          {label}
        </text>
      )}
    </svg>
  );
}

/** county seats, shown faintly for orientation (lon, lat) */
const COUNTY_SEATS: Record<string, { seat: string; lon: number; lat: number }> = {
  'Bács-Kiskun': { seat: 'Kecskemét', lon: 19.6897, lat: 46.8964 },
  Baranya: { seat: 'Pécs', lon: 18.2323, lat: 46.0727 },
  'Békés': { seat: 'Békéscsaba', lon: 21.0877, lat: 46.6736 },
  'Borsod-Abaúj-Zemplén': { seat: 'Miskolc', lon: 20.7784, lat: 48.1035 },
  'Csongrád-Csanád': { seat: 'Szeged', lon: 20.1414, lat: 46.253 },
  'Fejér': { seat: 'Székesfehérvár', lon: 18.4221, lat: 47.186 },
  'Győr-Moson-Sopron': { seat: 'Győr', lon: 17.6504, lat: 47.6875 },
  'Hajdú-Bihar': { seat: 'Debrecen', lon: 21.6273, lat: 47.5316 },
  Heves: { seat: 'Eger', lon: 20.3772, lat: 47.9026 },
  'Jász-Nagykun-Szolnok': { seat: 'Szolnok', lon: 20.1826, lat: 47.1621 },
  'Komárom-Esztergom': { seat: 'Tatabánya', lon: 18.3981, lat: 47.5692 },
  'Nógrád': { seat: 'Salgótarján', lon: 19.8, lat: 48.0935 },
  Pest: { seat: 'Budapest', lon: 19.0402, lat: 47.4979 },
  Somogy: { seat: 'Kaposvár', lon: 17.7968, lat: 46.3594 },
  'Szabolcs-Szatmár-Bereg': { seat: 'Nyíregyháza', lon: 21.7244, lat: 47.9554 },
  Tolna: { seat: 'Szekszárd', lon: 18.7062, lat: 46.3474 },
  Vas: { seat: 'Szombathely', lon: 16.6218, lat: 47.2307 },
  'Veszprém': { seat: 'Veszprém', lon: 17.9093, lat: 47.093 },
  Zala: { seat: 'Zalaegerszeg', lon: 16.8416, lat: 46.8417 },
};

/** One county's silhouette, optionally with a pulsing marker at lon/lat. */
export function CountyShape({ shapes, name, marker, markerLabel }: {
  shapes: Shapes; name: string;
  marker?: [number, number] | null; markerLabel?: string;
}) {
  const d = shapes.paths.get(name);
  if (!d) return null;
  // re-fit the county into the stage: scale its country-space bbox up
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    minX = Math.min(minX, nums[i]); maxX = Math.max(maxX, nums[i]);
    minY = Math.min(minY, nums[i + 1]); maxY = Math.max(maxY, nums[i + 1]);
  }
  const s = Math.min((W - 40) / (maxX - minX), (H - 40) / (maxY - minY));
  const tx = (W - (maxX - minX) * s) / 2 - minX * s;
  const ty = (H - (maxY - minY) * s) / 2 - minY * s;
  const m = marker ? shapes.project(marker[0], marker[1]) : null;
  // the county seat, faintly, for orientation (skip when it IS the marker)
  const seatInfo = COUNTY_SEATS[name];
  const seat = seatInfo && seatInfo.seat !== markerLabel
    ? { ...seatInfo, pos: shapes.project(seatInfo.lon, seatInfo.lat) }
    : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="intro__shape" role="img" aria-hidden="true">
      <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${s.toFixed(3)})`}>
        <path d={d} fill="var(--alert)" opacity={0.28}
          stroke="var(--alert)" strokeWidth={2.4 / s} />
        {seat && (
          <circle cx={seat.pos[0]} cy={seat.pos[1]} r={4 / s}
            fill="var(--ink-faint)" opacity={0.8} />
        )}
        {m && (
          <g>
            <circle className="intro__marker-ring" cx={m[0]} cy={m[1]} r={10 / s}
              fill="none" stroke="var(--alert)" strokeWidth={2 / s} />
            <circle cx={m[0]} cy={m[1]} r={5 / s} fill="var(--alert)" />
          </g>
        )}
      </g>
      {seat && (
        <text x={seat.pos[0] * s + tx + 10} y={seat.pos[1] * s + ty + 4}
          className="intro__shape-label intro__shape-label--seat">
          {seat.seat}
        </text>
      )}
      {m && markerLabel && (
        <text x={(m[0] * s + tx) + 14} y={m[1] * s + ty + 4}
          className="intro__shape-label intro__shape-label--small">
          {markerLabel}
        </text>
      )}
    </svg>
  );
}
