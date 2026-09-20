// The orientation layers every map shares: city labels (county seats,
// county-rank cities, járás seats, larger towns) as DOM markers — so no glyph
// server is needed — plus járás and Budapest district borders as line layers,
// and optional county name labels for the maps that have none of their own.
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Marker, type Map as MLMap } from 'maplibre-gl';
import {
  cityVisible, loadCities, loadGeo, resolveLayers, useLayerChoice,
  type LayerChoice, type LayerState,
} from '../lib/mapLayers';

/** layers the borders should stay underneath, in order of preference */
const BELOW = ['pts', 'praxes', 'county-marker'];

interface BorderLayer {
  id: string;
  file: string;
  color: string;
  width: number;
}

const BORDERS: Record<'jaras' | 'budapest', BorderLayer> = {
  jaras: { id: 'jaras-outline', file: 'jaras', color: '#2f4059', width: 0.7 },
  budapest: { id: 'bp-line', file: 'budapest', color: '#46597a', width: 1 },
};

function centroid(feature: GeoJSON.Feature): [number, number] | null {
  let minX = 180; let minY = 90; let maxX = -180; let maxY = -90; let seen = false;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as [number, number];
      seen = true;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk((feature.geometry as GeoJSON.Polygon)?.coordinates);
  return seen ? [(minX + maxX) / 2, (minY + maxY) / 2] : null;
}

/**
 * `mapDefaults` lets a map keep its own starting point (the main map shows
 * county names from the start); `countyLabels: false` is for maps that draw
 * their own county markers.
 */
export function useOrientationLayers(
  mapRef: RefObject<MLMap | null>,
  mapDefaults: LayerChoice = {},
  countyLabels = true,
): LayerState {
  const choice = useLayerChoice();
  const defaultsKey = JSON.stringify(mapDefaults);
  const layers = useMemo(
    () => resolveLayers(choice, JSON.parse(defaultsKey) as LayerChoice),
    [choice, defaultsKey],
  );
  const markersRef = useRef<Marker[]>([]);

  // city (and optionally county) labels
  useEffect(() => {
    let cancelled = false;
    const wantCounties = countyLabels && layers.counties;
    void Promise.all([loadCities(), wantCounties ? loadGeo('counties') : null])
      .then(([cities, counties]) => {
        const map = mapRef.current;
        if (cancelled || !map) return;
        markersRef.current.forEach((m) => m.remove());
        const markers: Marker[] = [];
        for (const city of cities) {
          if (!cityVisible(city, layers)) continue;
          const el = document.createElement('div');
          el.className = `map-city map-city--${city.rank}`;
          const dot = document.createElement('i');
          const label = document.createElement('span');
          label.textContent = city.name;
          el.append(dot, label);
          markers.push(new Marker({ element: el, anchor: 'left' })
            .setLngLat([city.lon, city.lat]).addTo(map));
        }
        for (const feature of counties?.features ?? []) {
          const center = centroid(feature);
          if (!center) continue;
          const el = document.createElement('div');
          el.className = 'map-county-label';
          el.textContent = String(feature.properties?.name ?? '');
          markers.push(new Marker({ element: el }).setLngLat(center).addTo(map));
        }
        markersRef.current = markers;
      });
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [layers, mapRef, countyLabels]);

  // járás and Budapest district borders, added the first time they are asked for
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const apply = () => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      for (const [key, border] of Object.entries(BORDERS) as ['jaras' | 'budapest', BorderLayer][]) {
        const on = layers[key];
        if (map.getLayer(border.id)) {
          map.setLayoutProperty(border.id, 'visibility', on ? 'visible' : 'none');
          continue;
        }
        if (!on) continue;
        void loadGeo(border.file).then((fc) => {
          const m = mapRef.current;
          if (cancelled || !m || !fc || m.getLayer(border.id)) return;
          try {
            if (!m.getSource(border.id)) {
              m.addSource(border.id, { type: 'geojson', data: fc });
            }
            m.addLayer({
              id: border.id, type: 'line', source: border.id,
              paint: { 'line-color': border.color, 'line-width': border.width },
            }, BELOW.find((id) => m.getLayer(id)));
          } catch {
            // the style is not ready yet — try again shortly
            timer = window.setTimeout(apply, 200);
          }
        });
      }
    };
    apply();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [layers.jaras, layers.budapest, layers, mapRef]);

  return layers;
}
