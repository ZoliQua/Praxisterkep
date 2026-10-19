// The charts of a PDF report, drawn as SVG strings on white.
//
// They are not the page's charts: those are dark, interactive and sized for
// a screen. These are drawn for paper — a white ground, the reader's choice
// of palette, gridlines and value labels on request — and the PDF keeps them
// as vectors, so they print sharp at any size. Text in them names a font the
// PDF has registered, so accents come out the same as in the body.
import type { ChartSize, PaletteKey } from './types';

export interface Palette {
  /** the bar or line of the area the report is about */
  focus: string;
  /** every other bar */
  other: string;
  grid: string;
  text: string;
  muted: string;
  /** parts of a whole, in order */
  parts: string[];
}

export const PALETTES: Record<PaletteKey, Palette> = {
  // the site's own colours, darkened enough to read on white
  site: { focus: '#d1495b', other: '#9fb3c8', grid: '#e3e8ee', text: '#1f2933', muted: '#616e7c',
    parts: ['#2a9d8f', '#e9a23b', '#d1495b', '#5b7db1', '#8c6bb1'] },
  // Okabe–Ito: tells apart for every common colour-vision deficiency
  colorblind: { focus: '#D55E00', other: '#9ab8d6', grid: '#e5e5e5', text: '#1a1a1a', muted: '#595959',
    parts: ['#0072B2', '#E69F00', '#D55E00', '#009E73', '#CC79A7'] },
  // for a black-and-white printer
  gray: { focus: '#1a1a1a', other: '#b3b3b3', grid: '#e6e6e6', text: '#1a1a1a', muted: '#555555',
    parts: ['#333333', '#808080', '#b3b3b3', '#d9d9d9', '#5c5c5c'] },
  // one hue, calm, for a document that has to look official
  blue: { focus: '#0b3d91', other: '#a8c0e0', grid: '#e4ebf5', text: '#14213d', muted: '#52607a',
    parts: ['#0b3d91', '#3a6fc4', '#7fa3dc', '#bcd0ee', '#5a7bb0'] },
};

export const ROW: Record<ChartSize, number> = { compact: 12, normal: 16, large: 21 };

export interface ChartStyle {
  width: number;
  palette: Palette;
  font: string;
  grid: boolean;
  labels: boolean;
  size: ChartSize;
}

export const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fontSize = (size: ChartSize) => (size === 'compact' ? 7.5 : size === 'large' ? 10 : 8.5);

/** A rough width of a label in points, enough to lay out a column. */
const textWidth = (s: string, fs: number) => s.length * fs * 0.52;

export interface BarRow {
  label: string;
  value: number | null;
  focus?: boolean;
  /** what the end of the bar says; the value itself when left out */
  display?: string;
}

/**
 * Horizontal bars, one row each, from zero. A bar may be negative (natural
 * change, migration): the axis then sits where zero falls.
 */
export function barChart(rows: BarRow[], style: ChartStyle,
  format: (v: number) => string = String): { svg: string; height: number } {
  const fs = fontSize(style.size);
  const rowH = ROW[style.size];
  const pal = style.palette;
  const labelW = Math.min(Math.max(...rows.map((r) => textWidth(r.label, fs)), 30) + 8,
    style.width * 0.38);
  const valueW = style.labels ? Math.max(...rows.map((r) =>
    textWidth(r.display ?? (r.value === null ? '–' : format(r.value)), fs)), 20) + 8 : 6;
  const plotW = Math.max(style.width - labelW - valueW, 40);
  const vals = rows.map((r) => r.value).filter((v): v is number => v !== null);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const x = (v: number) => labelW + ((v - lo) / span) * plotW;
  const top = 4;
  const height = top + rows.length * rowH + 6;
  const parts: string[] = [`<rect x="0" y="0" width="${style.width}" height="${height}" fill="#ffffff"/>`];
  if (style.grid) {
    for (let i = 0; i <= 4; i += 1) {
      const gx = labelW + (plotW * i) / 4;
      parts.push(`<line x1="${gx}" y1="${top}" x2="${gx}" y2="${height - 4}" stroke="${pal.grid}" stroke-width="0.6"/>`);
    }
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const barH = rowH * 0.62;
    const by = y + (rowH - barH) / 2;
    const weight = r.focus ? ' font-weight="bold"' : '';
    parts.push(`<text x="${labelW - 6}" y="${y + rowH * 0.68}" font-family="${style.font}" font-size="${fs}" fill="${pal.text}" text-anchor="end"${weight}>${escapeXml(r.label)}</text>`);
    if (r.value !== null) {
      const x0 = x(Math.min(0, r.value));
      const w = Math.max(Math.abs(x(r.value) - x(0)), 0.8);
      parts.push(`<rect x="${x0}" y="${by}" width="${w}" height="${barH}" fill="${r.focus ? pal.focus : pal.other}"/>`);
    }
    if (style.labels) {
      const text = r.display ?? (r.value === null ? '–' : format(r.value));
      const end = r.value === null ? x(0) : Math.max(x(r.value), x(0));
      parts.push(`<text x="${end + 4}" y="${y + rowH * 0.68}" font-family="${style.font}" font-size="${fs}" fill="${r.focus ? pal.text : pal.muted}"${weight}>${escapeXml(text)}</text>`);
    }
  });
  if (lo < 0) {
    parts.push(`<line x1="${x(0)}" y1="${top}" x2="${x(0)}" y2="${height - 4}" stroke="${pal.muted}" stroke-width="0.8"/>`);
  }
  return { svg: wrap(style.width, height, parts), height };
}

