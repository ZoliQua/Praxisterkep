// Outlines projected into a box: the plain equirectangular projection the
// page maps use, corrected for latitude. No React here, so the PDF export
// can draw the same shapes without pulling the app in.

export interface Box { x: number; y: number; width: number; height: number }

export type Ring = number[][];

export interface ProjectedShape {
  name: string;
  /** SVG path in the projected box */
  d: string;
  /** label anchor, the average of the outline's points */
  cx: number;
  cy: number;
  isCapital: boolean;
}

export interface ShapeFeature { name: string; rings: Ring[]; isCapital: boolean }

export function rings(geometry: { type: string; coordinates: unknown }): Ring[] {
  // the files hold both Polygon and MultiPolygon; one shape is one area
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as Ring[][]).flat();
  }
  return geometry.coordinates as Ring[];
}

/** Projects features into a box, keeping their aspect ratio; `labels` puts
 *  a name at a given longitude/latitude instead of the outline's average. */
export function project(features: ShapeFeature[], box: Box,
  labels: Record<string, [number, number]> = {}): ProjectedShape[] {
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
    const at = labels[f.name] ? xy(labels[f.name]) : null;
    return {
      name: f.name,
      isCapital: f.isCapital,
      d: f.rings.map((ring) => `M${ring.map((p) => xy(p).map((v) => v.toFixed(1))
        .join(' ')).join('L')}Z`).join(''),
      cx: at ? at[0] : points.reduce((a, p) => a + p[0], 0) / points.length,
      cy: at ? at[1] : points.reduce((a, p) => a + p[1], 0) / points.length,
    };
  });
}

/** The aspect ratio (width / height) the projection gives a set of features. */
export function aspect(features: ShapeFeature[]): number {
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
  return ((bbox[2] - bbox[0]) * k) / (bbox[3] - bbox[1] || 1);
}
