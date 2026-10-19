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
import { project, rings, type Box, type ProjectedShape, type ShapeFeature } from './projection';

export type DistrictShape = ProjectedShape;
export type { Box };

type Feature = ShapeFeature;

export function useDistrictShapes(width: number, height: number, inset?: Box,
  /** where the country is drawn; the whole frame unless the caller keeps
   *  room for a readout or an inset beside it */
  country?: Box): {
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
      shapes: project(all, country ?? { x: 0, y: 0, width, height }),
      capital: inset && capitalFeatures.length
        ? project(capitalFeatures, inset) : [],
    };
  }, [jaras, capitalGeo, width, height, inset, country]);
}
