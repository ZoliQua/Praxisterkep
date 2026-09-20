// The orientation layers every map shares: city labels (county seats,
// county-rank cities, larger towns) as DOM markers — so no glyph server is
// needed — and the Budapest district borders as a line layer.
import { useEffect, useRef, type RefObject } from 'react';
import { Marker, type Map as MLMap } from 'maplibre-gl';
import { loadBudapest, loadCities, useMapLayers, visibleRanks } from '../lib/mapLayers';

/** layers the borders should stay underneath, in order of preference */
const BELOW = ['pts', 'praxes', 'county-marker'];

export function useOrientationLayers(mapRef: RefObject<MLMap | null>): void {
  const layers = useMapLayers();
  const markersRef = useRef<Marker[]>([]);

  // city labels
  useEffect(() => {
    let cancelled = false;
    void loadCities().then((cities) => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      markersRef.current.forEach((m) => m.remove());
      const ranks = visibleRanks(layers);
      markersRef.current = cities.filter((c) => ranks.has(c.rank)).map((c) => {
        const el = document.createElement('div');
        el.className = `map-city map-city--${c.rank}`;
        const dot = document.createElement('i');
        const label = document.createElement('span');
        label.textContent = c.name;
        el.append(dot, label);
        return new Marker({ element: el, anchor: 'left' })
          .setLngLat([c.lon, c.lat])
          .addTo(map);
      });
    });
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [layers, mapRef]);

  // Budapest district borders
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const apply = () => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      if (map.getLayer('bp-line')) {
        map.setLayoutProperty('bp-line', 'visibility', layers.budapest ? 'visible' : 'none');
        return;
      }
      if (!layers.budapest) return; // nothing to add until it is asked for
      void loadBudapest().then((fc) => {
        const m = mapRef.current;
        if (cancelled || !m || !fc || m.getLayer('bp-line')) return;
        try {
          if (!m.getSource('bp')) m.addSource('bp', { type: 'geojson', data: fc });
          const below = BELOW.find((id) => m.getLayer(id));
          m.addLayer({
            id: 'bp-line', type: 'line', source: 'bp',
            paint: { 'line-color': '#46597a', 'line-width': 1 },
          }, below);
        } catch {
          // the style is not ready yet (or was torn down) — try again shortly
          timer = window.setTimeout(apply, 200);
        }
      });
    };
    apply();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [layers.budapest, mapRef]);
}
