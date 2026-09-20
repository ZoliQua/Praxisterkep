// Save the map exactly as it looks: the WebGL canvas plus the DOM markers
// (city and district labels) drawn on top, so the PNG carries the same
// orientation the visitor sees on screen.
import type { Map as MLMap } from 'maplibre-gl';
import { downloadBlob } from './exportChart';

const CREDIT = '© OpenStreetMap contributors · Praxistérkép';

interface Label {
  x: number;
  y: number;
  text: string;
  dot: number;
  size: number;
  weight: number;
  color: string;
}

/** read the markers out of the DOM, in canvas coordinates */
function labelsOf(container: HTMLElement, rect: DOMRect): Label[] {
  const out: Label[] = [];
  for (const el of container.querySelectorAll<HTMLElement>('.map-city, .map-county-label')) {
    const span = el.querySelector('span') ?? el;
    const text = (span.textContent ?? '').trim();
    if (!text) continue;
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(span);
    const dot = el.querySelector('i');
    out.push({
      x: box.left - rect.left + (dot ? dot.getBoundingClientRect().width + 6 : 0),
      y: box.top - rect.top + box.height / 2,
      text,
      dot: dot ? dot.getBoundingClientRect().width : 0,
      size: parseFloat(style.fontSize) || 11,
      weight: parseInt(style.fontWeight, 10) || 500,
      color: style.color || '#e9eef5',
    });
  }
  return out;
}

/**
 * The map as a PNG. MapLibre clears its drawing buffer after every frame, so
 * the canvas is re-rendered first and read inside the same frame.
 */
export function exportMapPng(map: MLMap, filename: string): void {
  const canvas = map.getCanvas();
  const container = map.getContainer();
  const rect = container.getBoundingClientRect();
  const labels = labelsOf(container, rect);
  const ratio = canvas.width / rect.width || 1;

  map.once('render', () => {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height + Math.round(22 * ratio);
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0b1016';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);

    for (const label of labels) {
      const x = label.x * ratio;
      const y = label.y * ratio;
      if (label.dot) {
        ctx.fillStyle = label.color;
        ctx.beginPath();
        ctx.arc(x - label.dot * ratio, y, (label.dot * ratio) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = `${label.weight} ${label.size * ratio}px "IBM Plex Sans", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3 * ratio;
      ctx.strokeStyle = 'rgba(11,16,22,0.85)';
      ctx.strokeText(label.text, x, y);
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, x, y);
    }

    ctx.font = `${12 * ratio}px "IBM Plex Sans", sans-serif`;
    ctx.fillStyle = '#64748b';
    ctx.textBaseline = 'middle';
    ctx.fillText(CREDIT, 10 * ratio, canvas.height + 11 * ratio);

    out.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${filename}-${new Date().toISOString().slice(0, 10)}.png`);
    }, 'image/png');
  });
  map.triggerRepaint();
}
