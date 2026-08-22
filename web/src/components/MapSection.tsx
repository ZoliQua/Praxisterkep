import { useEffect, useRef } from 'react';
import { Map as MLMap, NavigationControl, Popup } from 'maplibre-gl';
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
  return metric === 'rate' ? c.vacancyRate : c.populationVacant + c.populationDissolved;
}

function fillColorExpression(snapshot: Snapshot, metric: MapMetric): ExpressionSpecification {
  const values = snapshot.counties.map((c) =>
    metric === 'rate' ? c.vacancyRate : c.populationVacant + c.populationDissolved,
  );
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

function praxesToGeoJSON(praxes: Praxis[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of praxes) {
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

export function MapSection() {
  const snapshot = useSnapshot()!;
  const typeFilter = useAppStore((s) => s.typeFilter);
  const mapMetric = useAppStore((s) => s.mapMetric);
  const selectedCounty = useAppStore((s) => s.selectedCounty);
  const { setTypeFilter, setMapMetric, setSelectedCounty } = useAppStore.getState();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

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
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__map = map;
    }
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
    src?.setData(praxesToGeoJSON(filterPraxes(snapshot.praxes, typeFilter)));
  }, [snapshot, typeFilter]);

  const county = snapshot.counties.find((c) => c.name === selectedCounty);

  return (
    <section className="section container" id="terkep">
      <h2 className="section__heading">{t('map.heading')}</h2>
      <p className="section__explain">{t('map.explain')}</p>

      <div className="map-controls">
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
          <div style={{ marginTop: 8 }}>
            <div><span className="map-legend__dot" style={{ background: '#ff7a59' }} />{t('map.pointVacant')}</div>
            <div><span className="map-legend__dot" style={{ background: '#ffb454' }} />{t('map.pointDissolved')}</div>
            <div><span className="map-legend__dot" style={{ background: '#8b98ab', opacity: 0.55 }} />{t('map.pointApprox')}</div>
          </div>
        </div>
        {county && (
          <aside className="county-panel">
            <button className="county-panel__close" onClick={() => setSelectedCounty(null)}>×</button>
            <h3>{county.name}</h3>
            <dl>
              <dt>{t('map.countyDistricts')}</dt>
              <dd>{formatNumber(county.total)}</dd>
              <dt>{t('map.countyVacant')}</dt>
              <dd>{formatNumber(county.vacant)}</dd>
              <dt>{t('map.countyDissolved')}</dt>
              <dd>{formatNumber(county.dissolved)}</dd>
              <dt>{t('map.metricRate')}</dt>
              <dd>{formatPercent(county.vacancyRate)}</dd>
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