export interface Part { label: string; value: number }

/** One bar split into the parts of a whole, with a legend under it. */
export function stackedBar(parts: Part[], style: ChartStyle,
  format: (share: number) => string): { svg: string; height: number } {
  const fs = fontSize(style.size);
  const pal = style.palette;
  const total = parts.reduce((a, p) => a + Math.max(p.value, 0), 0) || 1;
  const barH = ROW[style.size] * 1.3;
  const out: string[] = [];
  let x = 0;
  parts.forEach((p, i) => {
    const w = (Math.max(p.value, 0) / total) * style.width;
    out.push(`<rect x="${x}" y="2" width="${w}" height="${barH}" fill="${pal.parts[i % pal.parts.length]}"/>`);
    if (style.labels && w > textWidth(format(p.value / total), fs) + 6) {
      const ink = inkOn(pal.parts[i % pal.parts.length]);
      out.push(`<text x="${x + w / 2}" y="${2 + barH * 0.66}" font-family="${style.font}" font-size="${fs}" fill="${ink}" text-anchor="middle" font-weight="bold">${escapeXml(format(p.value / total))}</text>`);
    }
    x += w;
  });
  // the legend: one swatch and name per part, wrapped onto rows
  let lx = 0;
  let ly = barH + 10;
  parts.forEach((p, i) => {
    const label = `${p.label} (${format(p.value / total)})`;
    const w = textWidth(label, fs) + 22;
    if (lx + w > style.width) { lx = 0; ly += fs + 6; }
    out.push(`<rect x="${lx}" y="${ly}" width="8" height="8" fill="${pal.parts[i % pal.parts.length]}"/>`);
    out.push(`<text x="${lx + 11}" y="${ly + 7}" font-family="${style.font}" font-size="${fs}" fill="${pal.text}">${escapeXml(label)}</text>`);
    lx += w;
  });
  const height = ly + fs + 6;
  return { svg: wrap(style.width, height, [`<rect x="0" y="0" width="${style.width}" height="${height}" fill="#ffffff"/>`, ...out]), height };
}

export interface Line { label: string; values: (number | null)[]; focus?: boolean }

