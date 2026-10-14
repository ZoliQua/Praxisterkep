// The 197 járás outlines, projected once into a fixed box.
//
// The country drawn at járás resolution is the whole point of the page: a
// county map shows twenty blocks and hides that Zala's nine járás are not one
// country. The capital comes from its own file, where the districts are
// numbered rather than named, so the two are stitched together here.
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

type Ring = number[][];

function rings(geometry: { type: string; coordinates: unknown }): Ring[] {
  // the files hold both Polygon and MultiPolygon; one shape is one járás
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as Ring[][]).flat();
  }
  return geometry.coordinates as Ring[];
}

export function useDistrictShapes(width: number, height: number): DistrictShape[] {
  const jaras = useGeo('jaras.geojson');
  const capital = useGeo('budapest.geojson');
  return useMemo(() => {
    if (!jaras) return [];
    const features: { name: string; rings: Ring[]; isCapital: boolean }[] = [];
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
    for (const f of capital?.features ?? []) {
      // "I. kerület" with ref "1" is what districts.json calls
      // "Budapest 01. ker."
      const ref = Number(f.properties.ref);
      if (!ref) continue;
      features.push({
        name: `Budapest ${String(ref).padStart(2, '0')}. ker.`,
        rings: rings(f.geometry),
        isCapital: true,
      });
    }
    let box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of features) {
      for (const ring of f.rings) {
        for (const [lon, lat] of ring) {
          box = [Math.min(box[0], lon), Math.min(box[1], lat),
            Math.max(box[2], lon), Math.max(box[3], lat)];
        }
      }
    }
    const k = Math.cos(((box[1] + box[3]) / 2) * Math.PI / 180);
    const scale = Math.min(width / ((box[2] - box[0]) * k), height / (box[3] - box[1]));
    const xy = ([lon, lat]: number[]): [number, number] => [
      (lon - box[0]) * k * scale + (width - (box[2] - box[0]) * k * scale) / 2,
      (box[3] - lat) * scale + (height - (box[3] - box[1]) * scale) / 2,
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
  }, [jaras, capital, width, height]);
}
