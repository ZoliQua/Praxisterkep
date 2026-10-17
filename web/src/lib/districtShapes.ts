// The 197 járás outlines, projected into a fixed box.
//
// The country drawn at járás resolution is the point of the page: a county
// map shows twenty blocks and hides that Zala's nine járás are not one
// country. The capital comes from its own file, where the districts are
// numbered rather than named.
//
// Budapest is drawn twice. At the country's own scale its 23 kerület are a
// smudge the size of a thumbnail — 525 km² against Hungary's 93 000 — and
// they hold a tenth of the population and the worst dental district in the
// country. So they are also blown up into an inset, projected on their own
// bounding box, which is what every atlas does with a capital.
import { useMemo } from 'react';
import { useGeo } from './geo';

export interface DistrictShape {
  name: string;
  /** SVG path in the projected box */
  d: string;
  /** label anchor, the average of the outline's points */
  cx: number;
  cy: number;
  isCapital: boolean;
}

export interface Box { x: number; y: number; width: number; height: number }

type Ring = number[][];

function rings(geometry: { type: string; coordinates: unknown }): Ring[] {
  // the files hold both Polygon and MultiPolygon; one shape is one járás
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as Ring[][]).flat();
  }
  return geometry.coordinates as Ring[];
}

interface Feature { name: string; rings: Ring[]; isCapital: boolean }

/** Projects features into a box, keeping their aspect ratio. */
function project(features: Feature[], box: Box): DistrictShape[] {
  let bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of features) {
    for (const ring of f.rings) {
      for (const [lon, lat] of ring) {
        bbox = [Math.min(bbox[0], lon), Math.min(bbox[1], lat),
          Math.max(bbox[2], lon), Math.max(bbox[3], lat)];
      }
    }
  }
  const k = Math.cos(((bbox[1] + bbox[3]) / 2) * Math.PI / 180);
  const w = (bbox[2] - bbox[0]) * k;
  const h = bbox[3] - bbox[1];
  const scale = Math.min(box.width / w, box.height / h);
  const xy = ([lon, lat]: number[]): [number, number] => [
    box.x + (lon - bbox[0]) * k * scale + (box.width - w * scale) / 2,
    box.y + (bbox[3] - lat) * scale + (box.height - h * scale) / 2,
  ];
  return features.map((f) => {
    const points = f.rings.flat().map(xy);
    return {
      name: f.name,
      isCapital: f.isCapital,
      d: f.rings.map((ring) => `M${ring.map((p) => xy(p).map((v) => v.toFixed(1))
        .join(' ')).join('L')}Z`).join(''),
      cx: points.reduce((a, p) => a + p[0], 0) / points.length,
      cy: points.reduce((a, p) => a + p[1], 0) / points.length,
    };
  });
}

export function useDistrictShapes(width: number, height: number, inset?: Box): {
  shapes: DistrictShape[];
  /** the kerület again, blown up into the inset box */
  capital: DistrictShape[];
} {
  const jaras = useGeo('jaras.geojson');
  const capitalGeo = useGeo('budapest.geojson');
  return useMemo(() => {
    if (!jaras) return { shapes: [], capital: [] };
    const features: Feature[] = [];
    for (const f of jaras.features) {
      // the file also carries the capital as one blob; its districts are what
      // a reader recognises, and they come from budapest.geojson below
      if (f.properties.name === 'Budapest') continue;
      features.push({
        name: String(f.properties.name),
        rings: rings(f.geometry),
        isCapital: false,
      });
    }
    const capitalFeatures: Feature[] = [];
    for (const f of capitalGeo?.features ?? []) {
      // "I. kerület" with ref "1" is what districts.json calls
      // "Budapest 01. ker."
      const ref = Number(f.properties.ref);
      if (!ref) continue;
      capitalFeatures.push({
        name: `Budapest ${String(ref).padStart(2, '0')}. ker.`,
        rings: rings(f.geometry),
        isCapital: true,
      });
    }
    const all = [...features, ...capitalFeatures];
    return {
      shapes: project(all, { x: 0, y: 0, width, height }),
      capital: inset && capitalFeatures.length
        ? project(capitalFeatures, inset) : [],
    };
  }, [jaras, capitalGeo, width, height, inset]);
}
