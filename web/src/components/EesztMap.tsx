// Map of the EESZT-matched districts: one point per district at its
// licensed premises (geocoded; settlement-centroid fallbacks are drawn
// faded). Zoomable, county focus, clickable points with a side panel.
// Used standalone in the EESZT section and above the data browser, where
// it follows the table's filters (it simply renders the rows it is given).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Map as MLMap, NavigationControl } from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { cellText, type Row } from '../lib/eesztTable';
import { eesztLink } from '../lib/eeszt';
import { useAppStore } from '../store/useAppStore';
import { LAYER_KEYS, toggleLayer, useMapLayers } from '../lib/mapLayers';
import { useOrientationLayers } from './useOrientationLayers';

const HUNGARY: [[number, number], [number, number]] = [[16.0, 45.7], [23.0, 48.65]];
const COLOR_FILLED = '#4fd6c2';
const COLOR_VACANT = '#ff7a59';
const COLOR_DISSOLVED = '#ffb454';
const COLOR_MISMATCH = '#b8b0f5';

/** what the map needs from a row; both data browsers' rows satisfy it */
export type MapRow = Row & {
  fin: string;
  settlement: string;
  county: string;
  type: string;
  status: string;
  lat: number | null;
  lon: number | null;
  geoApprox: boolean | null;
  settlementMatch: boolean | null;
  unitCode: string | null;
  licenceId: string | null;
  providerId: string | null;
};

/** colour-by-category mode: one colour per distinct row.type */
export interface MapCategory { key: string; label: string; color: string }

type Bbox = [[number, number], [number, number]];
let bboxPromise: Promise<Map<string, Bbox>> | null = null;

function loadCountyBboxes(): Promise<Map<string, Bbox>> {
  bboxPromise ??= fetch(`${import.meta.env.BASE_URL}data/counties.geojson`)
    .then((r) => r.json())
    .then((fc: GeoJSON.FeatureCollection) => {
      const out = new Map<string, Bbox>();
      for (const f of fc.features) {
        let minX = 180, minY = 90, maxX = -180, maxY = -90;
        const walk = (c: unknown): void => {
          if (Array.isArray(c) && typeof c[0] === 'number') {
            const [x, y] = c as [number, number];
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          } else if (Array.isArray(c)) c.forEach(walk);
        };
        walk((f.geometry as GeoJSON.Polygon).coordinates);
        out.set(String(f.properties?.name), [[minX, minY], [maxX, maxY]]);
      }
      return out;
    });
  return bboxPromise;
}

function toGeoJSON(rows: MapRow[], statusFilled: string, statusDissolved: string) {
  const features: GeoJSON.Feature[] = [];
  rows.forEach((r, i) => {
    if (r.lat === null || r.lon === null) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: {
        i,
        c: String(r.type ?? ''),
        s: r.status === statusFilled ? 'f' : r.status === statusDissolved ? 'd' : 'v',
        approx: r.geoApprox === true,
        mismatch: r.settlementMatch === false,
      },
    });
  });
  return { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection;
}

