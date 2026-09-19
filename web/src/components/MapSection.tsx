import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MLMap, Marker, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {
  ExpressionSpecification, GeoJSONSource, MapLayerMouseEvent,
} from 'maplibre-gl';
import { t } from '../lib/i18n';
import { formatMonth, formatNumber, formatPercent, monthsBetween } from '../lib/format';
import { countyRanking, filterPraxes, type TypeFilter } from '../lib/selectors';
import { readMapState, writeMapState } from '../lib/mapState';
import {
  useAppStore, useHistoryEntries, useMapSnapshot, type MapMetric,
} from '../store/useAppStore';
import type { Praxis, PraxisType, Snapshot } from '../types';

const HUNGARY_BOUNDS: [number, number, number, number] = [16.0, 45.6, 23.0, 48.7];
// dark-friendly sequential ramp (low -> high vacancy)
const RAMP = ['#152438', '#1f3a52', '#3d5a6c', '#8a7a55', '#d99a3d', '#ff7a59'];
// vacancy-age steps: <1y, 1-5y, 5-10y, 10+y
const AGE_COLORS = ['#f5c96b', '#ffb454', '#ff7a59', '#e34948'];
const LABEL_OFFSET: Record<string, [number, number]> = {
  Pest: [0.28, -0.42], // its centroid falls on Budapest
};
const PLAY_MS = 850;

type MapView = 'points' | 'columns';
type ColorMode = 'status' | 'age';

const initialUrl = readMapState(window.location.search);

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
  if (metric === 'rate') return c.vacancyRate ?? 0;
  if (metric === 'popshare') return c.populationShare ?? 0;
  return c.populationVacant + c.populationDissolved;
}

const METRIC_LABEL_KEYS: Record<MapMetric, string> = {
  rate: 'map.metricRate',
  population: 'map.metricPopulation',
  popshare: 'map.metricPopShare',
};

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

function jarasFillExpression(
  values: Map<string, { count: number; population: number }>,
): ExpressionSpecification {
  // sqrt scale: one outlier (Budapest) must not flatten everything else
  // into the darkest ramp step; any district with data gets >= RAMP[1]
  const max = Math.max(1, ...[...values.values()].map((v) => v.count));
  const match: unknown[] = ['match', ['get', 'name']];
  for (const [name, v] of values) {
    const idx = Math.max(1, Math.min(
      RAMP.length - 1,
      Math.round(Math.sqrt(v.count / max) * (RAMP.length - 1)),
    ));
    match.push(name, RAMP[idx]);
  }
  match.push(RAMP[0]);
  return match as ExpressionSpecification;
}

function fillOpacityExpression(focus: string | null): ExpressionSpecification | number {
  if (!focus) return 0.85;
  return ['case', ['==', ['get', 'name'], focus], 0.92, 0.25] as ExpressionSpecification;
}

function pointColorExpression(mode: ColorMode): ExpressionSpecification {
  if (mode === 'age') {
    return ['step', ['get', 'months'],
      AGE_COLORS[0], 12, AGE_COLORS[1], 60, AGE_COLORS[2], 120, AGE_COLORS[3],
    ] as ExpressionSpecification;
  }
  return ['match', ['get', 'status'], 'dissolved', '#ffb454', '#ff7a59'] as ExpressionSpecification;
}

function pointOpacityExpression(focus: string | null): ExpressionSpecification {
  const base: unknown = ['case', ['get', 'geoApprox'], 0.55, 0.9];
  if (!focus) return base as ExpressionSpecification;
  return ['case', ['==', ['get', 'county'], focus], base, 0.12] as ExpressionSpecification;
}

function praxesToGeoJSON(
  praxes: Praxis[], month: string, showDissolved: boolean, minYears: number,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of praxes) {
    if (!showDissolved && p.status === 'dissolved') continue;
    const months = monthsBetween(p.vacantSince, month);
    if (months < minYears * 12) continue;
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
          months,
          longTerm: p.longTerm === true,
          longTermSince: p.longTermSince ?? '',
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
  if (props.longTerm === true && props.longTermSince) {
    lines.push(`<div class="flag">${t('map.popupLongTerm', {
      month: formatMonth(String(props.longTermSince)),
    })}</div>`);
  }
  if (props.geoApprox === true) {
    lines.push(`<div class="flag">${t('map.popupApproxNote')}</div>`);
  }
  lines.push(
    `<a class="map-popup__link" href="#nalam" data-settlement="${esc(props.settlement)}">${t('map.popupToSearch')}</a>`,
    `<a class="map-popup__link" href="#terkep" data-copylink="${esc(props.id)}">${t('map.popupCopyLink')}</a>`,
  );
  return lines.join('');
}

