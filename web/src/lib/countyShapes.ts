// The twenty county outlines, projected once into a fixed box so several
// components can draw the same little map of the country: the picker, and
// any choropleth that has one number per county.
import { useMemo } from 'react';
import { useGeo } from './geo';

export interface CountyShape {
  name: string;
  /** SVG path in the projected box */
  d: string;
  /** label anchor, the average of the outline's points */
  cx: number;
  cy: number;
}

export function useCountyShapes(width: number, height: number): CountyShape[] {
  const geo = useGeo('counties.geojson');
  return useMemo(() => {
    if (!geo) return [];
    let box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of geo.features) {
      for (const ring of f.geometry.coordinates as number[][][]) {
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
    return geo.features.map((f) => {
      const rings = f.geometry.coordinates as number[][][];
      const points = rings.flat().map(xy);
      return {
        name: String(f.properties.name),
        d: rings.map((ring) => `M${ring.map((p) => xy(p).map((v) => v.toFixed(1))
          .join(' ')).join('L')}Z`).join(''),
        cx: points.reduce((a, p) => a + p[0], 0) / points.length,
        cy: points.reduce((a, p) => a + p[1], 0) / points.length,
      };
    });
  }, [geo, width, height]);
}