export function EesztMap({
  rows, height = 460, countyFilter = true, fitToRows = false, searchLink = true,
  categories, detailRows, countKey = 'eeszt.mapCount',
}: {
  rows: MapRow[];
  height?: number;
  /** show the county selector (off inside the data browser, whose own
   *  county filter already drives the rows) */
  countyFilter?: boolean;
  /** zoom to the given rows whenever they change (data-browser mode) */
  fitToRows?: boolean;
  /** show the "details in the search" link in the side panel */
  searchLink?: boolean;
  /** colour the points by row.type instead of by status, with this legend */
  categories?: MapCategory[];
  /** replace the side panel's field list (the districts' own list by default) */
  detailRows?: (row: MapRow) => [string, string][];
  /** i18n key of the "n / total on the map" line (districts by default) */
  countKey?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const [county, setCounty] = useState('');
  const [selected, setSelected] = useState<MapRow | null>(null);
  const layers = useMapLayers();
  const requestSearch = useAppStore((s) => s.requestSearch);

  const shown = useMemo(
    () => (county ? rows.filter((r) => r.county === county) : rows),
    [rows, county],
  );
  const counties = useMemo(
    () => [...new Set(rows.map((r) => r.county))].sort((a, b) => a.localeCompare(b, 'hu')),
    [rows],
  );
  const located = shown.filter((r) => r.lat !== null).length;
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const statusFilled = t('stats.statusFilled');
  const statusDissolved = t('stats.statusDissolved');

  const color = useMemo(() => (categories?.length
    ? ['match', ['get', 'c'],
      ...categories.flatMap((c) => [c.key, c.color]), COLOR_VACANT]
    : ['match', ['get', 's'],
      'f', COLOR_FILLED, 'd', COLOR_DISSOLVED, COLOR_VACANT]), [categories]);
  const colorRef = useRef(color);
  colorRef.current = color;

  // create the map once
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MLMap({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1016' } }],
      },
      bounds: HUNGARY,
      fitBoundsOptions: { padding: 16 },
      attributionControl: { compact: true },
      dragRotate: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-left');

    let disposed = false;
    const setup = () => {
      if (disposed || map.getSource('pts')) return;
      map.addSource('counties', {
        type: 'geojson',
        data: `${import.meta.env.BASE_URL}data/counties.geojson`,
        attribution: '© OpenStreetMap contributors',
      });
      map.addLayer({
        id: 'county-line', type: 'line', source: 'counties',
        paint: { 'line-color': '#2a3b52', 'line-width': 1 },
      });
      map.addSource('pts', {
        type: 'geojson',
        data: toGeoJSON(shownRef.current, statusFilled, statusDissolved),
      });
      map.addLayer({
        id: 'pts', type: 'circle', source: 'pts',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.6, 9, 4.5, 12, 7],
          'circle-color': colorRef.current as never,
          'circle-opacity': ['case', ['get', 'approx'], 0.4, 0.9],
          'circle-stroke-width': ['case', ['get', 'mismatch'], 1.6, 0.6],
          'circle-stroke-color': ['case', ['get', 'mismatch'], COLOR_MISMATCH, '#0b1016'],
        },
      });
      map.on('click', 'pts', (e: MapLayerMouseEvent) => {
        const i = e.features?.[0]?.properties?.i;
        if (typeof i === 'number') setSelected(shownRef.current[i] ?? null);
      });
      map.on('mouseenter', 'pts', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'pts', () => { map.getCanvas().style.cursor = ''; });
      readyRef.current = true;
    };
    // 'load' is not reliable after a StrictMode remount — retry until the
    // inline style accepts sources
    const trySetup = () => {
      if (disposed) return;
      try {
        setup();
      } catch {
        setTimeout(trySetup, 120);
      }
    };
    trySetup();
    return () => {
      disposed = true;
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // push the (filtered) rows to the map
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const apply = () => {
      if (cancelled || !mapRef.current) return; // unmounted: stop retrying
      const src = mapRef.current.getSource('pts') as GeoJSONSource | undefined;
      if (!src) {
        timer = window.setTimeout(apply, 150);
        return;
      }
      src.setData(toGeoJSON(shown, statusFilled, statusDissolved));
      if (fitToRows) {
        let minX = 180, minY = 90, maxX = -180, maxY = -90, n = 0;
        for (const r of shown) {
          if (r.lat === null || r.lon === null) continue;
          n += 1;
          minX = Math.min(minX, r.lon); maxX = Math.max(maxX, r.lon);
          minY = Math.min(minY, r.lat); maxY = Math.max(maxY, r.lat);
        }
        mapRef.current?.fitBounds(n ? [[minX, minY], [maxX, maxY]] : HUNGARY,
          { padding: 40, maxZoom: 12, duration: 600 });
      }
    };
    apply();
    setSelected((cur) => (cur && shown.includes(cur) ? cur : null));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [shown, statusFilled, statusDissolved, fitToRows]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer('pts')) {
      map.setPaintProperty('pts', 'circle-color', color as never);
    }
  }, [color]);

  useOrientationLayers(mapRef);

  // county focus (standalone mode)
  useEffect(() => {
    if (fitToRows) return;
    void loadCountyBboxes().then((b) => {
      const map = mapRef.current;
      if (!map) return;
      const box = county ? b.get(county) : undefined;
      map.fitBounds(box ?? HUNGARY, { padding: 24, duration: 700 });
    });
  }, [county, fitToRows]);

  const text = (v: unknown) => cellText((v ?? null) as never) || '–';
  const detail: [string, string][] = !selected ? []
    : detailRows ? detailRows(selected) : [
      [t('stats.thStatus'), text(selected.status)],
      [t('stats.thType'), text(selected.type)],
      [t('eeszt.thDistrictNo'), text(selected.districtNo)],
      [t('eeszt.licence'), selected.licAddress
        ? `${selected.licPostal ?? ''} ${selected.licSettlement ?? ''}, ${selected.licAddress}`
        : '–'],
      [t('eeszt.colSettlementMatch'), text(selected.settlementMatch)],
      [t('eeszt.colProviderMatch'), text(selected.providerMatch)],
      [t('eeszt.onCall'), text(selected.onCall)],
      [t('eeszt.thFunded'), text(selected.publicFunded)],
      [t('eeszt.colProfession'), text(selected.profession)],
      // provider/institution exist only for filled districts (ETL guard)
      ...(selected.provider ? [[t('eeszt.provider'), text(selected.provider)] as [string, string]] : []),
      ...(selected.institutionCode
        ? [[t('eeszt.institutionCode'), text(selected.institutionCode)] as [string, string]] : []),
      [t('eeszt.colFin'), selected.fin],
    ];

  return (
    <div className="eeszt-map">
      <div className="eeszt-map__bar">
        {countyFilter && (
          <select value={county} onChange={(e) => { setCounty(e.target.value); setSelected(null); }}
            aria-label={t('stats.thCounty')}>
            <option value="">{t('stats.filterCountyAll')}</option>
            {counties.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <span className="eeszt-map__layers">
          {LAYER_KEYS.map((key) => (
            <button key={key} type="button" aria-pressed={layers[key]}
              className={`map-layer${layers[key] ? ' is-on' : ''}`}
              onClick={() => toggleLayer(key)}>
              {layers[key] ? '◉' : '○'} {t(`map.layer.${key}`)}
            </button>
          ))}
        </span>
        <span className="eeszt-map__count">
          {t(countKey, { n: formatNumber(located), total: formatNumber(shown.length) })}
        </span>
        <span className="eeszt-map__legend">
          {categories?.length ? categories.map((c) => (
            <Fragment key={c.key}>
              <i style={{ background: c.color }} />{c.label}
            </Fragment>
          )) : (
            <>
              <i style={{ background: COLOR_FILLED }} />{t('stats.statusFilled')}
              <i style={{ background: COLOR_VACANT }} />{t('stats.statusVacant')}
              <i style={{ background: COLOR_DISSOLVED }} />{t('stats.statusDissolved')}
            </>
          )}
          <i className="is-ring" style={{ borderColor: COLOR_MISMATCH }} />{t('eeszt.legendMismatch')}
          <i style={{ background: '#9aa8bb', opacity: 0.45 }} />{t('eeszt.legendApprox')}
        </span>
      </div>
      <div className="eeszt-map__stage" style={{ height }}>
        <div ref={containerRef} className="eeszt-map__canvas" />
        {selected && (
          <aside className="eeszt-map__panel">
            <button className="county-panel__close" onClick={() => setSelected(null)}
              aria-label={t('stats.tableClose')}>×</button>
            <h4>{selected.settlement}</h4>
            <p className="eeszt-map__panel-sub">{selected.county}</p>
            <dl>
              {detail.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            <div className="eeszt-trace">
              <h5>{t('eeszt.traceTitle')}</h5>
              <ul>
                <li>
                  <span>{t('eeszt.traceFin')}</span>
                  <a href={eesztLink('finszolg', 'FINKOD', selected.fin)} target="_blank" rel="noopener">
                    {selected.fin} ↗</a>
                </li>
                {selected.unitCode && (
                  <li>
                    <span>{t('eeszt.traceUnit')}</span>
                    <a href={eesztLink('engedely', 'SZERVEZETI_EGYSEG_KOD', selected.unitCode.split(', ')[0])}
                      target="_blank" rel="noopener">{selected.unitCode} ↗</a>
                  </li>
                )}
                {selected.licenceId && (
                  <li>
                    <span>{t('eeszt.traceLicence')}</span>
                    <a href={eesztLink('engedely', 'ENGEDELY_AZONOSITO', selected.licenceId)}
                      target="_blank" rel="noopener">{selected.licenceId} ↗</a>
                  </li>
                )}
                {/* provider id is only present for filled districts (ETL guard) */}
                {selected.providerId && (
                  <li>
                    <span>{t('eeszt.traceProvider')}</span>
                    <a href={eesztLink('euszolg', 'EUSZOLG_AZONOSITO', selected.providerId)}
                      target="_blank" rel="noopener">{selected.providerId} ↗</a>
                  </li>
                )}
              </ul>
            </div>
            {selected.geoApprox && (
              <p className="praxis-line praxis-line--faint">{t('eeszt.approxNote')}</p>
            )}
            {searchLink && (
              <a className="map-popup__link" href="#nalam"
                onClick={() => requestSearch(selected.settlement)}>
                {t('map.popupToSearch')}
              </a>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