/** Lines over a shared x axis; the first and last x labels are written. */
export function lineChart(lines: Line[], xLabels: string[], style: ChartStyle,
  format: (v: number) => string = String): { svg: string; height: number } {
  const fs = fontSize(style.size);
  const pal = style.palette;
  const height = ROW[style.size] * 9;
  const left = Math.max(...lines.flatMap((l) => l.values)
    .filter((v): v is number => v !== null).map((v) => textWidth(format(v), fs)), 20) + 8;
  const bottom = fs + 18 + Math.ceil(lines.length / 3) * (fs + 6);
  const plotH = height - bottom - 6;
  const plotW = style.width - left - 6;
  const vals = lines.flatMap((l) => l.values).filter((v): v is number => v !== null);
  const lo = Math.min(...vals, 0);
  const hi = Math.max(...vals, 0) || 1;
  const y = (v: number) => 6 + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const n = Math.max(xLabels.length - 1, 1);
  const x = (i: number) => left + (i / n) * plotW;
  const out: string[] = [`<rect x="0" y="0" width="${style.width}" height="${height}" fill="#ffffff"/>`];
  for (let i = 0; i <= 4; i += 1) {
    const v = lo + ((hi - lo) * i) / 4;
    if (style.grid) out.push(`<line x1="${left}" y1="${y(v)}" x2="${left + plotW}" y2="${y(v)}" stroke="${pal.grid}" stroke-width="0.6"/>`);
    out.push(`<text x="${left - 4}" y="${y(v) + fs * 0.35}" font-family="${style.font}" font-size="${fs}" fill="${pal.muted}" text-anchor="end">${escapeXml(format(v))}</text>`);
  }
  out.push(`<line x1="${left}" y1="${6 + plotH}" x2="${left + plotW}" y2="${6 + plotH}" stroke="${pal.muted}" stroke-width="0.6"/>`);
  if (xLabels.length) {
    out.push(`<text x="${x(0)}" y="${6 + plotH + fs + 4}" font-family="${style.font}" font-size="${fs}" fill="${pal.muted}">${escapeXml(xLabels[0])}</text>`);
    out.push(`<text x="${x(xLabels.length - 1)}" y="${6 + plotH + fs + 4}" font-family="${style.font}" font-size="${fs}" fill="${pal.muted}" text-anchor="end">${escapeXml(xLabels[xLabels.length - 1])}</text>`);
  }
  lines.forEach((l, li) => {
    const color = l.focus ? pal.focus : pal.parts[(li + 1) % pal.parts.length];
    let d = '';
    l.values.forEach((v, i) => {
      if (v === null) return;
      d += `${d && l.values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    });
    if (d) out.push(`<path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="${l.focus ? 1.8 : 1.1}"/>`);
  });
  // legend under the axis
  let lx = left;
  let ly = 6 + plotH + fs + 14;
  lines.forEach((l, li) => {
    const color = l.focus ? pal.focus : pal.parts[(li + 1) % pal.parts.length];
    const w = textWidth(l.label, fs) + 24;
    if (lx + w > style.width) { lx = left; ly += fs + 6; }
    out.push(`<line x1="${lx}" y1="${ly + 3}" x2="${lx + 12}" y2="${ly + 3}" stroke="${color}" stroke-width="2"/>`);
    out.push(`<text x="${lx + 16}" y="${ly + 6}" font-family="${style.font}" font-size="${fs}" fill="${pal.text}">${escapeXml(l.label)}</text>`);
    lx += w;
  });
  return { svg: wrap(style.width, height, out), height };
}

/** Black or white, whichever reads better on a fill. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1a1a1a' : '#ffffff';
}

function wrap(width: number, height: number, parts: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
}

export interface Slice { value: number; color: string }

/**
 * A ring, the way the county page draws its two cards: the parts of a whole
 * around, the share that matters written in the middle.
 */
export function donut(slices: Slice[], size: number, center: string, font: string,
  ink = '#1f2933'): string {
  const total = slices.reduce((a, s) => a + Math.max(s.value, 0), 0) || 1;
  const r = size / 2;
  const thick = size * 0.17;
  const mid = r - thick / 2;
  const parts: string[] = [`<rect x="0" y="0" width="${size}" height="${size}" fill="#ffffff"/>`];
  let angle = -Math.PI / 2;
  for (const s of slices) {
    const share = Math.max(s.value, 0) / total;
    if (share <= 0) continue;
    if (share >= 0.9999) {
      parts.push(`<circle cx="${r}" cy="${r}" r="${mid}" fill="none" stroke="${s.color}" stroke-width="${thick}"/>`);
      break;
    }
    const end = angle + share * Math.PI * 2;
    const [x0, y0] = [r + mid * Math.cos(angle), r + mid * Math.sin(angle)];
    const [x1, y1] = [r + mid * Math.cos(end), r + mid * Math.sin(end)];
    parts.push(`<path d="M${x0.toFixed(2)},${y0.toFixed(2)} A${mid},${mid} 0 ${share > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}" fill="none" stroke="${s.color}" stroke-width="${thick}"/>`);
    angle = end;
  }
  parts.push(`<text x="${r}" y="${r + size * 0.07}" font-family="${font}" font-size="${size * 0.2}" font-weight="bold" fill="${ink}" text-anchor="middle">${escapeXml(center)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${parts.join('')}</svg>`;
}

export interface MapShape { name: string; d: string; cx: number; cy: number }

/**
 * The country with one area lit: every other outline light grey, the
 * neighbours of the same group (a járás's county) a shade darker, the one the
 * report is about in the focus colour, its name written beside it.
 */
export function areaMap(shapes: MapShape[], width: number, height: number, focus: string,
  palette: Palette, font: string, group?: Set<string>): string {
  const parts: string[] = [`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`];
  for (const s of shapes) {
    if (s.name === focus) continue;
    const fill = group?.has(s.name) ? '#c9d3de' : '#e6ebf0';
    parts.push(`<path d="${s.d}" fill="${fill}" stroke="#ffffff" stroke-width="0.6"/>`);
  }
  const lit = shapes.find((s) => s.name === focus);
  if (lit) {
    parts.push(`<path d="${lit.d}" fill="${palette.focus}" stroke="#ffffff" stroke-width="0.8"/>`);
    const fs = 9;
    const right = lit.cx < width * 0.7;
    const tx = right ? lit.cx + 14 : lit.cx - 14;
    parts.push(`<line x1="${lit.cx.toFixed(1)}" y1="${lit.cy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${(lit.cy - 12).toFixed(1)}" stroke="${palette.text}" stroke-width="0.6"/>`);
    parts.push(`<circle cx="${lit.cx.toFixed(1)}" cy="${lit.cy.toFixed(1)}" r="1.6" fill="${palette.text}"/>`);
    parts.push(`<text x="${(tx + (right ? 2 : -2)).toFixed(1)}" y="${(lit.cy - 14).toFixed(1)}" font-family="${font}" font-size="${fs}" font-weight="bold" fill="${palette.text}" text-anchor="${right ? 'start' : 'end'}">${escapeXml(focus)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
}