interface CountyGeom {
  centroid: [number, number];
  bbox: [[number, number], [number, number]];
}

let geomPromise: Promise<Map<string, CountyGeom>> | null = null;

function loadCountyGeoms(): Promise<Map<string, CountyGeom>> {
  geomPromise ??= fetch(`${import.meta.env.BASE_URL}data/counties.geojson`)
    .then((r) => r.json())
    .then((fc: GeoJSON.FeatureCollection) => {
      const out = new Map<string, CountyGeom>();
      for (const f of fc.features) {
        const name = (f.properties as { name: string }).name;
        const ring = outerRing(f.geometry);
        if (!ring) continue;
        let minX = 180, minY = 90, maxX = -180, maxY = -90;
        for (const [x, y] of ring) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        out.set(name, {
          centroid: ringCentroid(ring),
          bbox: [[minX, minY], [maxX, maxY]],
        });
      }
      return out;
    });
  return geomPromise;
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

/** tiny sparkline for the county panel */
function PanelSpark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const W = 224, H = 44;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const x = (i: number) => 4 + (i / (values.length - 1)) * (W - 8);
  const y = (v: number) => H - 6 - ((v - min) / Math.max(1, max - min)) * (H - 14);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="county-panel__spark" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3.2}
        fill={color} stroke="var(--bg-raised)" strokeWidth={1.5} />
    </svg>
  );
}

