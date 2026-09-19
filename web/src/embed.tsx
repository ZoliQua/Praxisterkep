// Embeddable mini map (embed.html): vacancy points for one kind, optional
// county focus, with a mandatory backlink to the full site. Query params:
//   ?k=dental|gp   (default dental)
//   &m=COUNTY      (optional county name, zooms to its bounds)
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import { t } from './lib/i18n';
import { formatMonth, formatNumber } from './lib/format';
import type { LatestFile, PraxisKind, Snapshot } from './types';

const HUNGARY_BOUNDS: [[number, number], [number, number]] =
  [[15.9, 45.6], [23.2, 48.7]];

function praxisFeatures(snapshot: Snapshot): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of snapshot.praxes) {
    for (const s of p.sites) {
      if (s.lat === undefined || s.lon === undefined) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: { status: p.status },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function EmbedApp() {
  const params = new URLSearchParams(window.location.search);
  const kind: PraxisKind = params.get('k') === 'gp' ? 'gp' : 'dental';
  const county = params.get('m');
  const containerRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    document.documentElement.dataset.kind = kind;
    void fetch(`${import.meta.env.BASE_URL}data/latest.json`)
      .then((r) => r.json())
      // keep the first object: StrictMode runs this effect twice, and two
      // distinct snapshot objects would tear down the map mid-load
      .then((latest: LatestFile) =>
        setSnapshot((prev) => prev ?? latest.kinds[kind] ?? null));
  }, [kind]);

  useEffect(() => {
    if (!snapshot || !containerRef.current) return;
    const map = new MLMap({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1016' } }],
      },
      bounds: HUNGARY_BOUNDS,
      fitBoundsOptions: { padding: 12 },
      attributionControl: { compact: true },
      dragRotate: false,
      interactive: true,
    });
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__emap = map;
    }
    // 'load' can be missed after a StrictMode remount; add the layers as
    // soon as the (inline, instantly parsed) style is ready instead
    const addLayers = () => {
      if (map.getSource('praxes')) return;
      map.addSource('counties', {
        type: 'geojson',
        data: `${import.meta.env.BASE_URL}data/counties.geojson`,
        attribution: '© OpenStreetMap contributors',
      });
      map.addLayer({
        id: 'county-line',
        type: 'line',
        source: 'counties',
        paint: { 'line-color': '#2a3b52', 'line-width': 1 },
      });
      map.addSource('praxes', { type: 'geojson', data: praxisFeatures(snapshot) });
      map.addLayer({
        id: 'praxis-points',
        type: 'circle',
        source: 'praxes',
        paint: {
          'circle-radius': 4,
          'circle-color': ['case', ['==', ['get', 'status'], 'dissolved'],
            '#ffb454', '#ff7a59'],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#0b1016',
        },
      });
      if (county) {
        void fetch(`${import.meta.env.BASE_URL}data/counties.geojson`)
          .then((r) => r.json())
          .then((fc: GeoJSON.FeatureCollection) => {
            const f = fc.features.find((x) =>
              String(x.properties?.name).toUpperCase() === county.toUpperCase());
            if (!f) return;
            let minX = 180, minY = 90, maxX = -180, maxY = -90;
            const walk = (c: unknown): void => {
              if (Array.isArray(c) && typeof c[0] === 'number') {
                const [lon, lat] = c as [number, number];
                minX = Math.min(minX, lon); maxX = Math.max(maxX, lon);
                minY = Math.min(minY, lat); maxY = Math.max(maxY, lat);
              } else if (Array.isArray(c)) c.forEach(walk);
            };
            walk((f.geometry as GeoJSON.Polygon).coordinates);
            map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 20 });
          });
      }
    };
    // retry until the style accepts layers (isStyleLoaded()/'load' are not
    // reliable right after a StrictMode remount)
    let disposed = false;
    const tryAdd = () => {
      if (disposed) return;
      try {
        addLayers();
      } catch {
        setTimeout(tryAdd, 120);
      }
    };
    tryAdd();
    return () => {
      disposed = true;
      map.remove();
    };
  }, [snapshot, county]);

  if (!snapshot) return <div className="loading">…</div>;
  const vacantAll = snapshot.national.vacant + snapshot.national.dissolved;
  return (
    <div className="embed">
      <div className="embed__map" ref={containerRef} />
      <div className="embed__bar">
        <span>
          <strong>{formatNumber(vacantAll)}</strong>{' '}
          {t(`kinds.${kind}.adj`)} {t('embed.vacantSuffix')} · {formatMonth(snapshot.month)}
        </span>
        <a href={`${window.location.origin}${import.meta.env.BASE_URL}?k=${kind}`}
          target="_blank" rel="noopener">
          {t('embed.backlink')} →
        </a>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EmbedApp />
  </StrictMode>,
);
