// The heavy half of the street map: MapLibre and the tiles. Imported only
// after the button is pressed, so the settlement page stays a static page for
// everyone who does not ask for this.
import { Map as MLMap, Marker, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { StreetPoint } from './streetmap';

/** The same colours the rest of the site uses for these layers. */
const COLORS: Record<string, string> = {
  gp: '#4fd6c2', dental: '#8ab4ff', pharmacy: '#c88ff0', oncall: '#f0b429',
  ambulance: '#ef8354', inpatient: '#ef6461', outpatient: '#9bd4a5',
  gyse: '#b8a4ff',
};

export async function render(host: HTMLElement, points: StreetPoint[], style: string) {
  if (!points.length) return;
  const map = new MLMap({
    container: host,
    style,
    bounds: bounds(points),
    fitBoundsOptions: { padding: 60, maxZoom: 16 },
    attributionControl: { compact: true },
  });
  await new Promise<void>((resolve) => {
    map.once('load', () => resolve());
    // a style that never loads must not leave the page waiting for ever
    window.setTimeout(resolve, 8000);
  });
  for (const p of points) {
    const el = document.createElement('i');
    el.className = `street-pin${p.approx ? ' street-pin--approx' : ''}`;
    el.style.background = COLORS[p.kind] ?? '#94a3b8';
    new Marker({ element: el })
      .setLngLat([p.lon, p.lat])
      .setPopup(new Popup({ offset: 12 }).setHTML(
        `<strong>${escape(p.name)}</strong>${p.address ? `<br>${escape(p.address)}` : ''}`
        + (p.approx ? '<br><em>hozzávetőleges hely</em>' : ''),
      ))
      .addTo(map);
  }
}

function bounds(points: StreetPoint[]): [[number, number], [number, number]] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const p of points) {
    minX = Math.min(minX, p.lon); maxX = Math.max(maxX, p.lon);
    minY = Math.min(minY, p.lat); maxY = Math.max(maxY, p.lat);
  }
  // a single point would make a zero-sized box
  const pad = 0.004;
  return [[minX - pad, minY - pad], [maxX + pad, maxY + pad]];
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