export function MapSection() {
  const snapshot = useMapSnapshot()!;
  const latestMonth = useAppStore((s) => s.latest?.month ?? snapshot.month);
  const kind = useAppStore((s) => s.kind);
  const typeFilter = useAppStore((s) => s.typeFilter);
  const mapMetric = useAppStore((s) => s.mapMetric);
  const selectedCounty = useAppStore((s) => s.selectedCounty);
  const selectedMonth = useAppStore((s) => s.selectedMonth);
  const entries = useHistoryEntries();
  const {
    setTypeFilter, setMapMetric, setSelectedCounty, selectMonth, ensureMonth,
    requestSearch,
  } = useAppStore.getState();

  const [view, setView] = useState<MapView>(initialUrl.view ?? 'points');
  const [colorMode, setColorMode] = useState<ColorMode>(initialUrl.colorMode ?? 'status');
  const [minYears, setMinYears] = useState(initialUrl.minYears ?? 0);
  const [level, setLevel] = useState<'county' | 'jaras'>('county');
  const [showNames, setShowNames] = useState(true);
  const [showDissolved, setShowDissolved] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const [geoms, setGeoms] = useState<Map<string, CountyGeom> | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<Marker[]>([]);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const urlMonthApplied = useRef(false);

  const months = useMemo(() => entries.map((e) => e.month), [entries]);
  const monthIdx = selectedMonth ? months.indexOf(selectedMonth) : months.length - 1;

  // járás-level aggregation: a praxis counts at its first district-bearing
  // site; Budapest kerület districts roll up onto the one Budapest polygon
  const districtValues = useMemo(() => {
    const m = new Map<string, { count: number; population: number }>();
    for (const p of snapshot.praxes) {
      const d0 = p.sites.find((s) => s.district)?.district;
      if (!d0) continue;
      const key = d0.startsWith('Budapest') ? 'Budapest' : d0;
      const cur = m.get(key) ?? { count: 0, population: 0 };
      cur.count += 1;
      cur.population += p.population ?? 0;
      m.set(key, cur);
    }
    return m;
  }, [snapshot]);

  useEffect(() => {
    void loadCountyGeoms().then(setGeoms);
  }, []);

  /* apply ?ho= archive month from the URL once history is known */
  useEffect(() => {
    if (urlMonthApplied.current || !initialUrl.month || months.length === 0) return;
    urlMonthApplied.current = true;
    if (months.includes(initialUrl.month) && initialUrl.month !== latestMonth) {
      void selectMonth(initialUrl.month);
    }
  }, [months, latestMonth, selectMonth]);

  /* apply ?p=FIN praxis deep link once: zoom to the praxis + open popup */
  const urlPraxisApplied = useRef(false);
  useEffect(() => {
    if (urlPraxisApplied.current || !initialUrl.praxis) return;
    const praxis = snapshot.praxes.find((p) => p.id === initialUrl.praxis);
    const site = praxis?.sites.find((s) => s.lat !== undefined && s.lon !== undefined);
    if (!praxis || !site) return;
    const open = () => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({ center: [site.lon!, site.lat!], zoom: 11, duration: 1400 });
      new Popup({ className: 'map-popup', closeButton: false, maxWidth: 'none' })
        .setLngLat([site.lon!, site.lat!])
        .setHTML(popupHtml({
          id: praxis.id,
          status: praxis.status,
          type: praxis.type,
          settlement: site.settlement,
          address: site.address,
          district: site.district,
          vacantSince: praxis.vacantSince,
          longTerm: praxis.longTerm === true,
          longTermSince: praxis.longTermSince ?? '',
          population: praxis.population,
          geoApprox: site.geoApprox === true,
          isHeadquarters: site.isHeadquarters,
        }))
        .addTo(map);
      // twice: late-mounting sections above the map shift the layout
      const scroll = () =>
        document.getElementById('terkep')?.scrollIntoView({ block: 'start' });
      scroll();
      setTimeout(scroll, 900);
    };
    // deferred: the map-creating effect is declared later in this component,
    // so mapRef is still null when this effect first runs
    const timer = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      urlPraxisApplied.current = true;
      if (readyRef.current) open();
      else map.once('praxisterkep:ready', open);
    }, 0);
    return () => clearTimeout(timer);
  }, [snapshot]);

  /* shareable URL (replaceState, foreign params preserved) */
  useEffect(() => {
    const q = writeMapState(window.location.search, {
      kind,
      county: selectedCounty ?? undefined,
      type: typeFilter,
      view,
      metric: mapMetric,
      month: selectedMonth ?? undefined,
      minYears: minYears || undefined,
      colorMode,
    });
    window.history.replaceState(
      null, '', `${window.location.pathname}${q}${window.location.hash}`,
    );
  }, [kind, selectedCounty, typeFilter, view, mapMetric, selectedMonth, minYears, colorMode]);

  /* time-travel playback */
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const cur = useAppStore.getState().selectedMonth;
      const i = cur ? months.indexOf(cur) : months.length - 1;
      const next = i + 1;
      if (next >= months.length - 1 || next >= months.length) {
        setPlaying(false);
        void selectMonth(null);
      } else {
        void selectMonth(months[next]);
      }
    }, PLAY_MS);
    return () => window.clearInterval(id);
  }, [playing, months, selectMonth]);

  function startPlayback() {
    months.forEach((m) => void ensureMonth(m)); // prefetch for smooth playback
    void selectMonth(months[0]);
    setPlaying(true);
  }

  /* ---------------- map lifecycle ---------------- */
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
      // járás layer starts empty; the geojson is only fetched on first use
      map.addSource('jaras', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        attribution: '© OpenStreetMap contributors',
      });
      map.addLayer({
        id: 'jaras-fill',
        type: 'fill',
        source: 'jaras',
        layout: { visibility: 'none' },
        paint: { 'fill-color': RAMP[0], 'fill-opacity': 0.85 },
      });
      map.addLayer({
        id: 'jaras-line',
        type: 'line',
        source: 'jaras',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#2a3b52', 'line-width': 0.8 },
      });
      map.addSource('praxes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'praxis-points',
        type: 'circle',
        source: 'praxes',
        paint: {
          'circle-radius': ['case', ['get', 'geoApprox'], 3.5, 5],
          'circle-color': pointColorExpression('status'),
          'circle-opacity': pointOpacityExpression(null),
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
      let hoverRaf = 0;
      for (const fillLayer of ['county-fill', 'jaras-fill']) {
        map.on('mousemove', fillLayer, (e: MapLayerMouseEvent) => {
          const name = e.features?.[0]?.properties?.name as string | undefined;
          if (!name) return;
          cancelAnimationFrame(hoverRaf);
          const { x, y } = e.point;
          hoverRaf = requestAnimationFrame(() => setHover({ name, x, y }));
        });
        map.on('mouseleave', fillLayer, () => {
          cancelAnimationFrame(hoverRaf);
          setHover(null);
        });
      }
      for (const layer of ['praxis-points', 'county-fill']) {
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
      }
      readyRef.current = true;
      map.fire('praxisterkep:ready');
    });

    // popup "open in search" + "copy deep link" (popup DOM lives inside
    // the map container)
    const onContainerClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;
      const a = target.closest?.('a[data-settlement]');
      if (a instanceof HTMLElement && a.dataset.settlement) {
        requestSearch(a.dataset.settlement);
        return;
      }
      const c = target.closest?.('a[data-copylink]');
      if (c instanceof HTMLElement && c.dataset.copylink) {
        ev.preventDefault();
        const url = new URL(window.location.href);
        url.searchParams.set('p', c.dataset.copylink);
        url.hash = '#terkep';
        void navigator.clipboard?.writeText(url.toString()).then(() => {
          c.textContent = t('map.popupCopied');
        });
      }
    };
    const container = containerRef.current;
    container.addEventListener('click', onContainerClick);

    return () => {
      container.removeEventListener('click', onContainerClick);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* choropleth + focus dimming */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.setPaintProperty('county-fill', 'fill-color', fillColorExpression(snapshot, mapMetric));
      map.setPaintProperty('county-fill', 'fill-opacity', fillOpacityExpression(selectedCounty));
      map.setPaintProperty('praxis-points', 'circle-opacity', pointOpacityExpression(selectedCounty));
      map.setPaintProperty('praxis-points', 'circle-color', pointColorExpression(colorMode));
    };
    if (readyRef.current) apply();
    else map.once('praxisterkep:ready', apply);
  }, [snapshot, mapMetric, selectedCounty, colorMode]);

  /* point data */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource('praxes') as GeoJSONSource | undefined;
      src?.setData(praxesToGeoJSON(
        filterPraxes(snapshot.praxes, typeFilter), snapshot.month, showDissolved, minYears,
      ));
      map.setLayoutProperty(
        'praxis-points', 'visibility', view === 'points' ? 'visible' : 'none',
      );
    };
    if (readyRef.current) apply();
    else map.once('praxisterkep:ready', apply);
  }, [snapshot, typeFilter, showDissolved, view, minYears]);

  /* county <-> járás level: swap the fill layers, lazy-load the polygons */
  const jarasLoaded = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (level === 'jaras' && !jarasLoaded.current) {
        jarasLoaded.current = true;
        void fetch(`${import.meta.env.BASE_URL}data/jaras.geojson`)
          .then((r) => r.json())
          .then((fc: GeoJSON.GeoJSON) => {
            (mapRef.current?.getSource('jaras') as GeoJSONSource | undefined)
              ?.setData(fc);
          });
      }
      const showJ = level === 'jaras' ? 'visible' : 'none';
      const showC = level === 'jaras' ? 'none' : 'visible';
      map.setLayoutProperty('jaras-fill', 'visibility', showJ);
      map.setLayoutProperty('jaras-line', 'visibility', showJ);
      map.setLayoutProperty('county-fill', 'visibility', showC);
      map.setLayoutProperty('county-line', 'visibility', showC);
      if (level === 'jaras') {
        map.setPaintProperty('jaras-fill', 'fill-color', jarasFillExpression(districtValues));
      }
    };
    if (readyRef.current) apply();
    else map.once('praxisterkep:ready', apply);
  }, [level, districtValues]);

  /* county focus zoom */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geoms) return;
    const apply = () => {
      if (selectedCounty && geoms.has(selectedCounty)) {
        map.fitBounds(geoms.get(selectedCounty)!.bbox, { padding: 56, duration: 800 });
      } else {
        map.fitBounds(HUNGARY_BOUNDS, { padding: 24, duration: 800 });
      }
    };
    if (readyRef.current) apply();
    else map.once('praxisterkep:ready', apply);
  }, [selectedCounty, geoms]);

  /* county labels / columns as HTML markers */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geoms) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (level === 'jaras') return; // county labels would clutter the járás view
    if (!showNames && view !== 'columns') return;
    const maxCount = Math.max(...snapshot.counties.map((c) => c.vacant + c.dissolved), 1);
    for (const c of snapshot.counties) {
      const g = geoms.get(c.name);
      if (!g) continue;
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
        .setLngLat([g.centroid[0] + dx, g.centroid[1] + dy])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [snapshot, geoms, showNames, view, level, setSelectedCounty]);

  const county = snapshot.counties.find((c) => c.name === selectedCounty);
  const hoverCounty = hover ? snapshot.counties.find((c) => c.name === hover.name) : null;
  const countyHistory = useMemo(() => {
    if (!selectedCounty) return null;
    const values = entries.map((e) => e.byCounty[selectedCounty]?.vacant ?? 0);
    return values.some((v) => v > 0) ? values : null;
  }, [entries, selectedCounty]);
  const countyRank = useMemo(() => {
    if (!selectedCounty) return null;
    const rows = countyRanking(snapshot);
    const i = rows.findIndex((r) => r.name === selectedCounty);
    return i >= 0 ? i + 1 : null;
  }, [snapshot, selectedCounty]);
  const isArchive = snapshot.month !== latestMonth;
  const monthLoading = selectedMonth !== null && snapshot.month !== selectedMonth;

  return (
    <section className="section container" id="terkep">
      <h2 className="section__heading">{t('map.heading')}</h2>
      <p className="section__explain">
        {t('map.explain')} {view === 'columns' && t('map.columnExplain')}{' '}
        {mapMetric === 'popshare' && t('map.popShareExplain')}
      </p>

      <div className="map-controls">
        <div className="seg" role="group">
          {(['county', 'jaras'] as const).map((l) => (
            <button key={l} aria-pressed={level === l} onClick={() => setLevel(l)}>
              {l === 'county' ? t('map.levelCounty') : t('map.levelJaras')}
            </button>
          ))}
        </div>
        <div className="seg" role="group">
          {(['points', 'columns'] as MapView[]).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'points' ? t('map.viewPoints') : t('map.viewColumns')}
            </button>
          ))}
        </div>
        {level === 'county' && (
          <div className="seg" role="group">
            {(['rate', 'population', 'popshare'] as MapMetric[]).map((m) => (
              <button key={m} aria-pressed={mapMetric === m} onClick={() => setMapMetric(m)}>
                {t(METRIC_LABEL_KEYS[m])}
              </button>
            ))}
          </div>
        )}
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
      {view === 'points' && (
        <div className="map-controls">
          <div className="seg" role="group">
            {(['status', 'age'] as ColorMode[]).map((m) => (
              <button key={m} aria-pressed={colorMode === m} onClick={() => setColorMode(m)}>
                {m === 'status' ? t('map.colorStatus') : t('map.colorAge')}
              </button>
            ))}
          </div>
          <div className="seg" role="group">
            {[0, 1, 5, 10].map((y2) => (
              <button key={y2} aria-pressed={minYears === y2} onClick={() => setMinYears(y2)}>
                {y2 === 0 ? t('map.durationAll') : t('map.durationYears', { n: y2 })}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="map-wrap">
        <div ref={containerRef} className="map-canvas" />
        {hover && level === 'county' && hoverCounty && !county && (
          <div className="map-tooltip" style={{ left: hover.x, top: hover.y }}>
            <strong>{hoverCounty.name}</strong>
            <span>
              {formatNumber(hoverCounty.vacant + hoverCounty.dissolved)} / {hoverCounty.total !== null ? formatNumber(hoverCounty.total) : '–'} {t('map.countyDistricts')}
              {hoverCounty.vacancyRate !== null && ` · ${formatPercent(hoverCounty.vacancyRate)}`}
              {hoverCounty.populationShare !== undefined
                && ` · ${t('map.countyPopShare')}: ${formatPercent(hoverCounty.populationShare)}`}
            </span>
          </div>
        )}
        {hover && level === 'jaras' && (
          <div className="map-tooltip" style={{ left: hover.x, top: hover.y }}>
            <strong>{hover.name}</strong>
            <span>
              {formatNumber(districtValues.get(hover.name)?.count ?? 0)} {t('map.jarasCount')}
              {(districtValues.get(hover.name)?.population ?? 0) > 0
                && ` · ${formatNumber(districtValues.get(hover.name)!.population)} ${t('map.fő')}`}
            </span>
          </div>
        )}
        {isArchive && (
          <div className="map-archive">
            {t('map.archiveMonth')}: <strong>{formatMonth(snapshot.month)}</strong>
            {snapshot.national.totalDistricts === null && (
              <span className="map-archive__note">{t('map.noDenomNote')}</span>
            )}
          </div>
        )}
        <div className="map-legend">
          <div>{t(level === 'jaras' ? 'map.jarasLegend' : METRIC_LABEL_KEYS[mapMetric])}</div>
          <div className="map-legend__ramp">
            {RAMP.map((c) => (
              <span key={c} style={{ background: c }} />
            ))}
          </div>
          <div className="map-legend__row">
            <span>{t('map.legendLow')}</span>
            <span>{t('map.legendHigh')}</span>
          </div>
          {view === 'points' && colorMode === 'status' && (
            <div style={{ marginTop: 8 }}>
              <div><span className="map-legend__dot" style={{ background: '#ff7a59' }} />{t('map.pointVacant')}</div>
              {showDissolved && snapshot.national.dissolved > 0 && (
                <div><span className="map-legend__dot" style={{ background: '#ffb454' }} />{t('map.pointDissolved')}</div>
              )}
              <div><span className="map-legend__dot" style={{ background: '#8b98ab', opacity: 0.55 }} />{t('map.pointApprox')}</div>
            </div>
          )}
          {view === 'points' && colorMode === 'age' && (
            <div style={{ marginTop: 8 }}>
              {[t('map.ageFresh'), t('map.age1'), t('map.age5'), t('map.age10')].map((label, i) => (
                <div key={label}>
                  <span className="map-legend__dot" style={{ background: AGE_COLORS[i] }} />
                  {label}
                </div>
              ))}
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
              {county.dissolved > 0 && (
                <>
                  <dt>{t('map.countyDissolved')}</dt>
                  <dd>{formatNumber(county.dissolved)}</dd>
                </>
              )}
              <dt>{t('map.metricRate')}</dt>
              <dd>{county.vacancyRate !== null ? formatPercent(county.vacancyRate) : '–'}</dd>
              <dt>{t('map.metricPopulation')}</dt>
              <dd>
                {formatNumber(county.populationVacant + county.populationDissolved)} {t('map.fő')}
              </dd>
              {county.populationShare !== undefined && (
                <>
                  <dt>{t('map.countyPopShare')}</dt>
                  <dd>{formatPercent(county.populationShare)}</dd>
                </>
              )}
              {county.praxesPer10k != null && (
                <>
                  <dt>{t('map.countyPer10k')}</dt>
                  <dd>{String(county.praxesPer10k).replace('.', ',')}</dd>
                </>
              )}
              {countyRank !== null && (
                <>
                  <dt>{t('map.countyRank')}</dt>
                  <dd>{countyRank}. / {snapshot.counties.length}</dd>
                </>
              )}
              {countyHistory && entries.length > 1 && (
                <>
                  <dt>{t('map.countyChangeSince', { month: formatMonth(entries[0].month) })}</dt>
                  <dd>
                    {countyHistory[0]} → {countyHistory[countyHistory.length - 1]}
                  </dd>
                </>
              )}
            </dl>
            {countyHistory && <PanelSpark values={countyHistory} color="var(--accent)" />}
            <button className="county-panel__back" onClick={() => setSelectedCounty(null)}>
              {t('map.backNational')}
            </button>
          </aside>
        )}
      </div>

      {months.length > 1 && (
        <div className="timeline">
          <button className="timeline__play"
            aria-label={playing ? t('map.pause') : t('map.play')}
            onClick={() => (playing ? setPlaying(false) : startPlayback())}>
            {playing ? (
              <svg viewBox="0 0 16 16"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /></svg>
            ) : (
              <svg viewBox="0 0 16 16"><path d="M4.5 2.5l9 5.5-9 5.5z" fill="currentColor" /></svg>
            )}
          </button>
          <span className="timeline__title">{t('map.timeTravel')}</span>
          <input type="range" min={0} max={months.length - 1} value={Math.max(0, monthIdx)}
            onChange={(e) => {
              setPlaying(false);
              const i = Number(e.target.value);
              void selectMonth(i >= months.length - 1 ? null : months[i]);
            }}
            aria-label={t('map.timeTravel')} />
          <span className="timeline__month">
            {monthLoading
              ? t('map.loadingMonth')
              : formatMonth(selectedMonth ?? latestMonth)}
            {!selectedMonth && !monthLoading && (
              <em> · {t('map.live')}</em>
            )}
          </span>
        </div>
      )}
    </section>
  );
}
