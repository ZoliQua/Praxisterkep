import { useEffect, useRef, useState } from 'react';
import { Map as MLMap, Marker, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ExpressionSpecification, GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import { t } from '../lib/i18n';
import { formatMonth, formatNumber, formatPercent } from '../lib/format';
import { filterPraxes, type TypeFilter } from '../lib/selectors';
import { useAppStore, useSnapshot, type MapMetric } from '../store/useAppStore';
import type { Praxis, PraxisType, Snapshot } from '../types';

const HUNGARY_BOUNDS: [number, number, number, number] = [16.0, 45.6, 23.0, 48.7];
// dark-friendly sequential ramp (low -> high vacancy)
const RAMP = ['#152438', '#1f3a52', '#3d5a6c', '#8a7a55', '#d99a3d', '#ff7a59'];
// hand-tuned label offsets where the geometric centroid is misleading
const LABEL_OFFSET: Record<string, [number, number]> = {
  Pest: [0.28, -0.42], // its centroid falls on Budapest
};

type MapView = 'points' | 'columns';

const TYPE_LABELS: Record<PraxisType, string> = {
  adult: t('map.typeAdult'),
  child: t('map.typeChild'),
  mixed: t('map.typeMixed'),
  school: t('map.typeSchool'),
};

function typeOptions(snapshot: Snapshot): { value: TypeFilter; label: string }[] {
  const present = Object.keys(snapshot.national.byType) as PraxisType[];
  return [
    { value: 'all' as TypeFilter, label: t('map.typeAll') },
    ...present.map((v) => ({ value: v as TypeFilter, label: TYPE_LABELS[v] })),
  ];
}

function countyMetric(snapshot: Snapshot, name: string, metric: MapMetric): number {
  const c = snapshot.counties.find((x) => x.name === name);
  if (!c) return 0;
  return metric === 'rate'
    ? c.vacancyRate ?? 0
    : c.populationVacant + c.populationDissolved;
}

function fillColorExpression(snapshot: Snapshot, metric: MapMetric): ExpressionSpecification {
  const values = snapshot.counties.map((c) => countyMetric(snapshot, c.name, metric));
  const max = Math.max(...values, 1e-9);
  const match: unknown[] = ['match', ['get', 'name']];
  for (const c of snapshot.counties) {
    const v = countyMetric(snapshot, c.name, metric) / max;
    const idx = Math.min(RAMP.length - 1, Math.floor(v * (RAMP.length - 1) + 0.5));
    match.push(c.name, RAMP[idx]);
  }
  match.push(RAMP[0]);
  return match as ExpressionSpecification;
}

function praxesToGeoJSON(praxes: Praxis[], showDissolved: boolean): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of praxes) {
    if (!showDissolved && p.status === 'dissolved') continue;
    for (const s of p.sites) {
      if (s.lat === undefined || s.lon === undefined) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          id: p.id,
          status: p.status,
          type: p.type,
          county: p.county,
          settlement: s.settlement,
          address: s.address,
          district: s.district,
          vacantSince: p.vacantSince,
          population: p.population,
          geoApprox: s.geoApprox === true,
          isHeadquarters: s.isHeadquarters,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function popupHtml(props: Record<string, unknown>): string {
  const esc = (v: unknown) =>
    String(v ?? '').replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const status =
    props.status === 'dissolved' ? t('map.popupStatusDissolved') : t('map.popupStatusVacant');
  const lines = [
    `<h4>${esc(props.settlement)} — ${esc(props.address)}${props.isHeadquarters === true ? ` <span class="muted">(${t('map.popupHeadquarters')})</span>` : ''}</h4>`,
    `<div>${status} · ${esc(t(`praxisTypes.${props.type}`))}</div>`,
    `<div class="muted">${t('map.popupVacantSince')}: ${esc(formatMonth(String(props.vacantSince)))} —</div>`,
  ];
  if (props.population) {
    lines.push(
      `<div class="muted">${t('map.popupPopulation')}: ${formatNumber(Number(props.population))} ${t('map.fő')}</div>`,
    );
  }
  if (props.district) {
    lines.push(`<div class="muted">${t('map.popupDistrict')}: ${esc(props.district)}</div>`);
  }
  if (props.geoApprox === true) {
    lines.push(`<div class="flag">${t('map.popupApproxNote')}</div>`);
  }
  return lines.join('');
}

// counties.geojson is fetched once for centroid computation (module cache)
let centroidsPromise: Promise<Map<string, [number, number]>> | null = null;

function loadCentroids(): Promise<Map<string, [number, number]>> {
  centroidsPromise ??= fetch(`${import.meta.env.BASE_URL}data/counties.geojson`)
    .then((r) => r.json())
    .then((fc: GeoJSON.FeatureCollection) => {
      const out = new Map<string, [number, number]>();
      for (const f of fc.features) {
        const name = (f.properties as { name: string }).name;
        const ring = outerRing(f.geometry);
        if (ring) out.set(name, ringCentroid(ring));
      }
      return out;
    });
  return centroidsPromise;
}

function outerRing(geom: GeoJSON.Geometry): number[][] | null {
  if (geom.type === 'Polygon') return geom.coordinates[0];
  if (geom.type === 'MultiPolygon') {
    let best: number[][] | null = null;
    for (const poly of geom.coordinates) {
      if (!best || poly[0].length > best.length) best = poly[0];
    }
    return best;
  }
  return null;
}

/** shoelace centroid of a closed ring */
function ringCentroid(ring: number[][]): [number, number] {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    a += cross;
    cx += (ring[i][0] + ring[i + 1][0]) * cross;
    cy += (ring[i][1] + ring[i + 1][1]) * cross;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function MapSection() {
  const snapshot = useSnapshot()!;
  const typeFilter = useAppStore((s) => s.typeFilter);
  const mapMetric = useAppStore((s) => s.mapMetric);
  const selectedCounty = useAppStore((s) => s.selectedCounty);
  const { setTypeFilter, setMapMetric, setSelectedCounty } = useAppStore.getState();

  const [view, setView] = useState<MapView>('points');
  const [showNames, setShowNames] = useState(true);
  const [showDissolved, setShowDissolved] = useState(true);
  const [centroids, setCentroids] = useState<Map<string, [number, number]> | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<Marker[]>([]);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    void loadCentroids().then(setCentroids);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MLMap({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1016' } }],
      },
      bounds: HUNGARY_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true },
      dragRotate: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-left');

    map.on('load', () => {
      map.addSource('counties', {
        type: 'geojson',
        data: `${import.meta.env.BASE_URL}data/counties.geojson`,
        attribution: '© OpenStreetMap contributors',
      });
      map.addLayer({
        id: 'county-fill',
        type: 'fill',
        source: 'counties',
        paint: {
          'fill-color': fillColorExpression(snapshotRef.current, useAppStore.getState().mapMetric),
          'fill-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'county-line',
        type: 'line',
        source: 'counties',
        paint: { 'line-color': '#2a3b52', 'line-width': 1 },
      });
      map.addSource('praxes', {
        type: 'geojson',
        data: praxesToGeoJSON(
          filterPraxes(snapshotRef.current.praxes, useAppStore.getState().typeFilter),
          true,
        ),
      });
      map.addLayer({
        id: 'praxis-points',
        type: 'circle',
        source: 'praxes',
        paint: {
          'circle-radius': ['case', ['get', 'geoApprox'], 3.5, 5],
          'circle-color': [
            'match', ['get', 'status'],
            'dissolved', '#ffb454',
            '#ff7a59',
          ],
          'circle-opacity': ['case', ['get', 'geoApprox'], 0.55, 0.9],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#0b1016',
        },
      });

      map.on('click', 'praxis-points', (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        new Popup({ className: 'map-popup', closeButton: false, maxWidth: 'none' })
          .setLngLat(e.lngLat)
          .setHTML(popupHtml(f.properties as Record<string, unknown>))
          .addTo(map);
      });
      map.on('click', 'county-fill', (e: MapLayerMouseEvent) => {
        if (map.queryRenderedFeatures(e.point, { layers: ['praxis-points'] }).length) return;
        const name = e.features?.[0]?.properties?.name as string | undefined;
        setSelectedCounty(name ?? null);
      });
      for (const layer of ['praxis-points', 'county-fill']) {
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
      }
      readyRef.current = true;
    });
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setPaintProperty('county-fill', 'fill-color', fillColorExpression(snapshot, mapMetric));
  }, [snapshot, mapMetric]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('praxes') as GeoJSONSource | undefined;
    src?.setData(praxesToGeoJSON(filterPraxes(snapshot.praxes, typeFilter), showDissolved));
    map.setLayoutProperty(
      'praxis-points', 'visibility', view === 'points' ? 'visible' : 'none',
    );
  }, [snapshot, typeFilter, showDissolved, view]);

  // county labels / columns as HTML markers (no glyph server needed)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centroids) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (!showNames && view !== 'columns') return;
    const maxCount = Math.max(...snapshot.counties.map((c) => c.vacant + c.dissolved), 1);
    for (const c of snapshot.counties) {
      const pos = centroids.get(c.name);
      if (!pos) continue;
      const [dx, dy] = LABEL_OFFSET[c.name] ?? [0, 0];
      const el = document.createElement('div');
      el.className = 'county-marker';
      if (view === 'columns') {
        const count = c.vacant + c.dissolved;
        const bar = document.createElement('div');
        bar.className = 'county-marker__bar';
        bar.style.height = `${Math.round(8 + (count / maxCount) * 64)}px`;
        el.appendChild(bar);
        const value = document.createElement('div');
        value.className = 'county-marker__value';
        value.textContent = c.vacancyRate !== null
          ? `${formatNumber(count)} · ${formatPercent(c.vacancyRate)}`
          : formatNumber(count);
        el.appendChild(value);
      }
      if (showNames) {
        const name = document.createElement('div');
        name.className = 'county-marker__name';
        name.textContent = c.name;
        el.appendChild(name);
      }
      el.addEventListener('click', () => setSelectedCounty(c.name));
      const marker = new Marker({ element: el, anchor: view === 'columns' ? 'bottom' : 'center' })
        .setLngLat([pos[0] + dx, pos[1] + dy])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [snapshot, centroids, showNames, view, setSelectedCounty]);

  const county = snapshot.counties.find((c) => c.name === selectedCounty);

  return (
    <section className="section container" id="terkep">
      <h2 className="section__heading">{t('map.heading')}</h2>
      <p className="section__explain">
        {t('map.explain')} {view === 'columns' && t('map.columnExplain')}
      </p>

      <div className="map-controls">
        <div className="seg" role="group">
          {(['points', 'columns'] as MapView[]).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'points' ? t('map.viewPoints') : t('map.viewColumns')}
            </button>
          ))}
        </div>
        <div className="seg" role="group">
          {(['rate', 'population'] as MapMetric[]).map((m) => (
            <button key={m} aria-pressed={mapMetric === m} onClick={() => setMapMetric(m)}>
              {m === 'rate' ? t('map.metricRate') : t('map.metricPopulation')}
            </button>
          ))}
        </div>
        <div className="seg" role="group">
          {typeOptions(snapshot).map((o) => (
            <button
              key={o.value}
              aria-pressed={typeFilter === o.value}
              onClick={() => setTypeFilter(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className="map-check">
          <input type="checkbox" checked={showNames}
            onChange={(e) => setShowNames(e.target.checked)} />
          {t('map.toggleNames')}
        </label>
        {snapshot.national.dissolved > 0 && view === 'points' && (
          <label className="map-check">
            <input type="checkbox" checked={showDissolved}
              onChange={(e) => setShowDissolved(e.target.checked)} />
            {t('map.toggleDissolved')}
          </label>
        )}
      </div>

      <div className="map-wrap">
        <div ref={containerRef} className="map-canvas" />
        <div className="map-legend">
          <div>{mapMetric === 'rate' ? t('map.metricRate') : t('map.metricPopulation')}</div>
          <div className="map-legend__ramp">
            {RAMP.map((c) => (
              <span key={c} style={{ background: c }} />
            ))}
          </div>
          <div className="map-legend__row">
            <span>{t('map.legendLow')}</span>
            <span>{t('map.legendHigh')}</span>
          </div>
          {view === 'points' && (
            <div style={{ marginTop: 8 }}>
              <div><span className="map-legend__dot" style={{ background: '#ff7a59' }} />{t('map.pointVacant')}</div>
              {showDissolved && snapshot.national.dissolved > 0 && (
                <div><span className="map-legend__dot" style={{ background: '#ffb454' }} />{t('map.pointDissolved')}</div>
              )}
              <div><span className="map-legend__dot" style={{ background: '#8b98ab', opacity: 0.55 }} />{t('map.pointApprox')}</div>
            </div>
          )}
        </div>
        {county && (
          <aside className="county-panel">
            <button className="county-panel__close" onClick={() => setSelectedCounty(null)}>×</button>
            <h3>{county.name}</h3>
            <dl>
              <dt>{t('map.countyDistricts')}</dt>
              <dd>{county.total !== null ? formatNumber(county.total) : '–'}</dd>
              <dt>{t('map.countyVacant')}</dt>
              <dd>{formatNumber(county.vacant)}</dd>
              <dt>{t('map.countyDissolved')}</dt>
              <dd>{formatNumber(county.dissolved)}</dd>
              <dt>{t('map.metricRate')}</dt>
              <dd>{county.vacancyRate !== null ? formatPercent(county.vacancyRate) : '–'}</dd>
              <dt>{t('map.metricPopulation')}</dt>
              <dd>
                {formatNumber(county.populationVacant + county.populationDissolved)} {t('map.fő')}
              </dd>
            </dl>
          </aside>
        )}
      </div>
    </section>
  );
}
