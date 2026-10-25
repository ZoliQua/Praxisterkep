// The point maps of the analysis, specialist and EESZT pages, loaded late.
//
// The map itself (EesztMapView) needs MapLibre, a megabyte of script, and a
// WebGL context each. Neither is wanted before the reader comes near a map:
// the module is fetched the first time any map is about to be shown, and
// each map starts only when it is within reach of the viewport. Until then
// a box of the map's height holds its place.
import { lazy, Suspense, type ComponentProps } from 'react';
import type { EesztMap as View } from './EesztMapView';
import { useNearViewport } from './Deferred';

export type { MapRow, MapCategory } from './EesztMapView';

const LazyView = lazy(() => import('./EesztMapView').then((m) => ({ default: m.EesztMap })));

type Props = ComponentProps<typeof View>;

export function EesztMap(props: Props) {
  const [ref, near] = useNearViewport();
  const stand = (
    <div className="eeszt-map" ref={near ? undefined : ref}>
      <div className="eeszt-map__stage" style={{ height: props.height ?? 460 }} />
    </div>
  );
  if (!near) return stand;
  return <Suspense fallback={stand}><LazyView {...props} /></Suspense>;
}
